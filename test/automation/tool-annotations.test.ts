import { describe, expect, it } from "vitest";
import { automationTools } from "../../src/automation/contracts";
import { automationToolAnnotations } from "../../src/main/automation/tool-annotations";

describe("MCP tool behavior hints", () => {
    it.each(["mmd_get_context", "mmd_list_assets", "mmd_capture_viewport", "mmd_get_operation"] as const)(
        "keeps %s read-only without irrelevant mutation hints", name => {
            expect(automationToolAnnotations(name, automationTools[name].edit)).toEqual({ readOnlyHint: true, openWorldHint: false });
        },
    );
    it("describes snapshot storage and eviction independently of edit permission", () => {
        expect(automationTools.mmd_capture_snapshot.edit).toBe(false);
        expect(automationToolAnnotations("mmd_capture_snapshot", false)).toEqual({
            readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false,
        });
    });
    it.each([
        "mmd_edit_keyframes", "mmd_execute_menu_action", "mmd_start_ui_operation", "mmd_set_control",
        "mmd_copy_keyframes", "mmd_undo", "mmd_redo",
    ] as const)("does not describe %s replacement/removal as additive-only or unconditionally repeatable", name => {
        expect(automationToolAnnotations(name, automationTools[name].edit)).toEqual({
            readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false,
        });
    });
    it("defaults new editing tools to conservative mutation hints, including effect instance removal", () => {
        expect(automationToolAnnotations("mmd_edit_effect_instances", true)).toEqual({
            readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false,
        });
    });
});
