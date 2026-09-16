import { z } from "zod";
import { checkMetadataBudget } from "./limits";

import { readAuthorDeclarations } from "./author-declarations";
import { effectInputRegistry } from "./input-registry";
export { maskWgslComments } from "./author-declarations";

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
const manifestSchema = z.object({
    apiVersion: z.literal(2), kind: z.literal("mmd-material"), name: z.string().min(1),
    effectVersion: z.array(z.number().int().min(0).max(4294967295)).length(3).optional(),
    sources: z.array(relativeEffectPath).length(1), requires: z.array(z.enum(["uv0"])).optional(),
    hooks: z.object({ surface: z.literal("effectSurface").optional(), finalColor: z.literal("effectFinalColor").optional() }).strict(),
    inputs: z.record(identifier, inputSchema), inputOrder: z.array(identifier).max(37),
}).strict();
export type EffectManifest = z.infer<typeof manifestSchema>;
export type EffectInput = z.infer<typeof inputSchema>;
export type EffectValue = number | number[];
export type EffectAssignment = { effectRevision: string; enabled: boolean };
export type EffectAsset = { revision: string; manifest: EffectManifest; sources: Array<{ path: string; text: string }>; originPath?: string };
export type EffectAssetReference = { revision: string; path: string; originPath?: string };
export type EffectTarget = { modelInstanceId: string; materialKey: string; materialMode?: "mmd-standard" | "pbr-standard" };
export type EffectChange = { target: EffectTarget; before: EffectAssignment | null; after: EffectAssignment | null };

const matrixBases = ["WORLD", "VIEW", "PROJECTION", "WORLDVIEW", "VIEWPROJECTION", "WORLDVIEWPROJECTION"];
export function matrixSemantic(semantic: string): { base: string; inverse: boolean; transpose: boolean } | null {
    for (const base of matrixBases) for (const suffix of ["", "INVERSE", "TRANSPOSE", "INVERSETRANSPOSE"]) {
        if (semantic === base + suffix) return { base, inverse: suffix.includes("INVERSE"), transpose: suffix.includes("TRANSPOSE") };
    }
    return null;
}
/** Internal snapshot descriptor only. Authors declare this information in WGSL. */
export function parseEffectManifest(value: unknown): EffectManifest {
    checkMetadataBudget(value);
    const manifest = manifestSchema.parse(value);
    if (!manifest.hooks.surface && !manifest.hooks.finalColor) throw new Error("At least one material hook is required");
    if (new Set(manifest.inputOrder).size !== manifest.inputOrder.length ||
        manifest.inputOrder.length !== Object.keys(manifest.inputs).length ||
        manifest.inputOrder.some(name => !Object.hasOwn(manifest.inputs, name))) throw new Error("Invalid input declaration order");
    for (const [name, input] of Object.entries(manifest.inputs)) {
        const expected = Object.hasOwn(effectInputRegistry, name) ? effectInputRegistry[name] : undefined;
        if (!expected || input.type !== expected.type || input.semantic !== expected.semantic ||
            input.annotations?.Object !== expected.annotations?.Object ||
            input.annotations?.SyncInEditMode !== expected.annotations?.SyncInEditMode) throw new Error("Unsupported input: " + name);
    }
    return manifest;
}
export function validateEffectSources(manifest: EffectManifest, sources: EffectAsset["sources"]): void {
    if (!Array.isArray(sources) || sources.length !== 1 || sources[0].path !== manifest.sources[0] || typeof sources[0].text !== "string") throw new Error("Source list does not match manifest");
    const declared = readAuthorDeclarations(sources[0].text, sources[0].path);
    if (canonicalEffectContent({ manifest: declared, sources }) !== canonicalEffectContent({ manifest, sources })) throw new Error("WGSL snapshot descriptor does not match source declarations");
}
export function defaultEffectAssignment(asset: EffectAsset): EffectAssignment {
    return { effectRevision: asset.revision, enabled: true };
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
        checkMetadataBudget(value);
        const parsed = z.object({ effectRevision: z.string().regex(/^[a-f0-9]{64}$/), enabled: z.boolean() }).strict().parse(value);
        assignments.set(material, parsed);
    } else assignments.delete(material);
}
