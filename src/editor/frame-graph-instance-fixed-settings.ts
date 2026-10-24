import { buildLutAtlasDataFrom3dlText } from "../render/lut-atlas-texture";
import { instanceColor, type InstanceColor, type EffectInstanceType } from "./frame-graph-instance-effects";
import { normalizeLuminousRadiance, type LuminousRadianceSettings } from "../render/luminous-radiance-settings";
import type { SsgiBlendMode } from "../types";

export const INSTANCE_LUT_PRESETS = [
    { id: "anime-soft", label: "Anime Soft" }, { id: "anime-cool", label: "Anime Cool" }, { id: "anime-dramatic", label: "Anime Dramatic" },
    { id: "monotone", label: "Monotone" }, { id: "sepia", label: "Sepia" }, { id: "teal-orange", label: "Teal Orange" },
] as const;
export type InstanceLutSource = { kind: "builtin"; preset: string } | { kind: "external"; name: string; runtimeText: string };
export type InstanceFixedSettings = { color?: InstanceColor; shadowColor?: InstanceColor; thickness?: number; softness?: number; lut?: InstanceLutSource; toonInfluence?: number; blendMode?: SsgiBlendMode; samples?: number; radiance?: LuminousRadianceSettings };
export type InstanceFixedSliderField = "samples" | "radianceStrength" | "radianceRange";
/** Public stack controls only. Stored internal settings do not imply a public control. */
export function visibleInstanceFixedFields(type: EffectInstanceType): readonly (keyof InstanceFixedSettings | "bloomColor")[] {
    switch (type) {
        case "bloom": return ["bloomColor"];
        case "lut": return ["lut"];
        case "aerialPerspective": case "offsetShadow": case "offsetHighlight": return ["color"];
        case "directionalLightShafts": return ["color", "shadowColor"];
        case "motionBlur": return ["samples"];
        case "luminous": return ["radiance"];
        default: return [];
    }
}
const validatedLuts = new Set<string>();
function lutSource(source: InstanceLutSource | undefined): InstanceLutSource {
    if (!source) return { kind: "builtin", preset: "anime-soft" };
    if (source.kind === "builtin" && INSTANCE_LUT_PRESETS.some(item => item.id === source.preset)) return { kind: "builtin", preset: source.preset };
    if (source.kind !== "external" || typeof source.name !== "string" || source.name.length > 200 || typeof source.runtimeText !== "string" || source.runtimeText.length > 16 * 1024 * 1024) throw new Error("Invalid instance LUT source");
    if (!validatedLuts.has(source.runtimeText)) {
        buildLutAtlasDataFrom3dlText(source.runtimeText);
        if (validatedLuts.size >= 8) validatedLuts.clear();
        validatedLuts.add(source.runtimeText);
    }
    return { kind: "external", name: source.name, runtimeText: source.runtimeText };
}
export function instanceFixedSettings(type: EffectInstanceType, value: InstanceFixedSettings = {}): InstanceFixedSettings | undefined {
    switch (type) {
        case "ssao": return { color: instanceColor(value.color ?? { r: 0.5, g: 0.5, b: 0.5 }), toonInfluence: finite(value.toonInfluence, 1, 0, 1) };
        case "ssgi": return { blendMode: ["additive", "softLight", "overlay"].includes(value.blendMode ?? "") ? value.blendMode : "softLight" };
        case "motionBlur": return { samples: Math.round(finite(value.samples, 32, 8, 64)) };
        case "luminous": return { radiance: normalizeLuminousRadiance(value.radiance) };
        case "lut": return { lut: lutSource(value.lut) };
        case "aerialPerspective": return { color: instanceColor(value.color ?? { r: 0.72, g: 0.79, b: 0.83 }) };
        case "directionalLightShafts": return { color: instanceColor(value.color), shadowColor: instanceColor(value.shadowColor ?? { r: 0, g: 0, b: 0 }) };
        case "offsetShadow": return { color: instanceColor(value.color ?? { r: 0.29, g: 0.21, b: 0.16 }), thickness: finite(value.thickness, 1, 0.0001, 1), softness: finite(value.softness, 0, 0, 12) };
        case "offsetHighlight": return { color: instanceColor(value.color) };
        default: return undefined;
    }
}
function finite(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
