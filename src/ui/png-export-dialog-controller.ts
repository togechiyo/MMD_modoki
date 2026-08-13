import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import {
    OUTPUT_ASPECT_OPTIONS,
    PNG_OUTPUT_SIZE_PRESET_OPTIONS,
    type OutputSizeSettingsAdapter,
} from "./export-ui-controller";
import { installEnterCommitNumberInput } from "./panel-control-helpers";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormButton, createPopupFormField, createPopupFormInline } from "./popup-form-helpers";

type PngExportDialogDeps = {
    dispatchAction: (action: EditorAction) => boolean;
    close: () => void;
    output: OutputSizeSettingsAdapter;
    kind?: "single" | "sequence";
};

export class PngExportDialogController implements PopupContentController {
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly close: () => void;
    private readonly output: OutputSizeSettingsAdapter;
    private readonly kind: "single" | "sequence";
    private container: HTMLElement | null = null;
    private aspectSelect: HTMLSelectElement | null = null;
    private sizePresetSelect: HTMLSelectElement | null = null;
    private widthInput: HTMLInputElement | null = null;
    private heightInput: HTMLInputElement | null = null;
    private transparentBackgroundInput: HTMLInputElement | null = null;

    constructor(deps: PngExportDialogDeps) {
        this.dispatchAction = deps.dispatchAction;
        this.close = deps.close;
        this.output = deps.output;
        this.kind = deps.kind ?? "single";
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        container.classList.add("popup-form");

        const state = this.output.getState();
        const form = document.createElement("div");
        form.className = "popup-form-grid";

        this.aspectSelect = this.createSelect(
            "png-output-aspect",
            OUTPUT_ASPECT_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
            state.aspectPreset,
        );
        this.sizePresetSelect = this.createSelect(
            "png-output-size-preset",
            PNG_OUTPUT_SIZE_PRESET_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
            state.sizePreset,
        );
        this.widthInput = this.createNumberInput("png-output-width", state.width, 320, 8192);
        this.heightInput = this.createNumberInput("png-output-height", state.height, 180, 8192);
        this.transparentBackgroundInput = this.createCheckbox(
            "png-output-transparent-background",
            state.pngTransparentBackground,
        );

        form.appendChild(createPopupFormField(t("dialog.pngExport.aspect"), this.aspectSelect));
        form.appendChild(createPopupFormField(t("dialog.pngExport.longSide"), this.sizePresetSelect));
        form.appendChild(createPopupFormField(
            t("dialog.pngExport.size"),
            createPopupFormInline(this.widthInput, "x", this.heightInput),
            "div",
        ));
        form.appendChild(createPopupFormField(
            t("dialog.pngExport.transparentBackground"),
            this.transparentBackgroundInput,
        ));

        const memoryNote = document.createElement("p");
        memoryNote.className = "popup-form-note";
        memoryNote.textContent = t("dialog.pngExport.memoryNote");

        const actions = document.createElement("div");
        actions.className = "popup-form-actions";

        const cancelButton = createPopupFormButton(t("dialog.pngExport.cancel"), "secondary");
        cancelButton.addEventListener("click", () => this.close());

        const exportButton = createPopupFormButton(
            t(this.kind === "sequence" ? "dialog.pngSequenceExport.export" : "dialog.pngExport.export"),
            "primary",
        );
        exportButton.addEventListener("click", () => {
            this.syncAllToOutputState();
            if (this.kind === "sequence") {
                this.dispatchAction({ type: "project.exportPngSequence", source: "menu" });
            } else {
                this.dispatchAction({ type: "project.exportPng", source: "menu", renderMode: "detached" });
            }
            this.close();
        });

        actions.append(cancelButton, exportButton);
        container.append(form, memoryNote, actions);
        this.setupEvents();
    }

    public unmount(): void {
        this.container?.classList.remove("popup-form");
        this.container = null;
    }

    private setupEvents(): void {
        this.aspectSelect?.addEventListener("change", () => {
            this.output.setAspectPreset(this.aspectSelect?.value ?? "16:9");
            this.dispatchAction({ type: "output.applyPreset", source: "menu" });
            this.syncDimensionsFromOutputState();
        });

        this.sizePresetSelect?.addEventListener("change", () => {
            this.output.setSizePreset(this.sizePresetSelect?.value ?? "1920");
            this.dispatchAction({ type: "output.applyPreset", source: "menu" });
            this.syncDimensionsFromOutputState();
        });

        if (this.widthInput) {
            installEnterCommitNumberInput(this.widthInput, {
                commit: () => this.commitDimensionInput("width"),
                revert: () => this.syncDimensionsFromOutputState(),
            });
            this.widthInput.addEventListener("change", () => this.commitDimensionInput("width"));
        }
        if (this.heightInput) {
            installEnterCommitNumberInput(this.heightInput, {
                commit: () => this.commitDimensionInput("height"),
                revert: () => this.syncDimensionsFromOutputState(),
            });
            this.heightInput.addEventListener("change", () => this.commitDimensionInput("height"));
        }
        this.transparentBackgroundInput?.addEventListener("change", () => {
            this.output.setPngTransparentBackground(this.transparentBackgroundInput?.checked ?? false);
        });
    }

    private syncAllToOutputState(): void {
        if (this.aspectSelect) this.output.setAspectPreset(this.aspectSelect.value);
        if (this.sizePresetSelect) this.output.setSizePreset(this.sizePresetSelect.value);
        if (this.widthInput) this.output.setWidth(this.parseNumberInput(this.widthInput, 1920));
        if (this.heightInput) this.output.setHeight(this.parseNumberInput(this.heightInput, 1080));
        if (this.transparentBackgroundInput) {
            this.output.setPngTransparentBackground(this.transparentBackgroundInput.checked);
        }
        this.output.setQualityScale(1);
    }

    private commitDimensionInput(dimension: "width" | "height"): void {
        if (dimension === "width") {
            this.output.setWidth(this.parseNumberInput(this.widthInput, 1920));
        } else {
            this.output.setHeight(this.parseNumberInput(this.heightInput, 1080));
        }
        this.dispatchAction({ type: "output.syncDimension", source: "menu", dimension });
        this.syncDimensionsFromOutputState();
    }

    private syncDimensionsFromOutputState(): void {
        const state = this.output.getState();
        if (this.widthInput) this.widthInput.value = String(state.width);
        if (this.heightInput) this.heightInput.value = String(state.height);
    }

    private createSelect(
        id: string,
        options: ReadonlyArray<{ value: string; label: string }>,
        selectedValue: string,
    ): HTMLSelectElement {
        const select = document.createElement("select");
        select.id = id;
        select.className = "popup-form-control";
        options.forEach((sourceOption) => {
            const option = document.createElement("option");
            option.value = sourceOption.value;
            option.textContent = sourceOption.label;
            select.appendChild(option);
        });
        select.value = selectedValue;
        return select;
    }

    private createNumberInput(id: string, value: number, min: number, max: number): HTMLInputElement {
        const input = document.createElement("input");
        input.id = id;
        input.className = "popup-form-control popup-form-number";
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = "1";
        input.value = String(value);
        return input;
    }

    private createCheckbox(id: string, checked: boolean): HTMLInputElement {
        const input = document.createElement("input");
        input.id = id;
        input.className = "popup-form-checkbox";
        input.type = "checkbox";
        input.checked = checked;
        return input;
    }

    private parseNumberInput(input: HTMLInputElement | null, fallback: number): number {
        const value = Number.parseInt(input?.value ?? String(fallback), 10);
        return Number.isFinite(value) ? value : fallback;
    }
}
