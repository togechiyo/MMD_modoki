import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { setThinTranslucencyShadow } from "./thin-translucency-shadow";

// Babylon 9.2 applies texture.level to reflected irradiance, but omits it
// from transmitted irradiance. Match the two paths for this preset only.
class ThinTranslucencyPlugin extends MaterialPluginBase {
    private active = false;
    constructor(material: PBRMaterial) {
        super(material, "ThinTranslucency", 215, { THIN_TRANSLUCENCY: false });
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
        (defines as MaterialDefines & { THIN_TRANSLUCENCY: boolean }).THIN_TRANSLUCENCY = this.active;
    }
    getCustomCode(type: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
        if (type !== "fragment") return null;
        const info = language === ShaderLanguage.WGSL ? "uniforms.vReflectionInfos" : "vReflectionInfos";
        return { "!outParams\\.refractionIrradiance=refractionIrradiance;": `
#ifdef THIN_TRANSLUCENCY
refractionIrradiance *= ${info}.x;
#endif
outParams.refractionIrradiance = refractionIrradiance;
` };
    }
}
const plugins = new WeakMap<PBRMaterial, ThinTranslucencyPlugin>();
export function setThinTranslucency(material: PBRMaterial, enabled: boolean): void {
    setThinTranslucencyShadow(material, enabled);
    let plugin = plugins.get(material);
    if (!plugin && enabled) { plugin = new ThinTranslucencyPlugin(material); plugins.set(material, plugin); }
    plugin?.setActive(enabled);
}
