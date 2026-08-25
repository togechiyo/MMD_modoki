import { t } from "./i18n";
import type { MmdManager } from "./mmd-manager";
import type { BoneControlInfo, ModelInfo, MorphDisplayFrameInfo } from "./types";
import {
    applyPanelMorphCategoryGridClasses,
    createPanelCategoryEmpty,
    createPanelMorphCategory,
    createPanelNumberGrid,
    createPanelSliderValueRow,
    installEnterCommitNumberInput,
    setPanelEmptyState,
} from "./ui/panel-control-helpers";
import { TRANSLATION_CONTROL_MAX, TRANSLATION_CONTROL_MIN } from "./ui/transform-control-limits";

type BoneSliderKey = "tx" | "ty" | "tz" | "rx" | "ry" | "rz" | "camDistance" | "camFov";
type BonePoseSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    distance?: number;
    fov?: number;
};

export class BottomPanel {
    private static readonly CAMERA_CONTROL_NAME = "Camera";
    private boneSelectionSummary: HTMLElement | null;
    private boneContainer: HTMLElement;
    private morphContainer: HTMLElement;
    private boneSliders: Map<BoneSliderKey, HTMLInputElement> = new Map();
    private boneSliderValues: Map<BoneSliderKey, HTMLElement> = new Map();
    private morphSliders: Map<string, HTMLInputElement> = new Map();
    private morphKeyframeButtons: Map<string, HTMLButtonElement> = new Map();
    private morphFrames: MorphDisplayFrameInfo[] = [];
    private boneControlMap: Map<string, BoneControlInfo> = new Map();
    private boneNames: Set<string> = new Set();
    private activeSliderInteractions: WeakSet<HTMLInputElement> = new WeakSet();
    private currentBoneName: string | null = null;
    private multipleBoneSelectionNames: string[] = [];
    private currentMorphFrameIndex: number | null = null;
    private mmdManager: MmdManager | null = null;
    private cameraPlaybackLocked = false;
    public onBoneSelectionChanged: ((boneName: string | null) => void) | null = null;
    public onMorphFrameSelectionChanged: ((frameIndex: number | null) => void) | null = null;
    public onBoneTransformEditStarted: ((boneName: string | null) => void) | null = null;
    public onBoneTransformEdited: ((boneName: string | null) => void) | null = null;
    public onBoneTransformEditCommitted: ((boneName: string | null) => void) | null = null;
    public onMorphValueEdited: ((frameIndex: number | null) => void) | null = null;
    public onMorphValueEditCommitted: ((morph: { frameIndex: number; index: number; name: string; value: number }) => void) | null = null;
    public onMorphKeyframeRequested: ((morph: { frameIndex: number; index: number; name: string; value: number }) => void) | null = null;
    public onRangeInputsRendered: ((root: ParentNode) => void) | null = null;
    public onRangeSliderSynced: ((slider: HTMLInputElement) => void) | null = null;

    constructor() {
        this.boneSelectionSummary = document.getElementById("bone-selection-summary");
        this.boneContainer = document.getElementById("bone-controls") as HTMLElement;
        this.morphContainer = document.getElementById("morph-controls") as HTMLElement;
    }

    setMmdManager(manager: MmdManager): void {
        this.mmdManager = manager;
    }

    setCameraPlaybackLocked(locked: boolean): void {
        this.cameraPlaybackLocked = locked;
        this.syncCameraControlAvailability();
    }

    updateBoneControls(info: ModelInfo): void {
        const previousBoneName = this.currentBoneName;
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();
        this.boneNames = new Set(info.boneNames);

        for (const boneControlInfo of info.boneControlInfos ?? []) {
            this.boneControlMap.set(boneControlInfo.name, boneControlInfo);
        }

        if (info.boneNames.length === 0) {
            this.currentBoneName = null;
            this.multipleBoneSelectionNames = [];
            this.updateBoneSelectionSummary();
            setPanelEmptyState(this.boneContainer, t("empty.noBones"));
            return;
        }

        const preferredBoneName = previousBoneName && info.boneNames.includes(previousBoneName)
            ? previousBoneName
            : info.boneNames[0];
        this.setSelectedBone(preferredBoneName, true);
    }

