import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcSkyOcclusionSettings, RcSkyOcclusionVolume } from "../render/rc-sky-occlusion-settings";
import { getRcSkyOcclusionUiState } from "./rc-sky-occlusion-ui-state";
import { createRcLightingEffectCard, createRcLightingSlider, type RcLightingEffectCardOptions } from "./rc-lighting-effect-card";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
    isEffectValueEditLocked(id: string): boolean;
    getRcSkyOcclusionSettings(): RcSkyOcclusionSettings;
    getRcSkyOcclusionDiagnostics(): { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcSkyOcclusionVolume | null; triangleCount: number; fieldRevision: number; supportedMaterialCount: number };
    getEffectSceneKeyframeFrames(id: string): Uint32Array;
};

/** Persistent scene lighting settings; the separate fixed-floor developer lab is unchanged. */
export function mountRcSkyOcclusionSettings(parent: HTMLElement, host: Host, dispatch: (action: EditorAction) => boolean, options: RcLightingEffectCardOptions): () => void {
    const card = createRcLightingEffectCard(parent, "rcSkyOcclusion", options);
    const { enabled, register } = card;
    const details = document.createElement("fieldset");
    details.className = "rc-lighting-effect-controls";
    let activeSlider: HTMLInputElement | null = null;
    const sliders = (["strength", "minimum"] as const).map(field => {
        const { row, input } = createRcLightingSlider(`rcSkyOcclusion${field === "strength" ? "Strength" : "Minimum"}`, t(`experiment.rcSkyOcclusion.${field}`));
        input.addEventListener("input", () => { activeSlider = input; });
        input.addEventListener("change", () => {
            activeSlider = null;
            dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { [field]: Number(input.value) / 100 } });
            refresh();
        });
        details.append(row);
        return { input, field };
    });
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcSkyOcclusion" }); refresh();
    });
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcSkyOcclusionStatus = "true";
    const refresh = (initial = false): void => {
        if (!initial && card.section.getClientRects().length === 0) return;
        const settings = host.getRcSkyOcclusionSettings();
        const valueEditLocked = host.isEffectValueEditLocked("rcSkyOcclusion");
        card.refresh(settings.enabled, host.isPlaying, valueEditLocked);
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcSkyOcclusion").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        if (!initial && card.content.hidden) return;
        const diagnostics = host.getRcSkyOcclusionDiagnostics();
        const uiState = getRcSkyOcclusionUiState(settings, diagnostics, t);
        details.disabled = !settings.enabled || valueEditLocked;
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * 100));
            slider.input.disabled = details.disabled;
        }
        status.dataset.state = diagnostics.status;
        status.dataset.fieldRevision = String(diagnostics.fieldRevision);
        status.dataset.supportedMaterialCount = String(diagnostics.supportedMaterialCount);
        status.dataset.automaticVolume = String(uiState.automaticVolume);
        status.textContent = uiState.statusText;
    };
    enabled.addEventListener("change", () => {
        dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { enabled: enabled.checked } }); refresh();
    });
    card.content.append(details, status, card.remove);
    // Hidden camera-panel rebuilds must not expose unchecked/default controls
    // before the next visible timer tick, even when the saved effect is enabled.
    refresh(true);
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
