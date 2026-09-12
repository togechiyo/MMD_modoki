/** Resource budgets, not a proof that a shader will terminate or compile cheaply. */
export const WGSL_SOURCE_BYTES = 1024 * 1024;
export const WGSL_METADATA_BYTES = 64 * 1024;
export const WGSL_SIDECAR_BYTES = 8 * 1024 * 1024;
export const WGSL_PROJECT_ASSETS = 128;

export function checkTextBudget(text: string, limit: number, label: string): number {
    if (typeof text !== "string" || text.length > limit) throw new Error(`${label}: exceeds ${limit} bytes`);
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > limit) throw new Error(`${label}: exceeds ${limit} bytes`);
    return bytes;
}

/** Bound work before schema validation / recursive canonicalization, including legacy project metadata. */
export function checkMetadataBudget(value: unknown): void {
    let nodes = 0;
    let bytes = 0;
    const count = (text: string): void => {
        bytes += checkTextBudget(text, WGSL_METADATA_BYTES, "WGSL metadata");
        if (bytes > WGSL_METADATA_BYTES) throw new Error("WGSL metadata exceeds 64 KiB");
    };
    const visit = (item: unknown, depth: number): void => {
        if (++nodes > 4096 || depth > 16) throw new Error("WGSL metadata: too many entries or nesting levels");
        if (typeof item === "string") count(item);
        if (item && typeof item === "object") {
            for (const key in item) if (Object.hasOwn(item, key)) {
                count(key);
                visit((item as Record<string, unknown>)[key], depth + 1);
            }
        }
    };
    visit(value, 0);
    checkTextBudget(JSON.stringify(value) ?? "", WGSL_METADATA_BYTES, "WGSL metadata");
}

export function checkProjectEffectCount(values: unknown[]): void {
    if (values.length > WGSL_PROJECT_ASSETS) throw new Error(`Project exceeds ${WGSL_PROJECT_ASSETS} external WGSL assets`);
}
