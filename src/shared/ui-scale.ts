export const UI_SCALE_PERCENTAGES = [75, 100, 125, 150] as const;

export type UiScalePercentage = (typeof UI_SCALE_PERCENTAGES)[number];

export const DEFAULT_UI_SCALE_PERCENTAGE: UiScalePercentage = 100;

export function isUiScalePercentage(value: number): value is UiScalePercentage {
    return UI_SCALE_PERCENTAGES.includes(value as UiScalePercentage);
}

export function parseUiScalePercentage(value: unknown): UiScalePercentage {
    const numericValue = typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : value;
    return typeof numericValue === "number" && isUiScalePercentage(numericValue)
        ? numericValue as UiScalePercentage
        : DEFAULT_UI_SCALE_PERCENTAGE;
}

export function uiScalePercentageToZoomFactor(value: UiScalePercentage): number {
    return value / 100;
}
