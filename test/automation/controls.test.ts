import { describe, it, expect } from "vitest";
import { automationControlSchema, automationControls } from "../../src/automation/controls";
import { automationLocalPathSchema, uiOperationSchema } from "../../src/automation/ui-operation-schema";

describe("UI MCP input boundary", () => {
    it("exposes public effect parameters with bounded values and excludes hidden ocean controls", () => {
        for (const value of [{ id: "ssgi.radius", value: 50 }, { id: "luminous.intensity", value: 0.5 },
            { id: "dof.focusMode", value: "model-target" }]) {
            expect(automationControlSchema.safeParse(value).success).toBe(true);
        }
        for (const value of [{ id: "ssgi.radius", value: 300 }, { id: "water.settings", value: { resolution: 123 } },
            { id: "water.settings", value: { oceanClarity: 1 } }, { id: "offsetShadow.x", value: 1.5 },
            { id: "ocean.clarity", value: 1 }, { id: "offsetHighlight.thickness", value: 1 }]) {
            expect(automationControlSchema.safeParse(value).success).toBe(false);
        }
    });
    it("has unique explicitly registered IDs and rejects arbitrary properties and nested fields", () => {
        expect(new Set(automationControls.map(entry => entry.id)).size).toBe(automationControls.length);
        expect(automationControlSchema.safeParse({ id: "bloom.weight", value: 0.4 }).success).toBe(true);
        for (const value of [{ id: "scene", value: {} }, { id: "bloom.weight", value: 100 }, { id: "bloom.weight", value: "0.4" },
            { id: "light.color", value: { r: 1, g: 1, b: 1, texture: "private" } }, { id: "render.stack", value: [{ id: "bloom", enabled: true }, { id: "bloom", enabled: false }] }]) {
            expect(automationControlSchema.safeParse(value).success).toBe(false);
        }
    });
    it("accepts absolute local paths and rejects remote URLs, UNC and alternate streams", () => {
        for (const path of ["C:\\Scenes\\sample.vmd", "/home/me/sample.vmd"]) expect(automationLocalPathSchema.safeParse(path).success).toBe(true);
        for (const path of ["https://host/model.pmx", "file:///a", "\\\\host\\share\\a", "//host/share/a", "C:sample", "sample.vmd", "C:\\a.vmd:stream", "C:\\bad\nfile"]) {
            expect(automationLocalPathSchema.safeParse(path).success).toBe(false);
        }
    });
    it("requires explicit overwrite and does not accept binary/model contents", () => {
        expect(uiOperationSchema.safeParse({ kind: "saveProject", filePath: "C:\\scene.json" }).success).toBe(false);
        expect(uiOperationSchema.safeParse({ kind: "saveProject", filePath: "C:\\scene.json", overwrite: false }).success).toBe(true);
        expect(uiOperationSchema.safeParse({ kind: "loadAsset", assetKind: "model", filePath: "C:\\model.pmx", bytes: [1, 2] }).success).toBe(false);
    });
});
