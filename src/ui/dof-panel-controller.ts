import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

const FIXED_DOF_FSTOP = 2.0;

type DofPanelElements = {
    cameraControls: HTMLElement | null;
    cameraDofControls: HTMLElement | null;
    enabledInput: HTMLInputElement | null;
    enabledValue: HTMLElement | null;
    qualitySelect: HTMLSelectElement | null;
    qualityValue: HTMLElement | null;
    focusSlider: HTMLInputElement | null;
    focusValue: HTMLElement | null;
    targetModelSelect: HTMLSelectElement | null;
    targetBoneSelect: HTMLSelectElement | null;
    focusOffsetSlider: HTMLInputElement | null;
    focusOffsetValue: HTMLElement | null;
    fStopSlider: HTMLInputElement | null;
    fStopValue: HTMLElement | null;
    nearSuppressionSlider: HTMLInputElement | null;
    nearSuppressionValue: HTMLElement | null;
    focalInvertInput: HTMLInputElement | null;
    focalInvertValue: HTMLElement | null;
    lensBlurSlider: HTMLInputElement | null;
    lensBlurValue: HTMLElement | null;
    lensSizeSlider: HTMLInputElement | null;
    lensSizeValue: HTMLElement | null;
    focalLengthSlider: HTMLInputElement | null;
    focalLengthValue: HTMLElement | null;
};

export type DofPanelControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveDofPanelElements(): DofPanelElements {
    return {
        cameraControls: document.getElementById("camera-controls"),
        cameraDofControls: document.getElementById("camera-dof-controls"),
        enabledInput: document.getElementById("effect-dof-enabled") as HTMLInputElement | null,
        enabledValue: document.getElementById("effect-dof-enabled-val"),
        qualitySelect: document.getElementById("effect-dof-quality") as HTMLSelectElement | null,
        qualityValue: document.getElementById("effect-dof-quality-val"),
        focusSlider: document.getElementById("effect-dof-focus") as HTMLInputElement | null,
        focusValue: document.getElementById("effect-dof-focus-val"),
        targetModelSelect: document.getElementById("effect-dof-target-model") as HTMLSelectElement | null,
        targetBoneSelect: document.getElementById("effect-dof-target-bone") as HTMLSelectElement | null,
        focusOffsetSlider: document.getElementById("effect-dof-focus-offset") as HTMLInputElement | null,
        focusOffsetValue: document.getElementById("effect-dof-focus-offset-val"),
        fStopSlider: document.getElementById("effect-dof-fstop") as HTMLInputElement | null,
        fStopValue: document.getElementById("effect-dof-fstop-val"),
        nearSuppressionSlider: document.getElementById("effect-dof-near-suppression") as HTMLInputElement | null,
        nearSuppressionValue: document.getElementById("effect-dof-near-suppression-val"),
        focalInvertInput: document.getElementById("effect-dof-focal-invert") as HTMLInputElement | null,
        focalInvertValue: document.getElementById("effect-dof-focal-invert-val"),
        lensBlurSlider: document.getElementById("effect-dof-lens-blur") as HTMLInputElement | null,
        lensBlurValue: document.getElementById("effect-dof-lens-blur-val"),
        lensSizeSlider: document.getElementById("effect-dof-lens-size") as HTMLInputElement | null,
        lensSizeValue: document.getElementById("effect-dof-lens-size-val"),
        focalLengthSlider: document.getElementById("effect-dof-focal-length") as HTMLInputElement | null,
        focalLengthValue: document.getElementById("effect-dof-focal-length-val"),
    };
}

export class DofPanelController {
    private readonly elements: DofPanelElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    private readonly dispatchAction?: (action: EditorAction) => boolean;

    constructor(deps: DofPanelControllerDeps) {
        this.elements = resolveDofPanelElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.isRangeInputEditing = deps.isRangeInputEditing;
        this.dispatchAction = deps.dispatchAction;

        this.setupControls();
    }

    public attachControlsToShaderPanel(host: HTMLElement): void {
        if (!this.elements.cameraDofControls) {
            return;
        }
        this.elements.cameraDofControls.classList.add("shader-postfx-dof-controls");
        if (this.elements.cameraDofControls.parentElement !== host) {
            host.appendChild(this.elements.cameraDofControls);
        }
    }

    public restoreControlsToCameraPanel(): void {
        if (!this.elements.cameraDofControls) {
            return;
        }
        this.elements.cameraDofControls.classList.remove("shader-postfx-dof-controls");
        if (
            this.elements.cameraControls &&
            this.elements.cameraDofControls.parentElement !== this.elements.cameraControls
        ) {
            this.elements.cameraControls.appendChild(this.elements.cameraDofControls);
        }
    }

