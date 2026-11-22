import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { isCaptureRenderTargetReady, normalizeExportRgbaAlpha, normalizeExportRgbaRows, unpremultiplyExportRgba } from "./export-render-surface";

describe("isCaptureRenderTargetReady", () => {
    const mesh = { name: "restored-model" } as Scene["meshes"][number];
    const engines: NullEngine[] = [];
    afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
    function captureScene() {
        const engine = new NullEngine();
        engines.push(engine);
        const scene = new Scene(engine);
        scene.activeCamera = new FreeCamera("camera", Vector3.Zero(), scene);
        const target = new RenderTargetTexture("capture", 16, scene);
        target.renderList = null;
        return { engine, scene, target };
    }

    it("starts readiness on every visible mesh in the capture pass while the first material is compiling", () => {
        const { engine, scene, target } = captureScene();
        const first = CreateBox("pending", {}, scene);
        const hidden = CreateBox("hidden", {}, scene); hidden.isVisible = false;
        const last = CreateBox("also needs compilation", {}, scene);
        const probe = (ready: boolean) => (completeCheck?: boolean) => {
            expect(completeCheck).toBe(true);
            expect(engine.currentRenderPassId).toBe(target.renderPassId);
            return ready;
        };
        const firstReady = vi.spyOn(first, "isReady").mockImplementation(probe(false));
        const hiddenReady = vi.spyOn(hidden, "isReady");
        const lastReady = vi.spyOn(last, "isReady").mockImplementation(probe(true));
        const previousPass = engine.currentRenderPassId;
        expect(isCaptureRenderTargetReady(target, scene.meshes)).toBe(false);
        expect(lastReady).toHaveBeenCalledOnce();
        expect(hiddenReady).not.toHaveBeenCalled();
        expect(target.renderList).toBeNull();
        expect(engine.currentRenderPassId).toBe(previousPass);
        firstReady.mockImplementation(probe(true));
        expect(isCaptureRenderTargetReady(target, scene.meshes)).toBe(true);
        expect(lastReady).toHaveBeenCalledTimes(2);
    });

    it("honors an explicit list and custom readiness callback, including its native receiver, arguments and errors", () => {
        const { scene, target } = captureScene();
        const first = CreateBox("first", {}, scene), last = CreateBox("last", {}, scene);
        const skipped = CreateBox("outside explicit list", {}, scene);
        const fallback = vi.spyOn(first, "isReady");
        const callback = vi.fn<NonNullable<typeof target.customIsReadyFunction>>().mockReturnValue(true);
        target.customIsReadyFunction = callback;
        target.renderList = [first];
        expect(target.isReadyForRendering()).toBe(true);
        const receiver = callback.mock.contexts[0];
        expect(receiver).toBeDefined();
        callback.mockClear(); callback.mockImplementation(mesh => mesh !== first);
        const explicit = [first, last];
        target.renderList = explicit;
        expect(isCaptureRenderTargetReady(target, [skipped])).toBe(false);
        expect(callback.mock.calls.map(([mesh, rate, preWarm]) => [mesh.name, rate, preWarm]))
            .toEqual([[first.name, target.refreshRate, true], [last.name, target.refreshRate, true]]);
        expect(callback.mock.contexts.every(context => context === receiver)).toBe(true);
        expect(fallback).not.toHaveBeenCalled();
        expect(target.customIsReadyFunction).toBe(callback);
        expect(target.renderList).toBe(explicit);
        callback.mockImplementation(() => { throw Error("material failed"); });
        expect(() => isCaptureRenderTargetReady(target, [skipped])).toThrow("material failed");
        expect(target.customIsReadyFunction).toBe(callback);
        expect(target.renderList).toBe(explicit);
    });

    it("remains unready when the native particle check fails after its meshes are ready", () => {
        const { scene, target } = captureScene();
        const mesh = CreateBox("ready", {}, scene);
        const meshReady = vi.spyOn(mesh, "isReady").mockReturnValue(true);
        const particles = new ParticleSystem("pending particles", 2, scene);
        const particleReady = vi.spyOn(particles, "isReady").mockReturnValue(false);
        target.particleSystemList = [particles];
        expect(isCaptureRenderTargetReady(target, [mesh])).toBe(false);
        expect(meshReady).toHaveBeenCalledWith(true);
        expect(particleReady).toHaveBeenCalledOnce();
        particleReady.mockReturnValue(true);
        expect(isCaptureRenderTargetReady(target, [mesh])).toBe(true);
    });

    it.each([true, false])("checks restored scene meshes without an active-mesh list (ready=%s)", (ready) => {
        const meshes = [mesh];
        const target = {
            renderList: null as Scene["meshes"] | null,
            isReadyForRendering: vi.fn(() => {
                expect(target.renderList).toBe(meshes);
                return ready;
            }),
        };
        expect(isCaptureRenderTargetReady(target, meshes)).toBe(ready);
        expect(target.isReadyForRendering).toHaveBeenCalledOnce();
        expect(target.renderList).toBeNull();
    });

    it.each([{ renderList: [] }, { renderList: [mesh] }])("preserves an explicit render list $renderList", ({ renderList }) => {
        const target = {
            renderList,
            isReadyForRendering: () => {
                expect(target.renderList).toBe(renderList);
                return true;
            },
        };
        expect(isCaptureRenderTargetReady(target, [])).toBe(true);
        expect(target.renderList).toBe(renderList);
    });

    it("supports a scene without meshes", () => {
        const target = { renderList: null, isReadyForRendering: () => true };
        expect(isCaptureRenderTargetReady(target, [])).toBe(true);
        expect(target.renderList).toBeNull();
    });

    it("restores the render list when readiness throws", () => {
        const target = {
            renderList: null,
            isReadyForRendering: () => { throw new Error("compilation failed"); },
        };
        expect(() => isCaptureRenderTargetReady(target, [mesh])).toThrow("compilation failed");
        expect(target.renderList).toBeNull();
    });
});

