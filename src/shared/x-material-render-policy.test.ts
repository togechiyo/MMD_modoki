import { describe, expect, it } from "vitest";
import { resolveXMaterialRenderPolicy } from "./x-material-render-policy";

describe("x material render policy", () => {
    it("keeps opaque materials out of the transparent queue", () => {
        expect(resolveXMaterialRenderPolicy(1, false)).toBe("opaque");
    });

    it("uses alpha cutout for alpha-capable textures on otherwise opaque materials", () => {
        expect(resolveXMaterialRenderPolicy(1, true)).toBe("cutout");
    });

    it("keeps material-level translucency as alpha blend", () => {
        expect(resolveXMaterialRenderPolicy(0.75, false)).toBe("blend");
        expect(resolveXMaterialRenderPolicy(0.75, true)).toBe("blend");
    });

    it("does not classify rounding noise as translucency", () => {
        expect(resolveXMaterialRenderPolicy(0.9995, true)).toBe("cutout");
    });
});
