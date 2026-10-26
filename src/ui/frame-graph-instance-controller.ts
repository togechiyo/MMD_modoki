import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { SerializedEffectInstances } from "../editor/frame-graph-effect-instances";
import type { EffectInstanceOperation } from "../editor/effect-instance-operations";
import { toFrameGraphEffectSliderValue, fromFrameGraphEffectSliderValue, type FrameGraphEffectSliderField } from "./frame-graph-effect-slider-mapping";
import { getEffectDefinition, type EffectValue, type EffectSlider } from "../editor/effect-keyframe-definitions";
import { INSTANCE_LUT_PRESETS, visibleInstanceFixedFields, type InstanceFixedSettings, type InstanceFixedSliderField } from "../editor/frame-graph-instance-fixed-settings";
import { DofInstanceFocusControls, type DofInstanceFocusHost } from "./dof-instance-focus-controls";
import { refreshSectionKeyframeButton, type SectionKeyframeButtonState } from "./section-keyframe-button";

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Host = Pick<MmdManager, "isEffectInstance" | "hasEffectSceneTrack" | "getEffectInstanceState" | "getEffectInstanceFixedSettings" | "captureCurrentEffectKeyframePayload" | "getEffectInstanceLabel" | "isPlaying"> & DofInstanceFocusHost;
type FixedSlider = { field: InstanceFixedSliderField; panelField: FrameGraphEffectSliderField; label: string; value: number };
function fixedSliders(type: string, settings: InstanceFixedSettings = {}): FixedSlider[] {
    switch (type) {
        case "motionBlur": return [{ field: "samples", panelField: "motionBlurSamples", label: "effect.frameGraphPost.controls.samples", value: settings.samples ?? 32 }];
        case "luminousRadiance": return [
            { field: "radianceStrength", panelField: "luminousRadianceStrength", label: "effect.frameGraphPost.controls.luminousRadianceStrength", value: settings.radiance?.strength ?? 1 },
            { field: "radianceRange", panelField: "luminousRadianceRange", label: "effect.frameGraphPost.controls.luminousRadianceRange", value: settings.radiance?.range ?? 12 },
            { field: "radianceSoftness", panelField: "luminousRadianceSoftness", label: "effect.frameGraphPost.controls.luminousRadianceSoftness", value: settings.radiance?.softness ?? 0 },
        ];
        default: return [];
    }
}

