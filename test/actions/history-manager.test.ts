import { describe, expect, it } from "vitest";

import { HistoryManager } from "../../src/actions/history-manager";
import type { BuiltCommand } from "../../src/actions/command-types";

function createCommand(id: string, createdAtMs = 100): BuiltCommand {
    return {
        id,
        label: id,
        scope: "keyframe",
        createdAtMs,
        diff: {
            type: "keyframe.add",
            track: { category: "bone", name: "センター" },
            frame: createdAtMs,
            beforeFrames: [],
            afterFrames: [createdAtMs],
        },
    };
}

describe("HistoryManager", () => {
    it("peeks at the next redo without advancing history and invalidates it on a new edit", () => {
        const history = new HistoryManager();
        const command = createCommand("ai:one");
        history.push(command);
        history.undo();
        const revision = history.getRevision();
        expect(history.peekRedo()).toBe(command);
        expect(history.getRevision()).toBe(revision);
        expect(history.redo()).toBe(command);
        expect(history.peekRedo()).toBeNull();
        history.undo();
        history.push(createCommand("manual:two"));
        expect(history.peekRedo()).toBeNull();
    });
    it("tracks undo availability after pushing a command", () => {
        const history = new HistoryManager();

        expect(history.canUndo()).toBe(false);
        expect(history.canRedo()).toBe(false);

        history.push(createCommand("add-1"));

        expect(history.canUndo()).toBe(true);
        expect(history.canRedo()).toBe(false);
        expect(history.getUndoCount()).toBe(1);
        expect(history.getRedoCount()).toBe(0);
    });

    it("moves the latest command to redo stack on undo", () => {
        const history = new HistoryManager();
        const first = createCommand("add-1");
        const second = createCommand("move-1");

        history.push(first);
        history.push(second);

        expect(history.undo()).toBe(second);
        expect(history.canUndo()).toBe(true);
        expect(history.canRedo()).toBe(true);
        expect(history.getUndoCount()).toBe(1);
        expect(history.getRedoCount()).toBe(1);
    });

    it("moves the latest undone command back to undo stack on redo", () => {
        const history = new HistoryManager();
        const command = createCommand("add-1");

        history.push(command);
        expect(history.undo()).toBe(command);
        expect(history.redo()).toBe(command);

        expect(history.canUndo()).toBe(true);
        expect(history.canRedo()).toBe(false);
        expect(history.getUndoCount()).toBe(1);
        expect(history.getRedoCount()).toBe(0);
    });

    it("clears redo stack when a new command is pushed", () => {
        const history = new HistoryManager();

        history.push(createCommand("add-1"));
        history.push(createCommand("add-2"));
        expect(history.undo()?.id).toBe("add-2");
        expect(history.canRedo()).toBe(true);

        history.push(createCommand("add-3"));

        expect(history.canRedo()).toBe(false);
        expect(history.getUndoCount()).toBe(2);
        expect(history.getRedoCount()).toBe(0);
    });

    it("returns null when undo or redo is not available", () => {
        const history = new HistoryManager();

        expect(history.undo()).toBeNull();
        expect(history.redo()).toBeNull();
    });

    it("clears both stacks", () => {
        const history = new HistoryManager();

        history.push(createCommand("add-1"));
        history.undo();

        history.clear("project load");

        expect(history.canUndo()).toBe(false);
        expect(history.canRedo()).toBe(false);
        expect(history.getUndoCount()).toBe(0);
        expect(history.getRedoCount()).toBe(0);
    });

    it("drops oldest commands when maxEntries is exceeded", () => {
        const history = new HistoryManager({ maxEntries: 2 });

        history.push(createCommand("add-1"));
        history.push(createCommand("add-2"));
        history.push(createCommand("add-3"));

        expect(history.getUndoCount()).toBe(2);
        expect(history.undo()?.id).toBe("add-3");
        expect(history.undo()?.id).toBe("add-2");
        expect(history.undo()).toBeNull();
    });

    it("normalizes invalid maxEntries values", () => {
        const history = new HistoryManager({ maxEntries: 0 });

        history.push(createCommand("add-1"));
        history.push(createCommand("add-2"));

        expect(history.getUndoCount()).toBe(1);
        expect(history.undo()?.id).toBe("add-2");
    });
});
