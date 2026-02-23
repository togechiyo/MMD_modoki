import type { MmdManager } from "./mmd-manager";
import type { BoneControlInfo, ModelInfo, MorphDisplayFrameInfo } from "./types";

type BoneSliderKey = "tx" | "ty" | "tz" | "rx" | "ry" | "rz" | "camDistance" | "camFov";

export class BottomPanel {
    private static readonly CAMERA_CONTROL_NAME = "Camera";
    private boneSelect: HTMLSelectElement;
    private boneContainer: HTMLElement;
    private morphFrameSelect: HTMLSelectElement;
    private morphContainer: HTMLElement;
    private boneSliders: Map<BoneSliderKey, HTMLInputElement> = new Map();
    private boneSliderValues: Map<BoneSliderKey, HTMLElement> = new Map();
    private morphSliders: Map<string, HTMLInputElement> = new Map();
    private morphFrames: MorphDisplayFrameInfo[] = [];
    private boneControlMap: Map<string, BoneControlInfo> = new Map();
    private currentBoneName: string | null = null;
    private mmdManager: MmdManager | null = null;
    public onBoneSelectionChanged: ((boneName: string | null) => void) | null = null;

    constructor() {
        this.boneSelect = document.getElementById("bone-select") as HTMLSelectElement;
        this.boneContainer = document.getElementById("bone-controls") as HTMLElement;
        this.morphFrameSelect = document.getElementById("morph-frame-select") as HTMLSelectElement;
        this.morphContainer = document.getElementById("morph-controls") as HTMLElement;

        this.boneSelect.addEventListener("change", () => {
            this.currentBoneName = this.boneSelect.value || null;
            this.renderSelectedBone();
            this.onBoneSelectionChanged?.(this.currentBoneName);
        });

        this.morphFrameSelect.addEventListener("change", () => {
            const selectedIndex = Number.parseInt(this.morphFrameSelect.value, 10);
            this.renderMorphFrame(Number.isNaN(selectedIndex) ? -1 : selectedIndex);
        });
    }

    setMmdManager(manager: MmdManager): void {
        this.mmdManager = manager;
    }

    updateBoneControls(info: ModelInfo): void {
        this.boneSelect.innerHTML = "";
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();

        for (const boneControlInfo of info.boneControlInfos ?? []) {
            this.boneControlMap.set(boneControlInfo.name, boneControlInfo);
        }

        if (info.boneNames.length === 0) {
            this.currentBoneName = null;
            this.boneSelect.disabled = true;
            this.boneContainer.innerHTML = '<div class="panel-empty-state">No bones</div>';
            return;
        }

        for (const boneName of info.boneNames) {
            const option = document.createElement("option");
            option.value = boneName;
            option.textContent = boneName;
            this.boneSelect.appendChild(option);
        }

        this.boneSelect.disabled = false;
        this.setSelectedBone(info.boneNames[0]);
    }

    updateMorphControls(info: ModelInfo): void {
        this.morphFrameSelect.innerHTML = "";
        this.morphSliders.clear();
        this.morphFrames = info.morphDisplayFrames.length > 0
            ? info.morphDisplayFrames
            : info.morphNames.length > 0
                ? [{ name: "All", morphNames: [...info.morphNames] }]
                : [];

        if (this.morphFrames.length === 0) {
            this.morphFrameSelect.disabled = true;
            this.morphContainer.innerHTML = '<div class="panel-empty-state">No morphs</div>';
            return;
        }

        this.morphFrames.forEach((frame, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = frame.name;
            this.morphFrameSelect.appendChild(option);
        });

        this.morphFrameSelect.disabled = this.morphFrames.length <= 1;
        this.morphFrameSelect.value = "0";
        this.renderMorphFrame(0);
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
        this.boneSliders.clear();
        this.boneSliderValues.clear();
        this.boneControlMap.clear();
        this.boneSelect.innerHTML = '<option value="">-</option>';
        this.boneSelect.disabled = true;
        this.boneContainer.innerHTML = '<div class="panel-empty-state">No model</div>';
    }

    clearMorphControls(): void {
        this.morphFrames = [];
        this.morphSliders.clear();
        this.morphFrameSelect.innerHTML = '<option value="">-</option>';
        this.morphFrameSelect.disabled = true;
        this.morphContainer.innerHTML = '<div class="panel-empty-state">No model</div>';
    }

    getSelectedBone(): string | null {
        return this.currentBoneName;
    }