describe("normalizeExportRgbaAlpha", () => {
    it("makes opaque output fully opaque while preserving the rendered RGB", () => {
        const pixels = new Uint8Array([0, 152, 0, 0, 25, 50, 75, 128, 9, 8, 7, 255]);
        expect([...normalizeExportRgbaAlpha(pixels, "opaque")]).toEqual([
            0, 152, 0, 255, 25, 50, 75, 255, 9, 8, 7, 255,
        ]);
    });

    it("keeps straight-alpha transparency and unpremultiplies the RGB", () => {
        const pixels = new Uint8Array([64, 32, 16, 128, 12, 13, 14, 0]);
        expect([...normalizeExportRgbaAlpha(pixels, "straight")]).toEqual([
            128, 64, 32, 128, 0, 0, 0, 0,
        ]);
    });
});

describe("normalizeExportRgbaRows", () => {
    it("converts bottom-to-top RGBA readback into top-to-bottom row order", () => {
        const bottomRow = [1, 2, 3, 4, 5, 6, 7, 8];
        const topRow = [9, 10, 11, 12, 13, 14, 15, 16];
        const source = new Uint8Array([...bottomRow, ...topRow]);

        const result = normalizeExportRgbaRows(source, 2, 2);

        expect([...result]).toEqual([...topRow, ...bottomRow]);
        expect([...source]).toEqual([...bottomRow, ...topRow]);
    });

    it("rejects undersized readback buffers", () => {
        expect(() => normalizeExportRgbaRows(new Uint8Array(3), 1, 1)).toThrow(
            "RGBA readback is too small",
        );
    });
});

describe("unpremultiplyExportRgba", () => {
    it("converts premultiplied RGB into straight alpha RGB", () => {
        const pixels = new Uint8Array([
            64, 32, 16, 128,
            9, 8, 7, 255,
            12, 13, 14, 0,
        ]);

        expect([...unpremultiplyExportRgba(pixels)]).toEqual([
            128, 64, 32, 128,
            9, 8, 7, 255,
            0, 0, 0, 0,
        ]);
    });

    it("clamps rounding overflow", () => {
        const pixels = new Uint8Array([200, 1, 0, 128]);

        expect([...unpremultiplyExportRgba(pixels)]).toEqual([255, 2, 0, 128]);
    });
});
