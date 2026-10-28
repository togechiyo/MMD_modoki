import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Scene } from "@babylonjs/core/scene";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { captureRadianceAlbedo, RADIANCE_ALBEDO_PATCH } from "./luminous-radiance-albedo";

const engines: NullEngine[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const engine of engines.splice(0)) engine.dispose(); });
const flushMaterialNotifications = () => new Promise<void>(resolve => Tools.SetImmediate(resolve));

function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), mesh = CreateBox("receiver", {}, scene);
    // Exercise the real plugin lifecycle and uniform binding without compiling a GPU shader.
    vi.spyOn(StandardMaterial.prototype, "shaderLanguage", "get").mockReturnValue(ShaderLanguage.WGSL);
    const material = new StandardMaterial("receiver", scene), buffer = new UniformBuffer(engine);
    mesh.material = material;
    const write = vi.spyOn(buffer, "updateFloat").mockImplementation(() => undefined);
    const enabled = (passId: number, target = material): number => {
        const plugin = target.pluginManager?.getPlugin("RadianceAlbedoCapture");
        if (!plugin) throw new Error("RC albedo plugin missing");
        write.mockClear(); engine.currentRenderPassId = passId;
        plugin.hardBindForSubMesh(buffer, scene, engine, mesh.subMeshes[0]);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0][0]).toBe("radianceAlbedoCapture");
        return write.mock.calls[0][1];
    };
    return { scene, material, enabled };
}

describe("RC Standard/MMD surface color capture", () => {
    it("matches the installed albedo output and changes only that output in the RC pass", () => {
        const original = "fragData[PREPASS_ALBEDO_INDEX]=vec4f(baseColor.rgb,writeGeometryInfo);";
        expect(defaultPixelShaderWGSL.shader).toContain(original);
        const patched = defaultPixelShaderWGSL.shader.replace(original, RADIANCE_ALBEDO_PATCH);
        expect(patched).toContain("uniforms.radianceAlbedoCapture > 0.5");
        expect(patched).toContain("baseColor.rgb * uniforms.vDiffuseColor.rgb");
        expect(patched).toContain("else { fragData[PREPASS_ALBEDO_INDEX] = vec4f(baseColor.rgb, writeGeometryInfo); }");
        expect(patched).toContain("fragData[PREPASS_NORMAL_INDEX]");
        expect(patched).toContain("fragData[PREPASS_DEPTH_INDEX]");
    });

    it("retains a shared pass until its last capture is released and keeps other passes independent", () => {
        const { scene, enabled } = fixture();
        const first = captureRadianceAlbedo(scene, 5), second = captureRadianceAlbedo(scene, 5);
        const other = captureRadianceAlbedo(scene, 8);
        expect(enabled(5)).toBe(1); expect(enabled(8)).toBe(1); expect(enabled(9)).toBe(0);
        first(); first();
        expect(enabled(5)).toBe(1); expect(enabled(8)).toBe(1);
        second();
        expect(enabled(5)).toBe(0); expect(enabled(8)).toBe(1);
        other(); other();
        expect(enabled(8)).toBe(0);
    });

    it("registers delayed new materials for surviving captures once even when the material is re-added", async () => {
        const { scene, enabled } = fixture();
        const first = captureRadianceAlbedo(scene, 5), second = captureRadianceAlbedo(scene, 5);
        const added = new StandardMaterial("added", scene);
        first();
        await flushMaterialNotifications();
        expect(enabled(5, added)).toBe(1);
        scene.removeMaterial(added); scene.addMaterial(added);
        await flushMaterialNotifications();
        second();
        expect(enabled(5, added)).toBe(0);
    });

    it("releases captured materials even after they leave the scene material list", () => {
        const { scene, material, enabled } = fixture();
        const release = captureRadianceAlbedo(scene, 5);
        scene.removeMaterial(material);
        release();
        expect(enabled(5)).toBe(0);
    });

    it("does not install a queued plugin after its capture is released", async () => {
        const { scene } = fixture();
        const release = captureRadianceAlbedo(scene, 5), added = new StandardMaterial("added", scene);
        scene.onNewMaterialAddedObservable.notifyObservers(added);
        release();
        await flushMaterialNotifications();
        expect(Boolean(added.pluginManager?.getPlugin("RadianceAlbedoCapture"))).toBe(false);
    });

    it("does not install a queued plugin on a disposed material", async () => {
        const { scene } = fixture();
        const release = captureRadianceAlbedo(scene, 5), added = new StandardMaterial("added", scene);
        scene.onNewMaterialAddedObservable.notifyObservers(added);
        added.dispose();
        await flushMaterialNotifications();
        expect(Boolean(added.pluginManager?.getPlugin("RadianceAlbedoCapture"))).toBe(false);
        expect(() => { release(); release(); }).not.toThrow();
    });

    it("allows scene disposal before queued registration and subsequent capture release", async () => {
        const { scene } = fixture();
        const release = captureRadianceAlbedo(scene, 5), added = new StandardMaterial("added", scene);
        scene.onNewMaterialAddedObservable.notifyObservers(added);
        scene.dispose();
        await flushMaterialNotifications();
        expect(Boolean(added.pluginManager?.getPlugin("RadianceAlbedoCapture"))).toBe(false);
        expect(() => { release(); release(); }).not.toThrow();
    });
});
