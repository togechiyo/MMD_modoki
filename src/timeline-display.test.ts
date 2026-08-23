import { describe, expect, it } from "vitest";

import { getTimelineTrackDisplayName } from "./timeline";

describe("timeline track display names", () => {
    it.each([
        ["Camera", "camera", "カメラ"],
        ["Light", "light", "照明"],
        ["Shadow", "shadow", "影"],
        ["Gravity", "gravity", "重力"],
        ["センター", "bone", "センター"],
    ] as const)("displays %s as %s category label", (name, category, expected) => {
        expect(getTimelineTrackDisplayName({ name, category })).toBe(expected);
    });
});