    updateMorphControls(info: ModelInfo): void {
        this.morphSliders.clear();
        this.morphKeyframeButtons.clear();
        this.morphFrames = info.morphDisplayFrames.length > 0
            ? info.morphDisplayFrames
            : info.morphNames.length > 0
                ? [{
                    name: t("option.all"),
                    morphs: info.morphNames.map((name, index) => ({ index, name })),
                }]
                : [];

        if (this.morphFrames.length === 0) {
            this.morphContainer.className = "morph-controls";
            setPanelEmptyState(this.morphContainer, t("empty.noMorphs"));
            return;
        }

        const firstNonEmptyIndex = this.morphFrames.findIndex((frame) => frame.morphs.length > 0);
        this.currentMorphFrameIndex = firstNonEmptyIndex >= 0 ? firstNonEmptyIndex : null;
        this.renderMorphGroups();
        this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
    }

    updateModelInfo(info: ModelInfo): void {
        const nameEl = document.getElementById("info-model-name");
        const verticesEl = document.getElementById("info-vertices");
        const bonesEl = document.getElementById("info-bones");
        const morphsEl = document.getElementById("info-morphs");

        if (nameEl) nameEl.textContent = info.name;
        if (verticesEl) verticesEl.textContent = info.vertexCount.toLocaleString();
        if (bonesEl) bonesEl.textContent = info.boneCount.toLocaleString();
        if (morphsEl) morphsEl.textContent = info.morphCount.toLocaleString();
    }

    clearBoneControls(): void {
        this.currentBoneName = null;
        this.multipleBoneSelectionNames = [];
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();
        this.boneNames.clear();
        this.updateBoneSelectionSummary();
        setPanelEmptyState(this.boneContainer, t("empty.noModel"));
    }

    clearMorphControls(): void {
        this.morphFrames = [];
        this.morphSliders.clear();
        this.morphKeyframeButtons.clear();
        this.currentMorphFrameIndex = null;
        this.morphContainer.className = "morph-controls";
        setPanelEmptyState(this.morphContainer, t("empty.noModel"));
    }

    getSelectedBone(): string | null {
        return this.currentBoneName;
    }

    isMultipleBoneSelectionActive(): boolean {
        return this.multipleBoneSelectionNames.length > 1;
    }

    getSelectedMorphFrameIndex(): number | null {
        return this.currentMorphFrameIndex;
    }

    getSelectedBoneTransformSnapshot(): BonePoseSnapshot | null {
        if (!this.currentBoneName || this.boneSliders.size === 0) return null;

        const isCameraControl = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME;
        if (isCameraControl) {
            const pose = this.mmdManager?.getCameraKeyframePose();
            const target = pose?.target ?? { x: 0, y: 0, z: 0 };
            const rotation = pose?.rotation ?? { x: 0, y: 0, z: 0 };
            return {
                position: {
                    x: target.x,
                    y: target.y,
                    z: target.z,
                },
                rotation: {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z,
                },
                target: {
                    x: target.x,
                    y: target.y,
                    z: target.z,
                },
                distance: pose?.distance ?? 45,
                fov: pose?.fov ?? 30,
            };
        }

        return {
            position: {
                x: this.getBoneSliderNumber("tx"),
                y: this.getBoneSliderNumber("ty"),
                z: this.getBoneSliderNumber("tz"),
            },
            rotation: {
                x: this.getBoneSliderNumber("rx"),
                y: this.getBoneSliderNumber("ry"),
                z: this.getBoneSliderNumber("rz"),
            },
        };
    }

    getSelectedMorphFrameSnapshot(): { frameIndex: number; morphs: Array<{ index: number; name: string; value: number }> } | null {
        if (this.currentMorphFrameIndex === null) return null;
        const frame = this.morphFrames[this.currentMorphFrameIndex];
        if (!frame) return null;

        return {
            frameIndex: this.currentMorphFrameIndex,
            morphs: frame.morphs.map((morph) => {
                const slider = this.morphSliders.get(this.getMorphControlKey(morph.index, morph.name));
                const rawValue = slider ? Number.parseFloat(slider.value) : 0;
                return {
                    index: morph.index,
                    name: morph.name,
                    value: Number.isFinite(rawValue) ? rawValue : 0,
                };
            }),
        };
    }

