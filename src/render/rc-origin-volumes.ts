export type RcSpatialVolume = { min: [number, number, number]; size: number };

// World-space domains, independent of model bounds, camera and animated shadow distance.
// Each effect retains its own probe grid, source policy and light transport.
const ORIGIN_VOLUME_SIZES = [128, 2048, 32768] as const;

export function createRcOriginVolumes(): RcSpatialVolume[] {
    return ORIGIN_VOLUME_SIZES.map(size => ({ min: [-size / 2, -size / 2, -size / 2], size }));
}
