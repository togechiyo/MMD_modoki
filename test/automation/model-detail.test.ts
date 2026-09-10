import { describe, expect, it } from "vitest";
import { diagnosticSelectorSchema, projectModelDiagnosticDetail, requiresDetailedDiagnostics } from "../../src/automation/model-detail";

describe("single-target detailed diagnostic projection", () => {
    const forbidden = { vertices: ["VERTEX_SECRET"], weights: ["WEIGHT_SECRET"], texture: { bytes: "TEXTURE_SECRET" }, offsets: ["OFFSET_SECRET"], shader: "SHADER_SECRET" };
    it.each(["bone", "morph", "material", "rigidBody", "joint"] as const)("exposes only named fields for %s", kind => {
        const source = { name: "fixture", ...forbidden, elements: [{ ...forbidden }], mass: 3, shapePosition: [1, 2, 3], diffuseTexture: { ...forbidden }, diffuseColor: { r: 0.1, g: 0.2, b: 0.3, ...forbidden } };
        const detail = projectModelDiagnosticDetail(kind, source);
        const json = JSON.stringify(detail);
        expect(json).not.toMatch(/VERTEX_SECRET|WEIGHT_SECRET|TEXTURE_SECRET|OFFSET_SECRET|SHADER_SECRET/);
        expect(detail.name).toBe("fixture");
        if (kind === "morph") expect(detail).toMatchObject({ elementCount: 1, elementDataShared: false });
        if (kind === "rigidBody") expect(detail).toMatchObject({ mass: 3, shapePosition: [1, 2, 3], solverEffectiveValues: "not_observed" });
        if (kind === "material") expect(detail).toMatchObject({ diffuseColor: { r: 0.1, g: 0.2, b: 0.3 }, texturesPresent: { diffuseTexture: true } });
        expect(source.vertices).toEqual(["VERTEX_SECRET"]);
    });
    it("bounds IK references, preserves units, and does not recursively include linked bones", () => {
        const detail = projectModelDiagnosticDetail("bone", { name: "root", parentBoneIndex: -1, appendTransform: { parentIndex: 1, ratio: 0.5, ...forbidden },
            ik: { target: 3, iteration: 8, rotationConstraint: 0.5, links: Array.from({ length: 40 }, (_, target) => ({ target, bone: forbidden, limitation: { minimumAngle: [-1, 0, 0], maximumAngle: [1, 0, 0], ...forbidden } })) } });
        expect(detail).toMatchObject({ parentBoneIndex: -1, appendTransform: { parentIndex: 1, ratio: 0.5 }, ik: { linkCount: 40, linksTruncated: true, angleUnit: "radians" } });
        expect((detail.ik as { links: unknown[] }).links).toHaveLength(32);
        expect(JSON.stringify(detail)).not.toContain("SECRET");
    });
    it("keeps unknown values null and limits strings", () => {
        const detail = projectModelDiagnosticDetail("rigidBody", { name: "a".repeat(400), mass: NaN, shapePosition: [Infinity, 2, 3] });
        expect(detail).toMatchObject({ mass: null, shapePosition: [null, 2, 3], collisionMask: null });
        expect(detail.name).toHaveLength(200);
    });
    it("requires one numeric index and gates both discovery and detail tools", () => {
        expect(diagnosticSelectorSchema.safeParse({ kind: "bone", index: 0 }).success).toBe(true);
        for (const selector of [{ kind: "bone", index: "all" }, { kind: "bone", index: 0, recursive: true }, { kind: "mesh", index: 0 }, [{ kind: "bone", index: 0 }]]) expect(diagnosticSelectorSchema.safeParse(selector).success).toBe(false);
        expect(requiresDetailedDiagnostics("mmd_inspect_detail")).toBe(true);
        expect(requiresDetailedDiagnostics("mmd_list_diagnostic_targets")).toBe(true);
        expect(requiresDetailedDiagnostics("mmd_inspect")).toBe(false);
    });
});
