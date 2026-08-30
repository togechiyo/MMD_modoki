import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ToastType = "success" | "error" | "info";

export const MODEL_INFO_CAMERA_SELECT_VALUE = "__camera__";
export const MODEL_INFO_ACCESSORY_SELECT_PREFIX = "__accessory__:";

export function createModelInfoAccessorySelectValue(index: number): string {
    return `${MODEL_INFO_ACCESSORY_SELECT_PREFIX}${Math.max(0, Math.floor(index))}`;
}

export function parseModelInfoAccessorySelectValue(value: string): number | null {
    if (!value.startsWith(MODEL_INFO_ACCESSORY_SELECT_PREFIX)) return null;
    const rawIndex = value.slice(MODEL_INFO_ACCESSORY_SELECT_PREFIX.length);
    if (!/^\d+$/.test(rawIndex)) return null;
    const index = Number.parseInt(rawIndex, 10);
    return Number.isSafeInteger(index) ? index : null;
}

export type ModelInfoSelectState = {
    innerHTML: string;
    value: string;
    disabled: boolean;
};

type ModelInfoPanelElements = {
    select: HTMLSelectElement | null;
    modelContent: HTMLElement | null;
    chkVisibility: HTMLInputElement | null;
    chkShadow: HTMLInputElement | null;
    ikDetails: HTMLDetailsElement | null;
    ikList: HTMLElement | null;
    btnLoad: HTMLButtonElement | null;
    btnDelete: HTMLButtonElement | null;
};

export type ModelInfoPanelControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    onTargetSelected: (value: string, showToast: boolean) => void;
    onModelVisibilityChanged: (visible: boolean) => void;
    onModelIkStateChanged: (boneName: string, enabled: boolean) => void;
    onModelDeleted: (hasRemainingModels: boolean) => void;
    getSelectedAccessoryIndex: () => number | null;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveModelInfoPanelElements(): ModelInfoPanelElements {
    return {
        select: document.getElementById("info-model-select") as HTMLSelectElement | null,
        modelContent: document.getElementById("info-model-content"),
        chkVisibility: document.getElementById("chk-model-visibility") as HTMLInputElement | null,
        chkShadow: document.getElementById("chk-model-shadow") as HTMLInputElement | null,
        ikDetails: document.getElementById("info-model-ik-details") as HTMLDetailsElement | null,
        ikList: document.getElementById("info-model-ik-list"),
        btnLoad: document.getElementById("btn-model-load") as HTMLButtonElement | null,
        btnDelete: document.getElementById("btn-model-delete") as HTMLButtonElement | null,
    };
}

