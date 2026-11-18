/** Protocol hints describe effects, independently of the editor's permission gate. */
export function automationToolAnnotations(name: string, requiresEditPermission: boolean) {
    // Snapshot capture also changes observable state: it stores an image and may evict earlier ones.
    const readOnlyHint = !requiresEditPermission && name !== "mmd_capture_snapshot";
    if (readOnlyHint) return { readOnlyHint: true, openWorldHint: false };
    return {
        readOnlyHint: false,
        // False means additive-only, not merely undoable. Edits can replace values or remove data.
        destructiveHint: true,
        // Operation IDs deduplicate only within bounded, grant/scene-scoped history.
        idempotentHint: false,
        openWorldHint: false,
    };
}
