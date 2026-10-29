// Keep the unfinished lighting adapter out of packaged builds and saved settings.
export const RADIANCE_LIGHTING_LAB_ENABLED = import.meta.env.DEV
    && import.meta.env.VITE_MMD_RADIANCE_LIGHTING_LAB === "1";
