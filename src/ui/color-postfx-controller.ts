import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ColorPostFxElements = {
    contrastInput: HTMLInputElement;
    contrastValue: HTMLElement;
    gammaInput: HTMLInputElement;
    gammaValue: HTMLElement;
    frameGraphContrastInput: HTMLInputElement | null;
    frameGraphContrastValue: HTMLElement | null;
    frameGraphGammaInput: HTMLInputElement | null;
    frameGraphGammaValue: HTMLElement | null;
    exposureInput: HTMLInputElement;
    exposureValue: HTMLElement;
    ditheringInput: HTMLInputElement;
    ditheringValue: HTMLElement;
    vignetteInput: HTMLInputElement;
    vignetteValue: HTMLElement;
    grainInput: HTMLInputElement;
    grainValue: HTMLElement;
    sharpenInput: HTMLInputElement;
    sharpenValue: HTMLElement;
    frameGraphGrainInput: HTMLInputElement | null;
    frameGraphGrainValue: HTMLElement | null;
    frameGraphSharpenInput: HTMLInputElement | null;
    frameGraphSharpenValue: HTMLElement | null;
    colorCurvesInput: HTMLInputElement;
    colorCurvesValue: HTMLElement;
};

export type ColorPostFxControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction?: (action: EditorAction) => boolean;
};

function queryRequired<T extends Element>(root: ParentNode, selector: string): T | null {
    return root.querySelector<T>(selector);
}

function resolveColorPostFxElements(root: ParentNode): ColorPostFxElements | null {
    const contrastInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="contrast"]');
    const contrastValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="contrast"]');
    const gammaInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="gamma"]');
    const gammaValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="gamma"]');
    const frameGraphContrastInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="frame-graph-contrast"]');
    const frameGraphContrastValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="frame-graph-contrast"]');
    const frameGraphGammaInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="frame-graph-gamma"]');
    const frameGraphGammaValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="frame-graph-gamma"]');
    const exposureInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="exposure"]');
    const exposureValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="exposure"]');
    const ditheringInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="dithering-intensity"]');
    const ditheringValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="dithering"]');
    const vignetteInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="vignette-weight"]');
    const vignetteValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="vignette"]');
    const grainInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="grain-intensity"]');
    const grainValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="grain-intensity"]');
    const sharpenInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="sharpen-edge"]');
    const sharpenValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="sharpen-edge"]');
    const frameGraphGrainInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="frame-graph-grain-intensity"]');
    const frameGraphGrainValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="frame-graph-grain-intensity"]');
    const frameGraphSharpenInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="frame-graph-sharpen-edge"]');
    const frameGraphSharpenValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="frame-graph-sharpen-edge"]');
    const colorCurvesInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="color-curves-saturation"]');
    const colorCurvesValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="color-curves-saturation"]');

    if (
        !contrastInput ||
        !contrastValue ||
        !gammaInput ||
        !gammaValue ||
        !exposureInput ||
        !exposureValue ||
        !ditheringInput ||
        !ditheringValue ||
        !vignetteInput ||
        !vignetteValue ||
        !grainInput ||
        !grainValue ||
        !sharpenInput ||
        !sharpenValue ||
        !colorCurvesInput ||
        !colorCurvesValue
    ) {
        return null;
    }

    return {
        contrastInput,
        contrastValue,
        gammaInput,
        gammaValue,
        frameGraphContrastInput,
        frameGraphContrastValue,
        frameGraphGammaInput,
        frameGraphGammaValue,
        exposureInput,
        exposureValue,
        ditheringInput,
        ditheringValue,
        vignetteInput,
        vignetteValue,
        grainInput,
        grainValue,
        sharpenInput,
        sharpenValue,
        frameGraphGrainInput,
        frameGraphGrainValue,
        frameGraphSharpenInput,
        frameGraphSharpenValue,
        colorCurvesInput,
        colorCurvesValue,
    };
}

