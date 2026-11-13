import { describe, expect, it } from "vitest";
import { createRendererContentSecurityPolicy } from "./renderer-csp";

const directives = (url?: string): Map<string, string[]> => new Map(
    createRendererContentSecurityPolicy(url).split("; ").map(value => {
        const [name, ...sources] = value.split(" ");
        return [name, sources];
    }),
);

describe("renderer content security policy", () => {
    it("permits bundled WASM while denying string and inline JavaScript", () => {
        const policy = directives();
        expect(policy.get("default-src")).toEqual(["'none'"]);
        expect(policy.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
        expect(policy.get("worker-src")).toEqual(["'self'", "blob:"]);
        for (const directive of ["object-src", "frame-src", "base-uri", "form-action"]) {
            expect(policy.get(directive)).toEqual(["'none'"]);
        }
    });

    it("allows local models, media and WASM without packaged network or dev protocol access", () => {
        const policy = directives();
        for (const directive of ["connect-src", "img-src", "media-src"]) {
            expect(policy.get(directive)).toEqual(["'self'", "file:", "blob:", "data:"]);
        }
        expect(createRendererContentSecurityPolicy()).not.toMatch(/https?:|wss?:|mmd-local:|\*/);
    });

    it.each([
        ["http://localhost:5173/", "ws://localhost:5173"],
        ["http://127.0.0.1:5181/index.html", "ws://127.0.0.1:5181"],
        ["https://localhost:5443/", "wss://localhost:5443"],
    ])("limits development HMR to the actual server origin: %s", (url, socket) => {
        const policy = directives(url);
        expect(policy.get("connect-src")).toEqual(["'self'", "file:", "blob:", "data:", "mmd-local:", socket]);
        expect(policy.get("script-src")).toEqual(directives().get("script-src"));
        expect(policy.get("img-src")).toContain("mmd-local:");
    });

    it("rejects a non-HTTP dev server instead of widening the policy", () => {
        expect(() => createRendererContentSecurityPolicy("file:///tmp/app.html")).toThrow("HTTP or HTTPS");
    });
});
