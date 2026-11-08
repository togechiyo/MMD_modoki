import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { RadianceSkyVisibilityField } from "../../../src/render/radiance-sky-visibility-field";
import { SkyAmbientPreviewPlugin } from "./material";

/** Original procedural fixture: no third-party model or texture. Not an app feature. */
export async function createSkyAmbientPreview() {
    if (!("mmdModokiE2e" in window)) throw new Error("Sky ambient preview requires E2E mode");
    const scene = EngineStore.LastCreatedScene;
    if (!scene || !scene.getEngine().isWebGPU) throw new Error("WebGPU scene required");
    const engine = scene.getEngine();
    scene.clearColor = new Color4(0.13, 0.15, 0.18, 1);
    for (const light of scene.lights) light.intensity = 0;
    const casters = new Set<Mesh>();
    const meshes: Mesh[] = [], materials: MmdStandardMaterial[] = [];
    const material = (name: string, color: string) => {
        const result = new MmdStandardMaterial(`sky-preview-${name}`, scene);
        result.diffuseColor = Color3.FromHexString(color);
        result.ambientColor = Color3.Black();
        result.specularColor = Color3.Black();
        result.emissiveColor = Color3.Black();
        materials.push(result);
        return result;
    };
    const plaster = material("plaster", "#E1D5BE");
    const floor = material("floor", "#DFD6C6");
    const blue = material("blue", "#47A8BE");
    const red = material("red", "#CD766C");
    const green = material("green", "#8EA878");
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        const shade = x === 0 || y === 0 ? 110 : ((x >> 4) + (y >> 4)) % 2 ? 255 : 175;
        pixels.set([shade, shade, shade, 255], i);
    }
    const tile = RawTexture.CreateRGBATexture(pixels, 32, 32, scene, true, false, Texture.BILINEAR_SAMPLINGMODE);
    tile.uScale = tile.vScale = 4;
    tile.wrapU = tile.wrapV = Texture.WRAP_ADDRESSMODE;
    floor.diffuseTexture = tile;
    const box = (name: string, dimensions: [number, number, number], position: [number, number, number],
        surface = plaster) => {
        const mesh = CreateBox(`sky-preview-${name}`, { width: dimensions[0], height: dimensions[1], depth: dimensions[2] }, scene);
        mesh.position.set(...position); mesh.material = surface;
        meshes.push(mesh); casters.add(mesh);
        return mesh;
    };
    box("plaza", [14, 0.2, 14], [0, -0.1, 0], floor);
    box("shop-back", [6, 5, 0.3], [-3.5, 2.5, 4.5]);
    box("shop-left", [0.3, 4, 4.5], [-6.35, 2, 2.1]);
    box("shop-window", [2.4, 2.2, 0.08], [-3.7, 1.8, 4.3], blue);
    box("window-mullion", [0.12, 2.3, 0.14], [-3.7, 1.8, 4.23]);
    box("window-crossbar", [2.5, 0.12, 0.14], [-3.7, 1.9, 4.23]);
    const roof = box("awning", [6.2, 0.22, 4.5], [-3.35, 3.25, 2.05], blue);
    box("awning-trim", [6.3, 0.28, 0.15], [-3.35, 3.15, -0.18], blue);
    box("room-left", [0.25, 4, 6], [0.1, 2, 2]);
    box("room-right", [0.25, 4, 6], [5.9, 2, 2]);
    box("room-back", [6, 4, 0.3], [3, 2, 5]);
    box("room-roof", [6.1, 0.25, 6.3], [3, 4.05, 2]);
    box("room-bench", [2.3, 0.45, 0.7], [3, 0.225, 3.9], red);
    box("planter", [0.9, 0.65, 0.9], [-5.2, 0.325, -1.1], red);
    box("plant", [0.65, 1, 0.65], [-5.2, 1.15, -1.1], green);
    const receiver = CreateSphere("sky-preview-moving-receiver", { diameter: 1.1, segments: 20 }, scene);
    receiver.position.set(-2, 0.6, -3); receiver.material = red; meshes.push(receiver);
    const volume = { min: [-8, -1, -8] as const, size: 16 };
    const field = new RadianceSkyVisibilityField(scene, { volume, diagnostic: false,
        opaqueOccludersOnly: true, materialIrradiance: true, acceptsMesh: mesh => casters.has(mesh) });
    field.source.update();
    await field.graph.buildAsync();
    await new Promise<void>(resolve => {
        const ready = scene.onBeforeRenderObservable.add(() => {
            if (field.graph.isReady()) { scene.onBeforeRenderObservable.remove(ready); resolve(); }
        });
    });
    const irradiance = field.irradianceField, nearest = field.nearestSurfaceField;
    if (!irradiance || !nearest) throw new Error("Sky fields missing");
    let occlusionEnabled = false, strength = 0.95, fill = 0.035;
    let submittedRevision = -1, fieldUpdates = 0, dispatches = 0, frames = 0;
    const update = () => {
        field.source.update(); frames++;
        if (submittedRevision === field.source.revision) return;
        const target = engine._currentRenderTarget, viewport = engine.currentViewport;
        const pass = engine.currentRenderPassId;
        try {
            dispatches += field.execute(0, true, { nearDistance: 8, rejectOccludedProbes: false, sampleAtRayEnd: true });
            engine.flushFramebuffer();
            submittedRevision = field.source.revision; fieldUpdates++;
        } finally {
            if (target) engine.bindFramebuffer(target);
            engine.currentRenderPassId = pass;
            if (viewport) engine.setViewport(viewport);
        }
    };
    update();
    for (const surface of materials) new SkyAmbientPreviewPlugin(surface, () => ({
        field: irradiance, nearestSurface: nearest, triangles: field.source.triangleBuffer,
        volume, strength, fill, occlusionEnabled,
    }));
    const observer = scene.onBeforeRenderObservable.add(update);
    const state = () => ({ frames, fieldUpdates, dispatches, sourceRevision: field.source.revision,
        geometryRevision: field.source.geometryRevision, triangles: field.source.bvh.triangleCount,
        casterCount: casters.size, occlusionEnabled, strength, fill,
        textureReady: tile.isReady(), textureEnabled: scene.texturesEnabled });
    return {
        state,
        setOcclusion(value: boolean) { occlusionEnabled = value; },
        setStrength(value: number) { strength = value; },
        setFill(value: number) { fill = value; },
        moveReceiver(x: number, z: number) { receiver.position.set(x, 0.6, z); },
        raiseAwning() { roof.position.y += 1; },
        samplePoints() {
            const camera = scene.activeCamera;
            if (!camera) throw new Error("Camera missing");
            const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
            return Object.fromEntries(Object.entries({ outside: [-2, 0.01, -4.5], porch: [-3.5, 0.01, 1],
                tileA: [-4.5, 0.01, -4.5], tileB: [-3, 0.01, -4.5],
                room: [3, 0.01, 2.8], receiver: receiver.position.asArray() }).map(([name, p]) => {
                const v = Vector3.Project(Vector3.FromArray(p), Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport);
                return [name, { x: v.x / engine.getRenderWidth(), y: v.y / engine.getRenderHeight() }];
            }));
        },
        dispose() {
            scene.onBeforeRenderObservable.remove(observer);
            for (const mesh of meshes) mesh.dispose();
            for (const surface of materials) surface.dispose();
            tile.dispose(); field.dispose();
        },
    };
}
