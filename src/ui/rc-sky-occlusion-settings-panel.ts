import type { EditorAction } from "../actions/types";
import { t } from "../i18n";
import type { RcSkyOcclusionSettings, RcSkyOcclusionVolume } from "../render/rc-sky-occlusion-settings";
import { createPopupFormButton, createPopupFormButtonRow, createPopupFormField, createPopupFormRange, createPopupFormValueText } from "./popup-form-helpers";
import { getRcSkyOcclusionUiState } from "./rc-sky-occlusion-ui-state";

type Host = {
    isPlaying: boolean;
    currentFrame: number;
    getRcSkyOcclusionSettings(): RcSkyOcclusionSettings;
    getRcSkyOcclusionDiagnostics(): { status: "off" | "preparing" | "ready" | "unsupported" | "error"; reason: string | null; volume: RcSkyOcclusionVolume | null; triangleCount: number; fieldRevision: number; supportedMaterialCount: number };
    getEffectSceneKeyframeFrames(id: string): Uint32Array;
};

/** Persistent scene lighting settings; the separate fixed-floor developer lab is unchanged. */
export function mountRcSkyOcclusionSettings(parent: HTMLElement, host: Host, dispatch: (action: EditorAction) => boolean): () => void {
    const section = document.createElement("section");
    section.className = "experimental-settings-section";
    section.dataset.experimentSection = "rc-sky-occlusion";
    const heading = document.createElement("h3");
    const headingLabel = document.createElement("label");
    headingLabel.className = "experimental-settings-heading-toggle";
    const enabled = document.createElement("input");
    enabled.type = "checkbox"; enabled.className = "popup-form-checkbox"; enabled.name = "rcSkyOcclusionEnabled";
    const title = document.createElement("span");
    title.id = "experiment-rc-sky-occlusion-title"; title.textContent = t("experiment.rcSkyOcclusion.title");
    headingLabel.append(enabled, title); heading.append(headingLabel);
    section.setAttribute("aria-labelledby", title.id);
    const note = document.createElement("p");
    note.className = "popup-form-note"; note.textContent = t("experiment.rcSkyOcclusion.note");
    const details = document.createElement("fieldset");
    details.className = "experimental-settings-subsection";
    const numberControls: HTMLInputElement[] = [];
    let activeSlider: HTMLInputElement | null = null;
    const sliders = (["strength", "minimum"] as const).map(field => {
        const input = document.createElement("input");
        input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1";
        input.name = `rcSkyOcclusion${field === "strength" ? "Strength" : "Minimum"}`;
        const value = createPopupFormValueText();
        input.addEventListener("input", () => { activeSlider = input; value.textContent = `${input.value}%`; });
        input.addEventListener("change", () => {
            activeSlider = null;
            dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { [field]: Number(input.value) / 100 } });
            refresh();
        });
        details.append(createPopupFormField(t(`experiment.rcSkyOcclusion.${field}`), createPopupFormRange(input, value)));
        return { input, value, field };
    });
    const rangeNote = document.createElement("p");
    rangeNote.className = "popup-form-note"; rangeNote.textContent = t("experiment.rcSkyOcclusion.volumeNote");
    details.append(rangeNote);
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
        details.append(createPopupFormField(t(`experiment.rcSkyOcclusion.${field}`), input));
    }
    const recalculate = createPopupFormButton(t("experiment.rcSkyOcclusion.recalculate"), "secondary");
    recalculate.addEventListener("click", () => {
        dispatch({ type: "effect.recalculateRcSkyOcclusionVolume", source: "panel" }); refresh();
    });
    const automatic = createPopupFormButton(t("experiment.rcSkyOcclusion.automatic"), "secondary");
    automatic.addEventListener("click", () => {
        dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { volume: null } }); refresh();
    });
    details.append(createPopupFormButtonRow([recalculate, automatic]));
    const register = createPopupFormButton(t("experiment.rcSkyOcclusion.registerKey"), "secondary");
    register.addEventListener("click", () => {
        dispatch({ type: "keyframe.registerEffect", source: "panel", instanceId: "rcSkyOcclusion" }); refresh();
    });
    const keyNote = document.createElement("p");
    keyNote.className = "popup-form-note"; keyNote.textContent = t("experiment.rcSkyOcclusion.keyNote");
    const status = document.createElement("p");
    status.className = "popup-form-note"; status.setAttribute("role", "status"); status.dataset.rcSkyOcclusionStatus = "true";
    const refresh = (): void => {
        const settings = host.getRcSkyOcclusionSettings();
        const diagnostics = host.getRcSkyOcclusionDiagnostics();
        const uiState = getRcSkyOcclusionUiState(settings, diagnostics, t);
        enabled.checked = settings.enabled; enabled.disabled = host.isPlaying;
        details.disabled = !settings.enabled || host.isPlaying;
        register.disabled = host.isPlaying;
        const hasCurrentKey = host.getEffectSceneKeyframeFrames("rcSkyOcclusion").includes(Math.floor(host.currentFrame));
        register.dataset.hasCurrentKey = String(hasCurrentKey);
        register.textContent = t(`experiment.rcSkyOcclusion.${hasCurrentKey ? "updateKey" : "registerKey"}`);
        for (const slider of sliders) {
            if (activeSlider !== slider.input) slider.input.value = String(Math.round(settings[slider.field] * 100));
            slider.value.textContent = `${slider.input.value}%`;
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
        status.textContent = `${uiState.statusText} · ${t("experiment.rcSkyOcclusion.materials")} ${diagnostics.supportedMaterialCount}`;
    };
    enabled.addEventListener("change", () => {
        dispatch({ type: "effect.setRcSkyOcclusion", source: "panel", settings: { enabled: enabled.checked } }); refresh();
    });
    section.append(heading, note, details, createPopupFormButtonRow([register]), keyNote, status);
    parent.append(section);
    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
}