export class ColorPostFxController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction?: (action: EditorAction) => boolean;
    private elements: ColorPostFxElements | null = null;

    constructor(deps: ColorPostFxControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
    }

    public connect(root: ParentNode): boolean {
        const elements = resolveColorPostFxElements(root);
        if (!elements) {
            return false;
        }
        this.elements = elements;

        const applyContrast = (input: HTMLInputElement): void => {
            const offsetPercent = Number(input.value);
            if (!this.dispatchAction?.({ type: "effect.setContrastOffset", source: "panel", offsetPercent })) {
                this.setContrastOffsetPercent(offsetPercent);
            }
        };

        const applyGamma = (input: HTMLInputElement): void => {
            const offsetPercent = Number(input.value);
            if (!this.dispatchAction?.({ type: "effect.setGammaOffset", source: "panel", offsetPercent })) {
                this.setGammaOffsetPercent(offsetPercent);
            }
        };

        const applyExposure = (): void => {
            const value = Number(elements.exposureInput.value);
            if (!this.dispatchAction?.({ type: "effect.setExposure", source: "panel", value })) {
                this.setExposure(value);
            }
        };

        const applyDithering = (): void => {
            const value = Number(elements.ditheringInput.value);
            if (!this.dispatchAction?.({ type: "effect.setDitheringIntensity", source: "panel", value })) {
                this.setDitheringIntensity(value);
            }
        };

        const applyVignette = (): void => {
            const value = Number(elements.vignetteInput.value);
            if (!this.dispatchAction?.({ type: "effect.setVignetteWeight", source: "panel", value })) {
                this.setVignetteWeight(value);
            }
        };

        const applyGrainIntensity = (): void => {
            const value = Number(elements.grainInput.value);
            if (!this.dispatchAction?.({ type: "effect.setGrainIntensity", source: "panel", value })) {
                this.setGrainIntensity(value);
            }
        };

        const applyFrameGraphGrainIntensity = (): void => {
            if (!elements.frameGraphGrainInput) {
                return;
            }
            const value = Number(elements.frameGraphGrainInput.value);
            if (!this.dispatchAction?.({ type: "effect.setGrainIntensity", source: "panel", value })) {
                this.setGrainIntensity(value);
            }
        };

        const applySharpenEdge = (): void => {
            const percent = Number(elements.sharpenInput.value);
            if (!this.dispatchAction?.({ type: "effect.setSharpenEdge", source: "panel", percent })) {
                this.setSharpenEdgePercent(percent);
            }
        };

        const applyFrameGraphSharpenEdge = (): void => {
            if (!elements.frameGraphSharpenInput) {
                return;
            }
            const percent = Number(elements.frameGraphSharpenInput.value);
            if (!this.dispatchAction?.({ type: "effect.setSharpenEdge", source: "panel", percent })) {
                this.setSharpenEdgePercent(percent);
            }
        };

        const applyColorCurves = (): void => {
            const value = Number(elements.colorCurvesInput.value);
            if (!this.dispatchAction?.({ type: "effect.setColorCurvesSaturation", source: "panel", value })) {
                this.setColorCurvesSaturation(value);
            }
        };

        elements.exposureInput.value = String(Math.max(0, Math.min(8, this.mmdManager.postEffectExposure)).toFixed(2));
        elements.ditheringInput.value = String(
            Math.max(0, Math.min(1, this.mmdManager.postEffectDitheringEnabled ? this.mmdManager.postEffectDitheringIntensity : 0)).toFixed(4),
        );
        elements.vignetteInput.value = String(
            Math.max(0, Math.min(4, this.mmdManager.postEffectVignetteEnabled ? this.mmdManager.postEffectVignetteWeight : 0)).toFixed(2),
        );
        elements.grainInput.value = String(
            Math.max(0, Math.min(100, Math.round(this.mmdManager.postEffectGrainIntensity))),
        );
        if (elements.frameGraphGrainInput) {
            elements.frameGraphGrainInput.value = elements.grainInput.value;
        }
        elements.sharpenInput.value = String(
            Math.max(0, Math.min(400, Math.round(this.mmdManager.postEffectSharpenEdge * 100))),
        );
        if (elements.frameGraphSharpenInput) {
            elements.frameGraphSharpenInput.value = elements.sharpenInput.value;
        }
        elements.colorCurvesInput.value = String(
            Math.max(
                -100,
                Math.min(100, Math.round(this.mmdManager.postEffectColorCurvesEnabled ? this.mmdManager.postEffectColorCurvesSaturation : 0)),
            ),
        );

        this.refreshContrastUi();
        this.refreshGammaUi();
        this.refreshExposureUi();
        this.refreshDitheringUi();
        this.refreshVignetteUi();
        this.refreshGrainUi();
        this.refreshSharpenUi();
        this.refreshColorCurvesUi();

        elements.contrastInput.addEventListener("input", () => applyContrast(elements.contrastInput));
        elements.gammaInput.addEventListener("input", () => applyGamma(elements.gammaInput));
        elements.frameGraphContrastInput?.addEventListener("input", () => {
            if (elements.frameGraphContrastInput) applyContrast(elements.frameGraphContrastInput);
        });
        elements.frameGraphGammaInput?.addEventListener("input", () => {
            if (elements.frameGraphGammaInput) applyGamma(elements.frameGraphGammaInput);
        });
        elements.exposureInput.addEventListener("input", applyExposure);
        elements.ditheringInput.addEventListener("input", applyDithering);
        elements.vignetteInput.addEventListener("input", applyVignette);
        elements.grainInput.addEventListener("input", applyGrainIntensity);
        elements.sharpenInput.addEventListener("input", applySharpenEdge);
        elements.frameGraphGrainInput?.addEventListener("input", applyFrameGraphGrainIntensity);
        elements.frameGraphSharpenInput?.addEventListener("input", applyFrameGraphSharpenEdge);
        elements.colorCurvesInput.addEventListener("input", applyColorCurves);

        return true;
    }

    public setContrastOffsetPercent(offsetPercent: number): void {
        this.mmdManager.postEffectContrast = 1 + offsetPercent / 100;
        this.refreshContrastUi();
    }

    public setGammaOffsetPercent(offsetPercent: number): void {
        this.mmdManager.postEffectGamma = Math.pow(2, -offsetPercent / 100);
        this.refreshGammaUi();
    }

    public setExposure(value: number): void {
        this.mmdManager.postEffectExposure = value;
        this.refreshExposureUi();
    }

    public setDitheringIntensity(value: number): void {
        this.mmdManager.postEffectDitheringIntensity = value;
        this.mmdManager.postEffectDitheringEnabled = this.mmdManager.postEffectDitheringIntensity > 0.000001;
        this.refreshDitheringUi();
    }

    public setVignetteWeight(value: number): void {
        this.mmdManager.postEffectVignetteWeight = value;
        this.mmdManager.postEffectVignetteEnabled = this.mmdManager.postEffectVignetteWeight > 0.000001;
        this.refreshVignetteUi();
    }

    public setGrainIntensity(value: number): void {
        this.mmdManager.postEffectGrainIntensity = value;
        this.refreshGrainUi();
    }

    public setSharpenEdgePercent(percent: number): void {
        this.mmdManager.postEffectSharpenEdge = percent / 100;
        this.refreshSharpenUi();
    }

    public setColorCurvesSaturation(value: number): void {
        this.mmdManager.postEffectColorCurvesHue = 30;
        this.mmdManager.postEffectColorCurvesDensity = 0;
        this.mmdManager.postEffectColorCurvesSaturation = value;
        this.mmdManager.postEffectColorCurvesExposure = 0;
        this.mmdManager.postEffectColorCurvesEnabled = Math.abs(this.mmdManager.postEffectColorCurvesSaturation) > 0.000001;
        this.refreshColorCurvesUi();
    }

    private refreshContrastUi(): void {
        const elements = this.elements;
        if (!elements) return;
        const roundedOffset = Math.round((this.mmdManager.postEffectContrast - 1) * 100);
        const value = String(roundedOffset);
        elements.contrastInput.value = value;
        elements.contrastValue.textContent = `${roundedOffset}%`;
        if (elements.frameGraphContrastInput && elements.frameGraphContrastValue) {
            elements.frameGraphContrastInput.value = value;
            elements.frameGraphContrastValue.textContent = `${roundedOffset}%`;
        }
    }

    public refreshGammaUi(): void {
        const elements = this.elements;
        if (!elements) return;
        const roundedOffset = Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100);
        const value = String(roundedOffset);
        elements.gammaInput.disabled = this.mmdManager.isPlaying;
        elements.gammaInput.value = value;
        elements.gammaValue.textContent = `${roundedOffset}%`;
        if (elements.frameGraphGammaInput && elements.frameGraphGammaValue) {
            elements.frameGraphGammaInput.disabled = this.mmdManager.isPlaying;
            elements.frameGraphGammaInput.value = value;
            elements.frameGraphGammaValue.textContent = `${roundedOffset}%`;
        }
    }

    private refreshExposureUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.exposureInput.value = String(Math.max(0, Math.min(8, this.mmdManager.postEffectExposure)).toFixed(2));
        elements.exposureValue.textContent = `x${this.mmdManager.postEffectExposure.toFixed(2)}`;
    }

    private refreshDitheringUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.ditheringInput.value = String(
            Math.max(0, Math.min(1, this.mmdManager.postEffectDitheringEnabled ? this.mmdManager.postEffectDitheringIntensity : 0)).toFixed(4),
        );
        const effectivePercent = this.mmdManager.postEffectDitheringIntensity * 100;
        elements.ditheringValue.textContent = this.mmdManager.postEffectDitheringEnabled
            ? `${effectivePercent.toFixed(2)}%`
            : t("status.off");
    }

    private refreshVignetteUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.vignetteInput.value = String(
            Math.max(0, Math.min(4, this.mmdManager.postEffectVignetteEnabled ? this.mmdManager.postEffectVignetteWeight : 0)).toFixed(2),
        );
        elements.vignetteValue.textContent = this.mmdManager.postEffectVignetteEnabled
            ? this.mmdManager.postEffectVignetteWeight.toFixed(2)
            : t("status.off");
    }

    public refreshGrainUi(): void {
        const elements = this.elements;
        if (!elements) return;
        const value = String(Math.max(0, Math.min(100, Math.round(this.mmdManager.postEffectGrainIntensity))));
        const label = this.mmdManager.postEffectGrainIntensity > 0.000001
            ? this.mmdManager.postEffectGrainIntensity.toFixed(1)
            : t("status.off");
        elements.grainInput.disabled = this.mmdManager.isPlaying;
        elements.grainInput.value = value;
        elements.grainValue.textContent = label;
        if (elements.frameGraphGrainInput && elements.frameGraphGrainValue) {
            elements.frameGraphGrainInput.disabled = this.mmdManager.isPlaying;
            elements.frameGraphGrainInput.value = value;
            elements.frameGraphGrainValue.textContent = label;
        }
    }

    private refreshSharpenUi(): void {
        const elements = this.elements;
        if (!elements) return;
        const value = String(Math.max(0, Math.min(400, Math.round(this.mmdManager.postEffectSharpenEdge * 100))));
        const label = this.mmdManager.postEffectSharpenEdge > 0.000001
            ? this.mmdManager.postEffectSharpenEdge.toFixed(2)
            : t("status.off");
        elements.sharpenInput.value = value;
        elements.sharpenValue.textContent = label;
        if (elements.frameGraphSharpenInput && elements.frameGraphSharpenValue) {
            elements.frameGraphSharpenInput.value = value;
            elements.frameGraphSharpenValue.textContent = label;
        }
    }

    private refreshColorCurvesUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.colorCurvesInput.value = String(
            Math.max(
                -100,
                Math.min(100, Math.round(this.mmdManager.postEffectColorCurvesEnabled ? this.mmdManager.postEffectColorCurvesSaturation : 0)),
            ),
        );
        elements.colorCurvesValue.textContent = this.mmdManager.postEffectColorCurvesEnabled
            ? `${Math.round(this.mmdManager.postEffectColorCurvesSaturation)}`
            : t("status.off");
    }
}