    syncSelectedMorphFrameSlidersFromRuntime(force = false): void {
        if (!this.mmdManager) return;

        for (const frame of this.morphFrames) {
            for (const morphInfo of frame.morphs) {
                const slider = this.morphSliders.get(this.getMorphControlKey(morphInfo.index, morphInfo.name));
                if (!slider) continue;
                if (!force && this.isSliderEditing(slider)) continue;

                const rawValue = morphInfo.index >= 0
                    ? this.mmdManager.getMorphWeightByIndex(morphInfo.index)
                    : this.mmdManager.getMorphWeight(morphInfo.name);
                const normalized = Number.isFinite(rawValue) ? rawValue : 0;
                const nextValue = normalized.toFixed(2);
                if (slider.value !== nextValue) {
                    slider.value = nextValue;
                }

                const valueDisplay = slider.parentElement?.querySelector(".morph-value") as HTMLElement | null;
                if (valueDisplay) {
                    valueDisplay.textContent = nextValue;
                }
            }
        }
        this.updateMorphKeyframeButtonStates(this.mmdManager.currentFrame);
    }

    updateMorphKeyframeButtonStates(frame = this.mmdManager?.currentFrame ?? 0): void {
        if (!this.mmdManager) return;
        for (const [key, button] of this.morphKeyframeButtons) {
            const morphName = button.dataset.morphName;
            if (!morphName) continue;
            const registered = this.mmdManager.hasTimelineKeyframe({ name: morphName, category: "morph" }, frame);
            this.setMorphKeyframeButtonState(button, registered ? "registered" : "dirty");
            this.morphKeyframeButtons.set(key, button);
        }
    }

    clearSelectedBone(forceRender = false): boolean {
        const selectionChanged = this.currentBoneName !== null || this.multipleBoneSelectionNames.length > 0;
        this.currentBoneName = null;
        this.multipleBoneSelectionNames = [];
        this.updateBoneSelectionSummary();
        if (forceRender || selectionChanged) {
            this.renderSelectedBone();
        }
        return selectionChanged;
    }

    setSelectedBone(boneName: string | null, forceRender = false): boolean {
        if (!boneName) {
            return this.clearSelectedBone(forceRender);
        }
        if (!this.boneNames.has(boneName)) return false;

        const selectionChanged = this.currentBoneName !== boneName || this.multipleBoneSelectionNames.length > 0;
        this.currentBoneName = boneName;
        this.multipleBoneSelectionNames = [];
        this.updateBoneSelectionSummary();
        if (forceRender || selectionChanged) {
            this.renderSelectedBone();
        }
        return true;
    }

    setMultipleSelectedBones(boneNames: readonly string[], forceRender = false): boolean {
        const validNames = Array.from(new Set(boneNames.filter((boneName) => this.boneNames.has(boneName))));
        if (validNames.length <= 1) {
            return this.setSelectedBone(validNames[0] ?? null, forceRender);
        }

        const previousKey = this.multipleBoneSelectionNames.join("\u001f");
        const nextKey = validNames.join("\u001f");
        const selectionChanged = this.currentBoneName !== null || previousKey !== nextKey;
        this.currentBoneName = null;
        this.multipleBoneSelectionNames = validNames;
        this.updateBoneSelectionSummary();
        if (forceRender || selectionChanged) {
            this.renderSelectedBone();
        }
        return true;
    }

