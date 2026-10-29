import type { RcSkyOcclusionSettings, RcSkyOcclusionVolume } from "../render/rc-sky-occlusion-settings";

type DiagnosticState = { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcSkyOcclusionVolume | null };
const REASON_KEYS: Readonly<Record<string, string>> = {
    "Frame Graph / WebGPU": "backend",
    "Scene custom render targets": "sceneTargets",
    "Multiple / rig cameras": "cameras",
    "PrePass": "prePass",
    "対象の通常MMD材質を読み込んでください": "noMaterials",
};

/** Diagnostic auto bounds are display-only; opening the dialog must not author a fixed volume. */
export function getRcSkyOcclusionUiState(settings: RcSkyOcclusionSettings, diagnostics: DiagnosticState, translate: (key: string) => string) {
    const volume = settings.volume ?? diagnostics.volume;
    const reason = diagnostics.reason?.replace(/\s+/g, " ").trim() ?? "";
    const translatedReason = REASON_KEYS[reason] ? translate(`experiment.rcSkyOcclusion.reason.${REASON_KEYS[reason]}`) : reason;
    const shortReason = translatedReason.length > 120 ? `${translatedReason.slice(0, 119)}…` : translatedReason;
    const showReason = diagnostics.status === "preparing" || diagnostics.status === "unsupported" || diagnostics.status === "error";
    return {
        automaticVolume: settings.volume === null,
        volume: volume ? { min: [...volume.min] as [number, number, number], size: volume.size } : null,
        statusText: `${translate(`experiment.rcSkyOcclusion.status.${diagnostics.status}`)}${showReason && shortReason ? `: ${shortReason}` : ""}`,
    };
}