export class ModelInfoPanelController {
    private readonly elements: ModelInfoPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly onTargetSelected: (value: string, showToast: boolean) => void;
    private readonly onModelVisibilityChanged: (visible: boolean) => void;
    private readonly onModelIkStateChanged: (boneName: string, enabled: boolean) => void;
    private readonly onModelDeleted: (hasRemainingModels: boolean) => void;
    private readonly getSelectedAccessoryIndex: () => number | null;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: ModelInfoPanelControllerDeps) {
        this.elements = resolveModelInfoPanelElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.onTargetSelected = deps.onTargetSelected;
        this.onModelVisibilityChanged = deps.onModelVisibilityChanged;
        this.onModelIkStateChanged = deps.onModelIkStateChanged;
        this.onModelDeleted = deps.onModelDeleted;
        this.getSelectedAccessoryIndex = deps.getSelectedAccessoryIndex;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupControls();
    }

    public refresh(): void {
        const select = this.elements.select;
        if (!select) return;

        const models = this.mmdManager.getLoadedModels();
        const accessories = this.mmdManager.getLoadedAccessories();
        const timelineTarget = this.mmdManager.getTimelineTarget();
        const requestedAccessoryIndex = this.getSelectedAccessoryIndex();
        const selectedAccessoryIndex = requestedAccessoryIndex !== null
            && accessories.some((accessory) => accessory.index === requestedAccessoryIndex)
            ? requestedAccessoryIndex
            : null;
        select.innerHTML = "";

        const cameraOption = document.createElement("option");
        cameraOption.value = MODEL_INFO_CAMERA_SELECT_VALUE;
        cameraOption.dataset.i18n = "option.cameraTarget";
        cameraOption.textContent = t("option.cameraTarget");
        select.appendChild(cameraOption);

        let selected = selectedAccessoryIndex !== null;
        if (!selected && timelineTarget === "camera") {
            cameraOption.selected = true;
            selected = true;
        }

        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            if (!selected && timelineTarget === "model" && model.active) {
                option.selected = true;
                selected = true;
            }
            select.appendChild(option);
        }

        for (const accessory of accessories) {
            const option = document.createElement("option");
            option.value = createModelInfoAccessorySelectValue(accessory.index);
            option.textContent = `${models.length + accessory.index + 1}: ${accessory.name} [${accessory.kind.toUpperCase()}]`;
            option.title = accessory.path;
            if (selectedAccessoryIndex === accessory.index) option.selected = true;
            select.appendChild(option);
        }

        if (!selected) {
            cameraOption.selected = true;
        }

        select.disabled = models.length === 0 && accessories.length === 0;
        if (this.elements.modelContent) {
            this.elements.modelContent.hidden = selectedAccessoryIndex !== null;
        }
        this.updateActionButtons();
    }

    public updateActionButtons(): void {
        const isAccessoryTarget = this.getSelectedAccessoryIndex() !== null;
        const isModelTarget = !isAccessoryTarget && this.mmdManager.getTimelineTarget() === "model";
        const hasModel = this.mmdManager.getLoadedModels().length > 0;
        const enabled = isModelTarget && hasModel;

        if (this.elements.chkVisibility) {
            this.elements.chkVisibility.disabled = !enabled;
            this.elements.chkVisibility.checked = enabled ? this.mmdManager.getActiveModelVisibility() : false;
        }

        if (this.elements.chkShadow) {
            this.elements.chkShadow.disabled = !enabled;
            this.elements.chkShadow.checked = enabled ? this.mmdManager.getActiveModelCastsShadow() : false;
        }

        if (this.elements.btnDelete) {
            this.elements.btnDelete.disabled = !enabled;
        }
        this.refreshIkControls(enabled);
    }

    public getSelectState(): ModelInfoSelectState {
        const models = this.mmdManager.getLoadedModels();
        const accessories = this.mmdManager.getLoadedAccessories();
        const select = document.createElement("select");
        const cameraOption = document.createElement("option");
        cameraOption.value = MODEL_INFO_CAMERA_SELECT_VALUE;
        cameraOption.dataset.i18n = "option.cameraTarget";
        cameraOption.textContent = t("option.cameraTarget");
        select.appendChild(cameraOption);
        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            select.appendChild(option);
        }

        for (const accessory of accessories) {
            const option = document.createElement("option");
            option.value = createModelInfoAccessorySelectValue(accessory.index);
            option.textContent = `${models.length + accessory.index + 1}: ${accessory.name} [${accessory.kind.toUpperCase()}]`;
            option.title = accessory.path;
            select.appendChild(option);
        }
        const activeModel = models.find((model) => model.active) ?? null;
        const selectedAccessoryIndex = this.getSelectedAccessoryIndex();
        const selectedAccessory = selectedAccessoryIndex === null
            ? null
            : accessories.find((accessory) => accessory.index === selectedAccessoryIndex) ?? null;
        const value = selectedAccessory
            ? createModelInfoAccessorySelectValue(selectedAccessory.index)
            : this.mmdManager.getTimelineTarget() === "model" && activeModel
                ? String(activeModel.index)
                : MODEL_INFO_CAMERA_SELECT_VALUE;
        return {
            innerHTML: select.innerHTML,
            value,
            disabled: models.length === 0 && accessories.length === 0,
        };
    }

    private refreshIkControls(enabled: boolean): void {
        const list = this.elements.ikList;
        if (!list) return;
        const states = enabled ? this.mmdManager.getActiveModelIkStates() : [];
        list.replaceChildren();
        if (this.elements.ikDetails) {
            this.elements.ikDetails.hidden = !enabled || states.length === 0;
        }
        for (const state of states) {
            const label = document.createElement("label");
            label.className = "info-toggle-label";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = state.enabled;
            checkbox.dataset.ikBoneName = state.boneName;
            checkbox.addEventListener("change", () => {
                if (!this.mmdManager.setActiveModelIkState(state.boneName, checkbox.checked)) {
                    checkbox.checked = !checkbox.checked;
                    this.showToast(`IK state update failed: ${state.boneName}`, "error");
                    return;
                }
                this.onModelIkStateChanged(state.boneName, checkbox.checked);
            });
            const text = document.createElement("span");
            text.textContent = state.boneName;
            label.append(checkbox, text);
            list.appendChild(label);
        }
    }

    public selectTimelineTarget(value: string, showToast: boolean): void {
        this.onTargetSelected(value, showToast);
    }

    public toggleActiveModelVisibility(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const visible = this.mmdManager.toggleActiveModelVisibility();
        this.updateActionButtons();
        this.onModelVisibilityChanged(visible);
        this.showToast(visible ? "Model visible" : "Model hidden", "info");
    }

    public setActiveModelCastsShadow(castShadow: boolean): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const ok = this.mmdManager.setActiveModelCastsShadow(castShadow);
        this.updateActionButtons();
        if (!ok) {
            this.showToast("Failed to update model shadow", "error");
            return;
        }
        this.showToast(castShadow ? t("toast.modelShadow.on") : t("toast.modelShadow.off"), "info");
    }

    public deleteActiveModel(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const ok = window.confirm("Delete selected model?");
        if (!ok) return;

        const removed = this.mmdManager.removeActiveModel();
        if (!removed) {
            this.showToast("Failed to delete model", "error");
            return;
        }

        this.onModelDeleted(this.mmdManager.getLoadedModels().length > 0);
        this.showToast("Model deleted", "success");
    }

    private setupControls(): void {
        this.elements.select?.addEventListener("change", () => {
            const value = this.elements.select?.value ?? "";
            if (this.dispatchAction?.({
                type: "model.selectTimelineTarget",
                source: "panel",
                value,
                showToast: true,
            })) return;
            this.selectTimelineTarget(value, true);
        });

        this.elements.chkVisibility?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "model.toggleActiveVisibility", source: "button" })) return;
            this.toggleActiveModelVisibility();
        });

        this.elements.chkShadow?.addEventListener("change", () => {
            const castShadow = this.elements.chkShadow?.checked ?? true;
            if (this.dispatchAction?.({ type: "model.setActiveShadow", source: "button", castShadow })) return;
            this.setActiveModelCastsShadow(castShadow);
        });

        this.elements.btnLoad?.addEventListener("click", () => {
            this.dispatchAction?.({ type: "project.openModel", source: "panel" });
        });

        this.elements.btnDelete?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "model.deleteActive", source: "button" })) return;
            this.deleteActiveModel();
        });

        this.updateActionButtons();
    }
}