    private renderSelectedBone(): void {
        this.boneContainer.innerHTML = "";
        this.boneSliders.clear();
        this.boneSliderValues.clear();

        if (this.isMultipleBoneSelectionActive()) {
            this.renderMultipleSelectedBones();
            return;
        }

        if (!this.currentBoneName) {
            setPanelEmptyState(this.boneContainer, t("empty.noBoneSelected"));
            return;
        }

        const isCameraControl = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME;
        const cameraPose = isCameraControl ? this.mmdManager?.getCameraKeyframePose() : null;
        const transform = isCameraControl
            ? {
                position: cameraPose?.target ?? { x: 0, y: 0, z: 0 },
                rotation: cameraPose?.rotation ?? { x: 0, y: 0, z: 0 },
            }
            : this.mmdManager?.getBoneTransform(this.currentBoneName) ?? {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
            };
        const boneControlInfo = isCameraControl
            ? {
                name: this.currentBoneName,
                movable: true,
                rotatable: true,
            }
            : this.boneControlMap.get(this.currentBoneName) ?? {
                name: this.currentBoneName,
                movable: true,
                rotatable: true,
            };

        const controlDefs: {
            key: BoneSliderKey;
            label: string;
            min: number;
            max: number;
            step: number;
            displayStep?: number;
            value: number;
            disabled?: boolean;
        }[] = [];
        const translationMin = TRANSLATION_CONTROL_MIN;
        const translationMax = TRANSLATION_CONTROL_MAX;

        controlDefs.push(
            { key: "tx", label: "X", min: translationMin, max: translationMax, step: 1, displayStep: 0.01, value: transform.position.x, disabled: !boneControlInfo.movable || (isCameraControl && this.cameraPlaybackLocked) },
            { key: "ty", label: "Y", min: translationMin, max: translationMax, step: 1, displayStep: 0.01, value: transform.position.y, disabled: !boneControlInfo.movable || (isCameraControl && this.cameraPlaybackLocked) },
            { key: "tz", label: "Z", min: translationMin, max: translationMax, step: 1, displayStep: 0.01, value: transform.position.z, disabled: !boneControlInfo.movable || (isCameraControl && this.cameraPlaybackLocked) },
            { key: "rx", label: "Rx", min: -180, max: 180, step: 1, displayStep: 0.1, value: transform.rotation.x, disabled: !boneControlInfo.rotatable || (isCameraControl && this.cameraPlaybackLocked) },
            { key: "ry", label: "Ry", min: -180, max: 180, step: 1, displayStep: 0.1, value: transform.rotation.y, disabled: !boneControlInfo.rotatable || (isCameraControl && this.cameraPlaybackLocked) },
            { key: "rz", label: "Rz", min: -180, max: 180, step: 1, displayStep: 0.1, value: transform.rotation.z, disabled: !boneControlInfo.rotatable || (isCameraControl && this.cameraPlaybackLocked) },
        );

        if (isCameraControl) {
            const externalParentActive = Boolean(this.mmdManager?.getCameraExternalParent());
            controlDefs.push(
                { key: "camDistance", label: t("slider.distance"), min: 0, max: 100000, step: 0.1, value: cameraPose?.distance ?? 45, disabled: externalParentActive || this.cameraPlaybackLocked },
                { key: "camFov", label: t("slider.fov"), min: 10, max: 120, step: 0.1, value: cameraPose?.fov ?? 30, disabled: this.cameraPlaybackLocked },
            );
        }

        if (controlDefs.length === 0) {
            setPanelEmptyState(this.boneContainer, t("empty.noEditableChannels"));
            return;
        }

        const grid = createPanelNumberGrid(controlDefs.map((def) => ({
            key: def.key,
            label: def.label,
            min: def.min,
            max: def.max,
            step: def.step,
            value: this.formatPanelNumberValue(this.clamp(def.value, def.min, def.max), def.displayStep ?? def.step),
            legacyRowClass: "bone-number-row",
            legacyLabelClass: "bone-number-label",
            legacyInputClass: "bone-number-input",
        })));
        grid.element.classList.toggle("bone-number-grid--camera", isCameraControl);
        for (const def of controlDefs) {
            const input = grid.inputs.get(def.key);
            if (!input) continue;
            input.parentElement?.classList.toggle("bone-number-row--camera-extra", def.key === "camDistance" || def.key === "camFov");
            input.dataset.displayStep = String(def.displayStep ?? def.step);
            this.configureBoneNumberInput(input, def);
            input.disabled = def.disabled === true;
            input.classList.toggle("is-channel-unavailable", def.disabled === true);
            input.setAttribute("aria-disabled", def.disabled === true ? "true" : "false");
        }
        this.boneContainer.appendChild(grid.element);
    }

