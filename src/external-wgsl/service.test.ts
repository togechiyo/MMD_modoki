import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { createHash } from "node:crypto";
import { ExternalWgslService } from "./service";
import { canonicalEffectContent, getEffectAssignment, type EffectAsset } from "./contract";
import { parseEffectFile } from "./single-file";
import { setWgslRecoveryBlocked } from "./recovery";

const { plugins } = vi.hoisted(() => ({ plugins: [] as Array<{ asset: EffectAsset | null }> }));
vi.mock("./material-plugin", () => ({ ExternalWgslMaterialPlugin: class {
    asset: EffectAsset | null = null;
    failure: string | null = null;
    constructor() { plugins.push(this); }
    configure(asset: EffectAsset | null) { this.asset = asset; }
    generatedSource() { return this.asset?.sources[0].text ?? ""; }
} }));
vi.mock("@babylonjs/core/Engines/webgpuEngine", () => ({ WebGPUEngine: class {} }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

function asset(name: string): EffectAsset {
    const parsed = parseEffectFile(`/* @modoki\n${JSON.stringify({ apiVersion: 1, kind: "mmd-material", name, hooks: { finalColor: "shade" } })}\n*/\nfn shade(s: ModokiFinalColor) -> vec3f { return s.color; }`);
    return { ...parsed, revision: createHash("sha256").update(canonicalEffectContent(parsed)).digest("hex") };
}
function fixture() {
    const lost = new Observable<WebGPUEngine>();
    const device = { pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => null) };
    const engine = Object.assign(Object.create(WebGPUEngine.prototype) as WebGPUEngine, { _device: device, onContextLostObservable: lost });
    const info = vi.fn(async (): Promise<{ messages: Array<{ type: string; message: string; lineNum: number; linePos: number }> }> => ({ messages: [] }));
    const material = { allowShaderHotSwapping: true, isReadyForSubMesh: () => true } as unknown as StandardMaterial;
    const mesh = { getTotalVertices: () => 3, subMeshes: [{ getMaterial: () => material,
        effect: { getPipelineContext: () => ({ stages: { vertexStage: { module: { getCompilationInfo: info } } } }) } }] } as unknown as AbstractMesh;
    const target = { modelInstanceId: "model", materialKey: "material" };
    const scene = { getEngine: () => engine, onDisposeObservable: new Observable<Scene>(), onBeforeRenderObservable: new Observable<Scene>() } as unknown as Scene;
    const host = { scene, targets: () => [{ target, material, meshes: [mesh] }], frame: () => 0, playing: () => false,
        viewportSize: () => ({ width: 100, height: 100 }), available: () => true, suspend: vi.fn(), resume: vi.fn(), changed: vi.fn(), failed: vi.fn() };
    const api = { state: vi.fn(async () => ({ blocked: false })), allow: vi.fn(async () => undefined), arm: vi.fn(async () => undefined),
        disarm: vi.fn(async () => undefined), fail: vi.fn(async () => undefined), onBlocked: vi.fn(() => () => undefined) };
    vi.stubGlobal("window", { electronAPI: { wgslRecovery: api } });
    const service = new ExternalWgslService(host);
    return { service, host, api, target, material, info, device, lost, engine };
}
beforeEach(() => {
    plugins.length = 0;
    vi.stubGlobal("localStorage", { getItem: () => "true", setItem: vi.fn() });
    setWgslRecoveryBlocked(false);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("WGSL transaction recovery", () => {
    it("rolls back ordinary validation errors to the previous working assignment", async () => {
        const f = fixture(); await f.service.apply([f.target], asset("before"));
        const previous = getEffectAssignment(f.material);
        f.info.mockResolvedValue({ messages: [{ type: "error", message: "unknown name", lineNum: 1, linePos: 1 }] });
        await expect(f.service.apply([f.target], asset("after"))).rejects.toThrow("unknown name");
        expect(getEffectAssignment(f.material)).toEqual(previous);
        expect(plugins[0].asset?.manifest.name).toBe("before");
        expect(f.service.enabled).toBe(true);
        expect(f.host.resume).toHaveBeenCalledTimes(2);
    });
    it.each(["info", "scope"] as const)("disables every shader on a pending %s response without losing assignments", async boundary => {
        const f = fixture(); await f.service.apply([f.target], asset("before"));
        const previous = getEffectAssignment(f.material);
        vi.useFakeTimers();
        if (boundary === "info") f.info.mockImplementation(() => new Promise(() => undefined));
        else f.device.popErrorScope.mockImplementation(() => new Promise(() => undefined));
        const result = f.service.apply([f.target], asset("after"));
        const assertion = expect(result).rejects.toThrow("timed out");
        // Digest uses a real native promise; yield until the bounded compilation has actually started.
        await vi.waitFor(() => expect(f.service.busy).toBe(true));
        await vi.advanceTimersByTimeAsync(15001); await assertion;
        expect(f.service.enabled).toBe(false); expect(f.service.busy).toBe(false);
        expect(plugins[0].asset).toBeNull();
        expect(getEffectAssignment(f.material)).toEqual(previous);
        expect(f.host.resume).toHaveBeenCalledTimes(2);
        expect(f.api.fail).toHaveBeenCalled();
    });
    it("disables plugins on device loss and retains assignments for save/undo", async () => {
        const f = fixture(); const changes = await f.service.apply([f.target], asset("before"));
        const previous = getEffectAssignment(f.material);
        f.lost.notifyObservers(f.engine);
        expect(f.service.enabled).toBe(false); expect(plugins[0].asset).toBeNull();
        expect(getEffectAssignment(f.material)).toEqual(previous);
        expect(f.host.failed).toHaveBeenCalledWith("wgsl.deviceLost");
        expect(f.service.restore(changes, "revert")).toBe(true);
        expect(getEffectAssignment(f.material)).toBeNull();
        expect(f.service.restore(changes, "apply")).toBe(true);
        expect(getEffectAssignment(f.material)).toEqual(previous);
        expect(plugins[0].asset).toBeNull();
    });
    it("never configures an external shader if recording the recovery marker fails", async () => {
        const f = fixture(); f.api.arm.mockRejectedValue(new Error("disk full"));
        await expect(f.service.apply([f.target], asset("new"))).rejects.toThrow("disk full");
        expect(plugins).toHaveLength(0); expect(f.service.busy).toBe(false);
        expect(f.host.resume).toHaveBeenCalledOnce();
    });
    it("stops tracking GPU faults after the user disables external WGSL", async () => {
        const f = fixture(); await f.service.apply([f.target], asset("before"));
        await f.service.setEnabled(false);
        f.lost.notifyObservers(f.engine);
        expect(f.api.disarm).toHaveBeenCalledOnce();
        expect(f.api.fail).not.toHaveBeenCalled();
    });
});
