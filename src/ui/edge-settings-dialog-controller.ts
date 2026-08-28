import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type EdgeSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

export class EdgeSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: EdgeSettingsDialogControllerDeps) {
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

        const uniformWidth = document.createElement("input");
        uniformWidth.type = "checkbox";
        uniformWidth.className = "popup-form-checkbox";
        uniformWidth.dataset.edgeUniformWidth = "true";
        uniformWidth.checked = this.mmdManager.modelEdgeUniformWidthEnabled;
        uniformWidth.addEventListener("change", () => {
            this.dispatchAction({
                type: "effect.setModelEdgeUniformWidth",
                source: "menu",
                enabled: uniformWidth.checked,
            });
            uniformWidth.checked = this.mmdManager.modelEdgeUniformWidthEnabled;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.uniformWidth"), uniformWidth));

        const width = document.createElement("input");
        width.type = "range";
        width.className = "popup-form-control popup-form-range";
        width.min = "0";
        width.max = "200";
        width.step = "1";
        width.value = String(Math.round(this.mmdManager.modelEdgeWidth * 100));

        const widthValue = createPopupFormValueText(`${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`);
        width.addEventListener("input", () => {
            const percent = Number(width.value);
            this.dispatchAction({ type: "effect.setModelEdgeWidth", source: "menu", percent });
            widthValue.textContent = `${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.width"), createPopupFormRange(width, widthValue), "div"));

        const colorOverride = document.createElement("input");
        colorOverride.type = "checkbox";
        colorOverride.className = "popup-form-checkbox";
        colorOverride.checked = this.mmdManager.modelEdgeColorOverrideEnabled;
        colorOverride.addEventListener("change", () => {
            this.dispatchAction({
                type: "effect.setModelEdgeColorOverride",
                source: "menu",
                enabled: colorOverride.checked,
            });
            colorOverride.checked = this.mmdManager.modelEdgeColorOverrideEnabled;
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.colorOverride"), colorOverride));

        const color = document.createElement("input");
        color.type = "color";
        color.className = "popup-form-control";
        color.value = rgbToHex(this.mmdManager.getModelEdgeColor());
        color.addEventListener("input", () => {
            const next = hexToRgb(color.value);
            this.dispatchAction({
                type: "effect.setModelEdgeColor",
                source: "menu",
                r: next.r,
                g: next.g,
                b: next.b,
            });
            this.refreshUi();
        });
        grid.appendChild(createPopupFormField(t("dialog.edge.color"), color));

        container.appendChild(form);
    }
}

function rgbToHex(color: { r: number; g: number; b: number }): string {
    const toHex = (value: number): string => {
        const byte = Math.max(0, Math.min(255, Math.round(value * 255)));
        return byte.toString(16).padStart(2, "0");
    };
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value.slice(1) : "000000";
    const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
    const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
    const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
    return { r, g, b };
}
