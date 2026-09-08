import { describe, expect, it } from "vitest";
import { captureMaterialBank, migrateMaterialBanks, resolveProjectMaterialMode } from "./material-mode-state";
import type { ProjectModelState } from "../types";

const model = (overrides: Partial<ProjectModelState> = {}): ProjectModelState => ({
    instanceId: "one", path: "fixture.pmx", visible: true, motionImports: [], ...overrides,
});
describe("project material mode and banks", () => {
    it("uses the saved whole-project mode and migrates homogeneous legacy scenes", () => {
        expect(resolveProjectMaterialMode({ models: [] })).toBe("mmd-standard");
        expect(resolveProjectMaterialMode({ models: [model({ materialPipeline: "pbr-standard" })] })).toBe("pbr-standard");
        expect(resolveProjectMaterialMode({ models: [model(), model({ materialPipeline: "pbr-standard" })] })).toBe("mmd-standard");
        expect(resolveProjectMaterialMode({ materialMode: "pbr-standard", models: [model()] })).toBe("pbr-standard");
    });
    it("preserves inactive settings and treats an empty bank as an explicit reset", () => {
        const materials = [{ materialKey: "0:skin", presetId: "wgsl-soft-lit" }];
        const normal = captureMaterialBank(undefined, "mmd-standard", materials);
        const both = captureMaterialBank(normal, "pbr-standard", [{ materialKey: "0:skin", presetId: "pbr-skin" }]);
        const reset = captureMaterialBank(both, "mmd-standard", []);
        expect(normal["pbr-standard"]).toBeUndefined();
        expect(reset["pbr-standard"]).toEqual(both["pbr-standard"]);
        expect(migrateMaterialBanks(model({ materialShaders: materials, materialSettingsByMode: reset }))["mmd-standard"]).toEqual({ materials: [] });
        materials[0].presetId = "changed";
        expect(normal["mmd-standard"]?.materials[0].presetId).toBe("wgsl-soft-lit");
    });
    it("migrates legacy assignments into their own mode without sharing instances", () => {
        const first = model({ materialPipeline: "pbr-standard", materialShaders: [{ materialKey: "0:skin", presetId: "pbr-skin" }] });
        const second = model({ instanceId: "two" });
        expect(migrateMaterialBanks(first)).toEqual({ "pbr-standard": { materials: first.materialShaders } });
        expect(migrateMaterialBanks(second)).toEqual({ "mmd-standard": { materials: [] } });
    });
});
