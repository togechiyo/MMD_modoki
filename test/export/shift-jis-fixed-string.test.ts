import { describe, expect, it } from "vitest";

import { encodeShiftJisFixedString, fixedStringByteKey } from "../../src/export/shift-jis-fixed-string";

describe("encodeShiftJisFixedString", () => {
    it("encodes the canonical camera header and pads it to 20 bytes", () => {
        const result = encodeShiftJisFixedString("カメラ・照明", 20, false);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Buffer.from(result.bytes).toString("hex"))
            .toBe("834a8381838981458fc696be0000000000000000");
    });

    it("rejects unencodable Unicode without rejecting a literal question mark", () => {
        expect(encodeShiftJisFixedString("?", 15, false).ok).toBe(true);
        expect(encodeShiftJisFixedString("😀", 15, false)).toMatchObject({ ok: false, reason: "unencodable" });
        expect(encodeShiftJisFixedString("𠮷", 15, false)).toMatchObject({ ok: false, reason: "unencodable" });
    });

    it("truncates only on a character boundary when explicitly allowed", () => {
        const result = encodeShiftJisFixedString("あいう", 5, true);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.truncated).toBe(true);
        expect(Buffer.from(result.bytes).toString("hex")).toBe("82a082a200");
    });

    it("detects byte aliases through the fixed-byte key", () => {
        const yen = encodeShiftJisFixedString("¥", 15, false);
        const slash = encodeShiftJisFixedString("\\", 15, false);
        expect(yen.ok && slash.ok && fixedStringByteKey(yen.bytes)).toBe(slash.ok ? fixedStringByteKey(slash.bytes) : "");
    });
});
