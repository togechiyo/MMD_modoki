import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EffectValue } from "../editor/effect-keyframe-definitions";

export type DofInstanceFocusHost = Pick<MmdManager, "isEffectInstance" | "getLoadedModels" | "getModelBoneNames" | "getPreferredDofFocusBoneName" | "getEffectInstanceDofFocusDistanceMm">;
type FocusField = "focusMode" | "targetModelInstanceId" | "targetBoneName";
/** Shared selectors in the stack and key editor. Refreshing never emits an edit. */
export class DofInstanceFocusControls {
    private readonly controls = new Map<FocusField, { label: HTMLElement; select: HTMLSelectElement }>();
    private readonly distance = document.createElement("output");
    private instanceId: string | null = null;
    constructor(root: HTMLElement, private readonly host: DofInstanceFocusHost, private readonly read: () => EffectValue, change: (value: EffectValue) => void) {
        for (const field of ["focusMode", "targetModelInstanceId", "targetBoneName"] as const) {
            const row = document.createElement("label"), label = document.createElement("span"), select = document.createElement("select");
            row.className = "effect-layer-control-row"; label.className = "effect-layer-control-label"; select.className = "effect-layer-control-select";
            select.dataset.dofInstanceField = field;
            select.addEventListener("change", () => {
                if (select.disabled) return;
                const value = { ...read(), [field]: select.value };
                if (field === "targetModelInstanceId") {
                    const model = host.getLoadedModels().find(item => item.instanceId === select.value);
                    value.targetBoneName = model ? host.getPreferredDofFocusBoneName(model.index) ?? "" : "";
                }
                change(value);
            });
            row.append(label, select); root.append(row); this.controls.set(field, { label, select });
        }
        this.distance.dataset.instanceDofDistance = ""; root.append(this.distance);
        // Camera/bone edits also change focus while the timeline is stopped.
        // Only the visible distance readout needs a render-rate update.
        const refreshDistance = (): void => {
            if (!root.isConnected) return;
            if (this.instanceId && root.getClientRects().length) this.refreshDistance(this.instanceId);
            requestAnimationFrame(refreshDistance);
        };
        requestAnimationFrame(refreshDistance);
    }
    refresh(value: EffectValue, playing: boolean, instanceId: string): void {
        this.instanceId = instanceId;
        const models = this.host.getLoadedModels(), model = models.find(item => item.instanceId === value.targetModelInstanceId);
        const modes = [
            ["camera-target", t("effect.frameGraphPost.dofFocusModes.cameraTarget")],
            ["model-target", t("effect.frameGraphPost.dofFocusModes.modelTarget")],
            ["person-auto", t("effect.frameGraphPost.dofFocusModes.personAuto")],
        ];
        for (const [field, { label, select }] of this.controls) {
            const text = t(`effect.frameGraphPost.controls.${field === "focusMode" ? "focusMode" : field === "targetModelInstanceId" ? "target" : "bone"}`);
            label.textContent = text; label.title = text; select.setAttribute("aria-label", text);
            const options = field === "focusMode" ? modes : field === "targetModelInstanceId"
                ? [["", t("option.none")], ...models.map(item => [item.instanceId, `${item.index + 1}: ${item.name}`])]
                : [["", t("option.none")], ...(model ? this.host.getModelBoneNames(model.index).map(name => [name, name]) : [])];
            const selected = String(value[field]);
            if (selected && !options.some(([id]) => id === selected)) options.push([selected, `${t("effect.instance.missingTarget")}: ${selected}`]);
            if (JSON.stringify(options) !== select.dataset.optionsKey) {
                select.replaceChildren(...options.map(([id, name]) => { const option = document.createElement("option"); option.value = id; option.textContent = name; return option; }));
                select.dataset.optionsKey = JSON.stringify(options);
            }
            select.value = selected;
            if (select.parentElement) select.parentElement.hidden = field !== "focusMode" && value.focusMode !== "model-target";
            select.disabled = playing || (field !== "focusMode" && value.focusMode !== "model-target");
        }
        this.refreshDistance(instanceId);
    }
    private refreshDistance(instanceId: string): void {
        if (!this.host.isEffectInstance(instanceId)) return;
        const text = `${(this.host.getEffectInstanceDofFocusDistanceMm(instanceId) / 1000).toFixed(2)} m`;
        if (this.distance.value !== text) this.distance.value = text;
    }
}
