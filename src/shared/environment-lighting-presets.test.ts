import { describe, expect, it } from "vitest";
import { normalizeEnvironmentLightingPreset } from "./environment-lighting-presets";

describe("environment preset compatibility", () => {
    it("restores each bundled preset", () => {
        for (const id of ["yamagata-field", "eitai-bridge", "mifune-bridge"]) {
            expect(normalizeEnvironmentLightingPreset(id)).toBe(id);
        }
    });
    it("restores older projects and unknown preset IDs to the snowy field", () => {
        for (const value of [undefined, null, "", "unknown", 1]) {
            expect(normalizeEnvironmentLightingPreset(value)).toBe("yamagata-field");
        }
    });
});
