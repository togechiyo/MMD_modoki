export const DEFAULT_CAMERA_MIN_Z = 0.15;
export const DEFAULT_CAMERA_MAX_Z = 100_000;
export const DEFAULT_SKYDOME_FAR_PLANE_RATIO = 0.95;

export type ViewportDepthBufferTarget = {
    useReverseDepthBuffer: boolean;
};

export function configureViewportDepthBuffer(
    engine: ViewportDepthBufferTarget,
    backend: "webgpu" | "webgl",
): boolean {
    const useReverseDepthBuffer = backend === "webgpu";
    engine.useReverseDepthBuffer = useReverseDepthBuffer;
    return useReverseDepthBuffer;
}

export function isCascadedShadowCompatible(
    engine: ViewportDepthBufferTarget,
    cascadedShadowSupported: boolean,
): boolean {
    return cascadedShadowSupported && !engine.useReverseDepthBuffer;
}

export function getDefaultSkydomeDiameter(cameraMaxZ = DEFAULT_CAMERA_MAX_Z): number {
    return cameraMaxZ * DEFAULT_SKYDOME_FAR_PLANE_RATIO * 2;
}
