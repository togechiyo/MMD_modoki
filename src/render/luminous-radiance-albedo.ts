import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

// Standard/MMD's native albedo attachment contains the texture/vertex color, without diffuseColor.
// Replace only this output, and only in the RC geometry pass. PBR's native albedo is already linear.
export const RADIANCE_ALBEDO_PATCH = `
#ifdef RADIANCE_ALBEDO_CAPTURE
if (uniforms.radianceAlbedoCapture > 0.5) {
    fragData[PREPASS_ALBEDO_INDEX] = vec4f(toLinearSpaceVec3(clamp(baseColor.rgb * uniforms.vDiffuseColor.rgb, vec3f(0.0), vec3f(1.0))), writeGeometryInfo);
} else { fragData[PREPASS_ALBEDO_INDEX] = vec4f(baseColor.rgb, writeGeometryInfo); }
#else
fragData[PREPASS_ALBEDO_INDEX] = vec4f(baseColor.rgb, writeGeometryInfo);
#endif
`;

class RadianceAlbedoPlugin extends MaterialPluginBase {
    public readonly passes = new Set<number>();
    constructor(material: StandardMaterial) {
        super(material, "RadianceAlbedoCapture", 280, { RADIANCE_ALBEDO_CAPTURE: true }, true, false);
        this.doNotSerialize = true;
        this.registerForExtraEvents = true;
        this._enable(true);
        this.markAllDefinesAsDirty();
    }
    public override getClassName(): string { return "RadianceAlbedoPlugin"; }
    public override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public override prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { RADIANCE_ALBEDO_CAPTURE: boolean }).RADIANCE_ALBEDO_CAPTURE = true;
    }
    public override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: [{ name: "radianceAlbedoCapture", size: 1, type: "float" }] };
    }
    public override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, engine: AbstractEngine): void {
        buffer.updateFloat("radianceAlbedoCapture", this.passes.has(engine.currentRenderPassId) ? 1 : 0);
    }
    public override getCustomCode(type: string): Record<string, string> | null {
        return type === "fragment" ? {
            "!fragData\\[PREPASS_ALBEDO_INDEX\\]=vec4f\\(baseColor\\.rgb,writeGeometryInfo\\);": RADIANCE_ALBEDO_PATCH,
        } : null;
    }
}

const plugins = new WeakMap<StandardMaterial, RadianceAlbedoPlugin>();

export function captureRadianceAlbedo(scene: Scene, passId: number): () => void {
    let disposed = false;
    const register = (material: Material): void => {
        if (disposed || !(material instanceof StandardMaterial)) return;
        let plugin = plugins.get(material);
        if (!plugin) { plugin = new RadianceAlbedoPlugin(material); plugins.set(material, plugin); }
        plugin.passes.add(passId);
    };
    for (const material of scene.materials) register(material);
    // Material-added fires inside the base constructor; wait for Standard/MMD initialization to finish.
    const observer = scene.onNewMaterialAddedObservable.add(material => queueMicrotask(() => register(material)));
    return () => {
        disposed = true; scene.onNewMaterialAddedObservable.remove(observer);
        for (const material of scene.materials) if (material instanceof StandardMaterial) plugins.get(material)?.passes.delete(passId);
    };
}
