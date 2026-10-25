import { getEffectDefinition, normalizeEffectValue, type EffectValue } from "./effect-keyframe-definitions";

export const FRAME_GRAPH_INSTANCE_EFFECT_TYPES = ["gamma", "grain", "sharpen", "chromatic", "vignette", "edgeBlur", "distortion", "bloom", "lut", "aerialPerspective", "directionalLightShafts", "offsetShadow", "offsetHighlight", "dof", "luminous", "luminousRadiance", "ssao", "ssgi", "ssr", "motionBlur"] as const;
export type EffectInstanceType = typeof FRAME_GRAPH_INSTANCE_EFFECT_TYPES[number];
export type InstanceColor = { r: number; g: number; b: number };
export type EvaluatedEffectInstance = { instanceId: string; type: EffectInstanceType; value: EffectValue; bloomColor?: InstanceColor; fixedSettings?: import("./frame-graph-instance-fixed-settings").InstanceFixedSettings; lutText?: string; dofFocusDistanceMm?: number };
export const instanceNeedsViewDepth = (type: string): boolean => ["aerialPerspective", "directionalLightShafts", "offsetShadow", "offsetHighlight", "ssao", "ssgi", "ssr", "luminousRadiance"].includes(type);
export const isEffectInstanceType = (type: string): type is EffectInstanceType => FRAME_GRAPH_INSTANCE_EFFECT_TYPES.some(item => item === type);
export const INSTANCE_EFFECT_NAMES: Record<EffectInstanceType, string> = { gamma: "Gamma", grain: "Grain", sharpen: "Sharpen", chromatic: "Chromatic Aberration", vignette: "Vignette", edgeBlur: "Edge Blur", distortion: "Lens Distortion", bloom: "Bloom", lut: "LUT", aerialPerspective: "Aerial Perspective", directionalLightShafts: "Directional Light Shafts", offsetShadow: "Offset Shadow", offsetHighlight: "Offset Highlight", dof: "DoF", luminous: "Luminous", luminousRadiance: "Luminous RC", ssao: "SSAO", ssgi: "SSGI", ssr: "SSR", motionBlur: "Motion Blur" };
const defaults: Record<EffectInstanceType, EffectValue> = {
    dof: { enabled: true },
    luminousRadiance: { enabled: true },
    luminous: { enabled: true, intensity: 1, threshold: 0.15, radius: 48 }, ssao: { enabled: true }, ssgi: { enabled: true }, ssr: { enabled: true }, motionBlur: { enabled: true },
    gamma: { enabled: true, gamma: 1 }, grain: { enabled: true, intensity: 50 }, sharpen: { enabled: true, edge: 2 },
    chromatic: { enabled: true, amount: 100 }, vignette: { enabled: true, weight: 2 }, edgeBlur: { enabled: true, strength: 0.5 },
    distortion: { enabled: true, influence: 0.5 }, bloom: { enabled: true, weight: 0.4, threshold: 0.9, kernel: 205 },
    lut: { enabled: true, intensity: 1 }, aerialPerspective: { enabled: true, strength: 0.18, start: 55, range: 180 },
    directionalLightShafts: { enabled: true, strength: 0.08, phaseG: 0 },
    offsetShadow: { enabled: true, strength: 0.35, offsetX: 0, offsetY: -30, depthBias: 0.2, maxDepth: 2, depthScale: 1 },
    offsetHighlight: { enabled: true, strength: 1, offsetX: 0, offsetY: -100, depthScale: 1 },
};
export const instanceValue = (type: EffectInstanceType, value: unknown = defaults[type]): EffectValue => normalizeEffectValue(getEffectDefinition(type), value);
export function instanceColor(value: unknown): InstanceColor {
    const color = value as Partial<InstanceColor> | null;
    const channel = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    return { r: channel(color?.r), g: channel(color?.g), b: channel(color?.b) };
}
