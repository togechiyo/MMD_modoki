import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcDiffuseGiSettings, RcDiffuseGiVolume } from "../render/rc-diffuse-gi-settings";
import { getRcDiffuseGiUiState } from "./rc-diffuse-gi-ui-state";
import { createRcLightingEffectCard, createRcLightingSlider, type RcLightingEffectCardOptions } from "./rc-lighting-effect-card";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
    isEffectValueEditLocked(id: string): boolean;
    getRcDiffuseGiSettings(): RcDiffuseGiSettings;
    getRcDiffuseGiDiagnostics(): { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcDiffuseGiVolume | null; triangleCount: number; fieldRevision: number; supportedMaterialCount: number };
    getEffectSceneKeyframeFrames(id: string): Uint32Array;
};

/** Directional-light bounce is an independent, persistent scene lighting setting. */
export function mountRcDiffuseGiSettings(parent: HTMLElement, host: Host, dispatch: (action: EditorAction) => boolean, options: RcLightingEffectCardOptions): () => void {
    const card = createRcLightingEffectCard(parent, "rcDiffuseGi", options);
    const { enabled, register } = card;
    const details = document.createElement("fieldset");
    details.className = "rc-lighting-effect-controls";
    let activeSlider: HTMLInputElement | null = null;
    const sliders = (["strength"] as const).map(field => {
        const { row, input } = createRcLightingSlider("rcDiffuseGiStrength", t(`experiment.rcDiffuseGi.${field}`));
        input.addEventListener("input", () => { activeSlider = input; });
        input.addEventListener("change", () => {
            activeSlider = null;
            dispatch({ type: "effect.setRcDiffuseGi", source: "panel", settings: { [field]: Number(input.value) / 50 } });
            refresh();
        });
        details.append(row);
        return { input, field };
    });
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcDiffuseGi" }); refresh();
    });
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcDiffuseGiStatus = "true";
    const refresh = (initial = false): void => {
        if (!initial && card.section.getClientRects().length === 0) return;
        const settings = host.getRcDiffuseGiSettings();
        const valueEditLocked = host.isEffectValueEditLocked("rcDiffuseGi");
        card.refresh(settings.enabled, host.isPlaying, valueEditLocked);
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcDiffuseGi").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        if (!initial && card.content.hidden) return;
        const diagnostics = host.getRcDiffuseGiDiagnostics();
        const uiState = getRcDiffuseGiUiState(settings, diagnostics, t);
        details.disabled = !settings.enabled || valueEditLocked;
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * 50));
            slider.input.disabled = details.disabled;
        }
        status.dataset.state = diagnostics.status;
        status.dataset.fieldRevision = String(diagnostics.fieldRevision);
        status.dataset.supportedMaterialCount = String(diagnostics.supportedMaterialCount);
        status.dataset.automaticVolume = String(uiState.automaticVolume);
        status.textContent = uiState.statusText;
    };
    enabled.addEventListener("change", () => {
        dispatch({ type: "effect.setRcDiffuseGi", source: "panel", settings: { enabled: enabled.checked } }); refresh();
    });
    card.content.append(details, status, card.remove);
    // Hidden camera-panel rebuilds must not expose unchecked/default controls
    // before the next visible timer tick, even when the saved effect is enabled.
    refresh(true);
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
