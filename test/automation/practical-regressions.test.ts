import { describe, expect, it } from "vitest";
import { automationControlSchema } from "../../src/automation/controls";
import { automationUserAction } from "../../src/automation/user-action";
import { AutomationError, describeAutomationFailure, toAutomationFailure } from "../../src/automation/diagnostics";
import { externalParentOmissionCount } from "../../src/export/external-parent-warning";
import { describeWebmExportFailure, webmExportFailureSchema, WebmCapabilityError } from "../../src/shared/webm-export-failure";

describe("practical MCP regressions", () => {
    it("preserves safe WebM cause and stage without exporting exception text", () => {
        const failure = describeWebmExportFailure(new WebmCapabilityError("VIDEO_ENCODER_UNAVAILABLE"), "initializing", true, false);
        expect(toAutomationFailure(new AutomationError(failure.code, failure.details))).toEqual(failure);
        expect(describeWebmExportFailure(new Error("PRIVATE PATH"), "encoding", true, true)).toEqual({ code: "VIDEO_EXPORT_FAILED", details: { stage: "encoding", secureContext: true, videoEncoderAvailable: true } });
        expect(webmExportFailureSchema.safeParse({ ...failure, details: { ...failure.details, message: "PRIVATE" } }).success).toBe(false);
    });
    it("accepts the same 0..2 light tint range as the editor, without widening other colors", () => {
        for (const component of [0, 256 / 255, 2]) expect(automationControlSchema.safeParse({ id: "light.color", value: { r: component, g: component, b: component } }).success).toBe(true);
        for (const component of [-0.01, 2.01, Infinity]) expect(automationControlSchema.safeParse({ id: "light.color", value: { r: component, g: 1, b: 1 } }).success).toBe(false);
        expect(automationControlSchema.safeParse({ id: "offsetHighlight.color", value: { r: 2, g: 1, b: 1 } }).success).toBe(false);
    });
    it("identifies a model comment wait independently of modal markup", () => {
        expect(automationUserAction(["ui_operation", "model_comment_confirmation"])).toMatchObject({ kind: "model_comment_confirmation" });
        expect(automationUserAction(["modal"])).toMatchObject({ kind: "dialog" });
        expect(automationUserAction(["ui_operation", "loading"])).toBeNull();
    });
    it("directs an unavailable target to context discovery instead of a nonexistent operation", () => {
        expect(describeAutomationFailure(toAutomationFailure(new AutomationError("TARGET_UNAVAILABLE")))).toMatchObject({ recovery: { strategy: "refresh_context", nextTool: "mmd_get_context" }, effects: { state: "none" } });
    });
    it("does not warn on null-only parents but retains releases when a real link is omitted", () => {
        const hasParent = (key: { id: string | null }) => Boolean(key.id);
        expect(externalParentOmissionCount([], hasParent)).toBe(0);
        expect(externalParentOmissionCount([{ id: null }, { id: null }], hasParent)).toBe(0);
        expect(externalParentOmissionCount([{ id: "parent" }, { id: null }], hasParent)).toBe(2);
    });
});
