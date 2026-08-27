export type WaterSurfaceColor = {
    r: number;
    g: number;
    b: number;
};

export type WaterSurfaceSettings = {
    enabled: boolean;
    size: number;
    height: number;
    resolution: number;
    windForce: number;
    windDirectionDegrees: number;
    waveHeight: number;
    bumpHeight: number;
    waveLength: number;
    waveSpeed: number;
    waveCount: number;
    bumpTextureScale: number;
    waterColor: WaterSurfaceColor;
    colorBlendFactor: number;
    waterColor2: WaterSurfaceColor;
    colorBlendFactor2: number;
    fresnelSeparate: boolean;
};

export const WATER_SURFACE_MESH_NAME = "mmdModokiWaterSurface";

export const DEFAULT_WATER_SURFACE_SETTINGS: Readonly<WaterSurfaceSettings> = Object.freeze({
    enabled: false,
    size: 120,
    height: 0,
    resolution: 512,
    windForce: 6,
    windDirectionDegrees: 25,
    waveHeight: 0.12,
    bumpHeight: 0.35,
    waveLength: 0.2,
    waveSpeed: 0.8,
    waveCount: 20,
    bumpTextureScale: 8,
    waterColor: Object.freeze({ r: 0.03, g: 0.28, b: 0.36 }),
    colorBlendFactor: 0.28,
    waterColor2: Object.freeze({ r: 0.08, g: 0.32, b: 0.44 }),
    colorBlendFactor2: 0.2,
    fresnelSeparate: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
    const numeric = typeof value === "number" ? value : Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
}

function normalizeColor(value: unknown, fallback: WaterSurfaceColor): WaterSurfaceColor {
    const record = isRecord(value) ? value : {};
    return {
        r: normalizeNumber(record.r, fallback.r, 0, 1),
        g: normalizeNumber(record.g, fallback.g, 0, 1),
        b: normalizeNumber(record.b, fallback.b, 0, 1),
    };
}

export function normalizeWaterSurfaceResolution(value: unknown): number {
    const numeric = normalizeNumber(value, DEFAULT_WATER_SURFACE_SETTINGS.resolution, 256, 2048);
    if (numeric <= 256) return 256;
    if (numeric <= 512) return 512;
    if (numeric <= 1024) return 1024;
    return 2048;
}

export function cloneWaterSurfaceSettings(settings: WaterSurfaceSettings): WaterSurfaceSettings {
    return {
        ...settings,
        waterColor: { ...settings.waterColor },
        waterColor2: { ...settings.waterColor2 },
    };
}

export function normalizeWaterSurfaceSettings(
    value: unknown,
    fallback: WaterSurfaceSettings = DEFAULT_WATER_SURFACE_SETTINGS,
): WaterSurfaceSettings {
    const record = isRecord(value) ? value : {};
    const direction = normalizeNumber(record.windDirectionDegrees, fallback.windDirectionDegrees, -3600, 3600);
    return {
        enabled: typeof record.enabled === "boolean" ? record.enabled : fallback.enabled,
        size: normalizeNumber(record.size, fallback.size, 1, 500),
        height: normalizeNumber(record.height, fallback.height, -20, 20),
        resolution: normalizeWaterSurfaceResolution(record.resolution ?? fallback.resolution),
        windForce: normalizeNumber(record.windForce, fallback.windForce, 0, 20),
        windDirectionDegrees: ((direction % 360) + 360) % 360,
        waveHeight: normalizeNumber(record.waveHeight, fallback.waveHeight, 0, 1),
        bumpHeight: normalizeNumber(record.bumpHeight, fallback.bumpHeight, 0, 2),
        waveLength: normalizeNumber(record.waveLength, fallback.waveLength, 0.01, 2),
        waveSpeed: normalizeNumber(record.waveSpeed, fallback.waveSpeed, 0, 3),
        waveCount: normalizeNumber(record.waveCount, fallback.waveCount, 1, 64),
        bumpTextureScale: normalizeNumber(record.bumpTextureScale, fallback.bumpTextureScale, 1, 32),
        waterColor: normalizeColor(record.waterColor, fallback.waterColor),
        colorBlendFactor: normalizeNumber(record.colorBlendFactor, fallback.colorBlendFactor, 0, 1),
        waterColor2: normalizeColor(record.waterColor2, fallback.waterColor2),
        colorBlendFactor2: normalizeNumber(record.colorBlendFactor2, fallback.colorBlendFactor2, 0, 1),
        fresnelSeparate: typeof record.fresnelSeparate === "boolean"
            ? record.fresnelSeparate
            : fallback.fresnelSeparate,
    };
}
