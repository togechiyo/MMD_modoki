import { t } from "../i18n";
import { getEffectDefinition, type EffectId, type EffectKeyframePayload, type EffectValue } from "../editor/effect-keyframe-definitions";

/** Compact shortcut for the selected effect; the existing right panel remains the full editor. */
export class EffectKeyframeController {
    private id: EffectId | null = null;
    private current: EffectValue = { enabled: false };
    private readonly enabled: HTMLInputElement;
    private readonly slider: HTMLInputElement;
    private readonly output: HTMLOutputElement;
    private readonly label: HTMLElement;
    private readonly state: HTMLElement;
    constructor(private readonly root: HTMLElement, preview: (id: EffectId, value: EffectValue) => void) {
        const enabled = root.querySelector<HTMLInputElement>("#effect-key-enabled");
        const slider = root.querySelector<HTMLInputElement>("#effect-key-value");
        const output = root.querySelector<HTMLOutputElement>("output");
        const label = root.querySelector<HTMLElement>("[data-effect-key-label]");
        const state = root.querySelector<HTMLElement>("[data-effect-key-state]");
        if (!enabled || !slider || !output || !label || !state) throw new Error("Effect key controls are missing");
        this.enabled = enabled; this.slider = slider; this.output = output; this.label = label; this.state = state;
        const change = (): void => {
            if (!this.id || this.slider.disabled) return;
            const { slider: mapping } = getEffectDefinition(this.id);
            this.current = { ...this.current, enabled: enabled.checked, [mapping.field]: mapping.toValue(Number(slider.value)) };
            output.value = `${slider.value}%`;
            preview(this.id, this.current);
        };
        enabled.addEventListener("change", change); slider.addEventListener("input", change);
    }
    refresh(payload: EffectKeyframePayload | null, playing: boolean, suspended: boolean): void {
        this.root.hidden = payload === null;
        this.id = payload?.effectId ?? null;
        if (!payload) return;
        this.current = payload.value;
        const { slider: mapping } = getEffectDefinition(payload.effectId);
        const label = t(`effect.frameGraphPost.effects.${payload.effectId}`);
        this.label.textContent = label;
        this.slider.setAttribute("aria-label", label);
        this.enabled.disabled = playing; this.slider.disabled = playing;
        this.enabled.checked = payload.value.enabled;
        this.slider.min = String(mapping.min); this.slider.max = String(mapping.max);
        const position = String(Math.round(mapping.toPosition(Number(this.current[mapping.field]))));
        if (this.slider.value !== position) this.slider.value = position;
        this.output.value = `${position}%`;
        this.state.textContent = suspended ? t("timeline.effectSuspended") : "";
    }
}
