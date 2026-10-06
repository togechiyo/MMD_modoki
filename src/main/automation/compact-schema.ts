import type { z } from "zod";

/** Standard Schema adapter: change only JSON serialization, retain Zod's runtime validator. */
export function compactMcpSchema<S extends z.ZodType>(schema: S): Pick<S, "~standard"> {
    const standard = schema["~standard"];
    return { "~standard": { ...standard, jsonSchema: { ...standard.jsonSchema,
        input: options => standard.jsonSchema.input({ ...options,
            libraryOptions: { ...options.libraryOptions, reused: "ref" } }),
    } } };
}
