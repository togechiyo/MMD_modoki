export const X_MATERIAL_ALPHA_EPSILON = 0.001;

export type XMaterialRenderPolicy = "opaque" | "cutout" | "blend";

export function resolveXMaterialRenderPolicy(
    materialAlpha: number,
    hasAlphaCapableTexture: boolean,
): XMaterialRenderPolicy {
    if (Number.isFinite(materialAlpha) && materialAlpha < 1 - X_MATERIAL_ALPHA_EPSILON) {
        return "blend";
    }
    if (hasAlphaCapableTexture) {
        return "cutout";
    }
    return "opaque";
}
