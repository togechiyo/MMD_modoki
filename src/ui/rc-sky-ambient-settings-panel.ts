import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcSkyAmbientSettings, RcSkyAmbientVolume } from "../render/rc-sky-ambient-settings";
import { getRcSkyAmbientUiState } from "./rc-sky-ambient-ui-state";
import { createRcLightingEffectCard, createRcLightingSlider, type RcLightingEffectCardOptions } from "./rc-lighting-effect-card";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
    isEffectValueEditLocked(id: string): boolean;
    getRcSkyAmbientSettings(): RcSkyAmbientSettings;
    getRcSkyAmbientDiagnostics(): { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcSkyAmbientVolume | null; effectiveVolume?: RcSkyAmbientVolume | null; probeGrid?: number; triangleCount: number; fieldRevision: number; supportedMaterialCount: number };
    getEffectSceneKeyframeFrames(id: string): Uint32Array;
};

/** Sky shading shares the compact RC effect controls and scene key track. */
export function mountRcSkyAmbientSettings(parent: HTMLElement, host: Host, dispatch: (action: EditorAction) => boolean, options: RcLightingEffectCardOptions): () => void {
    const card = createRcLightingEffectCard(parent, "rcSkyAmbient", options);
    const { enabled, register } = card;
    const details = document.createElement("fieldset");
    details.className = "rc-lighting-effect-controls";
    let activeSlider: HTMLInputElement | null = null;
    const sliders = (["opacity", "strength", "skyBrightness"] as const).map(field => {
        const suffix = `${field[0].toUpperCase()}${field.slice(1)}`;
        const scale = field === "strength" || field === "skyBrightness" ? 50 : 100;
        const { row, input } = createRcLightingSlider(`rcSkyAmbient${suffix}`, t(`experiment.rcSkyAmbient.${field}`));
        input.addEventListener("input", () => { activeSlider = input; });
        input.addEventListener("change", () => {
            activeSlider = null;
            dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings: { [field]: Number(input.value) / scale } });
            refresh();
        });
        details.append(row);
        return { input, field, scale };
    });
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcSkyAmbient" }); refresh();
    });
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcSkyAmbientStatus = "true";
    const refresh = (initial = false): void => {
        if (!initial && card.section.getClientRects().length === 0) return;
        const settings = host.getRcSkyAmbientSettings();
        const valueEditLocked = host.isEffectValueEditLocked("rcSkyAmbient");
        card.refresh(settings.enabled, host.isPlaying, valueEditLocked);
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcSkyAmbient").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        if (!initial && card.content.hidden) return;
        const diagnostics = host.getRcSkyAmbientDiagnostics();
        const uiState = getRcSkyAmbientUiState(settings, diagnostics, t);
        details.disabled = !settings.enabled || valueEditLocked;
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * slider.scale));
            slider.input.disabled = details.disabled;
        }
        status.dataset.state = diagnostics.status;
        status.dataset.fieldRevision = String(diagnostics.fieldRevision);
        status.dataset.supportedMaterialCount = String(diagnostics.supportedMaterialCount);
        status.dataset.automaticVolume = String(uiState.automaticVolume);
        status.dataset.probeGrid = diagnostics.probeGrid === undefined ? "" : String(diagnostics.probeGrid);
        status.dataset.volume = JSON.stringify(diagnostics.volume);
        status.dataset.effectiveVolume = JSON.stringify(diagnostics.effectiveVolume ?? null);
        status.textContent = uiState.statusText;
    };
    enabled.addEventListener("change", () => {
        dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings: { enabled: enabled.checked } }); refresh();
    });
    card.content.append(details, status, card.remove);
    // Hidden camera-panel rebuilds must not expose unchecked/default controls
    // before the next visible timer tick, even when the saved effect is enabled.
    refresh(true);
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
