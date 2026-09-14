import { t } from "../i18n";
import { getEffectDefinition, type EffectId, type EffectKeyframePayload, type EffectSlider, type EffectValue } from "../editor/effect-keyframe-definitions";

type SliderControl = { mapping: EffectSlider; input: HTMLInputElement; output: HTMLOutputElement; label: HTMLSpanElement };

/** Builds controls on effect changes; readout updates preserve focus. */
export class EffectKeyframeController {
    private id: EffectId | null = null;
    private current: EffectValue = { enabled: false };
    private readonly enabled: HTMLInputElement;
    private readonly parameters: HTMLElement;
    private readonly label: HTMLElement;
    private readonly state: HTMLElement;
    private readonly scope: HTMLElement;
    private controls: SliderControl[] = [];

    constructor(private readonly root: HTMLElement, private readonly preview: (id: EffectId, value: EffectValue) => void) {
        const enabled = root.querySelector<HTMLInputElement>("#effect-key-enabled");
        const parameters = root.querySelector<HTMLElement>("#effect-key-parameters");
        const label = root.querySelector<HTMLElement>("[data-effect-key-label]");
        const state = root.querySelector<HTMLElement>("[data-effect-key-state]");
        const scope = root.querySelector<HTMLElement>("[data-effect-key-scope]");
        if (!enabled || !parameters || !label || !state || !scope) throw new Error("Effect key controls are missing");
        this.enabled = enabled; this.parameters = parameters; this.label = label; this.state = state; this.scope = scope;
        enabled.addEventListener("change", () => this.change());
    }

    private change(mapping?: EffectSlider, input?: HTMLInputElement): void {
        if (!this.id || this.enabled.disabled) return;
        this.current = { ...this.current, enabled: this.enabled.checked };
        if (mapping && input) this.current[mapping.field] = mapping.toValue(Number(input.value));
        this.preview(this.id, this.current);
    }

    private buildControls(id: EffectId): void {
        this.parameters.replaceChildren();
        this.controls = getEffectDefinition(id).sliders.map((mapping, index) => {
            const row = document.createElement("label");
            const label = document.createElement("span");
            const input = document.createElement("input");
            const output = document.createElement("output");
            input.type = "range"; input.step = "1";
            input.id = index === 0 ? "effect-key-value" : `effect-key-value-${mapping.field}`;
            input.dataset.effectKeyField = mapping.field;
            input.min = String(mapping.min); input.max = String(mapping.max);
            output.htmlFor.value = input.id;
            input.addEventListener("input", () => this.change(mapping, input));
            row.append(label, input, output);
            this.parameters.append(row);
            return { mapping, input, output, label };
        });
    }

    refresh(payload: EffectKeyframePayload | null, playing: boolean, suspended: boolean): void {
        this.root.hidden = payload === null;
        if (!payload) { this.id = null; return; }
        if (this.id !== payload.effectId) this.buildControls(payload.effectId);
        this.id = payload.effectId;
        this.current = payload.value;
        const name = t(`effect.frameGraphPost.effects.${payload.effectId}`);
        this.label.textContent = name;
        this.enabled.disabled = playing;
        this.enabled.checked = payload.value.enabled;
        for (const { mapping, input, output, label } of this.controls) {
            label.textContent = mapping.labelKey ? t(mapping.labelKey) : "";
            input.setAttribute("aria-label", mapping.labelKey ? `${name} ${t(mapping.labelKey)}` : name);
            input.disabled = playing;
            const position = String(Math.round(mapping.toPosition(Number(this.current[mapping.field]))));
            if (input.value !== position) input.value = position;
            output.value = `${position}%`;
        }
        this.state.textContent = suspended ? t("timeline.effectSuspended") : "";
        const scopeKey = getEffectDefinition(payload.effectId).fixedSettingsLabelKey;
        this.scope.textContent = scopeKey ? t(scopeKey) : payload.effectId === "bloom" ? t("timeline.bloomFixedSettings") : "";
    }
}
