import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import { RC_DIFFUSE_GI_QUALITIES, type RcDiffuseGiSettings, type RcDiffuseGiVolume } from "../render/rc-diffuse-gi-settings";
import { getRcDiffuseGiUiState, getRcGiSliderPatch, getRcGiSliderPosition, rcGiRangeScaleAtPosition } from "./rc-diffuse-gi-ui-state";
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
    const sliders = (["strength", "quality", "rangeScale"] as const).map(field => {
        const suffix = field[0].toUpperCase() + field.slice(1);
        const { row, input } = createRcLightingSlider(`rcDiffuseGi${suffix}`, t(`experiment.rcDiffuseGi.${field}`));
        if (field !== "strength") {
            row.title = t(`experiment.rcDiffuseGi.${field}Hint`);
            input.setAttribute("aria-description", row.title);
        }
        if (field === "quality") input.max = String(RC_DIFFUSE_GI_QUALITIES.length - 1);
        const valueLabel = field === "strength" ? null : document.createElement("span");
        if (valueLabel) {
            row.classList.add("rc-lighting-effect-with-value");
            valueLabel.className = "effect-layer-control-value";
            valueLabel.setAttribute("aria-hidden", "true");
            row.append(valueLabel);
        }
        const syncValueText = () => {
            if (!valueLabel) return;
            const position = Number(input.value);
            const text = field === "quality" ? t(`experiment.rcDiffuseGi.quality.${RC_DIFFUSE_GI_QUALITIES[position]}`)
                : `×${Number(rcGiRangeScaleAtPosition(position).toFixed(2))}`;
            if (valueLabel.textContent !== text) valueLabel.textContent = text;
            input.setAttribute("aria-valuetext", text);
        };
        input.addEventListener("input", () => { activeSlider = input; syncValueText(); });
        input.addEventListener("change", () => {
            activeSlider = null;
            syncValueText();
            dispatch({ type: "effect.setRcDiffuseGi", source: "panel", settings: getRcGiSliderPatch(field, Number(input.value)) });
            refresh();
        });
        details.append(row);
        return { input, field, syncValueText };
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
            const position = String(getRcGiSliderPosition(slider.field, settings));
            if (initial || (activeSlider !== slider.input && slider.input.value !== position)) {
                slider.input.value = position;
                slider.syncValueText();
            }
            slider.input.disabled = details.disabled || (host.isPlaying && slider.field !== "strength");
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
