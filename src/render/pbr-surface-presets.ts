import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { setThinTranslucency } from "./pbr-thin-translucency-plugin";

export const PBR_SURFACE_PRESETS = {
    "pbr-metal-polished": { label: "Metal Polished", metallic: 1, roughness: 0.2 },
    "pbr-metal-satin": { label: "Metal Satin", metallic: 1, roughness: 0.45 },
    "pbr-plastic-glossy": { label: "Plastic Glossy", metallic: 0, roughness: 0.25 },
    "pbr-clay-white": { label: "Clay White", metallic: 0, roughness: 1 },
    "pbr-cotton": { label: "Cotton", metallic: 0, roughness: 0.9 },
    "pbr-satin": { label: "Satin", metallic: 0, roughness: 0.3 },
    "pbr-velvet": { label: "Velvet", metallic: 0, roughness: 0.85 },
    "pbr-leather": { label: "Leather", metallic: 0, roughness: 0.45 },
    "pbr-emissive": { label: "Emissive", metallic: 0, roughness: 1 },
    "pbr-candy-coat": { label: "Candy Coat", metallic: 1, roughness: 0.25 },
    "pbr-pearl": { label: "Pearl", metallic: 0.15, roughness: 0.35 },
    "pbr-aurora": { label: "Aurora", metallic: 0.8, roughness: 0.2 },
    "pbr-thin-translucent": { label: "Thin Translucent", metallic: 0, roughness: 0.85 },
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
        emissiveIntensity: material.emissiveIntensity,
    };
}
const snapshots = new WeakMap<PBRMaterial, ReturnType<typeof capture>>();
const plugins = new WeakMap<PBRMaterial, ClayWhitePlugin>();
const layers = new WeakMap<PBRMaterial, boolean[]>();
function captureFabric(material: PBRMaterial) {
    return {
        sheen: {
            isEnabled: material.sheen.isEnabled, intensity: material.sheen.intensity,
            color: material.sheen.color.clone(), roughness: material.sheen.roughness,
            linkSheenWithAlbedo: material.sheen.linkSheenWithAlbedo,
            albedoScaling: material.sheen.albedoScaling,
            texture: material.sheen.texture, textureRoughness: material.sheen.textureRoughness,
        },
        anisotropy: {
            isEnabled: material.anisotropy.isEnabled, intensity: material.anisotropy.intensity,
            direction: material.anisotropy.direction.clone(), texture: material.anisotropy.texture,
        },
        clearCoatEnabled: material.clearCoat.isEnabled,
        iridescenceEnabled: material.iridescence.isEnabled,
    };
}
const fabrics = new WeakMap<PBRMaterial, ReturnType<typeof captureFabric>>();
function captureCoating(material: PBRMaterial) {
    const coat = material.clearCoat;
    const film = material.iridescence;
    return {
        coat: { isEnabled: coat.isEnabled, intensity: coat.intensity, roughness: coat.roughness,
            indexOfRefraction: coat.indexOfRefraction, isTintEnabled: coat.isTintEnabled,
            texture: coat.texture, textureRoughness: coat.textureRoughness, bumpTexture: coat.bumpTexture },
        film: { isEnabled: film.isEnabled, intensity: film.intensity, indexOfRefraction: film.indexOfRefraction,
            minimumThickness: film.minimumThickness, maximumThickness: film.maximumThickness,
            texture: film.texture, thicknessTexture: film.thicknessTexture },
    };
}
const coatings = new WeakMap<PBRMaterial, ReturnType<typeof captureCoating>>();
const thinMaps = new WeakMap<PBRMaterial, {
    thicknessTexture: PBRMaterial["subSurface"]["thicknessTexture"];
    translucencyIntensityTexture: PBRMaterial["subSurface"]["translucencyIntensityTexture"];
}>();

