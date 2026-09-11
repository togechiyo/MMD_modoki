import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

type ExperimentalPostFxElements = {
    motionBlurStrengthInput: HTMLInputElement;
    motionBlurStrengthValue: HTMLElement;
    ssrStrengthInput: HTMLInputElement;
    ssrStrengthValue: HTMLElement;
    vlsExposureInput: HTMLInputElement;
    vlsExposureValue: HTMLElement;
};

export type ExperimentalPostFxControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction?: (action: EditorAction) => boolean;
};

function queryPanelElements(root: ParentNode): ExperimentalPostFxElements | null {
    const motionBlurStrengthInput = root.querySelector<HTMLInputElement>('input[data-postfx="motion-blur-strength"]');
    const motionBlurStrengthValue = root.querySelector<HTMLElement>('span[data-postfx-val="motion-blur-strength"]');
    const ssrStrengthInput = root.querySelector<HTMLInputElement>('input[data-postfx="ssr-strength"]');
    const ssrStrengthValue = root.querySelector<HTMLElement>('span[data-postfx-val="ssr-strength"]');
    const vlsExposureInput = root.querySelector<HTMLInputElement>('input[data-postfx="vls-exposure"]');
    const vlsExposureValue = root.querySelector<HTMLElement>('span[data-postfx-val="vls-exposure"]');

    if (
        !motionBlurStrengthInput ||
        !motionBlurStrengthValue ||
        !ssrStrengthInput ||
        !ssrStrengthValue ||
        !vlsExposureInput ||
        !vlsExposureValue
    ) {
        return null;
    }

    return {
        motionBlurStrengthInput,
        motionBlurStrengthValue,
        ssrStrengthInput,
        ssrStrengthValue,
        vlsExposureInput,
        vlsExposureValue,
    };
}

export class ExperimentalPostFxController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction?: (action: EditorAction) => boolean;
    private elements: ExperimentalPostFxElements | null = null;

    constructor(deps: ExperimentalPostFxControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }
        this.elements = elements;

        const applyMotionBlur = (): void => {
            const percent = Number(elements.motionBlurStrengthInput.value);
            if (!this.dispatchAction?.({ type: "effect.setMotionBlurStrength", source: "panel", percent })) {
                this.setMotionBlurStrengthPercent(percent);
            }
        };

        const applySsr = (): void => {
            const percent = Number(elements.ssrStrengthInput.value);
            if (!this.dispatchAction?.({ type: "effect.setSsrStrength", source: "panel", percent })) {
                this.setSsrStrengthPercent(percent);
            }
        };

        const applyVls = (): void => {
            const percent = Number(elements.vlsExposureInput.value);
            if (!this.dispatchAction?.({ type: "effect.setVlsExposure", source: "panel", percent })) {
                this.setVlsExposurePercent(percent);
            }
        };

        this.disableSsao();

        elements.motionBlurStrengthInput.value = String(
            Math.max(
                0,
                Math.min(
                    200,
                    Math.round((this.mmdManager.postEffectMotionBlurEnabled ? this.mmdManager.postEffectMotionBlurStrength : 0) * 100),
                ),
            ),
        );
        elements.ssrStrengthInput.value = String(
            Math.max(0, Math.min(200, Math.round((this.mmdManager.postEffectSsrEnabled ? this.mmdManager.postEffectSsrStrength : 0) * 100))),
        );
        elements.vlsExposureInput.value = String(
            Math.max(0, Math.min(200, Math.round((this.mmdManager.postEffectVlsEnabled ? this.mmdManager.postEffectVlsExposure : 0) * 100))),
        );

        // Rebuilding the panel reflects runtime state; it must not replay edits or
        // replace saved sample counts/disabled-effect parameters with defaults.
        elements.motionBlurStrengthValue.textContent = this.mmdManager.postEffectMotionBlurEnabled
            ? this.mmdManager.postEffectMotionBlurStrength.toFixed(2) : t("status.off");
        elements.ssrStrengthValue.textContent = this.mmdManager.postEffectSsrEnabled
            ? this.mmdManager.postEffectSsrStrength.toFixed(2) : t("status.off");
        elements.vlsExposureValue.textContent = this.mmdManager.postEffectVlsEnabled
            ? this.mmdManager.postEffectVlsExposure.toFixed(2) : t("status.off");
        if (this.mmdManager.getPostEffectBackend() !== "frameGraph") {
            this.setSsrStrengthPercent(0);
        }

        elements.motionBlurStrengthInput.addEventListener("input", applyMotionBlur);
        elements.ssrStrengthInput.addEventListener("input", applySsr);
        elements.vlsExposureInput.addEventListener("input", applyVls);
        return true;
    }

    public setMotionBlurStrengthPercent(percent: number): void {
        const elements = this.elements;
        if (!elements) return;
        this.mmdManager.postEffectMotionBlurStrength = percent / 100;
        this.mmdManager.postEffectMotionBlurSamples = 32;
        this.mmdManager.postEffectMotionBlurEnabled = this.mmdManager.postEffectMotionBlurStrength > 0.000001;
        elements.motionBlurStrengthInput.value = String(Math.max(0, Math.min(200, Math.round(percent))));
        elements.motionBlurStrengthValue.textContent = this.mmdManager.postEffectMotionBlurEnabled
            ? this.mmdManager.postEffectMotionBlurStrength.toFixed(2)
            : t("status.off");
    }

    public setSsrStrengthPercent(percent: number): void {
        const elements = this.elements;
        if (!elements) return;
        if (this.mmdManager.getPostEffectBackend() === "frameGraph") {
            this.mmdManager.postEffectSsrStrength = percent / 100;
            this.mmdManager.postEffectSsrEnabled = this.mmdManager.postEffectSsrStrength > 0.000001;
            elements.ssrStrengthInput.value = String(Math.max(0, Math.min(200, Math.round(percent))));
            elements.ssrStrengthValue.textContent = this.mmdManager.postEffectSsrEnabled
                ? this.mmdManager.postEffectSsrStrength.toFixed(2)
                : t("status.off");
            return;
        }
        this.mmdManager.postEffectSsrStrength = 0;
        this.mmdManager.postEffectSsrStep = 1;
        this.mmdManager.postEffectSsrEnabled = false;
        elements.ssrStrengthInput.value = "0";
        elements.ssrStrengthValue.textContent = t("status.off");
    }

    public setVlsExposurePercent(percent: number): void {
        const elements = this.elements;
        if (!elements) return;
        this.mmdManager.postEffectVlsExposure = percent / 100;
        this.mmdManager.postEffectVlsDecay = 0.95;
        this.mmdManager.postEffectVlsWeight = 0.4;
        this.mmdManager.postEffectVlsDensity = 0.9;
        this.mmdManager.postEffectVlsEnabled = this.mmdManager.postEffectVlsExposure > 0.000001;
        elements.vlsExposureInput.value = String(Math.max(0, Math.min(200, Math.round(percent))));
        elements.vlsExposureValue.textContent = this.mmdManager.postEffectVlsEnabled
            ? this.mmdManager.postEffectVlsExposure.toFixed(2)
            : t("status.off");
    }

    private disableSsao(): void {
        if (this.mmdManager.getPostEffectBackend() === "frameGraph") {
            return;
        }
        this.mmdManager.postEffectSsaoStrength = 0;
        this.mmdManager.postEffectSsaoRadius = 2;
        this.mmdManager.postEffectSsaoFadeEnd = 200;
        this.mmdManager.postEffectSsaoEnabled = false;
    }
}
