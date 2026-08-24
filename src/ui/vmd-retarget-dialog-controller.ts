import type { VmdSaveResult } from "../export/vmd-export-document";
import { t } from "../i18n";
import type { ElectronAPI } from "../types";
import {
    convertVmdForPmxModels,
} from "../tools/vmd-retarget-file-service";
import type {
    VmdRetargetOptions,
    VmdRetargetResult,
} from "../tools/vmd-retarget-converter";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
} from "./popup-form-helpers";

type ToastType = "success" | "error" | "info";
type RetargetFileKind = "sourceModel" | "sourceMotion" | "targetModel";
type RetargetFileApi = Pick<ElectronAPI,
    "openFileDialog" | "readBinaryFile" | "saveVmdFile" | "logError"
>;

export type VmdRetargetDialogControllerDeps = {
    fileApi: RetargetFileApi;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    close: () => void;
};

function fileNameFromPath(filePath: string | null): string {
    if (!filePath) return t("dialog.vmdRetarget.notSelected");
    return filePath.split(/[\\/]/).pop() || filePath;
}

function createFileRow(
    label: string,
    value: HTMLElement,
    button: HTMLButtonElement,
): HTMLElement {
    const row = document.createElement("div");
    row.className = "popup-form-file-row";
    row.append(value, button);
    return createPopupFormField(label, row, "div");
}

function createCheckbox(label: string, checked: boolean): { field: HTMLLabelElement; input: HTMLInputElement } {
    const field = document.createElement("label");
    field.className = "popup-form-check-field";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "popup-form-checkbox";
    input.checked = checked;
    const text = document.createElement("span");
    text.textContent = label;
    field.append(input, text);
    return { field, input };
}

function outputFileName(sourceMotionPath: string): string {
    const sourceName = fileNameFromPath(sourceMotionPath).replace(/\.vmd$/i, "") || "motion";
    return `${sourceName}_retargeted.vmd`;
}

function formatSaveError(result: Extract<VmdSaveResult, { status: "invalid" | "failed" }>): string {
    if (result.status === "failed") return result.message;
    return result.errors[0]?.message ?? t("dialog.vmdRetarget.saveFailed");
}

export class VmdRetargetDialogController implements PopupContentController {
    private readonly fileApi: RetargetFileApi;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly closeDialog: () => void;
    private readonly paths: Record<RetargetFileKind, string | null> = {
        sourceModel: null,
        sourceMotion: null,
        targetModel: null,
    };
    private options: VmdRetargetOptions = {
        retargetRotations: true,
        correctRootPosition: true,
        correctFootIkPosition: true,
    };
    private container: HTMLElement | null = null;
    private result: VmdRetargetResult | null = null;
    private busy = false;

    constructor(deps: VmdRetargetDialogControllerDeps) {
        this.fileApi = deps.fileApi;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.closeDialog = deps.close;
    }

    public mount(container: HTMLElement): void {
        this.container = container;
        this.render();
    }

    public unmount(): void {
        this.container = null;
    }

    public refreshLocale(): void {
        this.render();
    }

    public canClose(): boolean {
        return !this.busy;
    }

    private render(): void {
        if (!this.container) return;
        this.container.replaceChildren();

        const form = document.createElement("div");
        form.className = "popup-form popup-form-grid";

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.vmdRetarget.note");
        form.appendChild(note);

        for (const [kind, labelKey, extension] of [
            ["sourceModel", "dialog.vmdRetarget.sourceModel", "pmx"],
            ["sourceMotion", "dialog.vmdRetarget.sourceMotion", "vmd"],
            ["targetModel", "dialog.vmdRetarget.targetModel", "pmx"],
        ] as const) {
            const value = document.createElement("span");
            value.className = "popup-form-value popup-form-file-value";
            value.title = this.paths[kind] ?? "";
            value.textContent = fileNameFromPath(this.paths[kind]);
            const chooseButton = createPopupFormButton(t("dialog.vmdRetarget.choose"), "secondary");
            chooseButton.dataset.retargetFile = kind;
            chooseButton.disabled = this.busy;
            chooseButton.addEventListener("click", () => {
                void this.chooseFile(kind, extension);
            });
            form.appendChild(createFileRow(t(labelKey), value, chooseButton));
        }

        const rotation = createCheckbox(t("dialog.vmdRetarget.rotation"), this.options.retargetRotations);
        const rootPosition = createCheckbox(t("dialog.vmdRetarget.rootPosition"), this.options.correctRootPosition);
        const footIkPosition = createCheckbox(t("dialog.vmdRetarget.footIkPosition"), this.options.correctFootIkPosition);
        for (const checkbox of [rotation.input, rootPosition.input, footIkPosition.input]) {
            checkbox.disabled = this.busy;
        }
        rotation.input.addEventListener("change", () => this.updateOptions({ retargetRotations: rotation.input.checked }));
        rootPosition.input.addEventListener("change", () => this.updateOptions({ correctRootPosition: rootPosition.input.checked }));
        footIkPosition.input.addEventListener("change", () => this.updateOptions({ correctFootIkPosition: footIkPosition.input.checked }));
        const optionGroup = document.createElement("div");
        optionGroup.className = "popup-form-check-group";
        optionGroup.append(rotation.field, rootPosition.field, footIkPosition.field);
        form.appendChild(optionGroup);

        const resultArea = document.createElement("div");
        resultArea.className = "popup-form-result";
        resultArea.setAttribute("aria-live", "polite");
        this.renderResult(resultArea);
        form.appendChild(resultArea);

        const cancelButton = createPopupFormButton(t("button.cancel"), "secondary");
        const analyzeButton = createPopupFormButton(t("dialog.vmdRetarget.analyze"), "secondary");
        const saveButton = createPopupFormButton(t("dialog.vmdRetarget.save"), "primary");
        const ready = this.hasAllFiles();
        cancelButton.disabled = this.busy;
        analyzeButton.disabled = this.busy || !ready;
        saveButton.disabled = this.busy || !this.result;
        cancelButton.addEventListener("click", () => this.closeDialog());
        analyzeButton.addEventListener("click", () => { void this.analyze(); });
        saveButton.addEventListener("click", () => { void this.save(); });
        form.appendChild(createPopupFormButtonRow([saveButton, analyzeButton, cancelButton]));

        this.container.appendChild(form);
    }

