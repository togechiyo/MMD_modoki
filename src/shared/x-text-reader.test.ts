import { describe, expect, it } from "vitest";
import { XTextReader } from "./x-text-reader";

const header = "xof 0303txt 0032\n";
const windowSize = 1024 * 1024;

describe("X text reader", () => {
    it("keeps the complete signed exponent at each possible window boundary", () => {
        const field = "-12.34e-07f";
        for (let split = 0; split <= field.length; split++) {
            const padding = " ".repeat(windowSize - header.length - split);
            const reader = new XTextReader(header + padding + field + ";,42;");
            expect(reader.number()).toBe(-12.34e-7);
            expect(reader.number()).toBe(42);
            expect(reader.take()).toBeNull();
        }
    });

    it("reads split comments, quoted paths, and non-ASCII names using Shift_JIS", () => {
        const bytes = new Uint8Array(windowSize + 30);
        bytes.fill(32);
        const ascii = new TextEncoder();
        bytes.set(ascii.encode(header));
        bytes.set(ascii.encode("// ignored\n\""), windowSize - 1);
        // ソ has 0x5c as its second byte; the following backslash is a path separator.
        bytes.set([0x83, 0x5c, ...ascii.encode("\\tree.png\"; 3;")], windowSize + 11);
        const reader = new XTextReader(bytes);
        expect(reader.peek(1)).toEqual({ t: "num", v: "3" });
        expect(reader.take()).toEqual({ t: "str", v: "ソ\\tree.png" });
        expect(reader.number()).toBe(3);
    });

    it("handles multibyte UTF-8 at a decode boundary", () => {
        const padding = " ".repeat(windowSize - header.length - 1);
        const reader = new XTextReader(new TextEncoder().encode(header + padding + "庭Mesh {}"));
        expect(reader.take()).toEqual({ t: "id", v: "庭Mesh" });
        expect(reader.take()?.v).toBe("{");
    });

    it("rejects unsupported formats or impossible array counts before allocation", () => {
        expect(() => new XTextReader("xof 0303bin 0032")).toThrow(/Unsupported X format/);
        expect(() => new XTextReader(header + "4294967295; 0;").count(3)).toThrow(/array count/);
    });
});