    private renderMultipleSelectedBones(): void {
        const controlDefs: {
            key: BoneSliderKey;
            label: string;
            min: number;
            max: number;
            step: number;
            displayStep?: number;
            value: number;
            disabled?: boolean;
        }[] = [
            { key: "tx", label: "X", min: TRANSLATION_CONTROL_MIN, max: TRANSLATION_CONTROL_MAX, step: 1, displayStep: 0.01, value: 0, disabled: true },
            { key: "ty", label: "Y", min: TRANSLATION_CONTROL_MIN, max: TRANSLATION_CONTROL_MAX, step: 1, displayStep: 0.01, value: 0, disabled: true },
            { key: "tz", label: "Z", min: TRANSLATION_CONTROL_MIN, max: TRANSLATION_CONTROL_MAX, step: 1, displayStep: 0.01, value: 0, disabled: true },
            { key: "rx", label: "Rx", min: -180, max: 180, step: 1, displayStep: 0.1, value: 0, disabled: true },
            { key: "ry", label: "Ry", min: -180, max: 180, step: 1, displayStep: 0.1, value: 0, disabled: true },
            { key: "rz", label: "Rz", min: -180, max: 180, step: 1, displayStep: 0.1, value: 0, disabled: true },
        ];
        const grid = createPanelNumberGrid(controlDefs.map((def) => ({
            key: def.key,
            label: def.label,
            min: def.min,
            max: def.max,
            step: def.step,
            value: this.formatPanelNumberValue(def.value, def.displayStep ?? def.step),
            legacyRowClass: "bone-number-row",
            legacyLabelClass: "bone-number-label",
            legacyInputClass: "bone-number-input",
        })));
        for (const def of controlDefs) {
            const input = grid.inputs.get(def.key);
            if (!input) continue;
            input.dataset.displayStep = String(def.displayStep ?? def.step);
            input.disabled = true;
            input.classList.add("is-channel-unavailable");
            input.setAttribute("aria-disabled", "true");
            this.boneSliders.set(def.key, input);
        }
        this.boneContainer.appendChild(grid.element);
    }

    private configureBoneNumberInput(input: HTMLInputElement, def: {
        key: BoneSliderKey;
        label: string;
        min: number;
        max: number;
        step: number;
        displayStep?: number;
        value: number;
        disabled?: boolean;
    }): void {
        const beginInputInteraction = (): void => {
            if (this.activeSliderInteractions.has(input)) return;
            this.activeSliderInteractions.add(input);
            this.onBoneTransformEditStarted?.(this.currentBoneName);
        };
        const endInputInteraction = (): void => {
            if (!this.activeSliderInteractions.has(input)) return;
            this.activeSliderInteractions.delete(input);
            this.onBoneTransformEditCommitted?.(this.currentBoneName);
        };
        const applyInputValue = (): void => {
            const parsed = input.valueAsNumber;
            if (!Number.isFinite(parsed)) {
                this.syncSelectedBoneSlidersFromRuntime(true);
                return;
            }
            const clamped = this.clamp(parsed, def.min, def.max);
            if (clamped !== parsed) {
                input.value = this.formatSliderValue(clamped, def.displayStep ?? def.step);
            }
            this.applyBoneTransformFromSliders();
            if (this.currentBoneName) {
                this.onBoneTransformEdited?.(this.currentBoneName);
            }
        };

        installEnterCommitNumberInput(input, {
            commit: applyInputValue,
            revert: () => this.syncSelectedBoneSlidersFromRuntime(true),
            onBegin: beginInputInteraction,
            onEnd: endInputInteraction,
        });

        this.boneSliders.set(def.key, input);
    }

    private updateBoneSelectionSummary(): void {
        if (!this.boneSelectionSummary) return;
        if (this.isMultipleBoneSelectionActive()) {
            const label = t("bottomPanel.multipleBonesSelected", { count: this.multipleBoneSelectionNames.length });
            this.boneSelectionSummary.textContent = label;
            this.boneSelectionSummary.title = this.multipleBoneSelectionNames.join(", ");
            return;
        }
        this.boneSelectionSummary.textContent = this.currentBoneName ?? "-";
        this.boneSelectionSummary.title = this.currentBoneName ?? "";
    }

