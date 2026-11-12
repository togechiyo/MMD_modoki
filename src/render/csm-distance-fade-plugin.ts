import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { RegisterMaterialPlugin } from "@babylonjs/core/Materials/materialPluginManager";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";

const PLUGIN_NAME = "MmdCsmDistanceFade";
type LitMaterial = StandardMaterial | PBRBaseMaterial;

class CsmDistanceFadePlugin extends MaterialPluginBase {
    private layoutLightCount = 0;

    constructor(private readonly owner: LitMaterial) {
        super(owner, PLUGIN_NAME, 190, {}, true, false);
        this.doNotSerialize = true;
        this.registerForExtraEvents = true;
        this._enable(true);
    }

    public override getClassName(): string { return "CsmDistanceFadePlugin"; }

    public override isCompatible(language: ShaderLanguage): boolean {
        return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
    }

    public override getUniforms(): {
        ubo: Array<{ name: string; size: number; type: string }>;
    } {
        // The factory runs in Material's base constructor, before the derived
        // material initializes its light count. Read it when building the UBO.
        const count = this.owner instanceof StandardMaterial
            ? this.owner.maxSimultaneousLights : this.owner._maxSimultaneousLights;
        this.layoutLightCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        return {
            ubo: Array.from({ length: this.layoutLightCount }, (_, index) => ({
                name: `mmdCsmShadowMaxZ${index}`, size: 1, type: "float",
            })),
        };
    }

    public override getCustomCode(shaderType: string): Record<string, string> | null {
        // Both GLSL and WGSL materials expose this marker. getUniforms().fragment
        // targets ADDITIONAL_FRAGMENT_DECLARATION, which WGSL shaders omit.
        // Read the captured layout count at final shader injection, not during
        // the factory's early collection of injection point names.
        return shaderType === "fragment" ? {
            CUSTOM_FRAGMENT_DEFINITIONS: `#define MMD_CSM_FADE_LIGHT_COUNT ${this.layoutLightCount}`,
        } : null;
    }

    public override hardBindForSubMesh(buffer: UniformBuffer, scene: Scene, _engine: AbstractEngine, subMesh: SubMesh): void {
        const lights = subMesh.getRenderingMesh().lightSources;
        const camera = scene.activeCamera;
        for (let index = 0; index < this.layoutLightCount; index++) {
            const light = lights[index];
            // Match Babylon Light._bindLight, including its default-camera fallback.
            const generator = light?.getShadowGenerator(camera) ?? light?.getShadowGenerator();
            const configuredEnd = generator instanceof CascadedShadowGenerator ? generator.shadowMaxZ : 0;
            const end = camera && camera.maxZ > 0 ? Math.min(configuredEnd, camera.maxZ) : configuredEnd;
            buffer.updateFloat(`mmdCsmShadowMaxZ${index}`, Number.isFinite(end) && end > 0 ? end : 0);
        }
    }
}

/** Register before creating scene materials; Babylon clears factories when all engines are disposed. */
export function installCsmDistanceFadePlugin(): void {
    RegisterMaterialPlugin(PLUGIN_NAME, material => {
        if (!(material instanceof StandardMaterial || material instanceof PBRBaseMaterial)) return null;
        return material.pluginManager?.getPlugin(PLUGIN_NAME) ?? new CsmDistanceFadePlugin(material);
    });
}
