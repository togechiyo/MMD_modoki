import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcSkyOcclusionSettings, RcSkyOcclusionVolume } from "../render/rc-sky-occlusion-settings";
import { createPopupFormButton, createPopupFormButtonRow, createPopupFormField } from "./popup-form-helpers";
import { getRcSkyOcclusionUiState } from "./rc-sky-occlusion-ui-state";
import { createRcLightingEffectCard, createRcLightingSlider, type RcLightingEffectCardOptions } from "./rc-lighting-effect-card";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
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
    const volumeControls = document.createElement("fieldset");
    volumeControls.className = "rc-lighting-effect-controls";
    const numberControls: HTMLInputElement[] = [];
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
    for (const field of ["minX", "minY", "minZ", "size"] as const) {
        const input = document.createElement("input");
        input.type = "number"; input.step = "0.1"; input.className = "popup-form-control";
        input.name = `rcSkyOcclusion${field[0].toUpperCase()}${field.slice(1)}`;
        input.min = field === "size" ? "0.1" : "-1000000";
        input.max = field === "size" ? "100000" : "1000000";
        input.placeholder = t("experiment.rcSkyOcclusion.automatic");
        input.addEventListener("keydown", event => {
            if (event.key === "Escape") { input.blur(); refresh(); return; }
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (numberControls.some(control => control.value === "" || !control.checkValidity())) return;
            const values = numberControls.map(control => control.valueAsNumber);
            if (!values.every(Number.isFinite)) return;
            dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { volume: { min: [values[0], values[1], values[2]], size: values[3] } } });
            input.blur(); refresh();
        });
        numberControls.push(input);
        volumeControls.append(createPopupFormField(t(`experiment.rcSkyOcclusion.${field}`), input));
    }
    const recalculate = createPopupFormButton(t("experiment.rcSkyOcclusion.recalculate"), "secondary");
    recalculate.addEventListener("click", () => {
        dispatch({ type: "effect.recalculateRcSkyOcclusionVolume", source: "panel" }); refresh();
    });
    const automatic = createPopupFormButton(t("experiment.rcSkyOcclusion.automatic"), "secondary");
    automatic.addEventListener("click", () => {
        dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { volume: null } }); refresh();
    });
    volumeControls.append(createPopupFormButtonRow([recalculate, automatic]));
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcSkyOcclusion" }); refresh();
    });
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcSkyOcclusionStatus = "true";
    const refresh = (initial = false): void => {
        if (!initial && card.section.getClientRects().length === 0) return;
        const settings = host.getRcSkyOcclusionSettings();
        card.refresh(settings.enabled, host.isPlaying);
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcSkyOcclusion").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        if (!initial && card.content.hidden) return;
        const diagnostics = host.getRcSkyOcclusionDiagnostics();
        const uiState = getRcSkyOcclusionUiState(settings, diagnostics, t);
        details.disabled = !settings.enabled || host.isPlaying;
        volumeControls.disabled = !settings.enabled || host.isPlaying;
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * 100));
            slider.input.disabled = details.disabled;
        }
        const volume = uiState.volume;
        if (!numberControls.includes(document.activeElement as HTMLInputElement)) {
            numberControls.forEach((input, index) => { input.value = volume ? String(index < 3 ? volume.min[index] : volume.size) : ""; });
        }
        automatic.disabled = uiState.automaticVolume;
        automatic.textContent = t(`experiment.rcSkyOcclusion.${uiState.automaticVolume ? "automaticActive" : "automatic"}`);
        status.dataset.state = diagnostics.status;
        status.dataset.fieldRevision = String(diagnostics.fieldRevision);
        status.dataset.supportedMaterialCount = String(diagnostics.supportedMaterialCount);
        status.dataset.automaticVolume = String(uiState.automaticVolume);
        status.textContent = uiState.statusText;
    };
    enabled.addEventListener("change", () => {
        dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { enabled: enabled.checked } }); refresh();
    });
    card.advanced.append(volumeControls);
    card.content.append(details, status, card.advanced, card.remove);
    // Hidden camera-panel rebuilds must not expose unchecked/default controls
    // before the next visible timer tick, even when the saved effect is enabled.
    refresh(true);
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
