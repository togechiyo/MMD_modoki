import { describe, expect, it } from "vitest";

import {
    createModelInstanceId,
    createUniqueModelInstanceId,
    normalizeModelInstanceId,
} from "./model-instance-id";

describe("model instance IDs", () => {
    it("accepts stable project-safe identifiers and rejects malformed values", () => {
        expect(normalizeModelInstanceId("  dancer-01:back.left  ")).toBe("dancer-01:back.left");
        expect(normalizeModelInstanceId("")).toBeNull();
        expect(normalizeModelInstanceId("contains spaces")).toBeNull();
        expect(normalizeModelInstanceId(42)).toBeNull();
    });

    it("creates non-empty IDs and avoids an existing collision", () => {
        const generated = createModelInstanceId();
        expect(normalizeModelInstanceId(generated)).toBe(generated);

        const unique = createUniqueModelInstanceId(new Set([generated]));
        expect(normalizeModelInstanceId(unique)).toBe(unique);
        expect(unique).not.toBe(generated);
    });
});
