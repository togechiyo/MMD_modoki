import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import { createPanelNumberGrid, installEnterCommitNumberInput } from "./panel-control-helpers";

type AccessoryTransformSliderKey = "px" | "py" | "pz" | "rx" | "ry" | "rz" | "s";
type ToastType = "success" | "error" | "info";

type AccessoryPanelElements = {
    content: HTMLElement | null;
    transformContent: HTMLElement | null;
    name: HTMLElement | null;
    kind: HTMLElement | null;
    parentModelSelect: HTMLSelectElement | null;
    parentBoneSelect: HTMLSelectElement | null;
    chkVisibility: HTMLInputElement | null;
    chkShadow: HTMLInputElement | null;
    btnDelete: HTMLButtonElement | null;
    transformGrid: HTMLElement | null;
};

export type AccessoryPanelControllerDeps = {
    mmdManager: MmdManager;
    showToast: (message: string, type?: ToastType) => void;
    onAccessoryTransformChanged: (accessoryIndex: number) => void;
    onSelectionChanged: () => void;
    onAccessoriesChanged: () => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveAccessoryPanelElements(): AccessoryPanelElements {
    return {
        content: document.getElementById("accessory-info-content"),
        transformContent: document.getElementById("accessory-transform-content"),
        name: document.getElementById("info-accessory-name"),
        kind: document.getElementById("info-accessory-kind"),
        parentModelSelect: document.getElementById("accessory-parent-model") as HTMLSelectElement | null,
        parentBoneSelect: document.getElementById("accessory-parent-bone") as HTMLSelectElement | null,
        chkVisibility: document.getElementById("chk-accessory-visibility") as HTMLInputElement | null,
        chkShadow: document.getElementById("chk-accessory-shadow") as HTMLInputElement | null,
        btnDelete: document.getElementById("btn-accessory-delete") as HTMLButtonElement | null,
        transformGrid: document.getElementById("accessory-transform-grid"),
    };
}

export class AccessoryPanelController {
    private readonly elements: AccessoryPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly onAccessoryTransformChanged: (accessoryIndex: number) => void;
    private readonly onSelectionChanged: () => void;
    private readonly onAccessoriesChanged: () => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;
    private readonly transformInputs = new Map<AccessoryTransformSliderKey, HTMLInputElement>();
    private isSyncingTransformUi = false;
    private isSyncingParentUi = false;
    private selectedAccessoryIndex: number | null = null;

    constructor(deps: AccessoryPanelControllerDeps) {
        this.elements = resolveAccessoryPanelElements();
        this.mmdManager = deps.mmdManager;
        this.showToast = deps.showToast;
        this.onAccessoryTransformChanged = deps.onAccessoryTransformChanged;
        this.onSelectionChanged = deps.onSelectionChanged;
        this.onAccessoriesChanged = deps.onAccessoriesChanged;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupControls();
    }

    public refresh(): void {
        const accessories = this.mmdManager.getLoadedAccessories();
        if (
            this.selectedAccessoryIndex !== null
            && !accessories.some((accessory) => accessory.index === this.selectedAccessoryIndex)
        ) {
            this.selectedAccessoryIndex = null;
        }

        const hasSelection = this.selectedAccessoryIndex !== null;
        this.setAccessoryContentVisible(hasSelection);
        this.refreshAccessoryInfo();
        this.setTransformControlsEnabled(hasSelection);
        this.refreshParentModelOptions();
        this.syncParentControlsFromSelection();
        this.syncTransformSlidersFromSelection();
        this.updateActionButtons();
        this.onSelectionChanged();
    }

    public getSelectedAccessoryIndex(): number | null {
        return this.selectedAccessoryIndex;
    }

    public selectAccessory(index: number | null): void {
        const exists = index !== null
            && this.mmdManager.getLoadedAccessories().some((accessory) => accessory.index === index);
        this.selectedAccessoryIndex = exists ? index : null;
        this.setAccessoryContentVisible(this.selectedAccessoryIndex !== null);
        this.refreshAccessoryInfo();
        this.setTransformControlsEnabled(this.selectedAccessoryIndex !== null);
        this.syncTransformSlidersFromSelection();
        this.syncParentControlsFromSelection();
        this.updateActionButtons();
        this.onSelectionChanged();
    }

    public setParentModelFromPanel(): void {
        if (this.isSyncingParentUi) return;
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) return;

        const modelIndex = this.parseParentModelIndex();
        this.refreshParentBoneOptions(modelIndex, null);
        this.mmdManager.setAccessoryParent(selectedIndex, modelIndex, null);
    }

    public setParentBoneFromPanel(): void {
        if (this.isSyncingParentUi) return;
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) return;

        const modelIndex = this.parseParentModelIndex();
        if (modelIndex === null) {
            this.mmdManager.setAccessoryParent(selectedIndex, null, null);
            return;
        }

        const boneName = this.elements.parentBoneSelect?.value || null;
        this.mmdManager.setAccessoryParent(selectedIndex, modelIndex, boneName);
    }

    public setSelectedAccessoryVisibility(visible: boolean): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) return;
        const appliedVisible = this.mmdManager.setAccessoryVisibility(selectedIndex, visible);
        this.updateActionButtons();
        this.showToast(appliedVisible ? "Accessory visible" : "Accessory hidden", "info");
    }

    public setSelectedAccessoryCastsShadow(castsShadow: boolean): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) return;
        const applied = this.mmdManager.setAccessoryCastsShadow(selectedIndex, castsShadow);
        this.updateActionButtons();
        if (!applied) {
            this.showToast("Failed to update accessory shadow", "error");
            return;
        }
        this.showToast(castsShadow ? t("toast.modelShadow.on") : t("toast.modelShadow.off"), "info");
    }

    public deleteSelectedAccessory(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) return;

        const accessories = this.mmdManager.getLoadedAccessories();
        const current = accessories.find((item) => item.index === selectedIndex);
        const targetName = current?.name ?? "Accessory";

        const ok = window.confirm(`Delete accessory '${targetName}'?`);
        if (!ok) return;

        const removed = this.mmdManager.removeAccessory(selectedIndex);
        if (!removed) {
            this.showToast("Failed to delete accessory", "error");
            return;
        }

        const remainingAccessories = this.mmdManager.getLoadedAccessories();
        this.selectedAccessoryIndex = remainingAccessories.length > 0
            ? Math.min(selectedIndex, remainingAccessories.length - 1)
            : null;
        this.refresh();
        this.onAccessoriesChanged();
        this.showToast(`Accessory deleted: ${targetName}`, "success");
    }

    private setAccessoryContentVisible(visible: boolean): void {
        if (this.elements.content) this.elements.content.hidden = !visible;
        if (this.elements.transformContent) this.elements.transformContent.hidden = !visible;
    }

    private refreshAccessoryInfo(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        const accessory = selectedIndex === null
            ? null
            : this.mmdManager.getLoadedAccessories().find((item) => item.index === selectedIndex) ?? null;
        if (this.elements.name) this.elements.name.textContent = accessory?.name ?? "-";
        if (this.elements.kind) this.elements.kind.textContent = accessory?.kind.toUpperCase() ?? "-";
    }

    private setupControls(): void {
        const parentModelSelect = this.elements.parentModelSelect;
        const parentBoneSelect = this.elements.parentBoneSelect;
        const chkVisibility = this.elements.chkVisibility;
        const chkShadow = this.elements.chkShadow;
        const btnDelete = this.elements.btnDelete;

        this.renderTransformInputs();
        this.registerTransformInput("px", "accessory-pos-x");
        this.registerTransformInput("py", "accessory-pos-y");
        this.registerTransformInput("pz", "accessory-pos-z");
        this.registerTransformInput("rx", "accessory-rot-x");
        this.registerTransformInput("ry", "accessory-rot-y");
        this.registerTransformInput("rz", "accessory-rot-z");
        this.registerTransformInput("s", "accessory-scale");

        parentModelSelect?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "accessory.setParentModel", source: "panel" })) return;
            this.setParentModelFromPanel();
        });

        parentBoneSelect?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "accessory.setParentBone", source: "panel" })) return;
            this.setParentBoneFromPanel();
        });

        chkVisibility?.addEventListener("change", () => {
            const visible = chkVisibility.checked;
            if (this.dispatchAction?.({ type: "accessory.setVisibility", source: "panel", visible })) return;
            this.setSelectedAccessoryVisibility(visible);
        });

        chkShadow?.addEventListener("change", () => {
            const castsShadow = chkShadow.checked;
            if (this.dispatchAction?.({ type: "accessory.setShadow", source: "panel", castsShadow })) return;
            this.setSelectedAccessoryCastsShadow(castsShadow);
        });

        btnDelete?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "accessory.deleteSelected", source: "button" })) return;
            this.deleteSelectedAccessory();
        });

        this.updateTransformInputsFromCurrentValues();
        this.setTransformControlsEnabled(false);
        this.setParentControlsEnabled(false);
        this.updateActionButtons();
        this.onSelectionChanged();
    }

    private renderTransformInputs(): void {
        const container = this.elements.transformGrid;
        if (!container) return;

        const grid = createPanelNumberGrid([
            { key: "px", id: "accessory-pos-x", label: "X", min: -100, max: 100, step: 1, value: "0.0" },
            { key: "py", id: "accessory-pos-y", label: "Y", min: -100, max: 100, step: 1, value: "0.0" },
            { key: "pz", id: "accessory-pos-z", label: "Z", min: -100, max: 100, step: 1, value: "0.0" },
            { key: "rx", id: "accessory-rot-x", label: "Rx", min: -180, max: 180, step: 1, value: "0.0" },
            { key: "ry", id: "accessory-rot-y", label: "Ry", min: -180, max: 180, step: 1, value: "0.0" },
            { key: "rz", id: "accessory-rot-z", label: "Rz", min: -180, max: 180, step: 1, value: "0.0" },
            { key: "s", id: "accessory-scale", label: "Si", min: 1, max: 5000, step: 1, value: "100" },
            { key: "tr", id: "accessory-tr", label: "Tr", min: 0, max: 1, step: 0.01, value: "0.00", disabled: true },
        ], "accessory-transform");

        container.className = grid.element.className;
        container.replaceChildren(...Array.from(grid.element.children));
    }

    private registerTransformInput(
        key: AccessoryTransformSliderKey,
        inputId: string,
    ): void {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) return;
        this.transformInputs.set(key, input);

        const apply = (): void => {
            this.normalizeTransformInput(input, key);
            if (this.isSyncingTransformUi) return;

            const selectedIndex = this.getSelectedAccessoryIndex();
            if (selectedIndex === null) return;

            const position = {
                x: this.getTransformInputNumber("px", 0),
                y: this.getTransformInputNumber("py", 0),
                z: this.getTransformInputNumber("pz", 0),
            };
            const rotationDeg = {
                x: this.getTransformInputNumber("rx", 0),
                y: this.getTransformInputNumber("ry", 0),
                z: this.getTransformInputNumber("rz", 0),
            };
            const scalePercent = this.getTransformInputNumber("s", 100);

            this.mmdManager.setAccessoryTransform(selectedIndex, {
                position,
                rotationDeg,
                scale: scalePercent / 100,
            });
            this.onAccessoryTransformChanged(selectedIndex);
        };

        installEnterCommitNumberInput(input, {
            commit: apply,
            revert: () => this.syncTransformSlidersFromSelection(),
        });
    }

    private setTransformControlsEnabled(enabled: boolean): void {
        for (const input of this.transformInputs.values()) {
            input.disabled = !enabled;
        }
    }

    private setParentControlsEnabled(enabled: boolean): void {
        if (this.elements.parentModelSelect) {
            this.elements.parentModelSelect.disabled = !enabled;
        }
        if (this.elements.parentBoneSelect) {
            this.elements.parentBoneSelect.disabled = !enabled;
        }
    }

    private parseParentModelIndex(): number | null {
        const select = this.elements.parentModelSelect;
        if (!select) return null;
        const value = select.value;
        if (value === "") return null;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return null;
        return parsed;
    }

    private refreshParentModelOptions(): void {
        const select = this.elements.parentModelSelect;
        if (!select) return;

        const previousValue = select.value;
        const models = this.mmdManager.getLoadedModels();
        select.innerHTML = "";

        const worldOption = document.createElement("option");
        worldOption.value = "";
        worldOption.textContent = "World";
        select.appendChild(worldOption);

        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            select.appendChild(option);
        }

        const hasPrevious = Array.from(select.options).some((option) => option.value === previousValue);
        select.value = hasPrevious ? previousValue : "";
    }

    private refreshParentBoneOptions(modelIndex: number | null, selectedBoneName: string | null): void {
        const select = this.elements.parentBoneSelect;
        if (!select) return;

        select.innerHTML = "";

        if (modelIndex === null) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-";
            select.appendChild(option);
            select.value = "";
            select.disabled = true;
            return;
        }

        const modelOption = document.createElement("option");
        modelOption.value = "";
        modelOption.textContent = "(Model center)";
        select.appendChild(modelOption);

        const boneNames = this.mmdManager.getModelBoneNames(modelIndex);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            select.appendChild(option);
        }

        const target = selectedBoneName ?? "";
        const hasTarget = Array.from(select.options).some((option) => option.value === target);
        select.value = hasTarget ? target : "";
        select.disabled = false;
    }

    private syncParentControlsFromSelection(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) {
            this.isSyncingParentUi = true;
            try {
                if (this.elements.parentModelSelect) this.elements.parentModelSelect.value = "";
                this.refreshParentBoneOptions(null, null);
                this.setParentControlsEnabled(false);
            } finally {
                this.isSyncingParentUi = false;
            }
            return;
        }

        const parentState = this.mmdManager.getAccessoryParent(selectedIndex);
        const modelIndex = parentState?.modelIndex ?? null;
        const boneName = parentState?.boneName ?? null;

        this.isSyncingParentUi = true;
        try {
            this.setParentControlsEnabled(true);
            if (this.elements.parentModelSelect) {
                const modelValue = modelIndex === null ? "" : String(modelIndex);
                const hasValue = Array.from(this.elements.parentModelSelect.options)
                    .some((option) => option.value === modelValue);
                this.elements.parentModelSelect.value = hasValue ? modelValue : "";
            }
            this.refreshParentBoneOptions(modelIndex, boneName);
        } finally {
            this.isSyncingParentUi = false;
        }
    }

    private syncTransformSlidersFromSelection(): void {
        const selectedIndex = this.getSelectedAccessoryIndex();
        if (selectedIndex === null) {
            this.resetTransformSliders();
            return;
        }

        const transform = this.mmdManager.getAccessoryTransform(selectedIndex);
        if (!transform) {
            this.resetTransformSliders();
            return;
        }

        this.isSyncingTransformUi = true;
        try {
            this.setTransformInputValueClamped("px", transform.position.x);
            this.setTransformInputValueClamped("py", transform.position.y);
            this.setTransformInputValueClamped("pz", transform.position.z);
            this.setTransformInputValueClamped("rx", transform.rotationDeg.x);
            this.setTransformInputValueClamped("ry", transform.rotationDeg.y);
            this.setTransformInputValueClamped("rz", transform.rotationDeg.z);
            this.setTransformInputValueClamped("s", transform.scale * 100);
        } finally {
            this.isSyncingTransformUi = false;
        }
    }

    private resetTransformSliders(): void {
        this.isSyncingTransformUi = true;
        try {
            this.setTransformInputValueClamped("px", 0);
            this.setTransformInputValueClamped("py", 0);
            this.setTransformInputValueClamped("pz", 0);
            this.setTransformInputValueClamped("rx", 0);
            this.setTransformInputValueClamped("ry", 0);
            this.setTransformInputValueClamped("rz", 0);
            this.setTransformInputValueClamped("s", 100);
        } finally {
            this.isSyncingTransformUi = false;
        }
    }

    private setTransformInputValueClamped(key: AccessoryTransformSliderKey, value: number): void {
        const input = this.transformInputs.get(key);
        if (!input || !Number.isFinite(value)) return;
        const min = Number(input.min);
        const max = Number(input.max);
        const clamped = Math.max(min, Math.min(max, value));
        input.value = this.formatTransformInputValue(key, clamped);
    }

    private updateTransformInputsFromCurrentValues(): void {
        for (const [key, input] of this.transformInputs) {
            this.normalizeTransformInput(input, key);
        }
    }

    private getTransformInputNumber(key: AccessoryTransformSliderKey, fallback: number): number {
        const input = this.transformInputs.get(key);
        if (!input) return fallback;
        const value = Number(input.value);
        return Number.isFinite(value) ? value : fallback;
    }

    private normalizeTransformInput(input: HTMLInputElement, key: AccessoryTransformSliderKey): void {
        const parsed = Number(input.value);
        const fallback = key === "s" ? 100 : 0;
        const value = Number.isFinite(parsed) ? parsed : fallback;
        const min = input.min === "" ? Number.NEGATIVE_INFINITY : Number(input.min);
        const max = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
        const clamped = Math.max(min, Math.min(max, value));
        input.value = this.formatTransformInputValue(key, clamped);
    }

    private formatTransformInputValue(key: AccessoryTransformSliderKey, value: number): string {
        if (key === "s") return String(Math.round(value));
        return value.toFixed(1);
    }
    private updateActionButtons(): void {
        const chkVisibility = this.elements.chkVisibility;
        const chkShadow = this.elements.chkShadow;
        const btnDelete = this.elements.btnDelete;
        if (!chkVisibility || !chkShadow || !btnDelete) return;

        const selectedIndex = this.getSelectedAccessoryIndex();
        const enabled = selectedIndex !== null;
        chkVisibility.disabled = !enabled;
        chkShadow.disabled = !enabled;
        btnDelete.disabled = !enabled;

        if (!enabled) {
            chkVisibility.checked = false;
            chkShadow.checked = false;
            return;
        }

        const accessories = this.mmdManager.getLoadedAccessories();
        const current = accessories.find((item) => item.index === selectedIndex);
        chkVisibility.checked = current?.visible ?? true;
        chkShadow.checked = current?.castsShadow ?? true;
    }
}
