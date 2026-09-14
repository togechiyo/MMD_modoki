import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type LensEffectElements = {
    distortionInput: HTMLInputElement | null;
    distortionValue: HTMLElement | null;
    influenceInput: HTMLInputElement | null;
    influenceValue: HTMLElement | null;
};

type LensEffectPanelElements = {
    chromaticInput: HTMLInputElement;
    chromaticValue: HTMLElement;
    frameGraphChromaticInput: HTMLInputElement | null;
    frameGraphChromaticValue: HTMLElement | null;
    influenceInput: HTMLInputElement;
    influenceValue: HTMLElement;
    edgeBlurInput: HTMLInputElement | null;
    edgeBlurValue: HTMLElement | null;
};

export type LensEffectControllerDeps = {
    mmdManager: MmdManager;
    syncRangeNumberInput: (slider: HTMLInputElement) => void;
    isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveLensEffectElements(): LensEffectElements {
    return {
        distortionInput: document.getElementById("effect-lens-distortion") as HTMLInputElement | null,
        distortionValue: document.getElementById("effect-lens-distortion-val"),
        influenceInput: document.getElementById("effect-lens-distortion-influence") as HTMLInputElement | null,
        influenceValue: document.getElementById("effect-lens-distortion-influence-val"),
    };
}

function queryPanelElements(root: ParentNode): LensEffectPanelElements | null {
    const chromaticInput = root.querySelector<HTMLInputElement>('input[data-postfx="chromatic-aberration"]');
    const chromaticValue = root.querySelector<HTMLElement>('span[data-postfx-val="chromatic-aberration"]');
    const frameGraphChromaticInput = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-chromatic-aberration"]');
    const frameGraphChromaticValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-chromatic-aberration"]');
    const influenceInput = root.querySelector<HTMLInputElement>('input[data-postfx="distortion-influence"]');
    const influenceValue = root.querySelector<HTMLElement>('span[data-postfx-val="distortion-influence"]');
    const edgeBlurInput = root.querySelector<HTMLInputElement>('input[data-postfx="lens-edge-blur"]');
    const edgeBlurValue = root.querySelector<HTMLElement>('span[data-postfx-val="lens-edge-blur"]');

    if (
        !chromaticInput ||
        !chromaticValue ||
        !influenceInput ||
        !influenceValue
    ) {
        return null;
    }

    return {
        chromaticInput,
        chromaticValue,
        frameGraphChromaticInput,
        frameGraphChromaticValue,
        influenceInput,
        influenceValue,
        edgeBlurInput,
        edgeBlurValue,
    };
}

export class LensEffectController {
    private readonly elements: LensEffectElements;
    private readonly mmdManager: MmdManager;
    private readonly syncRangeNumberInput: (slider: HTMLInputElement) => void;
    private readonly isRangeInputEditing: (slider: HTMLInputElement) => boolean;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    constructor(deps: LensEffectControllerDeps) {
        this.elements = resolveLensEffectElements();
        this.mmdManager = deps.mmdManager;
        this.syncRangeNumberInput = deps.syncRangeNumberInput;
        this.isRangeInputEditing = deps.isRangeInputEditing;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupStaticControls();
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }

        const applyChromaticAberration = (): void => {
            const value = Number(elements.chromaticInput.value);
            if (this.dispatchAction?.({ type: "effect.setChromaticAberration", source: "panel", value })) return;
            this.setChromaticAberration(value);
            syncChromaticAberrationUi();
        };

        const applyFrameGraphChromaticAberration = (): void => {
            if (!elements.frameGraphChromaticInput) {
                return;
            }
            const value = Number(elements.frameGraphChromaticInput.value);
            if (this.dispatchAction?.({ type: "effect.setChromaticAberration", source: "panel", value })) return;
            this.setChromaticAberration(value);
            syncChromaticAberrationUi();
        };

        const syncChromaticAberrationUi = (): void => {
            const value = String(Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectChromaticAberration))));
            const label = this.mmdManager.postEffectChromaticAberration > 0.000001
                ? this.mmdManager.postEffectChromaticAberration.toFixed(0)
                : t("status.off");
            elements.chromaticInput.value = value;
            elements.chromaticValue.textContent = label;
            if (elements.frameGraphChromaticInput && elements.frameGraphChromaticValue) {
                elements.frameGraphChromaticInput.value = value;
                elements.frameGraphChromaticValue.textContent = label;
            }
        };

        const applyDistortionInfluence = (): void => {
            const percent = Number(elements.influenceInput.value);
            if (!this.dispatchAction?.({ type: "effect.setLensDistortionInfluence", source: "panel", percent })) {
                this.setLensDistortionInfluencePercent(percent);
            }
            this.refreshDistortionInfluenceValue(elements.influenceInput, elements.influenceValue);
            this.refreshStaticDistortionControls();
        };

        const applyEdgeBlur = (): void => {
            if (!elements.edgeBlurInput || !elements.edgeBlurValue) {
                return;
            }
            const percent = Number(elements.edgeBlurInput.value);
            if (!this.dispatchAction?.({ type: "effect.setLensEdgeBlur", source: "panel", percent })) {
                this.setLensEdgeBlurPercent(percent);
            }
            this.refreshEdgeBlurValue(elements.edgeBlurInput, elements.edgeBlurValue);
        };

        elements.chromaticInput.value = String(
            Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectChromaticAberration))),
        );
        if (elements.frameGraphChromaticInput) {
            elements.frameGraphChromaticInput.value = elements.chromaticInput.value;
        }
        this.refreshDistortionInfluenceValue(elements.influenceInput, elements.influenceValue);
        this.refreshEdgeBlurValue(elements.edgeBlurInput, elements.edgeBlurValue);

        syncChromaticAberrationUi();
        // Connecting a panel only reads state; rounded controls must not create previews.
        this.refreshStaticDistortionControls();

        elements.chromaticInput.addEventListener("input", applyChromaticAberration);
        elements.frameGraphChromaticInput?.addEventListener("input", applyFrameGraphChromaticAberration);
        elements.influenceInput.addEventListener("input", applyDistortionInfluence);
        elements.edgeBlurInput?.addEventListener("input", applyEdgeBlur);
        return true;
    }

    public refresh(): void {
        this.refreshStaticControls();

        const panelElements = queryPanelElements(document);
        if (panelElements) {
            const value = String(Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectChromaticAberration))));
            const label = this.mmdManager.postEffectChromaticAberration > 0.000001
                ? this.mmdManager.postEffectChromaticAberration.toFixed(0)
                : t("status.off");
            panelElements.chromaticInput.disabled = this.mmdManager.isPlaying;
            panelElements.chromaticInput.value = value;
            panelElements.chromaticValue.textContent = label;
            if (panelElements.frameGraphChromaticInput && panelElements.frameGraphChromaticValue) {
                panelElements.frameGraphChromaticInput.disabled = this.mmdManager.isPlaying;
                panelElements.frameGraphChromaticInput.value = value;
                panelElements.frameGraphChromaticValue.textContent = label;
            }
            this.refreshDistortionInfluenceValue(panelElements.influenceInput, panelElements.influenceValue);
            this.refreshEdgeBlurValue(panelElements.edgeBlurInput, panelElements.edgeBlurValue);
        }
    }

    public refreshAutoReadout(): void {
        if (!this.mmdManager.dofLensDistortionLinkedToCameraFov) return;
        if (!this.elements.distortionInput || !this.elements.distortionValue) return;
        if (this.isRangeInputEditing(this.elements.distortionInput)) return;

        const distortionPercent = this.mmdManager.getEffectRenderLensDistortion() * 100;
        const sliderMin = Number(this.elements.distortionInput.min);
        const sliderMax = Number(this.elements.distortionInput.max);
        const clamped = Math.max(sliderMin, Math.min(sliderMax, distortionPercent));
        this.elements.distortionInput.value = String(Math.round(clamped));
        this.elements.distortionValue.textContent = `${Math.round(distortionPercent)}% (auto)`;
        this.syncRangeNumberInput(this.elements.distortionInput);
    }

    private setupStaticControls(): void {
        this.setupStaticDistortionControl();
        this.setupStaticInfluenceControl();
    }

    private setupStaticDistortionControl(): void {
        const input = this.elements.distortionInput;
        const value = this.elements.distortionValue;
        if (!input || !value) {
            return;
        }

        const applyLensDistortion = (): void => {
            if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
                this.refreshAutoReadout();
                return;
            }
            const percent = Number(input.value);
            if (!this.dispatchAction?.({ type: "effect.setLensDistortion", source: "panel", percent })) {
                this.setLensDistortionPercent(percent);
            }
            value.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
        };

        input.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
        if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
            input.disabled = true;
            input.title = "Auto distortion (linked to camera FoV; 30deg = 0%)";
        } else {
            input.addEventListener("input", applyLensDistortion);
        }
        applyLensDistortion();
    }

    private setupStaticInfluenceControl(): void {
        const input = this.elements.influenceInput;
        const value = this.elements.influenceValue;
        if (!input || !value) {
            return;
        }

        const applyLensDistortionInfluence = (): void => {
            const percent = Number(input.value);
            if (!this.dispatchAction?.({ type: "effect.setLensDistortionInfluence", source: "panel", percent })) {
                this.setLensDistortionInfluencePercent(percent);
            }
            this.refreshDistortionInfluenceValue(input, value);
            this.refreshAutoReadout();

            const panelElements = queryPanelElements(document);
            if (panelElements) {
                this.refreshDistortionInfluenceValue(panelElements.influenceInput, panelElements.influenceValue);
            }
        };

        this.refreshDistortionInfluenceValue(input, value);
        input.addEventListener("input", applyLensDistortionInfluence);
    }

    public setChromaticAberration(value: number): void {
        this.mmdManager.postEffectChromaticAberration = value;
    }

    public setLensDistortionPercent(percent: number): void {
        this.mmdManager.dofLensDistortion = percent / 100;
    }

    public setLensDistortionInfluencePercent(percent: number): void {
        this.mmdManager.dofLensDistortionInfluence = percent / 100;
    }

    public setLensEdgeBlurPercent(percent: number): void {
        this.mmdManager.dofLensEdgeBlur = percent / 100;
    }

    private refreshStaticControls(): void {
        this.refreshStaticDistortionControls();
        this.refreshStaticInfluenceControls();
    }

    private refreshStaticDistortionControls(): void {
        if (!this.elements.distortionInput || !this.elements.distortionValue) {
            return;
        }
        if (this.mmdManager.dofLensDistortionLinkedToCameraFov) {
            this.refreshAutoReadout();
            return;
        }
        this.elements.distortionInput.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
        this.elements.distortionValue.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
        this.syncRangeNumberInput(this.elements.distortionInput);
    }

    private refreshStaticInfluenceControls(): void {
        if (!this.elements.influenceInput || !this.elements.influenceValue) {
            return;
        }
        this.refreshDistortionInfluenceValue(this.elements.influenceInput, this.elements.influenceValue);
    }

    private refreshDistortionInfluenceValue(input: HTMLInputElement, value: HTMLElement): void {
        const percent = Math.round(this.mmdManager.dofLensDistortionInfluence * 100);
        input.disabled = this.mmdManager.isPlaying;
        input.value = String(percent);
        value.textContent = `${percent}%`;
        this.syncRangeNumberInput(input);
    }

    private refreshEdgeBlurValue(
        input: HTMLInputElement | null,
        value: HTMLElement | null,
    ): void {
        if (!input || !value) {
            return;
        }

        const percent = Math.round(this.mmdManager.dofLensEdgeBlur * 100);
        input.max = "300";
        input.disabled = this.mmdManager.isPlaying;
        input.value = String(percent);
        input.removeAttribute("title");
        value.textContent = `${percent}%`;
        value.removeAttribute("title");
        this.syncRangeNumberInput(input);
    }
}
