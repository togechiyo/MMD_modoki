import { describe, expect, it } from "vitest";
import { summarizeAutomationContext } from "../../src/automation/context-summary";
import { automationTools } from "../../src/automation/contracts";

const context = () => ({ target: { editorSessionId: "11111111-1111-4111-8111-111111111111", sceneGeneration: 2 },
    editRevision: 7, assetRevision: 3, frame: 20, playing: false, busy: true,
    status: { editPermission: false, editBlockers: ["read_only", "model_comment_confirmation"],
        userAction: { kind: "model_comment_confirmation" }, observedAt: "2026-10-06T01:00:00.000Z" },
    timelineTarget: "model", timelineScope: { kind: "model", modelInstanceId: "one" }, undoId: "undo", redoId: null,
    models: [{ instanceId: "one", name: "PRIVATE_MODEL_NAME", active: true }], assetCount: 1,
    camera: { distance: 45 }, backend: "frameGraph", futureDetail: "PRIVATE_DETAIL" });

describe("compact automation context", () => {
    it("keeps editing guards and user action requirements without model names or camera details", () => {
        const full = context();
        const summary = summarizeAutomationContext(full);
        expect(summary).toMatchObject({ target: full.target, editRevision: 7, assetRevision: 3, modelCount: 1,
            assetCount: 1, timelineScope: full.timelineScope, status: full.status, undoId: "undo", redoId: null });
        expect(JSON.stringify(summary)).not.toContain("PRIVATE");
        expect(summary).not.toHaveProperty("camera");
        expect(summary).not.toHaveProperty("models");
    });
    it("observes playback and permission changes even when edit revision is unchanged", () => {
        const full = context();
        const first = summarizeAutomationContext(full);
        full.frame = 21; full.playing = true; full.busy = false;
        full.status = { editPermission: true, editBlockers: [], userAction: { kind: "none" }, observedAt: "2026-10-06T01:00:01.000Z" };
        expect(summarizeAutomationContext(full)).toMatchObject({ frame: 21, playing: true, busy: false, editRevision: first.editRevision,
            status: { editPermission: true, observedAt: "2026-10-06T01:00:01.000Z" } });
        expect(first.frame).toBe(20);
    });
    it("preserves full mode by default and rejects invalid detail values or extra fields", () => {
        const schema = automationTools.mmd_get_context.schema;
        expect(schema.parse({})).toEqual({ detail: "full" });
        expect(schema.parse({ detail: "summary" }).detail).toBe("summary");
        expect(schema.safeParse({ detail: "everything" }).success).toBe(false);
        expect(schema.safeParse({ detail: "summary", modelBytes: true }).success).toBe(false);
    });
});
