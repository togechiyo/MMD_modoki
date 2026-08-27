export type BackgroundDisplayMode = "white" | "black" | "checker";

export const normalizeBackgroundDisplayMode = (
    value: unknown,
    legacyBlack = false,
): BackgroundDisplayMode => {
    if (value === "white" || value === "black" || value === "checker") {
        return value;
    }
    return legacyBlack ? "black" : "white";
};
