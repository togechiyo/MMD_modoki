import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import {
    cloneWaterSurfaceSettings,
    DEFAULT_WATER_SURFACE_SETTINGS,
    type WaterSurfaceSettings,
} from "../scene/water-surface-settings";
import { colorToHex, hexToColor } from "../shared/skydome-background-style";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

export type WaterSurfaceSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    refreshUi: () => void;
};

function createRange(min: number, max: number, step: number, field: keyof WaterSurfaceSettings): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "range";
    input.className = "popup-form-control popup-form-range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.waterSurfaceField = field;
    return input;
}

export class WaterSurfaceSettingsDialogController implements PopupContentController {
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly refreshUi: () => void;

    constructor(deps: WaterSurfaceSettingsDialogControllerDeps) {
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

        this.appendRange(grid, "size", t("dialog.waterSurface.size"), 1, 500, 1, (value) => `${Math.round(value)}m`);
        this.appendRange(grid, "height", t("dialog.waterSurface.height"), -2000, 2000, 1, (value) => `${(value / 100).toFixed(2)}m`, 100);

        const resolution = document.createElement("select");
        resolution.className = "popup-form-control";
        resolution.dataset.waterSurfaceField = "resolution";
        [256, 512, 1024, 2048].forEach((value) => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            resolution.appendChild(option);
        });
        resolution.value = String(this.mmdManager.getWaterSurfaceSettings().resolution);
        resolution.addEventListener("change", () => {
            this.apply({ resolution: Number(resolution.value) });
            resolution.value = String(this.mmdManager.getWaterSurfaceSettings().resolution);
        });
        grid.appendChild(createPopupFormField(t("dialog.waterSurface.resolution"), resolution));

        this.appendRange(grid, "windForce", t("dialog.waterSurface.windForce"), 0, 200, 1, (value) => value.toFixed(1), 10);
        this.appendRange(grid, "windDirectionDegrees", t("dialog.waterSurface.windDirection"), 0, 359, 1, (value) => `${Math.round(value)}°`);
        this.appendRange(grid, "waveHeight", t("dialog.waterSurface.waveHeight"), 0, 100, 1, (value) => value.toFixed(2), 100);
        this.appendRange(grid, "bumpHeight", t("dialog.waterSurface.bumpHeight"), 0, 200, 1, (value) => value.toFixed(2), 100);
        this.appendRange(grid, "waveLength", t("dialog.waterSurface.waveLength"), 1, 200, 1, (value) => value.toFixed(2), 100);
        this.appendRange(grid, "waveSpeed", t("dialog.waterSurface.waveSpeed"), 0, 300, 1, (value) => value.toFixed(2), 100);
        this.appendRange(grid, "waveCount", t("dialog.waterSurface.waveCount"), 1, 64, 1, (value) => String(Math.round(value)));
        this.appendRange(grid, "bumpTextureScale", t("dialog.waterSurface.bumpTextureScale"), 1, 32, 1, (value) => `${Math.round(value)}x`);
        this.appendColor(grid, "waterColor", t("dialog.waterSurface.waterColor"));
        this.appendRange(grid, "colorBlendFactor", t("dialog.waterSurface.colorBlendFactor"), 0, 100, 1, (value) => `${Math.round(value * 100)}%`, 100);
        this.appendColor(grid, "waterColor2", t("dialog.waterSurface.waterColor2"));
        this.appendRange(grid, "colorBlendFactor2", t("dialog.waterSurface.colorBlendFactor2"), 0, 100, 1, (value) => `${Math.round(value * 100)}%`, 100);

        const fresnel = document.createElement("input");
        fresnel.type = "checkbox";
        fresnel.className = "popup-form-checkbox";
        fresnel.dataset.waterSurfaceField = "fresnelSeparate";
        fresnel.checked = this.mmdManager.getWaterSurfaceSettings().fresnelSeparate;
        fresnel.addEventListener("change", () => this.apply({ fresnelSeparate: fresnel.checked }));
        grid.appendChild(createPopupFormField(t("dialog.waterSurface.fresnelSeparate"), fresnel));

        const reset = createPopupFormButton(t("dialog.waterSurface.reset"), "secondary");
        reset.dataset.waterSurfaceAction = "reset";
        reset.addEventListener("click", () => {
            const enabled = this.mmdManager.waterSurfaceEnabled;
            this.apply({ ...cloneWaterSurfaceSettings(DEFAULT_WATER_SURFACE_SETTINGS), enabled });
            container.replaceChildren();
            this.mount(container);
        });
        grid.appendChild(createPopupFormField("", reset, "div"));

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.waterSurface.note");
        form.appendChild(note);
        container.appendChild(form);
    }

    private appendRange(
        grid: HTMLElement,
        field: keyof WaterSurfaceSettings,
        label: string,
        min: number,
        max: number,
        step: number,
        formatValue: (value: number) => string,
        scale = 1,
    ): void {
        const input = createRange(min, max, step, field);
        const valueText = createPopupFormValueText();
        const read = (): number => Number(this.mmdManager.getWaterSurfaceSettings()[field]);
        const sync = (): void => {
            const value = read();
            input.value = String(Math.round(value * scale));
            valueText.textContent = formatValue(value);
        };
        input.addEventListener("input", () => {
            this.apply({ [field]: Number(input.value) / scale });
            valueText.textContent = formatValue(read());
        });
        sync();
        grid.appendChild(createPopupFormField(label, createPopupFormRange(input, valueText), "div"));
    }

    private appendColor(
        grid: HTMLElement,
        field: "waterColor" | "waterColor2",
        label: string,
    ): void {
        const input = document.createElement("input");
        input.type = "color";
        input.className = "popup-form-control popup-form-color";
        input.dataset.waterSurfaceField = field;
        input.value = colorToHex(this.mmdManager.getWaterSurfaceSettings()[field]);
        input.addEventListener("input", () => {
            const color = hexToColor(input.value);
            if (color) this.apply({ [field]: color });
        });
        grid.appendChild(createPopupFormField(label, input));
    }

    private apply(settings: Partial<WaterSurfaceSettings>): void {
        this.dispatchAction({
            type: "viewport.setWaterSurfaceSettings",
            source: "menu",
            settings,
        });
        this.refreshUi();
    }
}