    public refreshFocusTargetControls(): void {
        if (!this.elements.targetModelSelect || !this.elements.targetBoneSelect) {
            return;
        }

        const modelSelect = this.elements.targetModelSelect;
        const boneSelect = this.elements.targetBoneSelect;
        const loadedModels = this.mmdManager.getLoadedModels();
        const targetModelInstanceId = this.mmdManager.getDofFocusTargetModelInstanceId();
        const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
        const resolvedModel = targetModelInstanceId
            ? loadedModels.find((model) => model.instanceId === targetModelInstanceId) ?? null
            : null;

        modelSelect.innerHTML = "";
        const cameraOption = document.createElement("option");
        cameraOption.value = "";
        cameraOption.textContent = t("option.cameraTarget");
        modelSelect.appendChild(cameraOption);

        for (const model of loadedModels) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = model.name;
            modelSelect.appendChild(option);
        }

        if (targetModelInstanceId && !resolvedModel) {
            this.mmdManager.setDofFocusTargetByIndex(null, null);
            return;
        }

        modelSelect.value = resolvedModel ? String(resolvedModel.index) : "";
        modelSelect.disabled = loadedModels.length === 0;

        boneSelect.innerHTML = "";
        if (!resolvedModel) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = t("option.none");
            boneSelect.appendChild(option);
            boneSelect.value = "";
            boneSelect.disabled = true;
            return;
        }

        const boneNames = this.mmdManager.getModelBoneNames(resolvedModel.index);
        for (const boneName of boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            boneSelect.appendChild(option);
        }

        const fallbackBoneName =
            targetBoneName && boneNames.includes(targetBoneName)
                ? targetBoneName
                : this.mmdManager.getPreferredDofFocusBoneName(resolvedModel.index);

        boneSelect.value = fallbackBoneName && boneNames.includes(fallbackBoneName) ? fallbackBoneName : (boneNames[0] ?? "");
        boneSelect.disabled = boneNames.length === 0;
    }

    public refreshAutoFocusReadout(): void {
        if (!this.mmdManager.dofAutoFocusEnabled) return;

        if (
            this.elements.focusSlider &&
            this.elements.focusValue &&
            !this.isRangeInputEditing(this.elements.focusSlider)
        ) {
            const focusMm = this.mmdManager.dofFocusDistanceMm;
            const sliderMin = Number(this.elements.focusSlider.min);
            const sliderMax = Number(this.elements.focusSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focusMm));
            this.elements.focusSlider.value = String(Math.round(clamped));
            this.elements.focusValue.textContent = `${(focusMm / 1000).toFixed(1)}m (auto)`;
            const targetModelPath = this.mmdManager.getDofFocusTargetModelPath();
            const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
            this.elements.focusSlider.title = targetModelPath
                ? `Auto focus (${targetBoneName ?? "target"}, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`
                : `Auto focus (camera target, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`;
            this.syncRangeNumberInput(this.elements.focusSlider);
        }

        if (this.elements.fStopValue) {
            const baseFStop = this.mmdManager.dofFStop;
            const effectiveFStop = this.mmdManager.dofEffectiveFStop;
            const hasCompensation = effectiveFStop > baseFStop + 0.01;
            this.elements.fStopValue.textContent = hasCompensation
                ? `${baseFStop.toFixed(2)} -> ${effectiveFStop.toFixed(2)}`
                : effectiveFStop.toFixed(2);
        }

        if (
            this.mmdManager.dofFocalLengthLinkedToCameraFov &&
            this.elements.focalLengthSlider &&
            this.elements.focalLengthValue &&
            !this.isRangeInputEditing(this.elements.focalLengthSlider)
        ) {
            const focalLength = this.mmdManager.dofFocalLength;
            const sliderMin = Number(this.elements.focalLengthSlider.min);
            const sliderMax = Number(this.elements.focalLengthSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focalLength));
            this.elements.focalLengthSlider.value = String(Math.round(clamped));
            this.elements.focalLengthValue.textContent = this.mmdManager.dofFocalLengthDistanceInverted
                ? `${Math.round(focalLength)} (auto, inv)`
                : `${Math.round(focalLength)} (auto)`;
            this.syncRangeNumberInput(this.elements.focalLengthSlider);
        }
    }

    private setupControls(): void {
        const elements = this.elements;
        if (
            !elements.enabledInput ||
            !elements.enabledValue ||
            !elements.qualitySelect ||
            !elements.qualityValue ||
            !elements.focusSlider ||
            !elements.focusValue ||
            !elements.focusOffsetSlider ||
            !elements.focusOffsetValue ||
            !elements.fStopSlider ||
            !elements.fStopValue ||
            !elements.nearSuppressionSlider ||
            !elements.nearSuppressionValue ||
            !elements.focalInvertInput ||
            !elements.focalInvertValue ||
            !elements.lensSizeSlider ||
            !elements.lensSizeValue ||
            !elements.focalLengthSlider ||
            !elements.focalLengthValue
        ) {
            return;
        }

        const autoFocusEnabled = this.mmdManager.dofAutoFocusEnabled;
        const focalLengthLinkedToFov = this.mmdManager.dofFocalLengthLinkedToCameraFov;
        const enabledInput = elements.enabledInput;
        const qualitySelect = elements.qualitySelect;
        const focusSlider = elements.focusSlider;
        const focusOffsetSlider = elements.focusOffsetSlider;
        const fStopSlider = elements.fStopSlider;
        const nearSuppressionSlider = elements.nearSuppressionSlider;
        const focalInvertInput = elements.focalInvertInput;
        const lensBlurSlider = elements.lensBlurSlider;
        const lensBlurValue = elements.lensBlurValue;
        const lensSizeSlider = elements.lensSizeSlider;
        const focalLengthSlider = elements.focalLengthSlider;
        focusSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        fStopSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        focalLengthSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        lensSizeSlider.min = "1";
        lensSizeSlider.max = "4096";

        const applyDofEnabled = (): void => {
            const enabled = enabledInput.checked;
            if (!this.dispatchAction?.({ type: "effect.setDofEnabled", source: "panel", enabled })) {
                this.setDofEnabled(enabled);
            }
        };
        const applyDofQuality = (): void => {
            const level = Number(qualitySelect.value);
            if (!this.dispatchAction?.({ type: "effect.setDofQuality", source: "panel", level })) {
                this.setDofQuality(level);
            }
        };
        const applyDofFocus = (): void => {
            const mm = Number(focusSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofFocusDistance", source: "panel", millimeters: mm })) {
                this.setDofFocusDistanceMm(mm);
            }
        };
        const applyDofFocusOffset = (): void => {
            const mm = Number(focusOffsetSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofFocusOffset", source: "panel", millimeters: mm })) {
                this.setDofFocusOffsetMm(mm);
            }
        };
        const applyDofFStop = (): void => {
            const fStop = FIXED_DOF_FSTOP;
            if (!this.dispatchAction?.({ type: "effect.setDofFStop", source: "panel", value: fStop })) {
                this.setDofFStop();
            }
        };
        const applyDofNearSuppression = (): void => {
            const percent = Number(nearSuppressionSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofNearSuppression", source: "panel", percent })) {
                this.setDofNearSuppressionPercent(percent);
            }
        };
        const applyDofFocalInvert = (): void => {
            const enabled = focalInvertInput.checked;
            if (!this.dispatchAction?.({ type: "effect.setDofFocalInvert", source: "panel", enabled })) {
                this.setDofFocalInvert(enabled);
            }
        };
        const applyDofLensBlur = (): void => {
            if (!lensBlurSlider || !lensBlurValue) {
                return;
            }
            const percent = Number(lensBlurSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofLensBlur", source: "panel", percent })) {
                this.setDofLensBlurPercent(percent);
            }
        };
        const applyDofLensSize = (): void => {
            const lensSize = Number(lensSizeSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofLensSize", source: "panel", value: lensSize })) {
                this.setDofLensSize(lensSize);
            }
        };
        const applyDofFocalLength = (): void => {
            const focalLength = Number(focalLengthSlider.value);
            if (!this.dispatchAction?.({ type: "effect.setDofFocalLength", source: "panel", value: focalLength })) {
                this.setDofFocalLength(focalLength);
            }
        };
        const applyDofTargetModel = (): void => {
            if (!elements.targetModelSelect) return;
            const modelIndex = Number.parseInt(elements.targetModelSelect.value, 10);
            const resolvedIndex = Number.isNaN(modelIndex) ? null : modelIndex;
            if (!this.dispatchAction?.({ type: "effect.setDofTargetModel", source: "panel", modelIndex: resolvedIndex })) {
                this.setDofTargetModel(resolvedIndex);
            }
        };
        const applyDofTargetBone = (): void => {
            if (!elements.targetModelSelect || !elements.targetBoneSelect) return;
            const modelIndex = Number.parseInt(elements.targetModelSelect.value, 10);
            const resolvedIndex = Number.isNaN(modelIndex) ? null : modelIndex;
            const boneName = elements.targetBoneSelect.value || null;
            if (!this.dispatchAction?.({ type: "effect.setDofTargetBone", source: "panel", modelIndex: resolvedIndex, boneName })) {
                this.setDofTargetBone(resolvedIndex, boneName);
            }
        };

        enabledInput.checked = this.mmdManager.dofEnabled;
        qualitySelect.value = String(this.mmdManager.dofBlurLevel);
        focusSlider.value = String(Math.round(this.mmdManager.dofFocusDistanceMm));
        focusOffsetSlider.value = String(Math.round(this.mmdManager.dofAutoFocusNearOffsetMm));
        this.mmdManager.dofFStop = FIXED_DOF_FSTOP;
        fStopSlider.value = String(Math.round(FIXED_DOF_FSTOP * 100));
        nearSuppressionSlider.value = String(Math.round(this.mmdManager.dofNearSuppressionScale * 100));
        focalInvertInput.checked = this.mmdManager.dofFocalLengthDistanceInverted;
        if (lensBlurSlider && lensBlurValue) {
            lensBlurSlider.value = String(Math.round(this.mmdManager.dofLensBlurStrength * 100));
            lensBlurSlider.disabled = false;
            lensBlurSlider.title = "";
            lensBlurValue.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
            lensBlurValue.title = "";
        }
        lensSizeSlider.value = String(Math.round(this.mmdManager.dofLensSize));
        focalLengthSlider.value = String(Math.round(this.mmdManager.dofFocalLength));
        if (autoFocusEnabled) {
            focusSlider.disabled = true;
            focusSlider.title = "Auto focus";
        }
        if (focalLengthLinkedToFov) {
            focalLengthSlider.disabled = true;
            focalLengthSlider.title = "Auto focal length (linked to camera FoV)";
        }

        applyDofEnabled();
        applyDofQuality();
        applyDofFocus();
        applyDofFocusOffset();
        applyDofFStop();
        applyDofNearSuppression();
        applyDofFocalInvert();
        applyDofLensBlur();
        applyDofLensSize();
        applyDofFocalLength();
        this.refreshFocusTargetControls();
        this.refreshAutoFocusReadout();

        enabledInput.addEventListener("change", applyDofEnabled);
        qualitySelect.addEventListener("change", applyDofQuality);
        if (!autoFocusEnabled) {
            focusSlider.addEventListener("input", applyDofFocus);
        }
        elements.targetModelSelect?.addEventListener("change", applyDofTargetModel);
        elements.targetBoneSelect?.addEventListener("change", applyDofTargetBone);
        focusOffsetSlider.addEventListener("input", applyDofFocusOffset);
        fStopSlider.addEventListener("input", applyDofFStop);
        nearSuppressionSlider.addEventListener("input", applyDofNearSuppression);
        focalInvertInput.addEventListener("change", applyDofFocalInvert);
        if (lensBlurSlider) {
            lensBlurSlider.addEventListener("input", applyDofLensBlur);
        }
        lensSizeSlider.addEventListener("input", applyDofLensSize);
        if (!focalLengthLinkedToFov) {
            focalLengthSlider.addEventListener("input", applyDofFocalLength);
        }
    }

    public setDofEnabled(enabled: boolean): void {
        const elements = this.elements;
        if (!elements.enabledInput || !elements.enabledValue) return;
        elements.enabledInput.checked = this.mmdManager.dofEnabled = enabled;
        elements.enabledValue.textContent = this.mmdManager.dofEnabled ? t("status.on") : t("status.off");
    }

    public setDofQuality(level: number): void {
        const elements = this.elements;
        if (!elements.qualitySelect || !elements.qualityValue) return;
        const blurLabels = [t("option.low"), t("option.medium"), t("option.high")];
        this.mmdManager.dofBlurLevel = level;
        elements.qualitySelect.value = String(level);
        elements.qualityValue.textContent = blurLabels[this.mmdManager.dofBlurLevel] ?? t("option.high");
    }

    public setDofFocusDistanceMm(millimeters: number): void {
        const elements = this.elements;
        if (!elements.focusSlider || !elements.focusValue) return;
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
            return;
        }
        this.mmdManager.dofFocusDistanceMm = millimeters;
        elements.focusSlider.value = String(Math.round(millimeters));
        elements.focusValue.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
    }

    public setDofFocusOffsetMm(millimeters: number): void {
        const elements = this.elements;
        if (!elements.focusOffsetSlider || !elements.focusOffsetValue) return;
        this.mmdManager.dofAutoFocusNearOffsetMm = millimeters;
        elements.focusOffsetSlider.value = String(Math.round(millimeters));
        elements.focusOffsetValue.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
        }
    }

    public setDofFStop(): void {
        const elements = this.elements;
        if (!elements.fStopSlider || !elements.fStopValue) return;
        this.mmdManager.dofFStop = FIXED_DOF_FSTOP;
        elements.fStopSlider.value = String(Math.round(FIXED_DOF_FSTOP * 100));
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
            return;
        }
        elements.fStopValue.textContent = this.mmdManager.dofFStop.toFixed(2);
    }

    public setDofNearSuppressionPercent(percent: number): void {
        const elements = this.elements;
        if (!elements.nearSuppressionSlider || !elements.nearSuppressionValue) return;
        this.mmdManager.dofNearSuppressionScale = percent / 100;
        elements.nearSuppressionSlider.value = String(Math.round(percent));
        elements.nearSuppressionValue.textContent = `${Math.round(this.mmdManager.dofNearSuppressionScale * 100)}%`;
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
        }
    }

    public setDofFocalInvert(enabled: boolean): void {
        const elements = this.elements;
        if (!elements.focalInvertInput || !elements.focalInvertValue || !elements.focalLengthSlider) return;
        this.mmdManager.dofFocalLengthDistanceInverted = enabled;
        elements.focalInvertInput.checked = enabled;
        elements.focalInvertValue.textContent = this.mmdManager.dofFocalLengthDistanceInverted ? t("status.on") : t("status.off");
        if (this.mmdManager.dofFocalLengthLinkedToCameraFov) {
            elements.focalLengthSlider.title = this.mmdManager.dofFocalLengthDistanceInverted
                ? "Auto focal length (linked to camera FoV, inverted)"
                : "Auto focal length (linked to camera FoV)";
            this.refreshAutoFocusReadout();
        }
    }

    public setDofLensBlurPercent(percent: number): void {
        const elements = this.elements;
        if (!elements.lensBlurSlider || !elements.lensBlurValue) return;
        this.mmdManager.dofLensBlurStrength = percent / 100;
        elements.lensBlurSlider.value = String(Math.round(percent));
        elements.lensBlurValue.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
        this.syncRangeNumberInput(elements.lensBlurSlider);
    }

    public setDofLensSize(value: number): void {
        const elements = this.elements;
        if (!elements.lensSizeSlider || !elements.lensSizeValue) return;
        this.mmdManager.dofLensSize = value;
        elements.lensSizeSlider.value = String(Math.round(value));
        elements.lensSizeValue.textContent = `${Math.round(this.mmdManager.dofLensSize)}`;
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
        }
    }

    public setDofFocalLength(value: number): void {
        const elements = this.elements;
        if (!elements.focalLengthSlider || !elements.focalLengthValue) return;
        if (this.mmdManager.dofFocalLengthLinkedToCameraFov) {
            this.refreshAutoFocusReadout();
            return;
        }
        this.mmdManager.dofFocalLength = value;
        elements.focalLengthSlider.value = String(Math.round(value));
        elements.focalLengthValue.textContent = `${Math.round(this.mmdManager.dofFocalLength)}`;
        if (this.mmdManager.dofAutoFocusEnabled) {
            this.refreshAutoFocusReadout();
        }
    }

    public setDofTargetModel(modelIndex: number | null): void {
        if (modelIndex === null) {
            this.mmdManager.setDofFocusTargetByIndex(null, null);
        } else {
            const preferredBoneName = this.mmdManager.getPreferredDofFocusBoneName(modelIndex);
            this.mmdManager.setDofFocusTargetByIndex(modelIndex, preferredBoneName);
        }
        this.refreshFocusTargetControls();
        this.refreshAutoFocusReadout();
    }

    public setDofTargetBone(modelIndex: number | null, boneName: string | null): void {
        if (modelIndex === null) {
            this.mmdManager.setDofFocusTargetByIndex(null, null);
        } else {
            this.mmdManager.setDofFocusTargetByIndex(modelIndex, boneName);
        }
        this.refreshFocusTargetControls();
        this.refreshAutoFocusReadout();
    }
}
