export type RcDiffuseGiInterval = { start: number; end: number };

/**
 * Keep nearby bounce sources in the finest grid for four cells. GI has no
 * per-fragment near trace, so it needs a longer first interval than Luminous.
 * The outermost cascade traces beyond its nominal end to the scene boundary.
 */
export function createRcDiffuseGiIntervals(volumeSize: number, grid = 16): RcDiffuseGiInterval[] {
    const firstIntervalLength = 4 * volumeSize / grid;
    let start = 0;
    return Array.from({ length: 4 }, (_, level) => {
        const end = start + firstIntervalLength * 4 ** level;
        const interval = { start, end };
        start = end;
        return interval;
    });
}
