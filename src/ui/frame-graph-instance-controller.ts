import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { SerializedEffectInstances } from "../editor/frame-graph-effect-instances";
import type { EffectInstanceOperation } from "../editor/effect-instance-operations";
import { toFrameGraphEffectSliderValue, fromFrameGraphEffectSliderValue, type FrameGraphEffectSliderField } from "./frame-graph-effect-slider-mapping";
import { getEffectDefinition, type EffectValue, type EffectSlider } from "../editor/effect-keyframe-definitions";

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Host = Pick<MmdManager, "isEffectInstance" | "hasEffectSceneTrack" | "getEffectInstanceState" | "captureCurrentEffectKeyframePayload" | "getEffectInstanceLabel" | "isPlaying">;

/** One delegated view for instance controls; the manager and Command layer own state. */
export class FrameGraphInstanceController {
    private pendingValue: SerializedEffectInstances | null = null;
    constructor(private readonly root: HTMLElement, private readonly host: Host,
        private readonly edit: (operation: EffectInstanceOperation) => void,
        private readonly value: (instanceId: string, value: EffectValue) => void,
        private readonly select: (instanceId: string) => void,
        private readonly commitValue: (before: SerializedEffectInstances) => void,
        private readonly syncSlider: (slider: HTMLInputElement) => void) {
        root.addEventListener("click", event => {
            const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-instance-action]") : null;
            const id = button?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id || !button || !host.isEffectInstance(id)) return;
            const action = button.dataset.instanceAction;
            if (action === "select") { select(id); return; }
            if (action === "up" || action === "down") edit({ action: "move", instanceId: id, delta: action === "up" ? 1 : -1 });
            else if (action === "duplicate" || action === "suspend" || action === "resume" || action === "delete") edit({ action, instanceId: id });
        });
        root.addEventListener("input", event => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const id = input?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            const mapping = id ? this.controls(id).find(item => item.field === input?.dataset.instanceField) : null;
            if (id && input && mapping?.panelField) {
                if (!host.hasEffectSceneTrack(id) && !this.pendingValue) this.pendingValue = host.getEffectInstanceState();
                value(id, { ...this.currentValue(id), [mapping.field]: fromFrameGraphEffectSliderValue(mapping.panelField as FrameGraphEffectSliderField, Number(input.value)) });
            }
        });
        root.addEventListener("change", event => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const id = input?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id || !input) return;
            if (input.dataset.instanceField === "label") edit({ action: "rename", instanceId: id, label: input.value });
            if (input.dataset.instanceField === "color") {
                const color = Number.parseInt(input.value.slice(1), 16);
                edit({ action: "color", instanceId: id, color: { r: (color >> 16 & 255) / 255, g: (color >> 8 & 255) / 255, b: (color & 255) / 255 } });
            }
            if (input.dataset.instanceField === "enabled") {
                const before = !host.hasEffectSceneTrack(id) ? host.getEffectInstanceState() : null;
                value(id, { ...host.captureCurrentEffectKeyframePayload(id).value, enabled: input.checked });
                if (before) commitValue(before);
            }
            if (input.type === "range" && this.pendingValue) { const before = this.pendingValue; this.pendingValue = null; commitValue(before); }
        });
    }
    render(id: string, present: boolean): string {
        const value = this.currentValue(id), label = escape(this.host.getEffectInstanceLabel(id));
        const controls = this.controls(id).map(mapping => {
            const field = mapping.panelField as FrameGraphEffectSliderField;
            const controlLabel = this.controlLabel(id, mapping);
            return `<div class="effect-layer-control-row"><span class="effect-layer-control-label">${escape(controlLabel)}</span><input type="range" class="effect-layer-control-slider" min="0" max="100" step="1" data-instance-field="${mapping.field}" aria-label="${escape(controlLabel)}" value="${Math.round(toFrameGraphEffectSliderValue(field, Number(value[mapping.field])))}"><output class="effect-layer-control-value" data-instance-value="${mapping.field}">${Number(value[mapping.field]).toFixed(2)}</output></div>`;
        }).join("");
        const instance = this.host.getEffectInstanceState().instances.find(item => item.instanceId === id);
        const color = instance?.type === "bloom" ? `<label class="effect-layer-control-row"><span>${escape(t("effect.frameGraphPost.controls.color"))}</span><input type="color" data-instance-field="color" aria-label="${escape(t("effect.frameGraphPost.controls.color"))}" value="#${[instance.bloomColor?.r ?? 1, instance.bloomColor?.g ?? 1, instance.bloomColor?.b ?? 1].map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}"></label>` : "";
        const button = (action: string, text: string): string => `<button type="button" class="effect-layer-control-button" data-instance-action="${action}" aria-label="${escape(t(`effect.instance.${action}`))}"${this.host.isPlaying ? " disabled" : ""}>${escape(text)}</button>`;
        return `<div class="effect-layer-placeholder effect-layer-placeholder--active effect-layer-placeholder--check" data-effect-stack-row="${id}" data-effect-instance-row="${id}">
            <div class="effect-layer-header"><input type="checkbox" data-instance-field="enabled" aria-label="${escape(t("status.on"))}"${value.enabled ? " checked" : ""}>
            <button type="button" class="effect-layer-main" data-instance-action="select"><span class="effect-layer-name">${label}</span></button></div>
            <div class="effect-layer-details"><input type="text" data-instance-field="label" maxlength="80" aria-label="${escape(t("effect.instance.name"))}" value="${label}">
            ${controls}${color}
            <div class="effect-instance-actions">${button("up", "↑")}${button("down", "↓")}${button("duplicate", t("effect.instance.duplicate"))}${button(present ? "suspend" : "resume", t(present ? "effect.instance.suspend" : "effect.instance.resume"))}${button("delete", t("effect.instance.delete"))}</div>
            ${present ? "" : `<span>${escape(t("timeline.effectSuspended"))}</span>`}</div></div>`;
    }
    refresh(): void {
        this.root.querySelectorAll<HTMLElement>("[data-effect-instance-row]").forEach(row => {
            const id = row.dataset.effectInstanceRow;
            if (!id || !this.host.isEffectInstance(id)) return;
            const value = this.currentValue(id);
            row.querySelectorAll<HTMLInputElement>("input").forEach(input => {
                input.disabled = this.host.isPlaying;
                if (input.dataset.instanceField === "enabled") input.checked = value.enabled;
                const mapping = this.controls(id).find(item => item.field === input.dataset.instanceField);
                if (mapping?.panelField) {
                    if (document.activeElement !== input) input.value = String(Math.round(toFrameGraphEffectSliderValue(mapping.panelField as FrameGraphEffectSliderField, Number(value[mapping.field]))));
                    this.syncSlider(input);
                }
            });
            row.querySelectorAll<HTMLButtonElement>("[data-instance-action]:not([data-instance-action='select'])").forEach(button => { button.disabled = this.host.isPlaying; });
            row.querySelectorAll<HTMLElement>("[data-instance-value]").forEach(output => { output.textContent = Number(value[output.dataset.instanceValue ?? ""]).toFixed(2); });
        });
    }
    private controls(id: string): readonly EffectSlider[] { return getEffectDefinition(this.host.captureCurrentEffectKeyframePayload(id).effectId).sliders; }
    private controlLabel(id: string, mapping: EffectSlider): string {
        const type = this.host.captureCurrentEffectKeyframePayload(id).effectId;
        return t(mapping.labelKey ?? `effect.frameGraphPost.controls.${type === "gamma" ? "gamma" : type === "grain" ? "intensity" : "strength"}`);
    }
    private currentValue(id: string): EffectValue { return this.host.captureCurrentEffectKeyframePayload(id).value; }
}
