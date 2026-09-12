import { describe, expect, it, vi } from "vitest";
import { buildClearModelMotionCommand, type ModelMotionState } from "../../src/editor/model-motion-state";
import { executeCommand, type CommandExecutionContext } from "../../src/actions/command-executor";

const empty = (): ModelMotionState => ({ animation: null, imports: [], externalParentKeyframes: [] });

describe("clear model motion command", () => {
    it("does not create empty commands and includes import-only or external-parent-only state", () => {
        expect(buildClearModelMotionCommand("model-1", empty(), 0)).toBeNull();
        expect(buildClearModelMotionCommand("", { ...empty(), imports: [{ type: "vmd", path: "motion.vmd" }] }, 0)).toBeNull();
        expect(buildClearModelMotionCommand("model-1", { ...empty(), imports: [{ type: "vmd", path: "motion.vmd" }] }, 0)).not.toBeNull();
        expect(buildClearModelMotionCommand("model-1", { ...empty(), externalParentKeyframes: [{ frame: 0, childBoneName: "センター", parentModelPath: null, parentBoneName: null }] }, 0)).not.toBeNull();
    });

    it("routes apply/undo/redo with the original model identity and propagates failure", () => {
        const before = { ...empty(), imports: [{ type: "vmd" as const, path: "motion.vmd" }] };
        const command = buildClearModelMotionCommand("model-1", before, 123);
        if (!command) throw new Error("command unavailable");
        const apply = vi.fn(() => true);
        const context: CommandExecutionContext = {
            applyModelMotionClear: apply,
            addTimelineKeyframe: () => false, removeTimelineKeyframe: () => false, moveTimelineKeyframe: () => false,
            setSelectedFrame: () => undefined, seekToBoundary: () => undefined, refreshAfterKeyframeEdit: () => undefined,
        };
        for (const direction of ["apply", "revert", "apply"] as const) {
            expect(executeCommand(command, direction, context)).toBe(true);
            expect(apply).toHaveBeenLastCalledWith({ type: "edit.modelMotionClear", modelInstanceId: "model-1", before }, direction);
        }
        apply.mockReturnValue(false);
        expect(executeCommand(command, "revert", context)).toBe(false);
    });
});
