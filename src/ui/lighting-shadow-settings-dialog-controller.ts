import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type LightingShadowSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

function createRange(min: number, max: number, step: number, value: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "range";
    input.className = "popup-form-control popup-form-range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(Math.round(value));
    return input;
}

export class LightingShadowSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: LightingShadowSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const mode = document.createElement("select");
        mode.id = "light-shadow-mode";
        mode.className = "popup-form-control";
        [
            { value: "cascaded", label: t("dialog.lightShadow.modeCascaded"), disabled: !this.mmdManager.isCascadedShadowSupported() },
            { value: "standard", label: t("dialog.lightShadow.modeStandard"), disabled: false },
        ].forEach((entry) => {
            const option = document.createElement("option");
            option.value = entry.value;
            option.textContent = entry.label;
            option.disabled = entry.disabled;
            mode.appendChild(option);
        });
        mode.value = this.mmdManager.shadowMode === "standard" ? "standard" : "cascaded";
        if (mode.selectedOptions[0]?.disabled) {
            mode.value = "standard";
        }
        mode.addEventListener("change", () => {
            const nextMode = mode.value === "standard" ? "standard" : "cascaded";
            this.dispatchAction({ type: "effect.setShadowMode", source: "menu", mode: nextMode });
            mode.value = this.mmdManager.shadowMode === "standard" ? "standard" : "cascaded";
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("label.shadowMode"), mode));

        const quality = document.createElement("select");
        quality.className = "popup-form-control";
        [
            { value: 0, label: t("dialog.lightShadow.qualityHigh") },
            { value: 1, label: t("dialog.lightShadow.qualityMedium") },
            { value: 2, label: t("dialog.lightShadow.qualityLow") },
        ].forEach((entry) => {
            const option = document.createElement("option");
            option.value = String(entry.value);
            option.textContent = entry.label;
            quality.appendChild(option);
        });
        quality.value = String(this.mmdManager.shadowFilteringQuality);
        quality.addEventListener("change", () => {
            this.dispatchAction({ type: "effect.setShadowFilteringQuality", source: "menu", value: Number(quality.value) });
            quality.value = String(this.mmdManager.shadowFilteringQuality);
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("label.shadowQuality"), quality));

        const formatWideAreaShadowDistance = (multiplier: number): string => {
            const clampedMultiplier = Math.max(1, Math.min(10, Math.round(multiplier)));
            const effectiveDistance = Math.min(100_000, this.mmdManager.shadowMaxZ * clampedMultiplier);
            return `×${clampedMultiplier} (${Math.round(effectiveDistance)})`;
        };
        this.appendRange(
            grid,
            t("label.shadowDistanceMultiplier"),
            1,
            10,
            1,
            this.mmdManager.shadowDistanceMultiplier,
            formatWideAreaShadowDistance,
            (value) => {
                this.dispatchAction({ type: "effect.setShadowDistanceMultiplier", source: "menu", value });
                this.refreshUi();
                return `×${this.mmdManager.shadowDistanceMultiplier} (${Math.round(this.mmdManager.effectiveShadowMaxZ)})`;
            },
            "light-shadow-distance-multiplier",
        );

        this.appendRange(grid, t("label.shadowDarkness"), 0, 100, 1, this.mmdManager.shadowDarkness * 100, (value) => (value / 100).toFixed(2), (value) => {
            this.dispatchAction({ type: "effect.setShadowDarkness", source: "menu", value: value / 100 });
            this.refreshUi();
            return this.mmdManager.shadowDarkness.toFixed(2);
        });

        this.appendRange(grid, t("label.selfShadowEdge"), 5, 100, 1, this.mmdManager.selfShadowEdgeSoftness * 1000, (value) => (value / 1000).toFixed(3), (value) => {
            this.dispatchAction({ type: "effect.setSelfShadowSoftness", source: "menu", value: value / 1000 });
            this.refreshUi();
            return this.mmdManager.selfShadowEdgeSoftness.toFixed(3);
        });
        this.appendRange(grid, t("label.occlusionShadowEdge"), 5, 100, 1, this.mmdManager.occlusionShadowEdgeSoftness * 1000, (value) => (value / 1000).toFixed(3), (value) => {
            this.dispatchAction({ type: "effect.setOcclusionShadowSoftness", source: "menu", value: value / 1000 });
            this.refreshUi();
            return this.mmdManager.occlusionShadowEdgeSoftness.toFixed(3);
        });

        container.appendChild(form);
    }

    private appendRange(
        grid: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        initialValue: number,
        formatValue: (value: number) => string,
        applyValue: (value: number) => string,
        controlId?: string,
    ): void {
        const input = createRange(min, max, step, initialValue);
        if (controlId) input.id = controlId;
        const value = createPopupFormValueText(formatValue(Number(input.value)));
        if (controlId) value.id = `${controlId}-val`;
        input.addEventListener("input", () => {
            value.textContent = applyValue(Number(input.value));
        });
        grid.appendChild(createPopupFormField(label, createPopupFormRange(input, value), "div"));
    }
}
