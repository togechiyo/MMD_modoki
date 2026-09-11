import { expect, it, vi } from "vitest";
import { keyframeSearchSchema, searchKeyframes } from "../../src/automation/keyframe-search";
const tracks = [{ category: "bone" as const, name: "左腕", frames: [0, 10, 30, 50] },
    { category: "morph" as const, name: "Ａ smile", frames: [10, 20, 30] }];
it("filters inclusive ranges and pages across tracks without changing input", () => {
    const read = vi.fn(() => ({ kind: "morph" as const, weights: [0.5] }));
    const before = structuredClone(tracks);
    const result = searchKeyframes(tracks, keyframeSearchSchema.parse({ startFrame: 10, endFrame: 30, includePayload: true }), 20, 1, 3, read);
    expect(result).toMatchObject({ totalCount: 5, matchedTrackCount: 2, firstFrame: 10, lastFrame: 30, previousFrame: 10, nextFrame: 30, nextOffset: 4 });
    expect(result.items.map(item => item.frame)).toEqual([30, 10, 20]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(tracks).toEqual(before);
});
it("combines exact names, category and normalized literal substring without regex", () => {
    const read = vi.fn();
    const result = searchKeyframes(tracks, keyframeSearchSchema.parse({ names: ["Ａ smile"], categories: ["morph"], nameContains: "a SM" }), 10, 0, 20, read);
    expect(result).toMatchObject({ totalCount: 3, previousFrame: null, nextFrame: 20 });
    expect(read).not.toHaveBeenCalled();
    expect(searchKeyframes(tracks, keyframeSearchSchema.parse({ nameContains: ".*" }), 0, 0, 20, read).totalCount).toBe(0);
    expect(keyframeSearchSchema.safeParse({ startFrame: 40, endFrame: 20 }).success).toBe(false);
});
it("counts large tracks without reading all payloads and handles empty pages", () => {
    const large = [{ category: "bone" as const, name: "腕", frames: Uint32Array.from({ length: 100000 }, (_, i) => i) }];
    const read = vi.fn(() => null);
    const filter = keyframeSearchSchema.parse({ includePayload: true });
    expect(searchKeyframes(large, filter, 100000, 99999, 20, read)).toMatchObject({ totalCount: 100000, nextOffset: null, previousFrame: 99999, nextFrame: null });
    expect(read).toHaveBeenCalledTimes(1);
    expect(searchKeyframes(large, filter, 0, 100000, 20, read).items).toEqual([]);
});
