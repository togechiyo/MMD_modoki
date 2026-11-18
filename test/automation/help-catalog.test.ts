import { describe, expect, it } from "vitest";
import { searchAutomationHelp } from "../../src/automation/help/catalog";

describe("automation help search", () => {
    it("finds saving instructions before incidental body mentions within the result limit", () => {
        expect(searchAutomationHelp("保存", 2).map(topic => topic.id)).toEqual([
            "ui-operations", "files-and-output",
        ]);
        expect(searchAutomationHelp("保存", 5).map(topic => topic.id)).toEqual([
            "ui-operations", "files-and-output", "dof-instance-focus", "effect-instances", "completion-notifications",
        ]);
    });

    it.each([
        ["ui-operations", "ui-operations"],
        ["ビューポート画像", "viewport"],
        ["　ＳＡＶＥ　", "ui-operations"],
    ])("prioritizes an id, title or normalized alias match for %s", (query, expectedId) => {
        expect(searchAutomationHelp(query, 1).map(topic => topic.id)).toEqual([expectedId]);
    });

    it("keeps body-only recovery terms searchable and requires every query term", () => {
        expect(searchAutomationHelp("snapshot_not_found 画像", 5).map(topic => topic.id)).toEqual(["viewport-comparison"]);
        expect(searchAutomationHelp("snapshot_not_found 保存先", 5)).toEqual([]);
    });

    it("returns no topics for empty or unmatched queries", () => {
        expect(searchAutomationHelp("　 \t\n", 5)).toEqual([]);
        expect(searchAutomationHelp("no-such-help-topic", 5)).toEqual([]);
    });
});
