import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Material } from "@babylonjs/core/Materials/material";
import { UnregisterMaterialPlugin } from "@babylonjs/core/Materials/materialPluginManager";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";
import { defaultPixelShader } from "@babylonjs/core/Shaders/default.fragment";
import { pbrPixelShader } from "@babylonjs/core/Shaders/pbr.fragment";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { pbrPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/pbr.fragment";
import { installCsmDistanceFadePlugin } from "./csm-distance-fade-plugin";

const engines: NullEngine[] = [];
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    installCsmDistanceFadePlugin();
    const scene = new Scene(engine), camera = new FreeCamera("camera", Vector3.Zero(), scene);
    camera.maxZ = 100000;
    const material = new StandardMaterial("receiver", scene);
    const mesh = CreateBox("receiver", {}, scene); mesh.material = material;
    return { engine, scene, camera, material, mesh };
}

function pluginFor(material: Material) {
    const plugin = material.pluginManager?.getPlugin("MmdCsmDistanceFade");
    if (!plugin) throw new Error("CSM fade plugin missing");
    return plugin;
}

// NullEngine cannot render CSM textures. Keep real material/light lifecycle,
// but provide only the generator type and configured distance used by binding.
function csm(end: number): CascadedShadowGenerator {
    const generator = Object.create(CascadedShadowGenerator.prototype) as CascadedShadowGenerator;
    Object.defineProperty(generator, "shadowMaxZ", { value: end, writable: true });
    return generator;
}

afterEach(() => {
    while (engines.length) engines.pop()?.dispose();
    UnregisterMaterialPlugin("MmdCsmDistanceFade");
    vi.restoreAllMocks();
});

