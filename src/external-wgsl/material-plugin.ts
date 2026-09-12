import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { EffectAsset, EffectAssignment, EffectValue } from "./contract";

const interfaces = `
struct ModokiSurface { positionWS: vec3f, normalWS: vec3f, uv0: vec2f, baseColor: vec3f, diffuseColor: vec3f, };
struct ModokiSurfaceOutput { baseColor: vec3f, diffuseColor: vec3f, normalWS: vec3f, };
struct ModokiFinalColor { surface: ModokiSurface, color: vec3f, };
`;
let nextRevision = 1;
export class ExternalWgslMaterialPlugin extends MaterialPluginBase {
    private asset: EffectAsset | null = null;
    private buffer: UniformBuffer | null = null;
    private generation = 0;
    public assignment: EffectAssignment | null = null;
    public failure: string | null = null;
    constructor(material: StandardMaterial, private readonly values: (asset: EffectAsset, assignment: EffectAssignment, mesh: AbstractMesh) => Record<string, EffectValue>) {
        super(material, "ModokiExternalMaterial", 1000, { MODOKI_EFFECT_REV: 0, MODOKI_HAS_UV: false }, true, false);
        this.doNotSerialize = true;
        this.registerForExtraEvents = true;
        this._enable(true);
    }
    public isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public configure(asset: EffectAsset | null, assignment: EffectAssignment | null): void {
        if (asset?.revision === this.asset?.revision && Boolean(asset) === Boolean(this.asset)) { this.assignment = assignment; return; }
        this.buffer?.dispose(); this.buffer = null;
        this.asset = asset; this.assignment = assignment; this.failure = null;
        this.generation = asset ? nextRevision++ : 0;
        const fields = this.fields();
        if (fields.length) {
            const buffer = new UniformBuffer(this._material.getScene().getEngine(), undefined, true, "modokiInputs");
            for (const [name, field] of fields) buffer.addUniform(name, field.type === "mat4x4f" ? 16 : field.type.startsWith("vec") ? Number(field.type[3]) : 1);
            buffer.create(); this.buffer = buffer;
        }
        this.markAllDefinesAsDirty();
        this._material.resetDrawCache();
    }
    private fields() { return Object.entries({ ...this.asset?.manifest.inputs, ...this.asset?.manifest.parameters }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0); }
    public prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
        Object.assign(defines, { MODOKI_EFFECT_REV: this.generation, MODOKI_HAS_UV: Boolean(this.asset && mesh.isVerticesDataPresent("uv")) });
    }
    public getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh): void {
        if (this.asset && mesh.isVerticesDataPresent("uv") && !attributes.includes("uv")) attributes.push("uv");
    }
    public getUniformBuffersNames(names: string[]): void { names.push("modokiInputs"); }
    public hardBindForSubMesh(_buffer: UniformBuffer, _scene: Scene, _engine: unknown, subMesh: SubMesh): void {
        if (!this.asset || !this.assignment || !this.buffer || !subMesh.effect) return;
        try {
            const values = this.values(this.asset, this.assignment, subMesh.getRenderingMesh());
            for (const [name, field] of this.fields()) {
                const value = values[name];
                if (field.type === "i32") this.buffer.updateInt(name, value as number);
                else if (field.type === "u32") this.buffer.updateUInt(name, value as number);
                else { const data = Array.isArray(value) ? value : [value]; this.buffer.updateUniform(name, data, data.length); }
            }
            this.buffer.update();
            const data = this.buffer.getBuffer();
            if (data) subMesh.effect.bindUniformBuffer(data, "modokiInputs");
        } catch (error) {
            this.configure(null, this.assignment);
            this.failure = error instanceof Error ? error.message : String(error);
        }
    }
    public generatedSource(): string {
        if (!this.asset) return "";
        const fields = this.fields();
        return interfaces + (fields.length ? `struct ModokiEffectInputs {\n${fields.map(([name, field]) => `    ${name}: ${field.type},`).join("\n")}\n};\nvar<uniform> modokiInputs: ModokiEffectInputs;\n` : "")
            + this.asset.sources.map(s => `\n// Source: ${s.path}\n${s.text}\n`).join("");
    }
    public getCustomCode(shaderType: string): Record<string, string> {
        // Always register the same injection points, including before an effect is selected.
        if (shaderType === "vertex") return {
            CUSTOM_VERTEX_DEFINITIONS: this.asset ? "#if MODOKI_EFFECT_REV > 0\n#ifndef UV1\n#ifdef MODOKI_HAS_UV\nattribute uv: vec2f;\n#endif\n#endif\nvarying modokiUV0: vec2f;\n#endif" : "",
            CUSTOM_VERTEX_MAIN_END: this.asset ? "#ifdef MODOKI_HAS_UV\nvertexOutputs.modokiUV0 = vertexInputs.uv;\n#else\nvertexOutputs.modokiUV0 = vec2f(0.0);\n#endif" : "",
        };
        const hooks = this.asset?.manifest.hooks;
        return {
            CUSTOM_FRAGMENT_DEFINITIONS: this.asset ? "varying modokiUV0: vec2f;\n" + this.generatedSource() : "",
            CUSTOM_FRAGMENT_BEFORE_LIGHTS: this.asset ? `
var modokiSurface = ModokiSurface(fragmentInputs.vPositionW, normalW, fragmentInputs.modokiUV0, baseColor.rgb, diffuseColor);
${hooks?.surface ? `let modokiOutput = ${hooks.surface}(modokiSurface);
baseColor = vec4f(modokiOutput.baseColor, baseColor.a);
diffuseColor = modokiOutput.diffuseColor;
if (dot(modokiOutput.normalWS, modokiOutput.normalWS) > 0.00000001) { normalW = normalize(modokiOutput.normalWS); }
modokiSurface = ModokiSurface(fragmentInputs.vPositionW, normalW, fragmentInputs.modokiUV0, baseColor.rgb, diffuseColor);` : ""}` : "",
            CUSTOM_FRAGMENT_BEFORE_FOG: hooks?.finalColor ? `color = vec4f(${hooks.finalColor}(ModokiFinalColor(modokiSurface, color.rgb)), color.a);` : "",
        };
    }
    public dispose(): void { this.buffer?.dispose(); this.buffer = null; this.asset = null; }
}