    syncSelectedBoneSlidersFromRuntime(force = false): void {
        if (this.isMultipleBoneSelectionActive()) return;
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.boneSliders.size === 0) return;

        if (this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME) {
            const pose = this.mmdManager.getCameraKeyframePose();
            this.syncSelectedBoneSlidersFromSnapshot(pose, force);
            this.syncCameraControlAvailability();
            return;
        }

        const transform = this.mmdManager.getAnimatedBoneTransform?.(this.currentBoneName)
            ?? this.mmdManager.getBoneTransform(this.currentBoneName);
        if (!transform) return;

        this.syncSelectedBoneSlidersFromSnapshot(transform, force);
    }

    syncSelectedBoneSlidersFromSnapshot(snapshot: BonePoseSnapshot | null, force = false): void {
        if (this.isMultipleBoneSelectionActive()) return;
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.boneSliders.size === 0) return;
        if (!snapshot) return;
        this.syncSelectedBoneSlidersFromSnapshotValues(snapshot, force);
    }

    private syncSelectedBoneSlidersFromSnapshotValues(snapshot: BonePoseSnapshot, force = false): void {
        const updateSlider = (key: BoneSliderKey, rawValue: number): void => {
            const slider = this.boneSliders.get(key);
            if (!slider) return;
            if (!force && this.isSliderEditing(slider)) return;

            const min = Number.parseFloat(slider.min);
            const max = Number.parseFloat(slider.max);
            const step = Number.parseFloat(slider.dataset.displayStep ?? (slider.step || "1"));
            const safeValue = this.clamp(
                rawValue,
                Number.isFinite(min) ? min : rawValue,
                Number.isFinite(max) ? max : rawValue,
            );
            const nextValue = this.formatPanelNumberValue(safeValue, step);
            if (slider.value !== nextValue) {
                slider.value = nextValue;
            }

            const valueEl = this.boneSliderValues.get(key);
            if (valueEl) {
                valueEl.textContent = this.formatSliderValue(Number(nextValue), step);
            }
        };

        const cameraTranslation = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME
            ? snapshot.target ?? snapshot.position
            : snapshot.position;
        updateSlider("tx", cameraTranslation.x);
        updateSlider("ty", cameraTranslation.y);
        updateSlider("tz", cameraTranslation.z);
        updateSlider("rx", snapshot.rotation.x);
        updateSlider("ry", snapshot.rotation.y);
        updateSlider("rz", snapshot.rotation.z);
        if (typeof snapshot.distance === "number") {
            updateSlider("camDistance", snapshot.distance);
        }
        if (typeof snapshot.fov === "number") {
            updateSlider("camFov", snapshot.fov);
        }
    }

    private syncCameraControlAvailability(): void {
        if (this.currentBoneName !== BottomPanel.CAMERA_CONTROL_NAME) return;
        const externalParentActive = Boolean(this.mmdManager?.getCameraExternalParent());
        for (const [key, input] of this.boneSliders) {
            const disabled = this.cameraPlaybackLocked || (key === "camDistance" && externalParentActive);
            input.disabled = disabled;
            input.classList.toggle("is-channel-unavailable", disabled);
            input.setAttribute("aria-disabled", disabled ? "true" : "false");
        }
    }

    private applyBoneTransformFromSliders(): void {
        if (this.isMultipleBoneSelectionActive()) return;
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME) {
            const tx = this.getBoneSliderNumber("tx");
            const ty = this.getBoneSliderNumber("ty");
            const tz = this.getBoneSliderNumber("tz");
            const rx = this.getBoneSliderNumber("rx");
            const ry = this.getBoneSliderNumber("ry");
            const rz = this.getBoneSliderNumber("rz");
            const distance = this.getBoneSliderNumber("camDistance");
            const fov = this.getBoneSliderNumber("camFov");
            this.mmdManager.setCameraTarget(tx, ty, tz);
            this.mmdManager.setCameraRotation(rx, ry, rz);
            this.mmdManager.setCameraDistance(distance);
            this.mmdManager.setCameraFov(fov);
            return;
        }

        const tx = this.getBoneSliderNumber("tx");
        const ty = this.getBoneSliderNumber("ty");
        const tz = this.getBoneSliderNumber("tz");
        this.mmdManager.setBoneTranslation(this.currentBoneName, tx, ty, tz, false);

        const rx = this.getBoneSliderNumber("rx");
        const ry = this.getBoneSliderNumber("ry");
        const rz = this.getBoneSliderNumber("rz");
        this.mmdManager.setBoneRotation(this.currentBoneName, rx, ry, rz, false);
    }

    private getBoneSliderNumber(key: BoneSliderKey): number {
        const slider = this.boneSliders.get(key);
        if (!slider) return 0;
        const value = Number.parseFloat(slider.value);
        return Number.isFinite(value) ? value : 0;
    }

    private renderMorphGroups(): void {
        this.morphContainer.innerHTML = "";
        this.morphSliders.clear();
        this.morphKeyframeButtons.clear();
        this.morphContainer.className = "morph-controls";

        const groups = this.buildMorphGroups();
        const hasMorphs = groups.some((group) => group.morphs.length > 0);
        if (!hasMorphs) {
            setPanelEmptyState(this.morphContainer, t("empty.noMorphs"));
            return;
        }

        applyPanelMorphCategoryGridClasses(this.morphContainer, "morph-controls", "morph-category-grid");
        for (const group of groups) {
            const { card, body } = createPanelMorphCategory(group.label, {
                card: "morph-category-card",
                header: "morph-category-header",
                body: "morph-category-body",
            });
            if (group.morphs.length === 0) {
                body.appendChild(createPanelCategoryEmpty());
            }

            for (const morphInfo of group.morphs) {
                body.appendChild(this.createMorphSliderRow(morphInfo));
            }

            this.morphContainer.appendChild(card);
        }

        this.onRangeInputsRendered?.(this.morphContainer);
        this.updateMorphKeyframeButtonStates();
    }

    private buildMorphGroups(): Array<{
        key: "eye" | "lip" | "brow" | "other";
        label: string;
        morphs: Array<{ frameIndex: number; index: number; name: string }>;
    }> {
        const groups: Array<{
            key: "eye" | "lip" | "brow" | "other";
            label: string;
            morphs: Array<{ frameIndex: number; index: number; name: string }>;
        }> = [
            { key: "eye", label: t("morph.category.eye"), morphs: [] },
            { key: "lip", label: t("morph.category.lip"), morphs: [] },
            { key: "brow", label: t("morph.category.brow"), morphs: [] },
            { key: "other", label: t("morph.category.other"), morphs: [] },
        ];

        this.morphFrames.forEach((frame, frameIndex) => {
            for (const morph of frame.morphs) {
                const key = this.classifyMorphFrame(morph.name);
                const group = groups.find((candidate) => candidate.key === key) ?? groups[3];
                group.morphs.push({ frameIndex, index: morph.index, name: morph.name });
            }
        });
        return groups;
    }

    private classifyMorphFrame(name: string): "eye" | "lip" | "brow" | "other" {
        const normalized = name.toLowerCase();
        if (/[\u76ee\u773c\u77b3]|\u307e\u3070\u305f\u304d|\u30a6\u30a3\u30f3\u30af|\u7b11\u3044/.test(name)
            || normalized.includes("eye")
            || normalized.includes("wink")) {
            return "eye";
        }
        if (/[\u7709]|\u56f0\u308b|\u6012\u308a|\u306b\u3053\u308a/.test(name)
            || normalized.includes("brow")
            || normalized.includes("eyebrow")) {
            return "brow";
        }
        if (/[\u53e3\u5507]|\u30ea\u30c3\u30d7|^[\u3042\u3044\u3046\u3048\u304a]$/.test(name)
            || normalized.includes("lip")
            || normalized.includes("mouth")) {
            return "lip";
        }
        return "other";
    }

    private createMorphSliderRow(morphInfo: { frameIndex: number; index: number; name: string }): HTMLElement {
        const morphName = morphInfo.name;
        const morphIndex = morphInfo.index;
        const morphKey = this.getMorphControlKey(morphIndex, morphName);
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.01";
        slider.value = this.mmdManager
            ? (morphIndex >= 0
                ? this.mmdManager.getMorphWeightByIndex(morphIndex).toFixed(2)
                : this.mmdManager.getMorphWeight(morphName).toFixed(2))
            : "0";

        const rendered = createPanelSliderValueRow({
            label: morphName,
            slider,
            valueText: Number(slider.value).toFixed(2),
            legacyRowClass: "morph-slider-row",
            legacySliderClass: "morph-slider",
            legacyValueClass: "morph-value",
        });
        const keyframeButton = document.createElement("button");
        keyframeButton.type = "button";
        keyframeButton.className = "morph-row-keyframe-btn";
        keyframeButton.textContent = "♢";
        keyframeButton.dataset.morphName = morphName;
        keyframeButton.setAttribute("aria-label", `${morphName} keyframe`);
        keyframeButton.title = t("button.register");
        rendered.row.appendChild(keyframeButton);

        slider.addEventListener("input", () => {
            const val = Number.parseFloat(slider.value);
            rendered.value.textContent = val.toFixed(2);
            if (!this.mmdManager) return;
            if (morphIndex >= 0) {
                this.mmdManager.setMorphWeightByIndex(morphIndex, val);
            } else {
                this.mmdManager.setMorphWeight(morphName, val);
            }
            this.currentMorphFrameIndex = morphInfo.frameIndex;
            this.setMorphKeyframeButtonState(keyframeButton, "dirty");
            this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
            this.onMorphValueEdited?.(this.currentMorphFrameIndex);
        });
        slider.addEventListener("change", () => {
            const rawValue = Number.parseFloat(slider.value);
            const value = Number.isFinite(rawValue) ? rawValue : 0;
            this.currentMorphFrameIndex = morphInfo.frameIndex;
            this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
            this.onMorphValueEditCommitted?.({
                frameIndex: morphInfo.frameIndex,
                index: morphIndex,
                name: morphName,
                value,
            });
        });
        keyframeButton.addEventListener("click", () => {
            const rawValue = Number.parseFloat(slider.value);
            const value = Number.isFinite(rawValue) ? rawValue : 0;
            this.currentMorphFrameIndex = morphInfo.frameIndex;
            this.onMorphFrameSelectionChanged?.(this.currentMorphFrameIndex);
            this.onMorphKeyframeRequested?.({
                frameIndex: morphInfo.frameIndex,
                index: morphIndex,
                name: morphName,
                value,
            });
        });

        this.morphSliders.set(morphKey, slider);
        this.morphKeyframeButtons.set(morphKey, keyframeButton);

        return rendered.row;
    }

    private getMorphControlKey(morphIndex: number, morphName: string): string {
        return `${morphIndex}:${morphName}`;
    }

    private setMorphKeyframeButtonState(button: HTMLButtonElement, state: "dirty" | "registered"): void {
        button.classList.toggle("is-registered", state === "registered");
        button.textContent = state === "registered" ? "♦" : "♢";
    }
    private isSliderEditing(slider: HTMLInputElement): boolean {
        const activeElement = document.activeElement;
        return this.activeSliderInteractions.has(slider)
            || activeElement === slider
            || activeElement === this.getAttachedNumberInput(slider);
    }

    private getAttachedNumberInput(slider: HTMLInputElement): HTMLInputElement | null {
        const candidate = slider.parentElement?.querySelector('input.range-number-input[type="number"]');
        return candidate instanceof HTMLInputElement ? candidate : null;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private formatSliderValue(value: number, step: number): string {
        if (step >= 1) return String(Math.round(value));
        if (step >= 0.1) return value.toFixed(1);
        return value.toFixed(2);
    }

    private formatPanelNumberValue(value: number, step: number): string {
        if (step >= 1) return String(Math.round(value));
        if (step >= 0.1) return value.toFixed(1);
        return value.toFixed(2);
    }
}
