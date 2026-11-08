import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcSkyAmbientSettings, RcSkyAmbientVolume } from "../render/rc-sky-ambient-settings";
import { createPopupFormButton, createPopupFormButtonRow, createPopupFormField } from "./popup-form-helpers";
import { getRcSkyAmbientUiState, rcSkyAmbientQualityToSlider, rcSkyAmbientRangeScaleToSlider, rcSkyAmbientSliderToQuality, rcSkyAmbientSliderToRangeScale } from "./rc-sky-ambient-ui-state";
import { createRcLightingEffectCard, createRcLightingSlider, type RcLightingEffectCardOptions } from "./rc-lighting-effect-card";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
    getRcSkyAmbientSettings(): RcSkyAmbientSettings;
    getRcSkyAmbientDiagnostics(): { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcSkyAmbientVolume | null; effectiveVolume?: RcSkyAmbientVolume | null; probeGrid?: number; triangleCount: number; fieldRevision: number; supportedMaterialCount: number };
    getEffectSceneKeyframeFrames(id: string): Uint32Array;
};

/** Independent sky light shares the compact RC effect controls and scene key track. */
export function mountRcSkyAmbientSettings(parent: HTMLElement, host: Host, dispatch: (action: EditorAction) => boolean, options: RcLightingEffectCardOptions): () => void {
    const card = createRcLightingEffectCard(parent, "rcSkyAmbient", options);
    const { enabled, register } = card;
    const advancedSummary = card.advanced.querySelector("summary");
    if (advancedSummary) advancedSummary.textContent = t("experiment.rcSkyAmbient.advanced");
    const details = document.createElement("fieldset");
    details.className = "rc-lighting-effect-controls";
    const volumeControls = document.createElement("fieldset");
    volumeControls.className = "rc-lighting-effect-controls";
    const numberControls: HTMLInputElement[] = [];
    let activeSlider: HTMLInputElement | null = null;
    const sliders = (["opacity", "strength", "fill"] as const).map(field => {
        const suffix = `${field[0].toUpperCase()}${field.slice(1)}`;
        const { row, input } = createRcLightingSlider(`rcSkyAmbient${suffix}`, t(`experiment.rcSkyAmbient.${field}`));
        input.addEventListener("input", () => { activeSlider = input; });
        input.addEventListener("change", () => {
            activeSlider = null;
            dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings: { [field]: Number(input.value) / (field === "strength" ? 50 : 100) } });
            refresh();
        });
        (field === "opacity" ? details : volumeControls).append(row);
        return { input, field };
    });
    const developmentSliders = (["rangeScale", "quality"] as const).map(field => {
        const name = `rcSkyAmbient${field[0].toUpperCase()}${field.slice(1)}`;
        const { row, input } = createRcLightingSlider(name, t(`experiment.rcSkyAmbient.${field}`));
        // Development values are read-only; the main opacity row remains slider-only.
        row.style.gridTemplateColumns = "minmax(58px, 0.35fr) minmax(0, 1fr) 54px";
        const value = document.createElement("output");
        value.className = "effect-layer-control-value";
        input.id = name;
        value.setAttribute("for", name);
        if (field === "quality") input.step = "50";
        const updateValue = (): void => {
            value.value = field === "rangeScale"
                ? `×${rcSkyAmbientSliderToRangeScale(Number(input.value)).toFixed(2)}`
                : t(`experiment.rcSkyAmbient.quality.${rcSkyAmbientSliderToQuality(Number(input.value))}`);
            input.setAttribute("aria-valuetext", value.value);
        };
        input.addEventListener("input", () => { activeSlider = input; updateValue(); });
        input.addEventListener("change", () => {
            activeSlider = null;
            const settings = field === "rangeScale"
                ? { rangeScale: rcSkyAmbientSliderToRangeScale(Number(input.value)) }
                : { quality: rcSkyAmbientSliderToQuality(Number(input.value)) };
            dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings });
            refresh();
        });
        row.append(value);
        volumeControls.append(row);
        return { input, field, updateValue };
    });
    for (const field of ["minX", "minY", "minZ", "size"] as const) {
        const input = document.createElement("input");
        input.type = "number"; input.step = "0.1"; input.className = "popup-form-control";
        input.name = `rcSkyAmbient${field[0].toUpperCase()}${field.slice(1)}`;
        input.min = field === "size" ? "0.1" : "-1000000";
        input.max = field === "size" ? "100000" : "1000000";
        input.placeholder = t("experiment.rcSkyAmbient.automatic");
        input.addEventListener("keydown", event => {
            if (event.key === "Escape") { input.blur(); refresh(); return; }
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (numberControls.some(control => control.value === "" || !control.checkValidity())) return;
            const values = numberControls.map(control => control.valueAsNumber);
            if (!values.every(Number.isFinite)) return;
            dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings: { volume: { min: [values[0], values[1], values[2]], size: values[3] } } });
            input.blur(); refresh();
        });
        numberControls.push(input);
        volumeControls.append(createPopupFormField(t(`experiment.rcSkyAmbient.${field}`), input));
    }
    const recalculate = createPopupFormButton(t("experiment.rcSkyAmbient.recalculate"), "secondary");
    recalculate.addEventListener("click", () => {
        dispatch({ type: "effect.recalculateRcSkyAmbientVolume", source: "panel" }); refresh();
    });
    const automatic = createPopupFormButton(t("experiment.rcSkyAmbient.automatic"), "secondary");
    automatic.addEventListener("click", () => {
        dispatch({ type: "effect.setRcSkyAmbient", source: "panel", settings: { volume: null } }); refresh();
    });
    volumeControls.append(createPopupFormButtonRow([recalculate, automatic]));
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcSkyAmbient" }); refresh();
    });
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcSkyAmbientStatus = "true";
    const refresh = (initial = false): void => {
        if (!initial && card.section.getClientRects().length === 0) return;
        const settings = host.getRcSkyAmbientSettings();
        card.refresh(settings.enabled, host.isPlaying);
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcSkyAmbient").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        if (!initial && card.content.hidden) return;
        const diagnostics = host.getRcSkyAmbientDiagnostics();
        const uiState = getRcSkyAmbientUiState(settings, diagnostics, t);
        details.disabled = !settings.enabled || host.isPlaying;
        volumeControls.disabled = !settings.enabled || host.isPlaying;
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * (slider.field === "strength" ? 50 : 100)));
            slider.input.disabled = details.disabled;
        }
        for (const slider of developmentSliders) {
            if (activeSlider !== slider.input) slider.input.value = String(slider.field === "rangeScale" ? rcSkyAmbientRangeScaleToSlider(settings.rangeScale) : rcSkyAmbientQualityToSlider(settings.quality));
            slider.input.disabled = volumeControls.disabled;
            slider.updateValue();
        }
        const volume = uiState.volume;
        if (!numberControls.includes(document.activeElement as HTMLInputElement)) {
            numberControls.forEach((input, index) => { input.value = volume ? String(index < 3 ? volume.min[index] : volume.size) : ""; });
        }
        automatic.disabled = uiState.automaticVolume;
        automatic.textContent = t(`experiment.rcSkyAmbient.${uiState.automaticVolume ? "automaticActive" : "automatic"}`);
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
    card.advanced.append(volumeControls, status);
    card.content.append(details, card.advanced, card.remove);
    // Hidden camera-panel rebuilds must not expose unchecked/default controls
    // before the next visible timer tick, even when the saved effect is enabled.
    refresh(true);
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