describe("CSM distance fade uniform binding", () => {
    it("injects the fade guard into installed Standard and PBR shaders in both languages", () => {
        const { scene } = fixture();
        for (const [name, shader, isPbr] of [
            ["standard GLSL", defaultPixelShader.shader, false],
            ["standard WGSL", defaultPixelShaderWGSL.shader, false],
            ["PBR GLSL", pbrPixelShader.shader, true],
            ["PBR WGSL", pbrPixelShaderWGSL.shader, true],
        ] as const) {
            const material = isPbr ? new PBRMaterial(name, scene) : new StandardMaterial(name, scene);
            material.maxSimultaneousLights = 3;
            material.buildUniformLayout();
            const manager = material.pluginManager as unknown as {
                _injectCustomCode: (event: object) => (type: string, source: string) => string;
            };
            const injected = manager._injectCustomCode({})("fragment", shader);
            expect(injected.match(/^#define MMD_CSM_FADE_LIGHT_COUNT 3$/gm), name).toHaveLength(1);
        }
    });

    it("registers Standard and PBR materials and reads their final light counts after construction", () => {
        const { scene, material } = fixture();
        installCsmDistanceFadePlugin();
        material.maxSimultaneousLights = 5;
        expect(pluginFor(material).getUniforms().ubo).toHaveLength(5);
        const pbr = new PBRMaterial("pbr", scene); pbr.maxSimultaneousLights = 2;
        expect(pluginFor(pbr).getUniforms().ubo).toHaveLength(2);
        expect(pluginFor(pbr).getCustomCode("fragment")?.CUSTOM_FRAGMENT_DEFINITIONS).toBe("#define MMD_CSM_FADE_LIGHT_COUNT 2");
        const unlit = new StandardMaterial("unlit", scene); unlit.maxSimultaneousLights = 0;
        expect(pluginFor(unlit).getUniforms()).toEqual({ ubo: [] });
        expect(pluginFor(unlit).getCustomCode("fragment")?.CUSTOM_FRAGMENT_DEFINITIONS).toBe("#define MMD_CSM_FADE_LIGHT_COUNT 0");
        const unsupported = new Material("custom", scene);
        expect(unsupported.pluginManager?.getPlugin("MmdCsmDistanceFade")).toBeFalsy();
    });

    it("uses the bound mesh's light order and updates frozen shared materials through the hard-bind event", () => {
        const { scene, material, mesh } = fixture();
        pluginFor(material).getUniforms();
        const first = new DirectionalLight("first", Vector3.Down(), scene);
        const second = new DirectionalLight("second", Vector3.Down(), scene);
        const ordinary = new DirectionalLight("ordinary", Vector3.Down(), scene);
        vi.spyOn(first, "getShadowGenerator").mockReturnValue(csm(1000));
        vi.spyOn(second, "getShadowGenerator").mockReturnValue(csm(1500));
        vi.spyOn(ordinary, "getShadowGenerator").mockReturnValue(Object.create(ShadowGenerator.prototype) as ShadowGenerator);
        const other = CreateBox("other receiver", {}, scene); other.material = material;
        mesh.lightSources.splice(0, mesh.lightSources.length, first, ordinary);
        other.lightSources.splice(0, other.lightSources.length, second, first);
        const write = vi.spyOn(material._uniformBuffer, "updateFloat").mockImplementation(() => undefined);
        material.freeze();
        material._callbackPluginEventHardBindForSubMesh({ subMesh: mesh.subMeshes[0] });
        expect(write.mock.calls).toEqual([
            ["mmdCsmShadowMaxZ0", 1000], ["mmdCsmShadowMaxZ1", 0],
            ["mmdCsmShadowMaxZ2", 0], ["mmdCsmShadowMaxZ3", 0],
        ]);
        write.mockClear();
        material._callbackPluginEventHardBindForSubMesh({ subMesh: other.subMeshes[0] });
        expect(write.mock.calls).toEqual([
            ["mmdCsmShadowMaxZ0", 1500], ["mmdCsmShadowMaxZ1", 1000],
            ["mmdCsmShadowMaxZ2", 0], ["mmdCsmShadowMaxZ3", 0],
        ]);
    });

    it("matches camera-specific fallback, tracks distance changes and treats zero camera far as infinite", () => {
        const { scene, camera, material, mesh } = fixture();
        material.maxSimultaneousLights = 1;
        pluginFor(material).getUniforms();
        const light = new DirectionalLight("light", Vector3.Down(), scene);
        const fallback = csm(1000), specific = csm(500);
        const otherCamera = new FreeCamera("other camera", Vector3.Zero(), scene);
        const lookup = vi.spyOn(light, "getShadowGenerator").mockImplementation(selected => selected === otherCamera
            ? specific : selected === undefined || selected === null ? fallback : null);
        mesh.lightSources.splice(0, mesh.lightSources.length, light);
        const write = vi.spyOn(material._uniformBuffer, "updateFloat").mockImplementation(() => undefined);
        const bind = () => {
            write.mockClear(); lookup.mockClear();
            material._callbackPluginEventHardBindForSubMesh({ subMesh: mesh.subMeshes[0] });
            return write.mock.calls;
        };
        scene.activeCamera = camera; camera.maxZ = 750;
        expect(bind()).toEqual([["mmdCsmShadowMaxZ0", 750]]);
        expect(lookup.mock.calls).toEqual([[camera], []]);
        camera.maxZ = 0;
        expect(bind()).toEqual([["mmdCsmShadowMaxZ0", 1000]]);
        fallback.shadowMaxZ = 1200;
        material.maxSimultaneousLights = 3;
        expect(bind()).toEqual([["mmdCsmShadowMaxZ0", 1200]]);
        expect(pluginFor(material).getCustomCode("fragment")?.CUSTOM_FRAGMENT_DEFINITIONS).toBe("#define MMD_CSM_FADE_LIGHT_COUNT 1");
        scene.activeCamera = otherCamera;
        expect(bind()).toEqual([["mmdCsmShadowMaxZ0", 500]]);
        expect(lookup.mock.calls).toEqual([[otherCamera]]);
    });

    it("registers again after Babylon clears plugin factories on final engine disposal", () => {
        const first = fixture();
        expect(pluginFor(first.material)).toBeTruthy();
        engines.pop()?.dispose();
        const second = fixture();
        expect(pluginFor(second.material).getUniforms().ubo).toHaveLength(4);
    });
});
