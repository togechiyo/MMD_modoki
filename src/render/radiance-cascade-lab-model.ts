export type RadianceLabSettings = {
    emitterColor: string;
    emissionGain: number;
    emitterEnabled: boolean;
    rcEnabled: boolean;
    glowEnabled: boolean;
    blockerEnabled: boolean;
    blockerX: number;
    camera: "overview" | "receiver";
};

export const DEFAULT_RADIANCE_LAB_SETTINGS: Readonly<RadianceLabSettings> = {
    emitterColor: "#ff4020", emissionGain: 8, emitterEnabled: true,
    rcEnabled: true, glowEnabled: true, blockerEnabled: true, blockerX: -1,
    camera: "overview",
};

export type RadianceCascadeLayout = {
    grid: number;
    directionsX: number;
    directionsY: number;
    width: number;
    height: number;
    start: number;
    end: number;
};

export function createRadianceCascadeLayouts(): RadianceCascadeLayout[] {
    let start = 0;
    return Array.from({ length: 4 }, (_, level) => {
        const grid = 16 >> level;
        const directionsX = 8 << level;
        const directionsY = 4 << level;
        const end = start + 0.5 * 4 ** level;
        const layout = { grid, directionsX, directionsY,
            width: grid * directionsX, height: grid * grid * directionsY, start, end };
        start = end;
        return layout;
    });
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeRadianceLabSettings(value: unknown): RadianceLabSettings {
    const raw = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
    const defaults = DEFAULT_RADIANCE_LAB_SETTINGS;
    const boolean = (key: keyof RadianceLabSettings, fallback: boolean): boolean =>
        typeof raw[key] === "boolean" ? raw[key] as boolean : fallback;
    return {
        emitterColor: typeof raw.emitterColor === "string" && /^#[0-9a-f]{6}$/i.test(raw.emitterColor)
            ? raw.emitterColor.toLowerCase() : defaults.emitterColor,
        emissionGain: finiteNumber(raw.emissionGain, defaults.emissionGain, 0, 24),
        emitterEnabled: boolean("emitterEnabled", defaults.emitterEnabled),
        rcEnabled: boolean("rcEnabled", defaults.rcEnabled),
        glowEnabled: boolean("glowEnabled", defaults.glowEnabled),
        blockerEnabled: boolean("blockerEnabled", defaults.blockerEnabled),
        blockerX: finiteNumber(raw.blockerX, defaults.blockerX, -2.5, 2.5),
        camera: raw.camera === "receiver" ? "receiver" : "overview",
    };
}

export function encodeRadianceLabSettings(settings: RadianceLabSettings): string {
    return JSON.stringify({ format: "mmd-modoki-radiance-lab", version: 1,
        settings: normalizeRadianceLabSettings(settings) }, null, 2);
}

export function decodeRadianceLabSettings(text: string): RadianceLabSettings {
    if (text.length > 16384) throw new Error("Settings file is too large");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid lab settings");
    const record = parsed as Record<string, unknown>;
    if (record.format !== "mmd-modoki-radiance-lab" || record.version !== 1) {
        throw new Error("Unsupported lab settings format");
    }
    return normalizeRadianceLabSettings(record.settings);
}

export function linearEmissionFromHex(color: string): [number, number, number] {
    const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_RADIANCE_LAB_SETTINGS.emitterColor;
    return [1, 3, 5].map(index => {
        const value = parseInt(safe.slice(index, index + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
}

export function getRadianceLabUniforms(settings: RadianceLabSettings, width: number, height: number): Float32Array {
    const state = normalizeRadianceLabSettings(settings);
    const color = linearEmissionFromHex(state.emitterColor);
    const eye = state.camera === "receiver" ? [-3, 1.4, -2.6] : [2.8, 2.8, 6.8];
    const target = state.camera === "receiver" ? [0.4, 0.4, 0.3] : [0, 1.1, -1.2];
    return new Float32Array([
        ...color, state.emitterEnabled ? state.emissionGain : 0,
        state.blockerX, 0.7, -1.8, state.blockerEnabled ? 1 : 0,
        ...eye, 0, ...target, 0,
        state.rcEnabled ? 1 : 0, state.glowEnabled ? 1 : 0, width, height,
        -4.5, -0.5, -4.5, 0, 9, 6, 9, 0,
    ]);
}