    private renderResult(container: HTMLElement): void {
        if (this.busy) {
            container.textContent = t("dialog.vmdRetarget.analyzing");
            return;
        }
        if (!this.result) {
            container.textContent = this.hasAllFiles()
                ? t("dialog.vmdRetarget.ready")
                : t("dialog.vmdRetarget.waiting");
            return;
        }

        const report = this.result.report;
        const summary = document.createElement("p");
        summary.className = "popup-form-result-summary";
        summary.textContent = t("dialog.vmdRetarget.summary", {
            bones: report.outputBoneKeyCount,
            boneTracks: report.mappedBoneTrackCount,
            rotations: report.rotationKeyCount,
            positions: report.positionKeyCount,
            morphTracks: report.mappedMorphTrackCount,
        });
        container.appendChild(summary);

        const detailItems = [
            [t("dialog.vmdRetarget.omittedBones"), report.omittedBoneTracks],
            [t("dialog.vmdRetarget.omittedMorphs"), report.omittedMorphTracks],
            [t("dialog.vmdRetarget.warnings"), report.warnings],
        ] as const;
        if (detailItems.every(([, items]) => items.length === 0)) return;

        const details = document.createElement("details");
        details.className = "popup-form-result-details";
        const heading = document.createElement("summary");
        heading.textContent = t("dialog.vmdRetarget.details");
        details.appendChild(heading);
        for (const [label, items] of detailItems) {
            if (items.length === 0) continue;
            const line = document.createElement("p");
            line.textContent = `${label}: ${items.join(", ")}`;
            details.appendChild(line);
        }
        container.appendChild(details);
    }

    private updateOptions(partial: Partial<VmdRetargetOptions>): void {
        this.options = { ...this.options, ...partial };
        this.result = null;
        this.render();
    }

    private async chooseFile(kind: RetargetFileKind, extension: "pmx" | "vmd"): Promise<void> {
        const path = await this.fileApi.openFileDialog([{
            name: extension === "pmx" ? "MikuMikuDance Model" : "Vocaloid Motion Data",
            extensions: [extension],
        }]);
        if (!path) return;
        this.paths[kind] = path;
        this.result = null;
        this.render();
    }

    private hasAllFiles(): boolean {
        return Boolean(this.paths.sourceModel && this.paths.sourceMotion && this.paths.targetModel);
    }

    private async analyze(): Promise<VmdRetargetResult | null> {
        const { sourceModel, sourceMotion, targetModel } = this.paths;
        if (!sourceModel || !sourceMotion || !targetModel || this.busy) return null;
        this.busy = true;
        this.result = null;
        this.setStatus(t("dialog.vmdRetarget.analyzing"), true);
        this.render();
        try {
            const [sourceModelBytes, sourceMotionBytes, targetModelBytes] = await Promise.all([
                this.fileApi.readBinaryFile(sourceModel),
                this.fileApi.readBinaryFile(sourceMotion),
                this.fileApi.readBinaryFile(targetModel),
            ]);
            if (!sourceModelBytes || !sourceMotionBytes || !targetModelBytes) {
                throw new Error(t("dialog.vmdRetarget.readFailed"));
            }
            this.result = await convertVmdForPmxModels(
                new Uint8Array(sourceModelBytes),
                new Uint8Array(sourceMotionBytes),
                new Uint8Array(targetModelBytes),
                this.options,
            );
            this.setStatus(t("dialog.vmdRetarget.analysisComplete"));
            return this.result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.fileApi.logError("vmd-export", "VMD retarget analysis failed", { message });
            this.showToast(t("dialog.vmdRetarget.analysisFailed"), "error");
            this.setStatus(t("dialog.vmdRetarget.analysisFailed"));
            return null;
        } finally {
            this.busy = false;
            this.render();
        }
    }

    private async save(): Promise<void> {
        if (!this.result || !this.paths.sourceMotion || this.busy) return;
        this.busy = true;
        this.setStatus(t("dialog.vmdRetarget.saving"), true);
        this.render();
        try {
            const saveResult = await this.fileApi.saveVmdFile(
                this.result.document,
                outputFileName(this.paths.sourceMotion),
            );
            if (saveResult.status === "saved") {
                this.showToast(t("dialog.vmdRetarget.saved"), "success");
                this.setStatus(t("dialog.vmdRetarget.saved"));
                this.busy = false;
                this.closeDialog();
                return;
            }
            if (saveResult.status === "cancelled") {
                this.setStatus(t("dialog.vmdRetarget.saveCancelled"));
                return;
            }
            const message = formatSaveError(saveResult);
            this.fileApi.logError("vmd-export", "Retargeted VMD save failed", {
                status: saveResult.status,
                message,
            });
            this.showToast(t("dialog.vmdRetarget.saveFailed"), "error");
            this.setStatus(t("dialog.vmdRetarget.saveFailed"));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.fileApi.logError("vmd-export", "Retargeted VMD save failed", { message });
            this.showToast(t("dialog.vmdRetarget.saveFailed"), "error");
            this.setStatus(t("dialog.vmdRetarget.saveFailed"));
        } finally {
            this.busy = false;
            this.render();
        }
    }
}
