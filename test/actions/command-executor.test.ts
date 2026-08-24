import { describe, expect, it } from "vitest";

import { executeCommand, type CommandExecutionContext } from "../../src/actions/command-executor";
import type { BoneTransformCommandSnapshot, BuiltCommand, CommandDiff, CommandTrackRef } from "../../src/actions/command-types";

const track: CommandTrackRef = { category: "bone", name: "センター" };

type Call =
    | ["add", CommandTrackRef, number]
    | ["remove", CommandTrackRef, number]
    | ["batchRemove", CommandTrackRef, number[]]
    | ["move", CommandTrackRef, number, number]
    | ["paste", CommandTrackRef, number, "payload" | null]
    | ["boneTransform", string, BoneTransformCommandSnapshot]
    | ["select", number | null]
    | ["selectKeys", number[]]
    | ["seek", number]
    | ["refresh"];

function createContext(result = true, options: { batchRemove?: boolean } = {}): { context: CommandExecutionContext; calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        context: {
            addTimelineKeyframe: (targetTrack, frame) => {
                calls.push(["add", targetTrack, frame]);
                return result;
            },
            removeTimelineKeyframe: (targetTrack, frame) => {
                calls.push(["remove", targetTrack, frame]);
                return result;
            },
            removeTimelineKeyframePayloads: options.batchRemove
                ? (targetTrack, frames) => {
                    calls.push(["batchRemove", targetTrack, [...frames]]);
                    return result;
                }
                : undefined,
            moveTimelineKeyframe: (targetTrack, fromFrame, toFrame) => {
                calls.push(["move", targetTrack, fromFrame, toFrame]);
                return result;
            },
            applyTimelineKeyframePayload: (targetTrack, frame, payload) => {
                calls.push(["paste", targetTrack, frame, payload ? "payload" : null]);
                return result;
            },
            applyBoneTransform: (boneName, snapshot) => {
                calls.push(["boneTransform", boneName, snapshot]);
                return result;
            },
            setSelectedFrame: (frame) => {
                calls.push(["select", frame]);
            },
            setSelectedKeys: (keys) => {
                calls.push(["selectKeys", keys.map((key) => key.frame)]);
            },
            seekToBoundary: (frame) => {
                calls.push(["seek", frame]);
            },
            refreshAfterKeyframeEdit: () => {
                calls.push(["refresh"]);
            },
        },
    };
}

function createCommand(diff: CommandDiff): BuiltCommand {
    return {
        id: diff.type,
        label: diff.type,
        scope: diff.type === "edit.boneTransform" ? "edit" : "keyframe",
        createdAtMs: 100,
        diff,
    };
}

