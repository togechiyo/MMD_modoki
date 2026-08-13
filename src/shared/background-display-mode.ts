export type BackgroundDisplayMode = "default" | "white" | "black" | "checker";

export const normalizeBackgroundDisplayMode = (
    value: unknown,
    legacyBlack = false,
): BackgroundDisplayMode => {
    if (value === "default" || value === "white" || value === "black" || value === "checker") {
        return value;
    }
    return legacyBlack ? "black" : "default";
};