    setSelectedBone(boneName: string | null): boolean {
        if (!boneName || this.boneSelect.disabled) return false;

        let exists = false;
        for (let i = 0; i < this.boneSelect.options.length; i += 1) {
            if (this.boneSelect.options[i].value === boneName) {
                exists = true;
                break;
            }
        }
        if (!exists) return false;

        this.currentBoneName = boneName;
        this.boneSelect.value = boneName;
        this.renderSelectedBone();
        return true;
    }

    private renderSelectedBone(): void {
        this.boneContainer.innerHTML = "";
        this.boneSliders.clear();
        this.boneSliderValues.clear();

        if (!this.currentBoneName) {
            this.boneContainer.innerHTML = '<div class="panel-empty-state">No bone selected</div>';
            return;
        }

        const isCameraControl = this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME;
        const transform = isCameraControl
            ? {
                position: this.mmdManager?.getCameraPosition() ?? { x: 0, y: 0, z: 0 },
                rotation: this.mmdManager?.getCameraRotation() ?? { x: 0, y: 0, z: 0 },
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

        const sliderDefs: {
            key: BoneSliderKey;
            label: string;
            min: number;
            max: number;
            step: number;
            value: number;
        }[] = [];

        if (boneControlInfo.movable) {
            sliderDefs.push(
                { key: "tx", label: "PosX", min: -30, max: 30, step: 0.01, value: transform.position.x },
                { key: "ty", label: "PosY", min: -30, max: 30, step: 0.01, value: transform.position.y },
                { key: "tz", label: "PosZ", min: -30, max: 30, step: 0.01, value: transform.position.z },
            );
        }
        if (boneControlInfo.rotatable) {
            sliderDefs.push(
                { key: "rx", label: "RotX", min: -180, max: 180, step: 0.1, value: transform.rotation.x },
                { key: "ry", label: "RotY", min: -180, max: 180, step: 0.1, value: transform.rotation.y },
                { key: "rz", label: "RotZ", min: -180, max: 180, step: 0.1, value: transform.rotation.z },
            );
        }
        if (isCameraControl) {
            sliderDefs.push(
                { key: "camDistance", label: "Dist", min: 0.1, max: 400, step: 0.1, value: this.mmdManager?.getCameraDistance() ?? 45 },
                { key: "camFov", label: "FoV", min: 10, max: 120, step: 0.1, value: this.mmdManager?.getCameraFov() ?? 30 },
            );
        }

        if (sliderDefs.length === 0) {
            this.boneContainer.innerHTML = '<div class="panel-empty-state">No editable channels</div>';
            return;
        }

        for (const def of sliderDefs) {
            const row = document.createElement("div");
            row.className = "bone-slider-row";

            const label = document.createElement("label");
            label.className = "bone-slider-label";
            label.textContent = def.label;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = String(def.min);
            slider.max = String(def.max);
            slider.step = String(def.step);
            slider.value = this.clamp(def.value, def.min, def.max).toFixed(def.step < 1 ? 2 : 0);
            slider.className = "bone-slider";

            const valueDisplay = document.createElement("span");
            valueDisplay.className = "bone-slider-value";
            valueDisplay.textContent = this.formatSliderValue(Number(slider.value), def.step);

            slider.addEventListener("input", () => {
                const value = Number(slider.value);
                valueDisplay.textContent = this.formatSliderValue(value, def.step);
                this.applyBoneTransformFromSliders();
            });

            this.boneSliders.set(def.key, slider);
            this.boneSliderValues.set(def.key, valueDisplay);

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valueDisplay);
            this.boneContainer.appendChild(row);
        }
    }

