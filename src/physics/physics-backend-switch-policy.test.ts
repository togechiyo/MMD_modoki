import { describe, expect, it } from "vitest";
import { shouldDeferBulletBackendSwitch } from "./physics-backend-switch-policy";

describe("Bullet backend switch policy", () => {
    it("defers replacement while classic runtime models own physics objects", () => {
        expect(shouldDeferBulletBackendSwitch("classic", 1)).toBe(true);
        expect(shouldDeferBulletBackendSwitch("classic", 3)).toBe(true);
    });

    it("allows initialization before models are loaded", () => {
        expect(shouldDeferBulletBackendSwitch("classic", 0)).toBe(false);
        expect(shouldDeferBulletBackendSwitch("wasm", 2)).toBe(false);
    });
});