/** One delegated view for instance controls; the manager and Command layer own state. */
export class FrameGraphInstanceController {
    private pendingValue: SerializedEffectInstances | null = null;
    private readonly dofControls = new Map<string, DofInstanceFocusControls>();
    constructor(private readonly root: HTMLElement, private readonly host: Host,
        private readonly edit: (operation: EffectInstanceOperation) => void,
        private readonly value: (instanceId: string, value: EffectValue) => void,
        private readonly fixedValue: (instanceId: string, field: InstanceFixedSliderField, value: number) => void,
        private readonly select: (instanceId: string) => void,
        private readonly registerKeyframe: (instanceId: string) => void,
        private readonly keyframeState: (instanceId: string) => SectionKeyframeButtonState,
        private readonly commitValue: (before: SerializedEffectInstances) => void,
        private readonly syncSlider: (slider: HTMLInputElement) => void,
        private readonly loadLut: (instanceId: string) => void) {
        root.addEventListener("click", event => {
            const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-instance-action]") : null;
            const id = button?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id || !button || !host.isEffectInstance(id)) return;
            const action = button.dataset.instanceAction;
            if (action === "select") { select(id); return; }
            if (action === "registerKeyframe") { registerKeyframe(id); return; }
            if (action === "lutFile") { loadLut(id); return; }
            if (action === "resume" || action === "delete") edit({ action, instanceId: id });
        });
        root.addEventListener("input", event => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const id = input?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            const mapping = id ? this.controls(id).find(item => item.field === input?.dataset.instanceField) : null;
            if (id && input && mapping?.panelField) {
                if (!host.hasEffectSceneTrack(id) && !this.pendingValue) this.pendingValue = host.getEffectInstanceState();
                value(id, { ...this.currentValue(id), [mapping.field]: fromFrameGraphEffectSliderValue(mapping.panelField as FrameGraphEffectSliderField, Number(input.value)) });
            }
            const fixed = id ? this.fixedControls(id).find(item => item.field === input?.dataset.instanceFixed) : null;
            if (id && input && fixed) {
                if (!this.pendingValue) this.pendingValue = host.getEffectInstanceState();
                this.fixedValue(id, fixed.field, fromFrameGraphEffectSliderValue(fixed.panelField, Number(input.value)));
            }
        });
        root.addEventListener("change", event => {
            const select = event.target instanceof HTMLSelectElement ? event.target : null;
            const selectedId = select?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (selectedId && select?.dataset.instanceField === "lutPreset") this.editFixed(selectedId, { lut: { kind: "builtin", preset: select.value } });
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const id = input?.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id || !input) return;
            if (input.dataset.instanceFixedToggle === "radiance") {
                const radiance = host.getEffectInstanceState().instances.find(item => item.instanceId === id)?.fixedSettings?.radiance ?? { enabled: false, strength: 1, range: 12 };
                this.editFixed(id, { radiance: { ...radiance, enabled: input.checked } });
            }
            if (input.dataset.instanceFixedToggle === "radianceDistanceSoftness") {
                const radiance = host.getEffectInstanceFixedSettings(id)?.radiance;
                if (radiance) this.editFixed(id, { radiance: { ...radiance, distanceSoftness: input.checked } });
            }
            if (input.dataset.instanceField === "color") {
                const color = Number.parseInt(input.value.slice(1), 16);
                const value = { r: (color >> 16 & 255) / 255, g: (color >> 8 & 255) / 255, b: (color & 255) / 255 };
                if (host.captureCurrentEffectKeyframePayload(id).effectId === "bloom") edit({ action: "color", instanceId: id, color: value });
                else this.editFixed(id, { color: value });
            }
            if (input.dataset.instanceField === "shadowColor") {
                const color = Number.parseInt(input.value.slice(1), 16);
                this.editFixed(id, { shadowColor: { r: (color >> 16 & 255) / 255, g: (color >> 8 & 255) / 255, b: (color & 255) / 255 } });
            }
            if (input.dataset.instanceField === "enabled") {
                const before = !host.hasEffectSceneTrack(id) ? host.getEffectInstanceState() : null;
                value(id, { ...host.captureCurrentEffectKeyframePayload(id).value, enabled: input.checked });
                if (before) commitValue(before);
            }
            if (input.type === "range" && this.pendingValue) { const before = this.pendingValue; this.pendingValue = null; commitValue(before); }
        });
    }
    render(id: string, present: boolean, expanded: boolean): string {
        const value = this.currentValue(id), label = escape(this.host.getEffectInstanceLabel(id));
        const controls = this.controls(id).map(mapping => {
            const field = mapping.panelField as FrameGraphEffectSliderField;
            const controlLabel = this.controlLabel(id, mapping);
            return `<div class="effect-layer-control-row"><span class="effect-layer-control-label">${escape(controlLabel)}</span><input type="range" class="effect-layer-control-slider" min="0" max="100" step="1" data-instance-field="${mapping.field}" aria-label="${escape(controlLabel)}" value="${Math.round(toFrameGraphEffectSliderValue(field, Number(value[mapping.field])))}"><output class="effect-layer-control-value" data-instance-value="${mapping.field}">${Number(value[mapping.field]).toFixed(2)}</output></div>`;
        }).join("");
        const instance = this.host.getEffectInstanceState().instances.find(item => item.instanceId === id);
        const visibleFixed = instance ? visibleInstanceFixedFields(instance.type) : [];
        const primaryColor = visibleFixed.includes("bloomColor") ? instance?.bloomColor : visibleFixed.includes("color") ? instance?.fixedSettings?.color : undefined;
        const color = primaryColor ? this.renderColor("color", primaryColor) : "";
        const shadowColor = visibleFixed.includes("shadowColor") && instance?.fixedSettings?.shadowColor ? this.renderColor("shadowColor", instance.fixedSettings.shadowColor) : "";
        const fixedSliderControls = fixedSliders(instance?.type ?? "", instance?.fixedSettings).map(item => `<label class="effect-layer-control-row"><span class="effect-layer-control-label">${escape(t(item.label))}</span><input class="effect-layer-control-slider" type="range" min="0" max="100" step="1" data-instance-fixed="${item.field}" aria-label="${escape(t(item.label))}" value="${Math.round(toFrameGraphEffectSliderValue(item.panelField, item.value))}"><output class="effect-layer-control-value" data-instance-fixed-value="${item.field}">${item.value.toFixed(2)}</output></label>`).join("");
        const distanceSoftnessLabel = escape(t("effect.frameGraphPost.controls.luminousRadianceDistanceSoftness"));
        const distanceSoftnessControl = instance?.type === "luminousRadiance" ? `<label class="effect-layer-control-row"><span class="effect-layer-control-label">${distanceSoftnessLabel}</span><input type="checkbox" data-instance-fixed-toggle="radianceDistanceSoftness" aria-label="${distanceSoftnessLabel}"${instance.fixedSettings?.radiance?.distanceSoftness ? " checked" : ""}></label>` : "";
        const lut = instance?.fixedSettings?.lut;
        const lutControls = instance?.type === "lut" ? `<select class="effect-layer-control-select" data-instance-field="lutPreset" aria-label="${escape(t("shader.postfx.lutSource"))}">${INSTANCE_LUT_PRESETS.map(preset => `<option value="${preset.id}"${lut?.kind === "builtin" && lut.preset === preset.id ? " selected" : ""}>${preset.label}</option>`).join("")}${lut?.kind === "external" ? `<option value="external" selected>${escape(lut.name)}</option>` : ""}</select><button type="button" data-instance-action="lutFile">${escape(t("shader.postfx.lutFile"))}</button>` : "";
        const button = (action: string): string => `<button type="button" class="effect-layer-control-button" data-instance-action="${action}" title="${escape(t(`effect.instance.${action}`))}"${this.host.isPlaying ? " disabled" : ""}>${escape(t(`effect.instance.${action}`))}</button>`;
        const dragTitle = escape(t("effect.frameGraphPost.dragToReorder"));
        const keyTitle = `${label}: ${escape(t("effect.instance.registerKeyframe"))}`;
        return `<div class="effect-layer-placeholder effect-layer-placeholder--active effect-layer-placeholder--check${value.enabled && present ? "" : " effect-layer-placeholder--off"}" data-effect-stack-row="${id}" data-effect-instance-row="${id}">
            <div class="effect-layer-header"><label class="effect-layer-check-wrap" title="${escape(t("effect.frameGraphPost.toggleVisibility"))}"><input class="effect-layer-check" type="checkbox" data-instance-field="enabled" aria-label="${escape(t("status.on"))}"${value.enabled ? " checked" : ""}></label>
            <button type="button" class="effect-layer-main" data-instance-action="select" aria-expanded="${expanded}"${present ? ` draggable="${!this.host.isPlaying}" data-effect-stack-drag="${id}" title="${dragTitle}"${this.host.isPlaying ? " disabled" : ""}` : ""}><span class="effect-layer-name">${label}</span></button>
            <button type="button" class="section-kf-btn effect-instance-keyframe-button" data-instance-action="registerKeyframe" title="${keyTitle}" aria-label="${keyTitle}"></button></div>
            <div class="effect-layer-details"${expanded ? "" : " hidden"}>
            ${instance?.type === "dof" ? '<div data-instance-dof-controls></div>' : ""}${controls}${color}${shadowColor}${fixedSliderControls}${distanceSoftnessControl}${lutControls}
            <div class="effect-instance-actions">${present ? "" : button("resume")}${button("delete")}</div>
            ${present ? "" : `<span>${escape(t("timeline.effectSuspended"))}</span>`}</div></div>`;
    }
    installControls(): void {
        this.dofControls.clear();
        this.root.querySelectorAll<HTMLElement>("[data-instance-dof-controls]").forEach(root => {
            const id = root.closest<HTMLElement>("[data-effect-instance-row]")?.dataset.effectInstanceRow;
            if (!id) return;
            const controls = new DofInstanceFocusControls(root, this.host, () => this.currentValue(id), value => {
                const before = !this.host.hasEffectSceneTrack(id) ? this.host.getEffectInstanceState() : null;
                this.value(id, value); if (before) this.commitValue(before);
            });
            this.dofControls.set(id, controls);
        });
        this.refresh();
    }
    refresh(): void {
        this.root.querySelectorAll<HTMLElement>("[data-effect-instance-row]").forEach(row => {
            const id = row.dataset.effectInstanceRow;
            if (!id || !this.host.isEffectInstance(id)) return;
            const value = this.currentValue(id);
            const fixed = this.fixedControls(id);
            row.classList.toggle("effect-layer-placeholder--off", !value.enabled || !row.querySelector("[data-effect-stack-drag]"));
            row.querySelectorAll<HTMLButtonElement>("[data-effect-stack-drag]").forEach(handle => { handle.disabled = this.host.isPlaying; handle.draggable = !this.host.isPlaying; });
            this.dofControls.get(id)?.refresh(value, this.host.isPlaying, id);
            row.querySelectorAll<HTMLInputElement>("input").forEach(input => {
                if (input.classList.contains("range-number-input")) return;
                input.disabled = this.host.isPlaying;
                if (input.dataset.instanceField === "enabled") input.checked = value.enabled;
                if (input.dataset.instanceFixedToggle === "radianceDistanceSoftness") input.checked = this.host.getEffectInstanceFixedSettings(id)?.radiance?.distanceSoftness === true;
                const mapping = this.controls(id).find(item => item.field === input.dataset.instanceField);
                if (mapping?.panelField) {
                    if (document.activeElement !== input) input.value = String(Math.round(toFrameGraphEffectSliderValue(mapping.panelField as FrameGraphEffectSliderField, Number(value[mapping.field]))));
                    this.syncSlider(input);
                }
                const fixedMapping = fixed.find(item => item.field === input.dataset.instanceFixed);
                if (fixedMapping) {
                    if (document.activeElement !== input) input.value = String(Math.round(toFrameGraphEffectSliderValue(fixedMapping.panelField, fixedMapping.value)));
                    this.syncSlider(input);
                }
            });
            row.querySelectorAll<HTMLButtonElement>("[data-instance-action]:not([data-instance-action='select'])").forEach(button => { button.disabled = this.host.isPlaying; });
            const keyButton = row.querySelector<HTMLButtonElement>('[data-instance-action="registerKeyframe"]');
            if (keyButton) refreshSectionKeyframeButton(keyButton, this.host.isPlaying ? "none" : this.keyframeState(id), this.host.isPlaying);
            row.querySelectorAll<HTMLSelectElement>("select:not([data-dof-instance-field])").forEach(select => { select.disabled = this.host.isPlaying; });
            row.querySelectorAll<HTMLElement>("[data-instance-value]").forEach(output => { output.textContent = Number(value[output.dataset.instanceValue ?? ""]).toFixed(2); });
            row.querySelectorAll<HTMLElement>("[data-instance-fixed-value]").forEach(output => { output.textContent = (fixed.find(item => item.field === output.dataset.instanceFixedValue)?.value ?? 0).toFixed(2); });
        });
    }
    private controls(id: string): readonly EffectSlider[] { return getEffectDefinition(this.host.captureCurrentEffectKeyframePayload(id).effectId).sliders; }
    private fixedControls(id: string): FixedSlider[] {
        const type = this.host.captureCurrentEffectKeyframePayload(id).effectId;
        return fixedSliders(type).length ? fixedSliders(type, this.host.getEffectInstanceFixedSettings(id)) : [];
    }
    private controlLabel(id: string, mapping: EffectSlider): string {
        const type = this.host.captureCurrentEffectKeyframePayload(id).effectId;
        return t(mapping.labelKey ?? `effect.frameGraphPost.controls.${type === "gamma" ? "gamma" : type === "grain" ? "intensity" : "strength"}`);
    }
    private currentValue(id: string): EffectValue { return this.host.captureCurrentEffectKeyframePayload(id).value; }
    private editFixed(id: string, patch: InstanceFixedSettings): void {
        const current = this.host.getEffectInstanceState().instances.find(item => item.instanceId === id)?.fixedSettings;
        this.edit({ action: "fixed", instanceId: id, settings: { ...current, ...patch } });
    }
    private renderColor(field: string, color: { r: number; g: number; b: number }): string {
        const label = t(`effect.frameGraphPost.controls.${field === "shadowColor" ? "shadowSideColor" : "color"}`);
        return `<label class="effect-layer-control-row effect-layer-control-row--fixed"><span class="effect-layer-control-label">${escape(label)}</span><input class="effect-layer-control-color" type="color" data-instance-field="${field}" aria-label="${escape(label)}" value="#${[color.r, color.g, color.b].map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}"></label>`;
    }
}
