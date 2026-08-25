export type OutputFrameRangeMode = "timeline" | "custom";

export type PersistedOutputFrameRange = {
    frameRangeMode?: OutputFrameRangeMode;
    startFrame?: number;
    endFrame?: number;
};

export function resolveOutputFrameRangeOnProjectLoad(
    state: PersistedOutputFrameRange,
    maxFrame: number,
): {
    mode: OutputFrameRangeMode;
    customized: boolean;
    startFrame: number;
    endFrame: number;
} {
    const normalizedMax = Number.isFinite(maxFrame) ? Math.max(0, Math.floor(maxFrame)) : 0;
    const hasStoredRange = Number.isFinite(state.startFrame) && Number.isFinite(state.endFrame);
    if (state.frameRangeMode === "timeline" || !hasStoredRange) {
        return {
            mode: "timeline",
            customized: false,
            startFrame: 0,
            endFrame: normalizedMax,
        };
    }

    const startFrame = Math.max(0, Math.min(normalizedMax, Math.floor(state.startFrame ?? 0)));
    const endFrame = Math.max(
        startFrame,
        Math.min(normalizedMax, Math.floor(state.endFrame ?? normalizedMax)),
    );
    return {
        mode: "custom",
        customized: true,
        startFrame,
        endFrame,
    };
}