export function restorePbrSurfacePreset(material: unknown): void {
    if (!(material instanceof PBRMaterial)) return;
    const snapshot = snapshots.get(material);
    if (snapshot) {
        Object.assign(material, snapshot);
        const maps = thinMaps.get(material);
        if (maps) { Object.assign(material.subSurface, maps); thinMaps.delete(material); }
        const enabled = layers.get(material);
        if (enabled) [material.clearCoat, material.sheen, material.anisotropy, material.iridescence, material.detailMap]
            .forEach((layer, index) => { layer.isEnabled = enabled[index]; });
        snapshots.delete(material);
        layers.delete(material);
        const fabric = fabrics.get(material);
        if (fabric) {
            Object.assign(material.sheen, fabric.sheen);
            Object.assign(material.anisotropy, fabric.anisotropy);
            material.clearCoat.isEnabled = fabric.clearCoatEnabled;
            material.iridescence.isEnabled = fabric.iridescenceEnabled;
            fabrics.delete(material);
        }
        const coating = coatings.get(material);
        if (coating) {
            Object.assign(material.clearCoat, coating.coat);
            Object.assign(material.iridescence, coating.film);
            coatings.delete(material);
        }
    }
    plugins.get(material)?.setActive(false);
    setThinTranslucency(material, false);
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
    if (["pbr-emissive", "pbr-candy-coat", "pbr-pearl", "pbr-aurora"].includes(preset)) {
        fabrics.set(material, captureFabric(material));
        coatings.set(material, captureCoating(material));
        material.sheen.isEnabled = false;
        material.anisotropy.isEnabled = false;
        material.clearCoat.isEnabled = preset === "pbr-candy-coat" || preset === "pbr-pearl";
        material.iridescence.isEnabled = preset === "pbr-pearl" || preset === "pbr-aurora";
        if (preset === "pbr-emissive") {
            material.emissiveColor = material.albedoColor.clone();
            material.emissiveTexture = material.albedoTexture;
            material.emissiveIntensity = 1;
            material.directIntensity = 0;
            material.environmentIntensity = 0;
            material.specularIntensity = 0;
        }
        if (material.clearCoat.isEnabled) {
            material.clearCoat.intensity = 1;
            material.clearCoat.roughness = preset === "pbr-pearl" ? 0.2 : 0.08;
            material.clearCoat.indexOfRefraction = 1.5;
            material.clearCoat.isTintEnabled = false;
            material.clearCoat.texture = null;
            material.clearCoat.textureRoughness = null;
            material.clearCoat.bumpTexture = null;
        }
        if (material.iridescence.isEnabled) {
            material.iridescence.intensity = preset === "pbr-pearl" ? 0.3 : 1;
            material.iridescence.indexOfRefraction = 1.3;
            material.iridescence.minimumThickness = 100;
            material.iridescence.maximumThickness = preset === "pbr-pearl" ? 300 : 400;
            material.iridescence.texture = null;
            material.iridescence.thicknessTexture = null;
        }
    }
    if (["pbr-cotton", "pbr-satin", "pbr-velvet", "pbr-leather", "pbr-thin-translucent"].includes(preset)) {
        fabrics.set(material, captureFabric(material));
        material.clearCoat.isEnabled = false;
        material.iridescence.isEnabled = false;
        material.sheen.isEnabled = preset === "pbr-velvet";
        material.anisotropy.isEnabled = preset === "pbr-satin";
        if (preset === "pbr-velvet") {
            material.sheen.intensity = 0.8;
            material.sheen.color = Color3.White();
            material.sheen.roughness = 0.7;
            // Linked sheen multiplies diffuse albedo by (1-intensity)^5.
            // Preserve the original fabric color and add the grazing highlight.
            material.sheen.linkSheenWithAlbedo = false;
            material.sheen.albedoScaling = false;
            material.sheen.texture = null;
            material.sheen.textureRoughness = null;
        }
        if (preset === "pbr-satin") {
            material.anisotropy.intensity = 0.5;
            material.anisotropy.direction.set(1, 0);
            material.anisotropy.texture = null;
        }
        if (preset === "pbr-cotton") material.specularIntensity = 0.35;
        if (preset === "pbr-thin-translucent") {
            const ss = material.subSurface;
            thinMaps.set(material, { thicknessTexture: ss.thicknessTexture, translucencyIntensityTexture: ss.translucencyIntensityTexture });
            ss.isTranslucencyEnabled = true;
            setThinTranslucency(material, true);
            ss.translucencyIntensity = 0.35;
            ss.legacyTranslucency = false;
            ss.minimumThickness = 0;
            ss.maximumThickness = 0.05;
            ss.tintColor = Color3.White();
            ss.translucencyColor = Color3.White();
            ss.useAlbedoToTintTranslucency = true;
            ss.thicknessTexture = null;
            ss.translucencyIntensityTexture = null;
            ss.translucencyColorTexture = null;
            material.specularIntensity = 0.35;
        }
        if (preset === "pbr-velvet") material.specularIntensity = 0.25;
    }
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
