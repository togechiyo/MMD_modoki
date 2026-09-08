import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export const PBR_SURFACE_PRESETS = {
    "pbr-metal-polished": { label: "Metal Polished", metallic: 1, roughness: 0.2 },
    "pbr-metal-satin": { label: "Metal Satin", metallic: 1, roughness: 0.45 },
    "pbr-plastic-glossy": { label: "Plastic Glossy", metallic: 0, roughness: 0.25 },
    "pbr-clay-white": { label: "Clay White", metallic: 0, roughness: 1 },
} as const;

class ClayWhitePlugin extends MaterialPluginBase {
    private active = false;
    constructor(material: PBRMaterial) {
        super(material, "ClayWhite", 210, { CLAY_WHITE: false });
        this.doNotSerialize = true;
    }
    isCompatible(): boolean { return true; }
    setActive(active: boolean): void {
        if (this.active === active) return;
        this.active = active;
        this._enable(active);
        this.markAllDefinesAsDirty();
    }
    prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { CLAY_WHITE: boolean }).CLAY_WHITE = this.active;
    }
    getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
        if (shaderType !== "fragment") return null;
        // Keep the original albedo sample for alpha testing/blending; discard RGB only.
        return { CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef CLAY_WHITE
surfaceAlbedo = ${language === ShaderLanguage.WGSL ? "vec3f" : "vec3"}(1.0);
#endif
` };
    }
}

function capture(material: PBRMaterial) {
    return {
        metallic: material.metallic, metallicTexture: material.metallicTexture,
        reflectivityTexture: material.reflectivityTexture, microSurfaceTexture: material.microSurfaceTexture,
        bumpTexture: material.bumpTexture, ambientTexture: material.ambientTexture,
        emissiveTexture: material.emissiveTexture, emissiveColor: material.emissiveColor.clone(),
        directIntensity: material.directIntensity,
    };
}
const snapshots = new WeakMap<PBRMaterial, ReturnType<typeof capture>>();
const plugins = new WeakMap<PBRMaterial, ClayWhitePlugin>();
const layers = new WeakMap<PBRMaterial, boolean[]>();

export function restorePbrSurfacePreset(material: unknown): void {
    if (!(material instanceof PBRMaterial)) return;
    const snapshot = snapshots.get(material);
    if (snapshot) {
        Object.assign(material, snapshot);
        const enabled = layers.get(material);
        if (enabled) [material.clearCoat, material.sheen, material.anisotropy, material.iridescence, material.detailMap]
            .forEach((layer, index) => { layer.isEnabled = enabled[index]; });
        snapshots.delete(material);
        layers.delete(material);
    }
    plugins.get(material)?.setActive(false);
}

export function applyPbrSurfacePreset(material: unknown, preset: string): void {
    if (!(material instanceof PBRMaterial) || !(preset in PBR_SURFACE_PRESETS)) return;
    const settings = PBR_SURFACE_PRESETS[preset as keyof typeof PBR_SURFACE_PRESETS];
    snapshots.set(material, capture(material));
    material.metallic = settings.metallic;
    material.roughness = settings.roughness;
    material.metallicTexture = null;
    material.reflectivityTexture = null;
    material.microSurfaceTexture = null;
    material.specularIntensity = preset === "pbr-clay-white" ? 0 : 1;
    if (preset !== "pbr-clay-white") return;
    layers.set(material, [material.clearCoat, material.sheen, material.anisotropy, material.iridescence, material.detailMap]
        .map(layer => layer.isEnabled));
    [material.clearCoat, material.sheen, material.anisotropy, material.iridescence, material.detailMap]
        .forEach(layer => { layer.isEnabled = false; });
    material.bumpTexture = null;
    material.ambientTexture = null;
    material.emissiveTexture = null;
    material.emissiveColor = Color3.Black();
    material.directIntensity = 1;
    let plugin = plugins.get(material);
    if (!plugin) { plugin = new ClayWhitePlugin(material); plugins.set(material, plugin); }
    plugin.setActive(true);
}
