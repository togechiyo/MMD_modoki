import { describe, expect, it } from "vitest";
import { resolveModelCommentNoticeContent } from "./model-comment-notice-controller";

describe("resolveModelCommentNoticeContent", () => {
    const header = {
        format: "pmx" as const,
        version: "2.1",
        modelName: "モデル名",
        englishModelName: "Model name",
        comment: "日本語の注記",
        englishComment: "English notice",
    };

    it("uses the native PMX fields for non-English UI", () => {
        expect(resolveModelCommentNoticeContent(header, false)).toEqual({
            title: "モデル名",
            comment: "日本語の注記",
            formatVersion: "PMX ver2.1",
        });
    });

    it("uses the English PMX fields for English UI", () => {
        expect(resolveModelCommentNoticeContent(header, true)).toEqual({
            title: "Model name",
            comment: "English notice",
            formatVersion: "PMX ver2.1",
        });
    });

    it("falls back across languages", () => {
        expect(resolveModelCommentNoticeContent({ ...header, englishComment: "" }, true).comment).toBe("日本語の注記");
    });
});
