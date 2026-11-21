import { describe, expect, it } from "vitest";
import { normalizePostEffectBackend, resolveAaOnlyOutput } from "./post-effect-backend";

describe("resolveAaOnlyOutput", () => {
    it("uses camera FXAA for an otherwise neutral WebGL2 frame", () => {
        expect(resolveAaOnlyOutput(true, "WebGL2", 1, false)).toBe("cameraFxaa");
        expect(resolveAaOnlyOutput(false, "WebGL2", 1, false)).toBe("direct");
    });

    it("preserves the contrast pass and the scattering prepass when AA is enabled", () => {
        expect(resolveAaOnlyOutput(true, "WebGL2", 1.2, false)).toBe("frameGraph");
        expect(resolveAaOnlyOutput(true, "WebGL2", 1, true)).toBe("frameGraph");
        expect(resolveAaOnlyOutput(false, "WebGL2", 1.2, true)).toBe("direct");
    });

    it.each(["WebGL1", "WebGPU"])("keeps the existing AA path for %s", engine => {
        expect(resolveAaOnlyOutput(true, engine, 1, false)).toBe("frameGraph");
        expect(resolveAaOnlyOutput(false, engine, 1, false)).toBe("direct");
    });
});

describe("normalizePostEffectBackend", () => {
    it("uses frame graph as the default backend", () => {
        expect(normalizePostEffectBackend(null)).toBe("frameGraph");
        expect(normalizePostEffectBackend("")).toBe("frameGraph");
        expect(normalizePostEffectBackend("unknown")).toBe("frameGraph");
        expect(normalizePostEffectBackend("classic")).toBe("classic");
    });

    it("uses the provided fallback for unknown values", () => {
        expect(normalizePostEffectBackend(null, "classic")).toBe("classic");
        expect(normalizePostEffectBackend("unknown", "classic")).toBe("classic");
    });

    it("accepts frame graph aliases for dev flags", () => {
        expect(normalizePostEffectBackend("frameGraph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame-graph")).toBe("frameGraph");
        expect(normalizePostEffectBackend("frame_graph")).toBe("frameGraph");
    });
});
