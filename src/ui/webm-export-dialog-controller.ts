import { t } from "../i18n";
import type { EditorAction } from "../actions/types";
import {
    OUTPUT_ASPECT_OPTIONS,
    OUTPUT_FPS_OPTIONS,
    OUTPUT_SIZE_PRESET_OPTIONS,
    type WebmExportSettingsAdapter,
} from "./export-ui-controller";
import { installEnterCommitNumberInput } from "./panel-control-helpers";
import type { PopupContentController } from "./popup-dialog-controller";
import { createPopupFormButton, createPopupFormField, createPopupFormInline } from "./popup-form-helpers";

type WebmExportDialogDeps = {
    dispatchAction: (action: EditorAction) => boolean;
    close: () => void;
    output: WebmExportSettingsAdapter;
};

export class WebmExportDialogController implements PopupContentController {
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly close: () => void;
    private readonly output: WebmExportSettingsAdapter;
    private container: HTMLElement | null = null;
    private aspectSelect: HTMLSelectElement | null = null;
    private sizePresetSelect: HTMLSelectElement | null = null;
    private widthInput: HTMLInputElement | null = null;
    private heightInput: HTMLInputElement | null = null;
    private fpsSelect: HTMLSelectElement | null = null;
    private includeAudioInput: HTMLInputElement | null = null;
    private usePlaybackRangeInput: HTMLInputElement | null = null;
    private startFrameInput: HTMLInputElement | null = null;
    private endFrameInput: HTMLInputElement | null = null;
    private resetFrameRangeButton: HTMLButtonElement | null = null;

