import { describe, expect, it } from "vitest";
import { resolveOutputFrameRangeOnProjectLoad } from "./output-frame-range-policy";

describe("output frame range policy", () => {
    it("follows the current timeline when the saved mode is timeline", () => {
        expect(resolveOutputFrameRangeOnProjectLoad({
            frameRangeMode: "timeline",
            startFrame: 0,
            endFrame: 120,
        }, 400)).toEqual({
            mode: "timeline",
            customized: false,
            startFrame: 0,
            endFrame: 400,
        });
    });

    it("preserves a legacy numeric range as an explicit custom range", () => {
        expect(resolveOutputFrameRangeOnProjectLoad({
            startFrame: 10,
            endFrame: 120,
        }, 400)).toEqual({
            mode: "custom",
            customized: true,
            startFrame: 10,
            endFrame: 120,
        });
    });

    it("defaults missing range state to the full timeline", () => {
        expect(resolveOutputFrameRangeOnProjectLoad({}, 500)).toEqual({
            mode: "timeline",
            customized: false,
            startFrame: 0,
            endFrame: 500,
        });
    });
});
