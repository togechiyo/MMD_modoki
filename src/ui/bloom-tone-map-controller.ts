import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";

const LUMINOUS_GLOW_DEFAULT_KERNEL = 20;
const LUMINOUS_GLOW_SLIDER_MAX = 400;

type BloomToneMapElements = {
    toneMappingTypeSelect: HTMLSelectElement;
    toneMappingValue: HTMLElement;
    bloomEnabledInput: HTMLInputElement;
    bloomEnabledValue: HTMLElement;
    bloomWeightInput: HTMLInputElement;
    bloomWeightValue: HTMLElement;
    bloomThresholdInput: HTMLInputElement;
    bloomThresholdValue: HTMLElement;
    bloomKernelInput: HTMLInputElement;
    bloomKernelValue: HTMLElement;
    frameGraphBloomEnabledInput: HTMLInputElement | null;
    frameGraphBloomEnabledValue: HTMLElement | null;
    frameGraphBloomWeightInput: HTMLInputElement | null;
    frameGraphBloomWeightValue: HTMLElement | null;
    frameGraphBloomThresholdInput: HTMLInputElement | null;
    frameGraphBloomThresholdValue: HTMLElement | null;
    frameGraphBloomKernelInput: HTMLInputElement | null;
    frameGraphBloomKernelValue: HTMLElement | null;
    glowIntensityInput: HTMLInputElement;
    glowIntensityValue: HTMLElement;
};

export type BloomToneMapControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction?: (action: EditorAction) => boolean;
};

function queryPanelElements(root: ParentNode): BloomToneMapElements | null {
    const toneMappingTypeSelect = root.querySelector<HTMLSelectElement>('select[data-postfx-select="tone-mapping-type"]');
    const toneMappingValue = root.querySelector<HTMLElement>('span[data-postfx-val="tone-mapping"]');
    const bloomEnabledInput = root.querySelector<HTMLInputElement>('input[data-postfx-check="bloom"]');
    const bloomEnabledValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-enabled"]');
    const bloomWeightInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-weight"]');
    const bloomWeightValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-weight"]');
    const bloomThresholdInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-threshold"]');
    const bloomThresholdValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-threshold"]');
    const bloomKernelInput = root.querySelector<HTMLInputElement>('input[data-postfx="bloom-kernel"]');
    const bloomKernelValue = root.querySelector<HTMLElement>('span[data-postfx-val="bloom-kernel"]');
    const frameGraphBloomEnabledInput = root.querySelector<HTMLInputElement>('input[data-postfx-check="frame-graph-bloom"]');
    const frameGraphBloomEnabledValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-bloom-enabled"]');
    const frameGraphBloomWeightInput = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-bloom-weight"]');
    const frameGraphBloomWeightValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-bloom-weight"]');
    const frameGraphBloomThresholdInput = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-bloom-threshold"]');
    const frameGraphBloomThresholdValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-bloom-threshold"]');
    const frameGraphBloomKernelInput = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-bloom-kernel"]');
    const frameGraphBloomKernelValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-bloom-kernel"]');
    const glowIntensityInput = root.querySelector<HTMLInputElement>('input[data-postfx="glow-intensity"]');
    const glowIntensityValue = root.querySelector<HTMLElement>('span[data-postfx-val="glow-intensity"]');

    if (
        !toneMappingTypeSelect ||
        !toneMappingValue ||
        !bloomEnabledInput ||
        !bloomEnabledValue ||
        !bloomWeightInput ||
        !bloomWeightValue ||
        !bloomThresholdInput ||
        !bloomThresholdValue ||
        !bloomKernelInput ||
        !bloomKernelValue ||
        !glowIntensityInput ||
        !glowIntensityValue
    ) {
        return null;
    }

    return {
        toneMappingTypeSelect,
        toneMappingValue,
        bloomEnabledInput,
        bloomEnabledValue,
        bloomWeightInput,
        bloomWeightValue,
        bloomThresholdInput,
        bloomThresholdValue,
        bloomKernelInput,
        bloomKernelValue,
        frameGraphBloomEnabledInput,
        frameGraphBloomEnabledValue,
        frameGraphBloomWeightInput,
        frameGraphBloomWeightValue,
        frameGraphBloomThresholdInput,
        frameGraphBloomThresholdValue,
        frameGraphBloomKernelInput,
        frameGraphBloomKernelValue,
        glowIntensityInput,
        glowIntensityValue,
    };
}

function toneMapTypeToLabel(value: number): string {
    switch (value) {
        case 1:
            return t("shader.option.aces");
        case 2:
            return t("shader.option.neutral");
        default:
            return t("shader.option.standard");
    }
}

