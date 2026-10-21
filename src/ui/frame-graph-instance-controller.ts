import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { SerializedEffectInstances } from "../editor/frame-graph-effect-instances";
import type { EffectInstanceOperation } from "../editor/effect-instance-operations";
import { toFrameGraphEffectSliderValue, fromFrameGraphEffectSliderValue } from "./frame-graph-effect-slider-mapping";
import type { EffectValue } from "../editor/effect-keyframe-definitions";

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
            if (id && input?.dataset.instanceField === "gamma") {
                if (!host.hasEffectSceneTrack(id) && !this.pendingValue) this.pendingValue = host.getEffectInstanceState();
                value(id, { ...host.captureCurrentEffectKeyframePayload(id).value, gamma: fromFrameGraphEffectSliderValue("gammaPower", Number(input.value)) });
            }
        });
        root.addEventListener("change", event => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const id = input?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id || !input) return;
            if (input.dataset.instanceField === "label") edit({ action: "rename", instanceId: id, label: input.value });
            if (input.dataset.instanceField === "enabled") {
                const before = !host.hasEffectSceneTrack(id) ? host.getEffectInstanceState() : null;
                value(id, { ...host.captureCurrentEffectKeyframePayload(id).value, enabled: input.checked });
                if (before) commitValue(before);
            }
            if (input.dataset.instanceField === "gamma" && this.pendingValue) { const before = this.pendingValue; this.pendingValue = null; commitValue(before); }
        });
    }
    render(id: string, present: boolean): string {
        const value = this.currentValue(id), label = escape(this.host.getEffectInstanceLabel(id));
        const button = (action: string, text: string): string => `<button type="button" class="effect-layer-control-button" data-instance-action="${action}" aria-label="${escape(t(`effect.instance.${action}`))}"${this.host.isPlaying ? " disabled" : ""}>${escape(text)}</button>`;
        return `<div class="effect-layer-placeholder effect-layer-placeholder--active effect-layer-placeholder--check" data-effect-stack-row="${id}" data-effect-instance-row="${id}">
            <div class="effect-layer-header"><input type="checkbox" data-instance-field="enabled" aria-label="${escape(t("status.on"))}"${value.enabled ? " checked" : ""}>
            <button type="button" class="effect-layer-main" data-instance-action="select"><span class="effect-layer-name">${label}</span></button></div>
            <div class="effect-layer-details"><input type="text" data-instance-field="label" maxlength="80" aria-label="${escape(t("effect.instance.name"))}" value="${label}">
            <div class="effect-layer-control-row"><span class="effect-layer-control-label">${escape(t("effect.frameGraphPost.controls.gamma"))}</span><input type="range" class="effect-layer-control-slider" min="0" max="100" step="1" data-instance-field="gamma" aria-label="${escape(t("effect.frameGraphPost.controls.gamma"))}" value="${Math.round(toFrameGraphEffectSliderValue("gammaPower", Number(value.gamma)))}"><output class="effect-layer-control-value" data-instance-value>${Number(value.gamma).toFixed(2)}</output></div>
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
                if (input.dataset.instanceField === "gamma") {
                    if (document.activeElement !== input) input.value = String(Math.round(toFrameGraphEffectSliderValue("gammaPower", Number(value.gamma))));
                    this.syncSlider(input);
                }
            });
            row.querySelectorAll<HTMLButtonElement>("[data-instance-action]:not([data-instance-action='select'])").forEach(button => { button.disabled = this.host.isPlaying; });
            const output = row.querySelector("[data-instance-value]");
            if (output) output.textContent = Number(value.gamma).toFixed(2);
        });
    }
    private currentValue(id: string): { enabled: boolean; gamma: number } {
        const payload = this.host.captureCurrentEffectKeyframePayload(id);
        if (payload.effectId !== "gamma") throw new Error("Unsupported effect instance controls");
        return payload.value;
    }
}