describe("executeCommand", () => {
    it("applies keyframe add commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.add",
            track,
            frame: 10,
            beforeFrames: [],
            afterFrames: [10],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["add", track, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("reverts keyframe add commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.add",
            track,
            frame: 10,
            beforeFrames: [],
            afterFrames: [10],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["remove", track, 10],
            ["select", null],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies keyframe delete commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.delete",
            track,
            frame: 10,
            beforeFrames: [10],
            afterFrames: [],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["remove", track, 10],
            ["select", null],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("reverts keyframe delete commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.delete",
            track,
            frame: 10,
            beforeFrames: [10],
            afterFrames: [],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["add", track, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies keyframe move commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "apply", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["move", track, 10, 11],
            ["select", 11],
            ["seek", 11],
            ["refresh"],
        ]);
    });

    it("reverts keyframe move commands", () => {
        const { context, calls } = createContext();

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "revert", context);

        expect(result).toBe(true);
        expect(calls).toEqual([
            ["move", track, 11, 10],
            ["select", 10],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("does not sync selection, seek, or refresh when the command operation fails", () => {
        const { context, calls } = createContext(false);

        const result = executeCommand(createCommand({
            type: "keyframe.move",
            track,
            fromFrame: 10,
            toFrame: 11,
            beforeFrames: [10],
            afterFrames: [11],
        }), "apply", context);

        expect(result).toBe(false);
        expect(calls).toEqual([
            ["move", track, 10, 11],
        ]);
    });

    it("applies and reverts keyframe paste commands", () => {
        const payload = {
            kind: "morph" as const,
            weights: [0.5],
        };

        const applyContext = createContext();
        expect(executeCommand(createCommand({
            type: "keyframe.paste",
            track,
            frame: 12,
            before: null,
            after: payload,
        }), "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["paste", track, 12, "payload"],
            ["select", 12],
            ["seek", 12],
            ["refresh"],
        ]);

        const revertContext = createContext();
        expect(executeCommand(createCommand({
            type: "keyframe.paste",
            track,
            frame: 12,
            before: null,
            after: payload,
        }), "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["paste", track, 12, null],
            ["select", null],
            ["seek", 12],
            ["refresh"],
        ]);
    });

    it("applies and reverts batch delete commands with payloads", () => {
        const payload = { kind: "morph" as const, weights: [0.5] };
        const command = createCommand({
            type: "keyframe.batchDelete",
            items: [
                { track, frame: 10, before: payload },
                { track, frame: 20, before: payload },
            ],
        });

        const applyContext = createContext();
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["paste", track, 10, null],
            ["paste", track, 20, null],
            ["select", null],
            ["selectKeys", []],
            ["seek", 10],
            ["refresh"],
        ]);

        const revertContext = createContext();
        expect(executeCommand(command, "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["paste", track, 20, "payload"],
            ["paste", track, 10, "payload"],
            ["select", 10],
            ["selectKeys", [10, 20]],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("uses the batch remove path when applying batch delete commands", () => {
        const payload = { kind: "morph" as const, weights: [0.5] };
        const command = createCommand({
            type: "keyframe.batchDelete",
            items: [
                { track, frame: 10, before: payload },
                { track, frame: 20, before: payload },
            ],
        });

        const applyContext = createContext(true, { batchRemove: true });
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["batchRemove", track, [10, 20]],
            ["select", null],
            ["selectKeys", []],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies and reverts batch move commands while restoring overwritten keys", () => {
        const payload = { kind: "morph" as const, weights: [0.5] };
        const overwritten = { kind: "morph" as const, weights: [1] };
        const command = createCommand({
            type: "keyframe.batchMove",
            deltaFrames: 1,
            items: [
                { track, fromFrame: 10, toFrame: 11, before: payload, overwritten: null },
                { track, fromFrame: 20, toFrame: 21, before: payload, overwritten },
            ],
        });

        const applyContext = createContext();
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["paste", track, 10, null],
            ["paste", track, 20, null],
            ["paste", track, 11, "payload"],
            ["paste", track, 21, "payload"],
            ["select", 11],
            ["selectKeys", [11, 21]],
            ["seek", 11],
            ["refresh"],
        ]);

        const revertContext = createContext();
        expect(executeCommand(command, "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["paste", track, 21, null],
            ["paste", track, 11, null],
            ["paste", track, 21, "payload"],
            ["paste", track, 10, "payload"],
            ["paste", track, 20, "payload"],
            ["select", 10],
            ["selectKeys", [10, 20]],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies and reverts batch paste commands relative to the paste base frame", () => {
        const payload = { kind: "morph" as const, weights: [0.5] };
        const command = createCommand({
            type: "keyframe.batchPaste",
            pasteBaseFrame: 30,
            items: [
                { track, sourceFrame: 10, targetFrame: 30, before: null, after: payload },
                { track, sourceFrame: 20, targetFrame: 40, before: payload, after: payload },
            ],
        });

        const applyContext = createContext();
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["paste", track, 30, "payload"],
            ["paste", track, 40, "payload"],
            ["select", 30],
            ["selectKeys", [30, 40]],
            ["seek", 30],
            ["refresh"],
        ]);

        const revertContext = createContext();
        expect(executeCommand(command, "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["paste", track, 40, "payload"],
            ["paste", track, 30, null],
            ["select", null],
            ["selectKeys", []],
            ["seek", 30],
            ["refresh"],
        ]);
    });

    it("applies and reverts an empty-frame insertion as one frame-column command", () => {
        const payload = { kind: "morph" as const, weights: [0.5] };
        const command = createCommand({
            type: "keyframe.frameColumnEdit",
            mode: "insert",
            anchorFrame: 10,
            before: [
                { track, frame: 10, payload },
                { track, frame: 20, payload },
            ],
            after: [
                { track, frame: 11, payload },
                { track, frame: 21, payload },
            ],
        });

        const applyContext = createContext(true, { batchRemove: true });
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["batchRemove", track, [10, 20]],
            ["paste", track, 11, "payload"],
            ["paste", track, 21, "payload"],
            ["select", null],
            ["selectKeys", []],
            ["seek", 10],
            ["refresh"],
        ]);

        const revertContext = createContext(true, { batchRemove: true });
        expect(executeCommand(command, "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["batchRemove", track, [11, 21]],
            ["paste", track, 10, "payload"],
            ["paste", track, 20, "payload"],
            ["select", null],
            ["selectKeys", []],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies and reverts batch correction while preserving the corrected selection", () => {
        const before = { kind: "morph" as const, weights: [0.5] };
        const after = { kind: "morph" as const, weights: [0.25] };
        const command = createCommand({
            type: "keyframe.batchCorrect",
            correctionKind: "morph",
            items: [
                { track, frame: 10, before, after },
                { track, frame: 20, before, after },
            ],
        });

        const applyContext = createContext();
        expect(executeCommand(command, "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["paste", track, 10, "payload"],
            ["paste", track, 20, "payload"],
            ["select", 10],
            ["selectKeys", [10, 20]],
            ["seek", 10],
            ["refresh"],
        ]);

        const revertContext = createContext();
        expect(executeCommand(command, "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["paste", track, 20, "payload"],
            ["paste", track, 10, "payload"],
            ["select", 10],
            ["selectKeys", [10, 20]],
            ["seek", 10],
            ["refresh"],
        ]);
    });

    it("applies and reverts bone transform commands", () => {
        const before = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
        };
        const after = {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 4, y: 5, z: 6 },
        };

        const applyContext = createContext();
        expect(executeCommand(createCommand({
            type: "edit.boneTransform",
            boneName: "センター",
            frame: 12,
            before,
            after,
        }), "apply", applyContext.context)).toBe(true);
        expect(applyContext.calls).toEqual([
            ["boneTransform", "センター", after],
        ]);

        const revertContext = createContext();
        expect(executeCommand(createCommand({
            type: "edit.boneTransform",
            boneName: "センター",
            frame: 12,
            before,
            after,
        }), "revert", revertContext.context)).toBe(true);
        expect(revertContext.calls).toEqual([
            ["boneTransform", "センター", before],
        ]);
    });
});
