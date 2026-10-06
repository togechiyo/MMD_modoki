import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compactMcpSchema } from "../../src/main/automation/compact-schema";

describe("MCP Standard Schema serialization adapter", () => {
    it("retains the original validator, defaults, transformations and refinements", async () => {
        const source = z.object({ value: z.number().min(0).default(2) }).strict().refine(value => value.value !== 3, "Forbidden value")
            .transform(value => ({ ...value, doubled: value.value * 2 }));
        const compact = compactMcpSchema(source)["~standard"];
        expect(compact.validate).toBe(source["~standard"].validate);
        expect(compact.jsonSchema.output).toBe(source["~standard"].jsonSchema.output);
        for (const input of [{}, { value: 1 }, { value: 3 }, { value: -1 }, { value: 1, bytes: [] }]) {
            expect(await compact.validate(input)).toEqual(await source["~standard"].validate(input));
        }
    });
    it.each(["draft-2020-12", "draft-07"])("respects %s and uses self-contained references", target => {
        const array = z.array(z.number().int().min(0).max(127)).length(12);
        const source = z.object({ first: array, second: array }).strict();
        const json = compactMcpSchema(source)["~standard"].jsonSchema.input({ target });
        expect(JSON.stringify(json)).toContain('"$ref":"#/');
        expect(JSON.stringify(json)).not.toContain('"$ref":"http');
        expect(json.$schema).toBe(source["~standard"].jsonSchema.input({ target }).$schema);
        expect(json.additionalProperties).toBe(false);
    });
});
