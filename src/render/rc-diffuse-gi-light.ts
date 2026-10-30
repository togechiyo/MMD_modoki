import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

export type RcDiffuseGiLight = {
    directionToLight: [number, number, number];
    color: [number, number, number];
};

/** Match Babylon's world light direction and scaled intensity, without raster shadow settings. */
export function readRcDiffuseGiLight(light: DirectionalLight | null): RcDiffuseGiLight | null {
    if (!light) return null;
    const transformed = light.computeTransformedInformation();
    const direction = transformed ? light.transformedDirection : light.direction;
    if (!direction) return null;
    const length = direction.length();
    const intensity = light.isEnabled() ? light.getScaledIntensity() : 0;
    if (!(length > 0.00001) || ![length, direction.x, direction.y, direction.z, intensity,
        light.diffuse.r, light.diffuse.g, light.diffuse.b].every(Number.isFinite)) return null;
    return {
        directionToLight: [-direction.x / length, -direction.y / length, -direction.z / length],
        color: [light.diffuse.r, light.diffuse.g, light.diffuse.b].map(value => Math.max(0, value * intensity)) as [number, number, number],
    };
}