    constructor(deps: WebmExportDialogDeps) {
        this.dispatchAction = deps.dispatchAction;
        this.close = deps.close;
        this.output = deps.output;
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        container.classList.add("popup-form");

        const state = this.output.getState();
        const form = document.createElement("div");
        form.className = "popup-form-grid";

        this.aspectSelect = this.createSelect(
            "webm-output-aspect",
            OUTPUT_ASPECT_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
            state.aspectPreset,
        );
        this.sizePresetSelect = this.createSelect(
            "webm-output-size-preset",
            OUTPUT_SIZE_PRESET_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })),
            state.sizePreset,
        );
        this.widthInput = this.createNumberInput("webm-output-width", state.width, 320, 8192);
        this.heightInput = this.createNumberInput("webm-output-height", state.height, 180, 8192);
        this.fpsSelect = this.createSelect("webm-output-fps", OUTPUT_FPS_OPTIONS, String(state.fps));
        this.includeAudioInput = this.createCheckbox("webm-output-include-audio", state.includeAudio);
        this.usePlaybackRangeInput = this.createCheckbox("webm-output-use-playback-range", state.usePlaybackRange);
        this.startFrameInput = this.createNumberInput("webm-output-start-frame", state.startFrame, 0, 999999);
        this.endFrameInput = this.createNumberInput("webm-output-end-frame", state.endFrame, 0, 999999);
        this.resetFrameRangeButton = createPopupFormButton(
            t("dialog.webmExport.useTimelineRange"),
            "secondary",
        );
        this.resetFrameRangeButton.id = "webm-output-reset-frame-range";

        form.appendChild(createPopupFormField(t("dialog.webmExport.aspect"), this.aspectSelect));
        form.appendChild(createPopupFormField(t("dialog.webmExport.longSide"), this.sizePresetSelect));
        form.appendChild(this.createSizeField());
        form.appendChild(createPopupFormField(t("dialog.webmExport.fps"), this.fpsSelect));
        form.appendChild(createPopupFormField(t("dialog.webmExport.includeAudio"), this.includeAudioInput));
        form.appendChild(createPopupFormField(t("dialog.webmExport.usePlaybackRange"), this.usePlaybackRangeInput));
        form.appendChild(this.createFrameRangeField());

        const actions = document.createElement("div");
        actions.className = "popup-form-actions";

        const cancelButton = createPopupFormButton(t("dialog.webmExport.cancel"), "secondary");
        cancelButton.addEventListener("click", () => this.close());

        const exportButton = createPopupFormButton(t("dialog.webmExport.export"), "primary");
        exportButton.addEventListener("click", () => {
            this.syncAllToOutputState();
            this.dispatchAction({ type: "project.exportWebm", source: "menu" });
            this.close();
        });

        actions.append(cancelButton, exportButton);
        container.append(form, actions);
        this.setupEvents();
    }

    public unmount(): void {
        this.container?.classList.remove("popup-form");
        this.container = null;
    }

    private setupEvents(): void {
        this.aspectSelect?.addEventListener("change", () => {
            this.output.setAspectPreset(this.aspectSelect?.value ?? "16:9");
            if (!this.dispatchAction({ type: "output.applyPreset", source: "menu" })) {
                this.output.getState();
            }
            this.syncDimensionsFromOutputState();
        });

        this.sizePresetSelect?.addEventListener("change", () => {
            this.output.setSizePreset(this.sizePresetSelect?.value ?? "1920");
            if (!this.dispatchAction({ type: "output.applyPreset", source: "menu" })) {
                this.output.getState();
            }
            this.syncDimensionsFromOutputState();
        });

        if (this.widthInput) {
            installEnterCommitNumberInput(this.widthInput, {
                commit: () => this.commitDimensionInput("width"),
                revert: () => this.syncDimensionsFromOutputState(),
            });
        }

        if (this.heightInput) {
            installEnterCommitNumberInput(this.heightInput, {
                commit: () => this.commitDimensionInput("height"),
                revert: () => this.syncDimensionsFromOutputState(),
            });
        }

        this.fpsSelect?.addEventListener("change", () => {
            this.output.setFps(this.parseNumberInput(this.fpsSelect, 30));
        });
        this.includeAudioInput?.addEventListener("change", () => {
            this.output.setIncludeAudio(this.includeAudioInput?.checked ?? false);
        });
        this.usePlaybackRangeInput?.addEventListener("change", () => {
            const usePlaybackRange = this.usePlaybackRangeInput?.checked ?? false;
            this.output.setUsePlaybackRange(usePlaybackRange);
            if (usePlaybackRange) {
                this.syncFrameRangeFromPlaybackRange();
            }
        });
        if (this.startFrameInput) {
            installEnterCommitNumberInput(this.startFrameInput, {
                commit: () => this.commitFrameRangeInput("start"),
                revert: () => this.syncFrameRangeFromOutputState(),
            });
        }
        if (this.endFrameInput) {
            installEnterCommitNumberInput(this.endFrameInput, {
                commit: () => this.commitFrameRangeInput("end"),
                revert: () => this.syncFrameRangeFromOutputState(),
            });
        }
        this.resetFrameRangeButton?.addEventListener("click", () => {
            const state = this.output.resetFrameRangeToTimeline();
            if (this.usePlaybackRangeInput) this.usePlaybackRangeInput.checked = state.usePlaybackRange;
            this.syncFrameRangeFromOutputState();
        });
    }

    private createSizeField(): HTMLElement {
        return createPopupFormField(
            t("dialog.webmExport.size"),
            createPopupFormInline(this.widthInput, "x", this.heightInput),
            "div",
        );
    }

    private createFrameRangeField(): HTMLElement {
        const row = document.createElement("div");
        row.className = "popup-form-frame-range";
        row.append(createPopupFormInline(this.startFrameInput, "-", this.endFrameInput));
        if (this.resetFrameRangeButton) row.append(this.resetFrameRangeButton);
        return createPopupFormField(
            t("dialog.webmExport.frameRange"),
            row,
            "div",
        );
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

    private syncDimensionsFromOutputState(): void {
        const state = this.output.getState();
        if (this.widthInput) this.widthInput.value = String(state.width);
        if (this.heightInput) this.heightInput.value = String(state.height);
    }

    private syncFrameRangeFromOutputState(): void {
        const state = this.output.getState();
        if (this.startFrameInput) this.startFrameInput.value = String(state.startFrame);
        if (this.endFrameInput) this.endFrameInput.value = String(state.endFrame);
    }

    private syncFrameRangeFromPlaybackRange(): void {
        const state = this.output.syncPlaybackRange();
        if (this.startFrameInput) this.startFrameInput.value = String(state.startFrame);
        if (this.endFrameInput) this.endFrameInput.value = String(state.endFrame);
    }

    private syncAllToOutputState(): void {
        if (this.aspectSelect) this.output.setAspectPreset(this.aspectSelect.value);
        if (this.sizePresetSelect) this.output.setSizePreset(this.sizePresetSelect.value);
        if (this.widthInput) this.output.setWidth(this.parseNumberInput(this.widthInput, 1920));
        if (this.heightInput) this.output.setHeight(this.parseNumberInput(this.heightInput, 1080));
        if (this.fpsSelect) this.output.setFps(this.parseNumberInput(this.fpsSelect, 30));
        if (this.includeAudioInput) this.output.setIncludeAudio(this.includeAudioInput.checked);
        if (this.usePlaybackRangeInput) this.output.setUsePlaybackRange(this.usePlaybackRangeInput.checked);
        if (this.startFrameInput) this.output.setStartFrame(this.parseNumberInput(this.startFrameInput, 0));
        if (this.endFrameInput) this.output.setEndFrame(this.parseNumberInput(this.endFrameInput, 0));
        this.output.setCaptureMode("rgba-surface");
        this.dispatchAction({ type: "output.sanitizeFrameRange", source: "menu", boundary: "end" });
    }

    private commitDimensionInput(dimension: "width" | "height"): void {
        if (dimension === "width") {
            this.output.setWidth(this.parseNumberInput(this.widthInput, 1920));
        } else {
            this.output.setHeight(this.parseNumberInput(this.heightInput, 1080));
        }
        if (!this.dispatchAction({ type: "output.syncDimension", source: "menu", dimension })) {
            this.output.getState();
        }
        this.syncDimensionsFromOutputState();
    }

    private commitFrameRangeInput(boundary: "start" | "end"): void {
        if (boundary === "start") {
            this.output.setStartFrame(this.parseNumberInput(this.startFrameInput, 0));
        } else {
            this.output.setEndFrame(this.parseNumberInput(this.endFrameInput, 0));
        }
        this.dispatchAction({ type: "output.markFrameRangeCustomized", source: "menu" });
        this.dispatchAction({ type: "output.sanitizeFrameRange", source: "menu", boundary });
        this.syncFrameRangeFromOutputState();
    }

    private parseNumberInput(input: HTMLInputElement | HTMLSelectElement | null, fallback: number): number {
        const value = Number.parseInt(input?.value ?? String(fallback), 10);
        return Number.isFinite(value) ? value : fallback;
    }

}
