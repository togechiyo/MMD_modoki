import { t } from "../i18n";
import type { MmdManager, WgslMaterialShaderPresetId } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import {
    PBR_MATERIAL_UI_ENABLED,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";
import {
    createModelInfoAccessorySelectValue,
    parseModelInfoAccessorySelectValue,
} from "./model-info-panel-controller";

type ToastType = "success" | "error" | "info";

type ShaderPanelElements = {
    materialPipelineSelect: HTMLSelectElement | null;
    modelSelect: HTMLSelectElement | null;
    presetSelect: HTMLSelectElement | null;
    applySelectedButton: HTMLButtonElement | null;
    applyAllButton: HTMLButtonElement | null;
    resetButton: HTMLButtonElement | null;
    note: HTMLElement | null;
    materialList: HTMLElement | null;
};

type InfoModelSelectState = {
    innerHTML: string;
    value: string;
    disabled: boolean;
};

export type ShaderPanelControllerDeps = {
    mmdManager: MmdManager;
    getInfoModelSelectState: () => InfoModelSelectState;
    onModelTargetSelected: (value: string, showToast: boolean) => void;
    renderCameraPostEffectsPanel: () => void;
    restoreCameraDofControlsToCameraPanel: () => void;
    getBaseNameForRenderer: (filePath: string) => string;
    showToast: (message: string, type?: ToastType) => void;
    onExternalWgslToonChanged: (path: string | null, text: string | null) => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

const CAMERA_SELECT_VALUE = "__camera__";
const EXTERNAL_WGSL_PRESET_PREFIX = "external-wgsl::";
const HIDDEN_SHADER_PRESET_IDS = new Set<WgslMaterialShaderPresetId>([
    "wgsl-specular",
    "wgsl-cel-sharp",
    "wgsl-rim-lift",
    "wgsl-mono-flat",
    "wgsl-full-light-add",
    "wgsl-full-alpha-test-hard",
    "wgsl-alpha-mask",
    "wgsl-accessory-toon",
    "wgsl-obj-untextured",
    "wgsl-obj-mtl",
    "wgsl-white-key-cutout",
    "wgsl-black-key-cutout",
    "wgsl-sss-standard",
    "wgsl-sss-skin",
]);

function resolveShaderPanelElements(): ShaderPanelElements {
    return {
        materialPipelineSelect: document.getElementById("shader-material-pipeline-select") as HTMLSelectElement | null,
        modelSelect: document.getElementById("shader-model-select") as HTMLSelectElement | null,
        presetSelect: document.getElementById("shader-preset-select") as HTMLSelectElement | null,
        applySelectedButton: document.getElementById("btn-shader-apply-selected") as HTMLButtonElement | null,
        applyAllButton: document.getElementById("btn-shader-apply-all") as HTMLButtonElement | null,
        resetButton: document.getElementById("btn-shader-reset") as HTMLButtonElement | null,
        note: document.getElementById("shader-panel-note"),
        materialList: document.getElementById("shader-material-list"),
    };
}

export class ShaderPanelController {
    private readonly elements: ShaderPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly getInfoModelSelectState: () => InfoModelSelectState;
    private readonly onModelTargetSelected: (value: string, showToast: boolean) => void;
    private readonly renderCameraPostEffectsPanel: () => void;
    private readonly restoreCameraDofControlsToCameraPanel: () => void;
    private readonly getBaseNameForRenderer: (filePath: string) => string;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly onExternalWgslToonChanged: (path: string | null, text: string | null) => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;
    private readonly selectedMaterialKeys = new Map<string, string>();
    private bundledWgslShaderFiles: { name: string; path: string }[] = [];
    private bundledWgslScanInFlight = false;
    private postFxWgslToonPath: string | null = null;
    private postFxWgslToonText: string | null = null;

    constructor(deps: ShaderPanelControllerDeps) {
        this.elements = resolveShaderPanelElements();
        this.mmdManager = deps.mmdManager;
        this.getInfoModelSelectState = deps.getInfoModelSelectState;
        this.onModelTargetSelected = deps.onModelTargetSelected;
        this.renderCameraPostEffectsPanel = deps.renderCameraPostEffectsPanel;
        this.restoreCameraDofControlsToCameraPanel = deps.restoreCameraDofControlsToCameraPanel;
        this.getBaseNameForRenderer = deps.getBaseNameForRenderer;
        this.showToast = deps.showToast;
        this.onExternalWgslToonChanged = deps.onExternalWgslToonChanged;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupEventListeners();
    }

    public refresh(): void {
        const elements = this.elements;
        if (
            !elements.modelSelect ||
            !elements.presetSelect ||
            !elements.applySelectedButton ||
            !elements.applyAllButton ||
            !elements.resetButton ||
            !elements.note ||
            !elements.materialList
        ) {
            return;
        }

        this.syncModelSelectorFromInfo();
        const models = this.mmdManager.getWgslModelShaderStates();
        const accessories = this.mmdManager.getAccessoryMaterialShaderStates();
        const infoModelState = this.getInfoModelSelectState();
        const selectedAccessoryIndex = parseModelInfoAccessorySelectValue(infoModelState.value);
        const selectedAccessory = selectedAccessoryIndex === null
            ? null
            : accessories.find((accessory) => accessory.accessoryIndex === selectedAccessoryIndex) ?? null;
        if (elements.materialPipelineSelect) {
            elements.materialPipelineSelect.value = this.mmdManager.getMmdMaterialPipelinePreset();
            elements.materialPipelineSelect.disabled = selectedAccessory !== null;
        }
        if (infoModelState.value === CAMERA_SELECT_VALUE && selectedAccessory === null) {
            this.renderCameraPostEffectsPanel();
            return;
        }
        this.restoreCameraDofControlsToCameraPanel();

        if (!this.bundledWgslScanInFlight) {
            void this.reloadBundledWgslShaderFiles(false);
        }

        const isAvailable = this.mmdManager.isWgslMaterialShaderAssignmentAvailable();
        const previousSelectedShaderValue = elements.presetSelect.value;
        const wgslPresetCatalog = this.mmdManager.getWgslMaterialShaderPresets();
        let presets: Array<{ id: string; label: string; description: string }> =
            wgslPresetCatalog
            .filter((preset) => !HIDDEN_SHADER_PRESET_IDS.has(preset.id)
                || (selectedAccessory?.kind === "x" && preset.id === "wgsl-accessory-toon")
                || (selectedAccessory?.kind === "obj" && (
                    preset.id === "wgsl-obj-untextured" || preset.id === "wgsl-obj-mtl"
                )));

        elements.presetSelect.innerHTML = "";
        for (const preset of presets) {
            const option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.label;
            elements.presetSelect.appendChild(option);
        }

        if (models.length === 0 && accessories.length === 0) {
            elements.modelSelect.innerHTML = '<option value="">-</option>';
            elements.modelSelect.disabled = true;
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.loadModel");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("empty.noModel")}</div>`;
            return;
        }

        let selectedModelIndex = Number.parseInt(infoModelState.value, 10);
        if (selectedAccessory === null && (
            Number.isNaN(selectedModelIndex) ||
            !models.some((model) => model.modelIndex === selectedModelIndex)
        )) {
            selectedModelIndex = models.find((model) => model.active)?.modelIndex ?? models[0]?.modelIndex ?? -1;
        }

        const selectedModel = selectedAccessory === null
            ? models.find((model) => model.modelIndex === selectedModelIndex) ?? models[0] ?? null
            : null;
        const selectedTargetValue = selectedAccessory
            ? createModelInfoAccessorySelectValue(selectedAccessory.accessoryIndex)
            : String(selectedModel?.modelIndex ?? "");
        const selectedMaterials = selectedAccessory?.materials ?? selectedModel?.materials ?? [];
        const isPbrModel = selectedModel?.materialPipeline === "pbr-standard";
        elements.modelSelect.value = selectedTargetValue;
        elements.modelSelect.disabled = false;
        if (isPbrModel && !PBR_MATERIAL_UI_ENABLED) {
            elements.presetSelect.innerHTML = '<option value="">-</option>';
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.materialUiUnavailable");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("shader.note.materialUiUnavailable")}</div>`;
            return;
        }
        if (!isAvailable && !isPbrModel) {
            elements.modelSelect.innerHTML = '<option value="">-</option>';
            elements.modelSelect.disabled = true;
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.wgslUnavailable");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("shader.note.wgslUnavailable")}</div>`;
            return;
        }
        if (isPbrModel) {
            presets = [
                {
                    id: "pbr-base",
                    label: t("shader.pbrPreset.standard"),
                    description: t("shader.pbrMaterial.baseDescription"),
                },
                {
                    id: "pbr-mmd-like",
                    label: t("shader.pbrPreset.mmdLike"),
                    description: t("shader.pbrMaterial.mmdLikeDescription"),
                },
                {
                    id: "pbr-skin",
                    label: t("shader.pbrPreset.skin"),
                    description: t("shader.pbrMaterial.skinDescription"),
                },
                {
                    id: "pbr-skin-sss",
                    label: t("shader.pbrPreset.skinSss"),
                    description: t("shader.pbrMaterial.skinSssDescription"),
                },
                {
                    id: "pbr-skin-face",
                    label: t("shader.pbrPreset.skinFace"),
                    description: t("shader.pbrMaterial.skinFaceDescription"),
                },
                {
                    id: "pbr-no-shadow",
                    label: t("shader.pbrPreset.noShadow"),
                    description: t("shader.pbrMaterial.noShadowDescription"),
                },
            ];
            elements.presetSelect.innerHTML = "";
            for (const preset of presets) {
                const option = document.createElement("option");
                option.value = preset.id;
                option.textContent = preset.label;
                elements.presetSelect.appendChild(option);
            }
        }
        if (selectedMaterials.length === 0) {
            elements.presetSelect.disabled = true;
            elements.applySelectedButton.disabled = true;
            elements.applyAllButton.disabled = true;
            elements.resetButton.disabled = true;
            elements.note.textContent = t("shader.note.noMaterial");
            elements.materialList.innerHTML = `<div class="panel-empty-state">${t("shader.note.noMaterial")}</div>`;
            return;
        }

        const rememberedMaterialKey = this.selectedMaterialKeys.get(selectedTargetValue);
        const selectedMaterial = rememberedMaterialKey
            ? selectedMaterials.find((material) => material.key === rememberedMaterialKey) ?? null
            : null;
        if (rememberedMaterialKey && !selectedMaterial) {
            this.selectedMaterialKeys.delete(selectedTargetValue);
        }

        let selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        let mixedPresets = false;
        if (selectedMaterial) {
            selectedPresetId = isPbrModel
                ? selectedMaterial.pbrPresetId
                : selectedMaterial.presetId;
        } else {
            const allPresetIds = Array.from(new Set(selectedMaterials.map(
                (material) => isPbrModel ? material.pbrPresetId : material.presetId,
            )));
            if (allPresetIds.length === 1) {
                selectedPresetId = allPresetIds[0];
            } else {
                mixedPresets = true;
            }
        }
        if (!presets.some((preset) => preset.id === selectedPresetId)) {
            selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        }

        const selectedExternalWgslPath = isPbrModel
            ? null
            : selectedMaterial
            ? selectedMaterial.externalWgslPath
            : (() => {
                const paths = new Set(
                    selectedMaterials
                        .map((material) => material.externalWgslPath)
                        .filter((value): value is string => typeof value === "string" && value.length > 0),
                );
                return paths.size === 1 ? Array.from(paths)[0] : null;
            })();

        let selectedShaderValue = previousSelectedShaderValue;
        if (!selectedShaderValue || !Array.from(elements.presetSelect.options).some((option) => option.value === selectedShaderValue)) {
            selectedShaderValue = selectedPresetId;
        }
        if (!Array.from(elements.presetSelect.options).some((option) => option.value === selectedShaderValue)) {
            selectedShaderValue = presets[0]?.id ?? "wgsl-mmd-standard";
        }
        elements.presetSelect.value = selectedShaderValue;

        const presetLabelById = new Map<string, string>(
            (isPbrModel ? presets : wgslPresetCatalog)
                .map((preset): [string, string] => [preset.id, preset.label]),
        );
        elements.materialList.innerHTML = "";

        for (const material of selectedMaterials) {
            const item = document.createElement("div");
            item.className = "shader-material-item";
            if (selectedMaterial?.key === material.key) {
                item.classList.add("active");
            }
            if (!material.visible) {
                item.classList.add("shader-material-item--hidden");
            }
            item.title = material.key;
            item.addEventListener("click", () => {
                const current = this.selectedMaterialKeys.get(selectedTargetValue);
                if (current === material.key) {
                    this.selectedMaterialKeys.delete(selectedTargetValue);
                } else {
                    this.selectedMaterialKeys.set(selectedTargetValue, material.key);
                }
                this.refresh();
            });

            const visibilityToggle = document.createElement("input");
            visibilityToggle.className = "shader-material-toggle";
            visibilityToggle.type = "checkbox";
            visibilityToggle.checked = material.visible;
            visibilityToggle.title = material.visible ? t("button.hide") : t("button.show");
            visibilityToggle.setAttribute("aria-label", `${material.name} ${material.visible ? t("button.hide") : t("button.show")}`);
            visibilityToggle.addEventListener("click", (event) => {
                event.stopPropagation();
            });
            visibilityToggle.addEventListener("change", (event) => {
                event.stopPropagation();
                const visible = selectedAccessory
                    ? this.mmdManager.setAccessoryMaterialVisibility(
                        selectedAccessory.accessoryIndex,
                        material.key,
                        visibilityToggle.checked,
                    )
                    : this.mmdManager.setModelMaterialVisibility(
                        selectedModel?.modelIndex ?? -1,
                        material.key,
                        visibilityToggle.checked,
                    );
                if (!visible) {
                    visibilityToggle.checked = !visibilityToggle.checked;
                    this.showToast("Material visibility update failed", "error");
                    return;
                }
                this.refresh();
            });
            item.appendChild(visibilityToggle);

            const nameEl = document.createElement("span");
            nameEl.className = "shader-material-name";
            nameEl.textContent = material.name;
            item.appendChild(nameEl);

            const presetEl = document.createElement("span");
            presetEl.className = "shader-material-preset";
            presetEl.textContent = material.externalWgslPath
                ? `WGSL: ${this.getBaseNameForRenderer(material.externalWgslPath)}`
                : (isPbrModel
                    ? (presetLabelById.get(material.pbrPresetId) ?? material.pbrPresetId)
                    : (presetLabelById.get(material.presetId) ?? material.presetId));
            item.appendChild(presetEl);

            elements.materialList.appendChild(item);
        }

        elements.applySelectedButton.textContent = t("shader.apply.selected");
        elements.applyAllButton.textContent = t("shader.apply.all");
        elements.resetButton.textContent = selectedMaterial
            ? t("shader.reset.selected")
            : t("shader.reset.all");

        if (selectedExternalWgslPath) {
            elements.note.textContent = t("shader.note.externalWgslActive", {
                name: this.getBaseNameForRenderer(selectedExternalWgslPath),
            });
        } else if (selectedMaterial) {
            elements.note.textContent = t("shader.note.selectedMaterial", {
                name: selectedMaterial.name,
            });
        } else if (mixedPresets) {
            elements.note.textContent = t("shader.note.mixedPresets");
        } else {
            const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
            elements.note.textContent = selectedPreset?.description ?? t("shader.note.applyAll");
        }

        const hasSelectableOption = Array.from(elements.presetSelect.options).some((option) => !option.disabled && option.value.length > 0);
        elements.presetSelect.disabled = !hasSelectableOption;
        elements.applySelectedButton.disabled = !hasSelectableOption || !selectedMaterial;
        elements.applyAllButton.disabled = !hasSelectableOption;
        elements.resetButton.disabled = false;
    }

    public syncModelSelectorFromInfo(): void {
        if (!this.elements.modelSelect) return;
        const state = this.getInfoModelSelectState();
        this.elements.modelSelect.innerHTML = state.innerHTML;
        for (const option of Array.from(this.elements.modelSelect.options)) {
            if (option.value === CAMERA_SELECT_VALUE) {
                option.remove();
            }
        }
        const hasModelOption = this.elements.modelSelect.options.length > 0;
        const hasStateValue = Array.from(this.elements.modelSelect.options).some((option) => option.value === state.value);
        this.elements.modelSelect.value = hasStateValue
            ? state.value
            : (this.elements.modelSelect.options[0]?.value ?? "");
        this.elements.modelSelect.disabled = state.disabled || !hasModelOption;
    }

    public getExternalWgslToonAsset(): { path: string | null; text: string | null } {
        return {
            path: this.postFxWgslToonPath,
            text: this.postFxWgslToonText,
        };
    }

    public setExternalWgslToonAsset(path: string | null, text: string | null): void {
        this.postFxWgslToonPath = path;
        this.postFxWgslToonText = text;
        this.onExternalWgslToonChanged(path, text);
    }

    public selectModelTarget(value: string, showToast: boolean): void {
        this.onModelTargetSelected(value, showToast);
    }

    public async applySelectedShaderPreset(): Promise<void> {
        await this.applyShaderPresetFromPanel(false, "selected");
    }

    public async applyShaderPresetToAll(): Promise<void> {
        await this.applyShaderPresetFromPanel(false, "all");
    }

    public async resetShaderPreset(): Promise<void> {
        await this.applyShaderPresetFromPanel(true, "auto");
    }

    public validateExternalWgslToonSnippet(source: string): string | null {
        const text = source.trim();
        if (text.length === 0) {
            return "WGSL shader file is empty";
        }
        if (/\bfragmentOutputs\b/.test(text)) {
            return "WGSL snippet must not include fragmentOutputs";
        }
        if (/\breturn\b/.test(text)) {
            return "WGSL snippet must not contain return statements";
        }
        if (/@fragment\b|@vertex\b/.test(text) || /\bfn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text)) {
            return "Use a toon snippet, not a full WGSL module";
        }
        if (!/diffuseBase\s*\+=/.test(text)) {
            return "WGSL snippet must write to diffuseBase";
        }
        return null;
    }

    public async reloadBundledWgslShaderFiles(triggerRefresh = true): Promise<void> {
        if (this.bundledWgslScanInFlight) {
            return;
        }
        this.bundledWgslScanInFlight = true;
        try {
            this.bundledWgslShaderFiles = await window.electronAPI.listBundledWgslFiles();
        } catch {
            this.bundledWgslShaderFiles = [];
        } finally {
            this.bundledWgslScanInFlight = false;
        }
        if (triggerRefresh) {
            this.refresh();
        }
    }

    private setupEventListeners(): void {
        this.elements.materialPipelineSelect?.addEventListener("change", () => {
            const next = this.mmdManager.setMmdMaterialPipelinePreset(
                this.elements.materialPipelineSelect?.value,
            );
            this.showToast(
                next === "pbr-standard"
                    ? t("shader.toast.pbrNextImport")
                    : t("shader.toast.mmdNextImport"),
                "info",
            );
            this.refresh();
        });
        this.elements.modelSelect?.addEventListener("change", () => {
            const value = this.elements.modelSelect?.value ?? "";
            if (this.dispatchAction?.({
                type: "shader.selectModelTarget",
                source: "panel",
                value,
                showToast: true,
            })) return;
            this.selectModelTarget(value, true);
        });
        this.elements.applySelectedButton?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "shader.applySelected", source: "button" })) return;
            void this.applySelectedShaderPreset();
        });
        this.elements.applyAllButton?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "shader.applyAll", source: "button" })) return;
            void this.applyShaderPresetToAll();
        });
        this.elements.resetButton?.addEventListener("click", () => {
            if (this.dispatchAction?.({ type: "shader.reset", source: "button" })) return;
            void this.resetShaderPreset();
        });
    }

    private parseExternalWgslPresetPath(value: string): string | null {
        if (!value.startsWith(EXTERNAL_WGSL_PRESET_PREFIX)) {
            return null;
        }
        const path = value.slice(EXTERNAL_WGSL_PRESET_PREFIX.length).trim();
        return path.length > 0 ? path : null;
    }

    private async applyShaderPresetFromPanel(resetToDefault: boolean, target: "auto" | "selected" | "all"): Promise<void> {
        if (!this.elements.presetSelect) {
            return;
        }
        const infoTargetValue = this.getInfoModelSelectState().value;
        if (infoTargetValue === CAMERA_SELECT_VALUE) {
            this.showToast("Select a model in the info panel first", "error");
            return;
        }

        const models = this.mmdManager.getWgslModelShaderStates();
        const accessories = this.mmdManager.getAccessoryMaterialShaderStates();
        const accessoryIndex = parseModelInfoAccessorySelectValue(infoTargetValue);
        const selectedAccessory = accessoryIndex === null
            ? null
            : accessories.find((accessory) => accessory.accessoryIndex === accessoryIndex) ?? null;
        let modelIndex = Number.parseInt(infoTargetValue, 10);
        if (selectedAccessory === null && (
            Number.isNaN(modelIndex) || !models.some((model) => model.modelIndex === modelIndex)
        )) {
            modelIndex = models.find((model) => model.active)?.modelIndex ?? -1;
        }
        if (selectedAccessory === null && modelIndex < 0) {
            this.showToast("Material target is not selected", "error");
            return;
        }

        const selectedTargetValue = selectedAccessory
            ? createModelInfoAccessorySelectValue(selectedAccessory.accessoryIndex)
            : String(modelIndex);
        const selectedMaterialKey = this.selectedMaterialKeys.get(selectedTargetValue) ?? null;
        if (target === "selected" && selectedMaterialKey === null) {
            this.showToast("No material selected", "error");
            return;
        }
        const materialKey = target === "all" ? null : selectedMaterialKey;
        const selectedModel = selectedAccessory === null
            ? models.find((model) => model.modelIndex === modelIndex)
            : null;
        const isPbrModel = selectedModel?.materialPipeline === "pbr-standard";
        if (!isPbrModel && !this.mmdManager.isWgslMaterialShaderAssignmentAvailable()) {
            this.showToast("WGSL effect assignment is unavailable", "error");
            return;
        }
        const selectedValue = resetToDefault
            ? (isPbrModel
                ? "pbr-base"
                : selectedAccessory?.defaultPresetId ?? "wgsl-mmd-standard")
            : this.elements.presetSelect.value;
        if (!selectedValue) {
            this.showToast("Effect preset is not selected", "error");
            return;
        }

        if (isPbrModel) {
            const ok = this.mmdManager.setPbrMaterialShaderPreset(
                modelIndex,
                materialKey,
                selectedValue as PbrMaterialShaderPreset,
            );
            if (!ok) {
                this.showToast(t("shader.toast.pbrMaterialFailed"), "error");
                return;
            }
            this.refresh();
            this.showToast(
                selectedValue === "pbr-base"
                    ? t("shader.toast.pbrBaseApplied")
                    : t("shader.toast.pbrMaterialApplied", {
                        name: selectedValue === "pbr-mmd-like"
                            ? t("shader.pbrPreset.mmdLike")
                            : selectedValue === "pbr-skin-sss"
                                ? t("shader.pbrPreset.skinSss")
                            : selectedValue === "pbr-skin-face"
                                ? t("shader.pbrPreset.skinFace")
                                : selectedValue === "pbr-no-shadow"
                                    ? t("shader.pbrPreset.noShadow")
                                    : t("shader.pbrPreset.skin"),
                    }),
                "success",
            );
            return;
        }

        if (selectedAccessory === null && (resetToDefault || !this.parseExternalWgslPresetPath(selectedValue))) {
            this.setExternalWgslToonAsset(null, null);
            this.mmdManager.setExternalWgslToonShaderForModel(modelIndex, materialKey, null, null);
        }

        const externalWgslPath = this.parseExternalWgslPresetPath(selectedValue);
        if (externalWgslPath) {
            if (selectedAccessory !== null) {
                this.showToast("External WGSL assignment is not available for accessories", "error");
                return;
            }
            const shaderText = await window.electronAPI.readTextFile(externalWgslPath);
            if (!shaderText) {
                this.showToast(`WGSL shader load failed: ${this.getBaseNameForRenderer(externalWgslPath)}`, "error");
                return;
            }
            const validationError = this.validateExternalWgslToonSnippet(shaderText);
            if (validationError) {
                this.showToast(`WGSL invalid: ${validationError}`, "error");
                return;
            }

            const ok = this.mmdManager.setExternalWgslToonShaderForModel(modelIndex, materialKey, externalWgslPath, shaderText);
            if (!ok) {
                this.showToast("WGSL shader assignment failed", "error");
                return;
            }

            this.setExternalWgslToonAsset(externalWgslPath, shaderText);
            this.refresh();
            this.showToast(`WGSL shader selected: ${this.getBaseNameForRenderer(externalWgslPath)}`, "success");
            return;
        }

        const ok = selectedAccessory
            ? this.mmdManager.setAccessoryMaterialShaderPreset(
                selectedAccessory.accessoryIndex,
                materialKey,
                selectedValue as WgslMaterialShaderPresetId,
            )
            : this.mmdManager.setWgslMaterialShaderPreset(
                modelIndex,
                materialKey,
                selectedValue as WgslMaterialShaderPresetId,
            );
        if (!ok) {
            this.showToast("Effect assignment failed", "error");
            return;
        }

        this.refresh();
        const targetLabel = materialKey === null ? "all materials" : "selected material";
        this.showToast(`Effect assigned (${targetLabel})`, "success");
    }
}
