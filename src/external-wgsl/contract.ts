import { z } from "zod";

const identifier = z.string().regex(/^(?!fx_|Modoki|modoki|__)[A-Za-z_][A-Za-z0-9_]*$/)
    .refine(value => !new Set("_ fn var let const override struct alias return if else for while loop break continue switch case default true false discard enable requires diagnostic".split(" ")).has(value), "Reserved WGSL identifier");
export const relativeEffectPath = z.string().min(1).refine(value =>
    !value.startsWith("/") && !/[\\:]/.test(value) && !Array.from(value).some(char => char.charCodeAt(0) < 32) && !value.split("/").includes(".."), "Expected a package-relative path");
const valueType = z.enum(["f32", "i32", "u32", "vec2f", "vec3f", "vec4f", "mat4x4f"]);
const inputSchema = z.object({
    type: valueType,
    semantic: z.string(),
    annotations: z.object({ Object: z.enum(["Geometry", "Camera", "Light"]).optional(), SyncInEditMode: z.boolean().optional() }).strict().optional(),
}).strict();
const parameterSchema = z.object({
    type: z.enum(["f32", "i32", "u32", "vec2f", "vec3f", "vec4f"]),
    default: z.union([z.number(), z.array(z.number())]),
    ui: z.object({ label: z.string().optional(), control: z.enum(["number", "color"]).optional(),
        min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() }).strict().optional(),
}).strict();
const manifestSchema = z.object({
    $schema: z.string().optional(), apiVersion: z.literal(1), kind: z.literal("mmd-material"), name: z.string().min(1), description: z.string().optional(),
    sources: z.array(relativeEffectPath).min(1), requires: z.array(z.enum(["uv0"])).optional(),
    hooks: z.object({ surface: identifier.optional(), finalColor: identifier.optional() }).strict(),
    inputs: z.record(identifier, inputSchema).optional(), parameters: z.record(identifier, parameterSchema).optional(),
    textures: z.object({}).strict().optional(),
}).strict();
export type EffectManifest = z.infer<typeof manifestSchema>;
export type EffectInput = z.infer<typeof inputSchema>;
export type EffectParameter = z.infer<typeof parameterSchema>;
export type EffectValue = number | number[];
export type EffectAssignment = { effectRevision: string; enabled: boolean; parameters: Record<string, EffectValue> };
export type EffectAsset = { revision: string; manifest: EffectManifest; sources: Array<{ path: string; text: string }>; originPath?: string };
export type EffectAssetReference = { revision: string; path: string; originPath?: string };
export type EffectTarget = { modelInstanceId: string; materialKey: string };
export type EffectChange = { target: EffectTarget; before: EffectAssignment | null; after: EffectAssignment | null };

const matrixBases = ["WORLD", "VIEW", "PROJECTION", "WORLDVIEW", "VIEWPROJECTION", "WORLDVIEWPROJECTION"];
export function matrixSemantic(semantic: string): { base: string; inverse: boolean; transpose: boolean } | null {
    for (const base of matrixBases) for (const suffix of ["", "INVERSE", "TRANSPOSE", "INVERSETRANSPOSE"]) {
        if (semantic === base + suffix) return { base, inverse: suffix.includes("INVERSE"), transpose: suffix.includes("TRANSPOSE") };
    }
    return null;
}
export function validateParameter(parameter: EffectParameter, value: EffectValue): void {
    const size = parameter.type.startsWith("vec") ? Number(parameter.type[3]) : 1;
    const values = Array.isArray(value) ? value : [value];
    if ((size === 1) !== !Array.isArray(value) || values.length !== size) throw new Error("Parameter shape does not match " + parameter.type);
    for (const n of values) {
        if (!Number.isFinite(Math.fround(n))) throw new Error("Parameter must be finite f32");
        if (parameter.type === "i32" && (!Number.isInteger(n) || n < -2147483648 || n > 2147483647)) throw new Error("Invalid i32");
        if (parameter.type === "u32" && (!Number.isInteger(n) || n < 0 || n > 4294967295)) throw new Error("Invalid u32");
        if (n < (parameter.ui?.min ?? -Infinity) || n > (parameter.ui?.max ?? Infinity)) throw new Error("Parameter outside its declared range");
    }
}
export function parseEffectManifest(value: unknown): EffectManifest {
    const manifest = manifestSchema.parse(value);
    if (!manifest.hooks.surface && !manifest.hooks.finalColor) throw new Error("At least one material hook is required");
    if (new Set(manifest.sources).size !== manifest.sources.length) throw new Error("Duplicate source path");
    for (const [name, input] of Object.entries(manifest.inputs ?? {})) {
        if (Object.hasOwn(manifest.parameters ?? {}, name)) throw new Error("Duplicate input/parameter: " + name);
        const object = input.annotations?.Object;
        const matrix = matrixSemantic(input.semantic);
        let expected: EffectInput["type"] | undefined;
        if (matrix && object === (matrix.base.includes("WORLD") ? "Geometry" : "Camera")) expected = "mat4x4f";
        if (object === "Geometry") {
            if (input.semantic === "DIFFUSE") expected = "vec4f";
            if (["AMBIENT", "SPECULAR"].includes(input.semantic)) expected = "vec3f";
            if (input.semantic === "SPECULARPOWER") expected = "f32";
        }
        if (object === "Light" && ["DIFFUSE", "DIRECTION"].includes(input.semantic)) expected = "vec3f";
        if (object === "Camera" && input.semantic === "POSITION") expected = "vec3f";
        if (!object && ["TIME", "ELAPSEDTIME"].includes(input.semantic) && typeof input.annotations?.SyncInEditMode === "boolean") expected = "f32";
        if (!object && input.semantic === "MODOKI_FRAME") expected = "f32";
        if (!object && input.semantic === "VIEWPORTPIXELSIZE") expected = "vec2f";
        if (!expected || input.type !== expected) throw new Error("Unsupported semantic/type/annotations: " + name + " (" + input.semantic + ")");
        if (!["TIME", "ELAPSEDTIME"].includes(input.semantic) && input.annotations?.SyncInEditMode !== undefined) throw new Error("SyncInEditMode is only valid for time inputs");
    }
    for (const [name, parameter] of Object.entries(manifest.parameters ?? {})) {
        if ((parameter.ui?.min ?? -Infinity) > (parameter.ui?.max ?? Infinity)) throw new Error("Invalid parameter range: " + name);
        if (parameter.ui?.control === "color" && !["vec3f", "vec4f"].includes(parameter.type)) throw new Error("Color control requires vec3f/vec4f");
        validateParameter(parameter, parameter.default);
    }
    return manifest;
}

