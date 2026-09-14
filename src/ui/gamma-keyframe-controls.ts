import type { GammaSceneValue } from "../editor/gamma-scene-track";

/** Controls for the selected camera-mode gamma row; rendering and key edits remain outside the view. */
export class GammaKeyframeControls {
    private readonly enabled: HTMLInputElement;
    private readonly slider: HTMLInputElement;
    private readonly value: HTMLOutputElement;

    constructor(private readonly root: HTMLElement, preview: (value: GammaSceneValue) => void) {
        const enabled = root.querySelector<HTMLInputElement>("#gamma-key-enabled");
        const slider = root.querySelector<HTMLInputElement>("#gamma-key-value");
        const value = root.querySelector<HTMLOutputElement>("output");
        if (!enabled || !slider || !value) throw new Error("Gamma key controls are missing");
        this.enabled = enabled;
        this.slider = slider;
        this.value = value;
        const change = (): void => {
            if (this.slider.disabled) return;
            this.value.value = `${this.slider.value}%`;
            preview({ enabled: this.enabled.checked, gamma: Math.pow(2, -Number(this.slider.value) / 100) });
        };
        this.enabled.addEventListener("change", change);
        this.slider.addEventListener("input", change);
    }

    refresh(selected: boolean, playing: boolean, value: GammaSceneValue): void {
        this.root.hidden = !selected;
        this.enabled.disabled = playing;
        this.slider.disabled = playing;
        this.enabled.checked = value.enabled;
        const offset = Math.round(-Math.log2(value.gamma) * 100);
        this.slider.value = String(offset);
        this.value.value = `${offset}%`;
    }
}