export class BloomToneMapController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction?: (action: EditorAction) => boolean;
    private elements: BloomToneMapElements | null = null;

    constructor(deps: BloomToneMapControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
    }

    public connect(root: ParentNode): boolean {
        const elements = queryPanelElements(root);
        if (!elements) {
            return false;
        }
        this.elements = elements;

        const applyToneMapping = (): void => {
            const selected = Number(elements.toneMappingTypeSelect.value);
            if (!this.dispatchAction?.({ type: "effect.setToneMappingType", source: "panel", value: selected })) {
                this.setToneMappingType(selected);
            }
        };

        const applyBloom = (
            enabledInput: HTMLInputElement,
            weightInput: HTMLInputElement,
            thresholdInput: HTMLInputElement,
            kernelInput: HTMLInputElement,
            changed: EventTarget | null,
        ): void => {
            const action = {
                type: "effect.setBloom" as const,
                source: "panel" as const,
                enabled: changed === enabledInput ? enabledInput.checked : this.mmdManager.postEffectBloomEnabled,
                weightPercent: changed === weightInput ? Number(weightInput.value) : this.mmdManager.postEffectBloomWeight * 100,
                thresholdSlider: changed === thresholdInput ? Number(thresholdInput.value) : (2 - this.mmdManager.postEffectBloomThreshold) * 100,
                kernel: changed === kernelInput ? Number(kernelInput.value) : this.mmdManager.postEffectBloomKernel,
            };
            if (!this.dispatchAction?.(action)) {
                this.setBloom(action.enabled, action.weightPercent, action.thresholdSlider, action.kernel);
            }
        };

        const applyGlow = (): void => {
            const percent = Number(elements.glowIntensityInput.value);
            if (!this.dispatchAction?.({ type: "effect.setGlowIntensity", source: "panel", percent })) {
                this.setGlowIntensityPercent(percent);
            }
        };

        elements.toneMappingTypeSelect.value = this.mmdManager.postEffectToneMappingEnabled
            ? String(this.mmdManager.postEffectToneMappingType)
            : "-1";
        elements.glowIntensityInput.max = "400";
        elements.glowIntensityInput.disabled = this.mmdManager.isPlaying;
        elements.glowIntensityInput.value = String(
            Math.max(
                0,
                Math.min(
                    LUMINOUS_GLOW_SLIDER_MAX,
                    Math.round((this.mmdManager.hasEffectSceneTrack("luminous") || this.mmdManager.postEffectGlowEnabled ? this.mmdManager.postEffectGlowIntensity : 0) * 100),
                ),
            ),
        );

        applyToneMapping();
        this.refreshBloomUi();
        this.refreshGlowUi();

        elements.toneMappingTypeSelect.addEventListener("change", applyToneMapping);
        elements.bloomEnabledInput.addEventListener("input", (event) => applyBloom(
            elements.bloomEnabledInput,
            elements.bloomWeightInput,
            elements.bloomThresholdInput,
            elements.bloomKernelInput,
            event.target,
        ));
        elements.bloomWeightInput.addEventListener("input", (event) => applyBloom(
            elements.bloomEnabledInput,
            elements.bloomWeightInput,
            elements.bloomThresholdInput,
            elements.bloomKernelInput,
            event.target,
        ));
        elements.bloomThresholdInput.addEventListener("input", (event) => applyBloom(
            elements.bloomEnabledInput,
            elements.bloomWeightInput,
            elements.bloomThresholdInput,
            elements.bloomKernelInput,
            event.target,
        ));
        elements.bloomKernelInput.addEventListener("input", (event) => applyBloom(
            elements.bloomEnabledInput,
            elements.bloomWeightInput,
            elements.bloomThresholdInput,
            elements.bloomKernelInput,
            event.target,
        ));
        if (
            elements.frameGraphBloomEnabledInput &&
            elements.frameGraphBloomWeightInput &&
            elements.frameGraphBloomThresholdInput &&
            elements.frameGraphBloomKernelInput
        ) {
            const applyFrameGraphBloom = (event: Event): void => applyBloom(
                elements.frameGraphBloomEnabledInput as HTMLInputElement,
                elements.frameGraphBloomWeightInput as HTMLInputElement,
                elements.frameGraphBloomThresholdInput as HTMLInputElement,
                elements.frameGraphBloomKernelInput as HTMLInputElement,
                event.target,
            );
            elements.frameGraphBloomEnabledInput.addEventListener("input", applyFrameGraphBloom);
            elements.frameGraphBloomWeightInput.addEventListener("input", applyFrameGraphBloom);
            elements.frameGraphBloomThresholdInput.addEventListener("input", applyFrameGraphBloom);
            elements.frameGraphBloomKernelInput.addEventListener("input", applyFrameGraphBloom);
        }
        elements.glowIntensityInput.addEventListener("input", applyGlow);
        return true;
    }

    public setToneMappingType(value: number): void {
        const enabled = value >= 0;
        this.mmdManager.postEffectToneMappingEnabled = enabled;
        if (enabled) {
            this.mmdManager.postEffectToneMappingType = value;
        }
        this.refreshToneMappingUi();
    }

    public setBloom(enabled: boolean, weightPercent: number, thresholdSlider: number, kernel: number): void {
        // The classic threshold slider is inverted; keyframes contain actual values.
        if (this.mmdManager.hasEffectSceneTrack("bloom")) {
            this.mmdManager.setEffectScenePreview("bloom", { enabled, weight: weightPercent / 100, threshold: 2 - thresholdSlider / 100 });
        } else {
            this.mmdManager.postEffectBloomEnabled = enabled;
            this.mmdManager.postEffectBloomWeight = weightPercent / 100;
            this.mmdManager.postEffectBloomThreshold = 2 - thresholdSlider / 100;
        }
        if (this.mmdManager.postEffectBloomKernel !== kernel) this.mmdManager.postEffectBloomKernel = kernel;
        this.refreshBloomUi();
    }

    public setGlowIntensityPercent(percent: number): void {
        this.mmdManager.postEffectGlowIntensity = Math.max(0, Math.min(4, percent / 100));
        if (!this.mmdManager.hasEffectSceneTrack("luminous")) {
            this.mmdManager.postEffectGlowKernel = LUMINOUS_GLOW_DEFAULT_KERNEL;
            this.mmdManager.postEffectGlowEnabled = this.mmdManager.postEffectGlowIntensity > 0.000001;
        }
        this.refreshGlowUi();
    }

    private refreshToneMappingUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.toneMappingTypeSelect.value = this.mmdManager.postEffectToneMappingEnabled
            ? String(this.mmdManager.postEffectToneMappingType)
            : "-1";
        elements.toneMappingValue.textContent = this.mmdManager.postEffectToneMappingEnabled
            ? toneMapTypeToLabel(this.mmdManager.postEffectToneMappingType)
            : t("option.none");
    }

    public refreshBloomUi(): void {
        const elements = this.elements;
        if (!elements) return;
        const enabled = this.mmdManager.postEffectBloomEnabled;
        const weightText = enabled
            ? `${Math.round(this.mmdManager.postEffectBloomWeight * 100)}%`
            : t("status.off");
        const thresholdText = this.mmdManager.postEffectBloomThreshold.toFixed(2);
        const kernelText = String(Math.round(this.mmdManager.postEffectBloomKernel));

        const syncGroup = (
            enabledInput: HTMLInputElement | null,
            enabledValue: HTMLElement | null,
            weightInput: HTMLInputElement | null,
            weightValue: HTMLElement | null,
            thresholdInput: HTMLInputElement | null,
            thresholdValue: HTMLElement | null,
            kernelInput: HTMLInputElement | null,
            kernelValue: HTMLElement | null,
        ): void => {
            if (
                !enabledInput ||
                !enabledValue ||
                !weightInput ||
                !weightValue ||
                !thresholdInput ||
                !thresholdValue ||
                !kernelInput ||
                !kernelValue
            ) {
                return;
            }
            enabledInput.checked = enabled;
            enabledValue.textContent = enabled ? t("status.on") : t("status.off");
            weightInput.value = String(Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectBloomWeight * 100))));
            thresholdInput.value = String(Math.max(0, Math.min(200, Math.round((2 - this.mmdManager.postEffectBloomThreshold) * 100))));
            kernelInput.value = String(Math.max(1, Math.min(256, Math.round(this.mmdManager.postEffectBloomKernel))));
            enabledInput.disabled = this.mmdManager.isPlaying;
            const locked = this.mmdManager.isPlaying || (!enabled && !this.mmdManager.hasEffectSceneTrack("bloom"));
            weightInput.disabled = locked;
            thresholdInput.disabled = locked;
            kernelInput.disabled = !enabled || this.mmdManager.isPlaying;
            weightValue.textContent = weightText;
            thresholdValue.textContent = thresholdText;
            kernelValue.textContent = kernelText;
        };

        syncGroup(
            elements.bloomEnabledInput,
            elements.bloomEnabledValue,
            elements.bloomWeightInput,
            elements.bloomWeightValue,
            elements.bloomThresholdInput,
            elements.bloomThresholdValue,
            elements.bloomKernelInput,
            elements.bloomKernelValue,
        );
        syncGroup(
            elements.frameGraphBloomEnabledInput,
            elements.frameGraphBloomEnabledValue,
            elements.frameGraphBloomWeightInput,
            elements.frameGraphBloomWeightValue,
            elements.frameGraphBloomThresholdInput,
            elements.frameGraphBloomThresholdValue,
            elements.frameGraphBloomKernelInput,
            elements.frameGraphBloomKernelValue,
        );
    }

    public refreshGlowUi(): void {
        const elements = this.elements;
        if (!elements) return;
        elements.glowIntensityInput.max = "400";
        elements.glowIntensityInput.disabled = this.mmdManager.isPlaying;
        elements.glowIntensityInput.value = String(
            Math.max(
                0,
                Math.min(
                    LUMINOUS_GLOW_SLIDER_MAX,
                    Math.round((this.mmdManager.hasEffectSceneTrack("luminous") || this.mmdManager.postEffectGlowEnabled ? this.mmdManager.postEffectGlowIntensity : 0) * 100),
                ),
            ),
        );
        elements.glowIntensityValue.textContent = this.mmdManager.postEffectGlowEnabled
            ? this.mmdManager.postEffectGlowIntensity.toFixed(2)
            : t("status.off");
    }
}