/** Preserve lines/columns while masking WGSL's nested block and line comments. */
export function maskWgslComments(source: string): string {
    let depth = 0; let line = false; let output = "";
    for (let i = 0; i < source.length; i++) {
        const pair = source.slice(i, i + 2);
        if (!line && pair === "/*") { depth++; output += "  "; i++; }
        else if (!line && depth > 0 && pair === "*/") { depth--; output += "  "; i++; }
        else if (!depth && pair === "//") { line = true; output += "  "; i++; }
        else if (source[i] === "\n") { line = false; output += "\n"; }
        else output += depth || line ? " " : source[i];
    }
    if (depth) throw new Error("Unterminated WGSL block comment");
    return output;
}
export function validateEffectSources(manifest: EffectManifest, sources: EffectAsset["sources"]): void {
    if (sources.length !== manifest.sources.length || sources.some((s, i) => s.path !== manifest.sources[i] || typeof s.text !== "string")) throw new Error("Source list does not match manifest");
    for (const file of sources) {
        const text = maskWgslComments(file.text);
        const invalid = /@(vertex|fragment|compute|group|binding)\b|\bdiscard\b|\bvar\s*<\s*(uniform|storage|workgroup)\b|^\s*#|\b(?:fn|struct|alias|var|let|const|override)\s+(?:modoki|Modoki|fx_)/m.exec(text);
        if (invalid) throw new Error(file.path + ":" + (text.slice(0, invalid.index).split("\n").length) + ": unsupported declaration in material profile");
    }
    const text = maskWgslComments(sources.map(s => s.text).join("\n"));
    for (const hook of Object.values(manifest.hooks)) if (hook && !new RegExp("\\bfn\\s+" + hook + "\\s*\\(").test(text)) throw new Error("Missing hook function: " + hook);
}
export function defaultEffectAssignment(asset: EffectAsset): EffectAssignment {
    return { effectRevision: asset.revision, enabled: true, parameters: Object.fromEntries(Object.entries(asset.manifest.parameters ?? {}).map(([name, p]) => [name, structuredClone(p.default)])) };
}
export function canonicalEffectContent(asset: Pick<EffectAsset, "manifest" | "sources">): string {
    const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
        : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, ordered(v)])) : value;
    return JSON.stringify(ordered({ manifest: asset.manifest, sources: asset.sources }));
}
const assignments = new WeakMap<object, EffectAssignment>();
export function getEffectAssignment(material: object): EffectAssignment | null { return structuredClone(assignments.get(material) ?? null); }
export function setEffectAssignment(material: object, value: EffectAssignment | null): void {
    if (value) {
        const parsed = z.object({ effectRevision: z.string().regex(/^[a-f0-9]{64}$/), enabled: z.boolean(), parameters: z.record(identifier, z.union([z.number(), z.array(z.number())])) }).strict().parse(value);
        assignments.set(material, parsed);
    } else assignments.delete(material);
}
