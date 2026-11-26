// Shelved for the next release. Keep opt-in development access for resuming work.
// Packaged builds cannot enable this through saved settings or environment flags.
export const EFFECT_TIMELINE_ENABLED = import.meta.env.DEV
    && import.meta.env.VITE_MMD_EFFECT_TIMELINE === "1";

/** The retired card is exercised only by development compatibility tests. */
export const showEffectInEditor = (id: string): boolean => id !== "rcSkyOcclusion"
    || (import.meta.env.DEV && import.meta.env.VITE_MMD_TEST_RETIRED_EFFECT_UI === "1");
