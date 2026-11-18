/** Shared public catalog; safe to import without the renderer or LUT parser. */
export const INSTANCE_LUT_PRESETS = [
    { id: "anime-soft", label: "Anime Soft" }, { id: "anime-cool", label: "Anime Cool" }, { id: "anime-dramatic", label: "Anime Dramatic" },
    { id: "monotone", label: "Monotone" }, { id: "sepia", label: "Sepia" }, { id: "teal-orange", label: "Teal Orange" },
] as const;
