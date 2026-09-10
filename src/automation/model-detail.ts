import { z } from "zod";

export const diagnosticKindSchema = z.enum(["bone", "morph", "material", "rigidBody", "joint"]);
export type DiagnosticKind = z.infer<typeof diagnosticKindSchema>;
export const diagnosticSelectorSchema = z.object({ kind: diagnosticKindSchema, index: z.number().int().min(0).max(1000000) }).strict();
export type DiagnosticSelector = z.infer<typeof diagnosticSelectorSchema>;
export type ModelDiagnosticMetadata = {
    bones: readonly Record<string, unknown>[];
    morphs: readonly Record<string, unknown>[];
};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const vector = (value: unknown): (number | null)[] | null => Array.isArray(value) || ArrayBuffer.isView(value) ? [0, 1, 2].map(index => number(record(value)[index])) : null;
const text = (value: unknown): string | null => typeof value === "string" ? value.slice(0, 200) : null;
const fields = (source: Record<string, unknown>, names: readonly string[]): Record<string, number | null> => Object.fromEntries(names.map(name => [name, number(source[name])]));
const vectors = (source: Record<string, unknown>, names: readonly string[]): Record<string, (number | null)[] | null> => Object.fromEntries(names.map(name => [name, vector(source[name])]));

export function diagnosticTargetName(source: unknown): string | null { return text(record(source).name); }

/** Explicit projections only: never serialize loader metadata, morph offsets, meshes, textures, or solver objects. */
export function projectModelDiagnosticDetail(kind: DiagnosticKind, input: unknown): Record<string, unknown> {
    const source = record(input);
    const name = text(source.name);
    if (kind === "bone") {
        const append = record(source.appendTransform);
        const ik = record(source.ik);
        const links = Array.isArray(ik.links) ? ik.links : [];
        const local = record(source.localVector);
        return { name, source: "loader_metadata", englishName: text(source.englishName), ...fields(source, ["parentBoneIndex", "transformOrder", "flag"]),
            axisLimit: vector(source.axisLimit), localAxes: source.localVector ? vectors(local, ["x", "z"]) : null,
            appendTransform: source.appendTransform ? fields(append, ["parentIndex", "ratio"]) : null,
            ik: source.ik ? { ...fields(ik, ["target", "iteration", "rotationConstraint"]), angleUnit: "radians", linkCount: links.length,
                links: links.slice(0, 32).map(link => { const item = record(link); return { target: number(item.target), limitation: item.limitation ? vectors(record(item.limitation), ["minimumAngle", "maximumAngle"]) : null }; }),
                linksTruncated: links.length > 32 } : null };
    }
    if (kind === "morph") return { name, source: "loader_metadata", englishName: text(source.englishName), ...fields(source, ["type", "category"]),
        elementCount: Array.isArray(source.elements) ? source.elements.length : null, elementDataShared: false };
    if (kind === "material") {
        const rgb = (value: unknown) => fields(record(value), ["r", "g", "b"]);
        return { name, source: "runtime_material", ...fields(source, ["alpha", "alphaCutOff", "transparencyMode", "roughness", "metallic", "specularPower", "outlineWidth", "outlineAlpha", "zOffset", "zOffsetUnits"]),
            backFaceCulling: typeof source.backFaceCulling === "boolean" ? source.backFaceCulling : null,
            forceDepthWrite: typeof source.forceDepthWrite === "boolean" ? source.forceDepthWrite : null,
            diffuseColor: rgb(source.diffuseColor), albedoColor: rgb(source.albedoColor), specularColor: rgb(source.specularColor), emissiveColor: rgb(source.emissiveColor),
            texturesPresent: Object.fromEntries(["diffuseTexture", "albedoTexture", "opacityTexture", "toonTexture", "sphereTexture"].map(key => [key, source[key] != null])) };
    }
    if (kind === "rigidBody") return { name, source: "app_retained_physics_settings", solverEffectiveValues: "not_observed",
        ...fields(source, ["boneIndex", "shapeType", "physicsMode", "mass", "linearDamping", "angularDamping", "repulsion", "friction", "collisionGroup", "collisionMask"]),
        ...vectors(source, ["shapeSize", "shapePosition", "shapeRotation"]), positionSpace: "model", lengthUnit: "MMD", angleUnit: "radians" };
    return { name, source: "app_retained_physics_settings", solverEffectiveValues: "not_observed",
        ...fields(source, ["rigidbodyIndexA", "rigidbodyIndexB", "type"]),
        ...vectors(source, ["position", "rotation", "positionMin", "positionMax", "rotationMin", "rotationMax", "springPosition", "springRotation"]),
        positionSpace: "model", constraintSpace: "joint_local", lengthUnit: "MMD", angleUnit: "radians" };
}

export type DetailAccessRecord = { timestamp: string; modelInstanceId: string; modelName: string; kind: DiagnosticKind; index: number; name: string | null };
export const requiresDetailedDiagnostics = (tool: string): boolean => tool === "mmd_list_diagnostic_targets" || tool === "mmd_inspect_detail";
