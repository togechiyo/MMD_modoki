export type RcSpatialVolume = { min: [number, number, number]; size: number };

// World-space domains, independent of model bounds, camera and animated shadow distance.
// Each effect retains its own probe grid, source policy and light transport.
// Keep a medium-near level: jumping directly from 128 to 2048 makes visible
// walls beyond 64 world units inherit a 16x larger probe interval.
const ORIGIN_VOLUME_SIZES = [128, 512, 2048, 32768] as const;
export const RC_ORIGIN_VOLUME_COUNT = ORIGIN_VOLUME_SIZES.length;

export function createRcOriginVolumes(): RcSpatialVolume[] {
    return ORIGIN_VOLUME_SIZES.map(size => ({ min: [-size / 2, -size / 2, -size / 2], size }));
}
