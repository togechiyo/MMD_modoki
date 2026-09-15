// Shelved for the next release. Keep opt-in development access for resuming work.
// Packaged builds cannot enable this through saved settings or environment flags.
export const EFFECT_TIMELINE_ENABLED = import.meta.env.DEV
    && import.meta.env.VITE_MMD_EFFECT_TIMELINE === "1";
