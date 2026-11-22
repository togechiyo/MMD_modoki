import { RC_DIFFUSE_GI_QUALITIES, type RcDiffuseGiSettings, type RcDiffuseGiVolume } from "../render/rc-diffuse-gi-settings";

export type RcGiSliderField = "strength" | "quality" | "rangeScale";

export function getRcGiSliderPosition(field: RcGiSliderField, settings: RcDiffuseGiSettings): number {
    switch (field) {
        case "strength": return Math.round(settings.strength * 50);
        case "quality": return RC_DIFFUSE_GI_QUALITIES.indexOf(settings.quality);
        case "rangeScale": return Math.round(50 + 50 * Math.log2(settings.rangeScale));
    }
}

/** Near range uses equal slider travel per doubling. */
export function rcGiRangeScaleAtPosition(position: number): number {
    return 2 ** ((position - 50) / 50);
}

export function getRcGiSliderPatch(field: RcGiSliderField, position: number): Partial<RcDiffuseGiSettings> {
    switch (field) {
        case "strength": return { strength: position / 50 };
        case "quality": return { quality: RC_DIFFUSE_GI_QUALITIES[position] };
        case "rangeScale": return { rangeScale: rcGiRangeScaleAtPosition(position) };
    }
}

type DiagnosticState = { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcDiffuseGiVolume | null };
const REASON_KEYS: Readonly<Record<string, string>> = {
    "Frame Graph / WebGPU": "backend",
    "Scene custom render targets": "sceneTargets",
    "Multiple / rig cameras": "cameras",
    "PrePass": "prePass",
    "Main directional light": "mainLight",
    "Zero strength": "zeroStrength",
    "No direct light": "noDirectLight",
    "対象の通常MMD材質を読み込んでください": "noMaterials",
};

/** Diagnostic auto bounds are display-only; opening the dialog must not author a fixed volume. */
export function getRcDiffuseGiUiState(settings: RcDiffuseGiSettings, diagnostics: DiagnosticState, translate: (key: string) => string) {
    const volume = settings.volume ?? diagnostics.volume;
    const reason = diagnostics.reason?.replace(/\s+/g, " ").trim() ?? "";
    const translatedReason = REASON_KEYS[reason] ? translate(`experiment.rcDiffuseGi.reason.${REASON_KEYS[reason]}`) : reason;
    const shortReason = translatedReason.length > 120 ? `${translatedReason.slice(0, 119)}…` : translatedReason;
    const showReason = diagnostics.status !== "off";
    return {
        automaticVolume: settings.volume === null,
        volume: volume ? { min: [...volume.min] as [number, number, number], size: volume.size } : null,
        statusText: `${translate(`experiment.rcDiffuseGi.status.${diagnostics.status}`)}${showReason && shortReason ? `: ${shortReason}` : ""}`,
    };
}