    syncSelectedBoneSlidersFromRuntime(): void {
        if (!this.mmdManager || !this.currentBoneName) return;
        if (this.boneSliders.size === 0) return;

        if (this.currentBoneName === BottomPanel.CAMERA_CONTROL_NAME) {
            const position = this.mmdManager.getCameraPosition();
            const rotation = this.mmdManager.getCameraRotation();
            const distance = this.mmdManager.getCameraDistance();
            const fov = this.mmdManager.getCameraFov();

            const updateSlider = (key: BoneSliderKey, rawValue: number): void => {
                const slider = this.boneSliders.get(key);
                if (!slider) return;
                if (document.activeElement === slider) return;

                const min = Number.parseFloat(slider.min);
                const max = Number.parseFloat(slider.max);
                const step = Number.parseFloat(slider.step || "1");
                const safeValue = this.clamp(
                    rawValue,
                    Number.isFinite(min) ? min : rawValue,
                    Number.isFinite(max) ? max : rawValue,
                );
                const digits = step < 1 ? 2 : 0;
                const nextValue = safeValue.toFixed(digits);
                if (slider.value !== nextValue) {
                    slider.value = nextValue;
                }

                const valueEl = this.boneSliderValues.get(key);
                if (valueEl) {
                    valueEl.textContent = this.formatSliderValue(Number(nextValue), step);
                }
            };

            updateSlider("tx", position.x);
            updateSlider("ty", position.y);
            updateSlider("tz", position.z);
            updateSlider("rx", rotation.x);
            updateSlider("ry", rotation.y);
            updateSlider("rz", rotation.z);
            updateSlider("camDistance", distance);
            updateSlider("camFov", fov);
            return;
        }

        const transform = this.mmdManager.getBoneTransform(this.currentBoneName);
        if (!transform) return;

        const updateSlider = (key: BoneSliderKey, rawValue: number): void => {
            const slider = this.boneSliders.get(key);
            if (!slider) return;
            // While dragging/focusing this slider, don't override user's input.
            if (document.activeElement === slider) return;

            const min = Number.parseFloat(slider.min);
            const max = Number.parseFloat(slider.max);
            const step = Number.parseFloat(slider.step || "1");
            const safeValue = this.clamp(
                rawValue,
                Number.isFinite(min) ? min : rawValue,
                Number.isFinite(max) ? max : rawValue,
            );
            const digits = step < 1 ? 2 : 0;
            const nextValue = safeValue.toFixed(digits);
            if (slider.value !== nextValue) {
                slider.value = nextValue;
            }

            const valueEl = this.boneSliderValues.get(key);
            if (valueEl) {
                valueEl.textContent = this.formatSliderValue(Number(nextValue), step);
            }
        };

        updateSlider("tx", transform.position.x);
        updateSlider("ty", transform.position.y);
        updateSlider("tz", transform.position.z);
        updateSlider("rx", transform.rotation.x);
        updateSlider("ry", transform.rotation.y);
        updateSlider("rz", transform.rotation.z);
    }

    private applyBoneTransformFromSliders(): void {
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
            this.mmdManager.setCameraPosition(tx, ty, tz);
            this.mmdManager.setCameraRotation(rx, ry, rz);
            this.mmdManager.setCameraDistance(distance);
            this.mmdManager.setCameraFov(fov);
            return;
        }

        const boneControlInfo = this.boneControlMap.get(this.currentBoneName) ?? {
            name: this.currentBoneName,
            movable: true,
            rotatable: true,
        };

        if (boneControlInfo.movable) {
            const tx = this.getBoneSliderNumber("tx");
            const ty = this.getBoneSliderNumber("ty");
            const tz = this.getBoneSliderNumber("tz");
            this.mmdManager.setBoneTranslation(this.currentBoneName, tx, ty, tz);
        }

        if (boneControlInfo.rotatable) {
            const rx = this.getBoneSliderNumber("rx");
            const ry = this.getBoneSliderNumber("ry");
            const rz = this.getBoneSliderNumber("rz");
            this.mmdManager.setBoneRotation(this.currentBoneName, rx, ry, rz);
        }
    }

    private getBoneSliderNumber(key: BoneSliderKey): number {
        const slider = this.boneSliders.get(key);
        if (!slider) return 0;
        const value = Number.parseFloat(slider.value);
        return Number.isFinite(value) ? value : 0;
    }

    private renderMorphFrame(frameIndex: number): void {
        this.morphContainer.innerHTML = "";
        this.morphSliders.clear();

        const frame = this.morphFrames[frameIndex];
        if (!frame) {
            this.morphContainer.innerHTML = '<div class="panel-empty-state">No frame</div>';
            return;
        }

        if (frame.morphNames.length === 0) {
            this.morphContainer.innerHTML = '<div class="panel-empty-state">No morphs</div>';
            return;
        }

        for (const morphName of frame.morphNames) {
            const row = document.createElement("div");
            row.className = "morph-slider-row";

            const label = document.createElement("label");
            label.textContent = morphName;
            label.title = morphName;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "1";
            slider.step = "0.01";
            slider.value = this.mmdManager
                ? this.mmdManager.getMorphWeight(morphName).toFixed(2)
                : "0";

            const valueDisplay = document.createElement("span");
            valueDisplay.className = "morph-value";
            valueDisplay.textContent = Number(slider.value).toFixed(2);

            slider.addEventListener("input", () => {
                const val = Number.parseFloat(slider.value);
                valueDisplay.textContent = val.toFixed(2);
                this.mmdManager?.setMorphWeight(morphName, val);
            });

            this.morphSliders.set(morphName, slider);

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valueDisplay);
            this.morphContainer.appendChild(row);
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private formatSliderValue(value: number, step: number): string {
        if (step >= 1) return String(Math.round(value));
        if (step >= 0.1) return value.toFixed(1);
        return value.toFixed(2);
    }
}
