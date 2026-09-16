import { describe, expect, it } from "vitest";
import type { MmdModokiProjectFileV1 } from "../types";
import { withoutLegacyWgsl } from "./project-format";

describe("unsupported project WGSL", () => {
    it("drops old assignments in active and inactive banks without mutating other project data", () => {
        const old = { effectRevision: "old", enabled: true, parameters: { Strength: 0.7 } };
        const state = { materialKey: "0:body", presetId: "wgsl-full-light", visible: false, externalEffect: old };
        const motion = { camera: "retained" };
        const source = { format: "mmd_modoki_project", version: 1, motion,
            externalEffects: [{ revision: "old", manifest: { apiVersion: 1 } }, { revision: "new", path: "new.json" }],
            scene: { models: [{ path: "fixture.pmx", materialShaders: [state],
                materialSettingsByMode: { "pbr-standard": { materials: [state] } } }] } } as unknown as MmdModokiProjectFileV1;
        const result = withoutLegacyWgsl(source);
        expect(result.warnings).toHaveLength(1);
        expect(result.project.scene.models[0].materialShaders?.[0]).toEqual({ materialKey: "0:body", presetId: "wgsl-full-light", visible: false });
        expect(result.project.scene.models[0].materialSettingsByMode?.["pbr-standard"]?.materials[0].externalEffect).toBeUndefined();
        expect(result.project.externalEffects).toEqual([{ revision: "new", path: "new.json" }]);
        expect(result.project).toHaveProperty("motion", motion);
        expect(source.scene.models[0].materialShaders?.[0].externalEffect).toBe(old);
    });
});
