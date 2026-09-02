import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { ElectronAPI, MmdOptimizedFormat } from "../types";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
} from "./popup-form-helpers";

type ToastType = "success" | "error" | "info";
type ConversionKind = "model" | "motion";
type ConverterApi = Pick<MmdManager, "convertPmxFileToBpmx" | "convertVmdBytesToBvmd">;
type ConverterFileApi = Pick<ElectronAPI,
    "openFileDialog" | "readBinaryFile" | "saveMmdOptimizedFile" | "logError"
>;

export type MmdOptimizedFormatDialogControllerDeps = {
    converter: ConverterApi;
    fileApi: ConverterFileApi;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    close: () => void;
};

function fileNameFromPath(filePath: string | null): string {
    if (!filePath) return t("dialog.mmdOptimizedFormat.notSelected");
    return filePath.split(/[\\/]/).pop() || filePath;
}

function outputFileName(filePath: string, format: MmdOptimizedFormat): string {
    const sourceName = fileNameFromPath(filePath).replace(/\.[^.]+$/i, "") || "converted";
    return `${sourceName}.${format}`;
}

function createFileRow(value: HTMLElement, button: HTMLButtonElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "popup-form-file-row";
    row.append(value, button);
    return row;
}

export class MmdOptimizedFormatDialogController implements PopupContentController {
    private readonly converter: ConverterApi;
    private readonly fileApi: ConverterFileApi;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly closeDialog: () => void;
    private readonly paths: Record<ConversionKind, string | null> = { model: null, motion: null };
    private container: HTMLElement | null = null;
    private busyKind: ConversionKind | null = null;
    private resultMessage = "";

    constructor(deps: MmdOptimizedFormatDialogControllerDeps) {
        this.converter = deps.converter;
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
        return this.busyKind === null;
    }

    private render(): void {
        if (!this.container) return;
        this.container.replaceChildren();

        const form = document.createElement("div");
        form.className = "popup-form popup-form-grid";

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.mmdOptimizedFormat.note");
        form.appendChild(note);

        form.appendChild(this.createConversionSection("model", "bpmx"));
        form.appendChild(this.createConversionSection("motion", "bvmd"));

        const result = document.createElement("div");
        result.className = "popup-form-result";
        result.setAttribute("aria-live", "polite");
        result.textContent = this.busyKind
            ? t(`dialog.mmdOptimizedFormat.${this.busyKind === "model" ? "convertingModel" : "convertingMotion"}`)
            : (this.resultMessage || t("dialog.mmdOptimizedFormat.ready"));
        form.appendChild(result);

        const closeButton = createPopupFormButton(t("button.cancel"), "secondary");
        closeButton.disabled = this.busyKind !== null;
        closeButton.addEventListener("click", () => this.closeDialog());
        form.appendChild(createPopupFormButtonRow([closeButton]));

        this.container.appendChild(form);
    }

    private createConversionSection(kind: ConversionKind, format: MmdOptimizedFormat): HTMLElement {
        const section = document.createElement("section");
        section.className = "popup-form-conversion-section";

        const heading = document.createElement("h3");
        heading.className = "popup-form-conversion-title";
        heading.textContent = t(`dialog.mmdOptimizedFormat.${kind}Title`);
        section.appendChild(heading);

        const description = document.createElement("p");
        description.className = "popup-form-note";
        description.textContent = t(`dialog.mmdOptimizedFormat.${kind}Description`);
        section.appendChild(description);

        const value = document.createElement("span");
        value.className = "popup-form-value popup-form-file-value";
        value.title = this.paths[kind] ?? "";
        value.textContent = fileNameFromPath(this.paths[kind]);
        const chooseButton = createPopupFormButton(t("dialog.mmdOptimizedFormat.choose"), "secondary");
        chooseButton.dataset.optimizedFormatFile = kind;
        chooseButton.disabled = this.busyKind !== null;
        chooseButton.addEventListener("click", () => { void this.chooseFile(kind); });
        section.appendChild(createPopupFormField(
            t(`dialog.mmdOptimizedFormat.${kind}File`),
            createFileRow(value, chooseButton),
            "div",
        ));

        const convertButton = createPopupFormButton(
            t(`dialog.mmdOptimizedFormat.${format}Convert`),
            "primary",
        );
        convertButton.dataset.optimizedFormatConvert = kind;
        convertButton.disabled = this.busyKind !== null || !this.paths[kind];
        convertButton.addEventListener("click", () => { void this.convertAndSave(kind, format); });
        section.appendChild(createPopupFormButtonRow([convertButton]));
        return section;
    }

    private async chooseFile(kind: ConversionKind): Promise<void> {
        const path = await this.fileApi.openFileDialog([kind === "model"
            ? { name: "MikuMikuDance Model", extensions: ["pmx", "pmd"] }
            : { name: "Vocaloid Motion Data", extensions: ["vmd"] }]);
        if (!path) return;
        this.paths[kind] = path;
        this.resultMessage = "";
        this.render();
    }

    private async convertAndSave(kind: ConversionKind, format: MmdOptimizedFormat): Promise<void> {
        const sourcePath = this.paths[kind];
        if (!sourcePath || this.busyKind) return;
        this.busyKind = kind;
        this.resultMessage = "";
        const progressKey = kind === "model" ? "convertingModel" : "convertingMotion";
        this.setStatus(t(`dialog.mmdOptimizedFormat.${progressKey}`), true);
        this.render();
        try {
            let convertedBytes: Uint8Array;
            if (kind === "model") {
                convertedBytes = await this.converter.convertPmxFileToBpmx(sourcePath);
            } else {
                const sourceBytes = await this.fileApi.readBinaryFile(sourcePath);
                if (!sourceBytes) throw new Error(t("dialog.mmdOptimizedFormat.readFailed"));
                convertedBytes = await this.converter.convertVmdBytesToBvmd(
                    fileNameFromPath(sourcePath),
                    new Uint8Array(sourceBytes),
                );
            }

            const saveResult = await this.fileApi.saveMmdOptimizedFile(
                convertedBytes,
                outputFileName(sourcePath, format),
                format,
            );
            if (saveResult.status === "saved") {
                this.resultMessage = t("dialog.mmdOptimizedFormat.saved", {
                    format: format.toUpperCase(),
                    file: fileNameFromPath(saveResult.filePath),
                });
                this.showToast(this.resultMessage, "success");
                this.setStatus(this.resultMessage);
                return;
            }
            if (saveResult.status === "cancelled") {
                this.resultMessage = t("dialog.mmdOptimizedFormat.saveCancelled");
                this.setStatus(this.resultMessage);
                return;
            }
            throw new Error(saveResult.message);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.fileApi.logError("asset", "optimized MMD format conversion failed", {
                kind,
                format,
                message,
            });
            this.resultMessage = t("dialog.mmdOptimizedFormat.failed", { format: format.toUpperCase() });
            this.showToast(this.resultMessage, "error");
            this.setStatus(this.resultMessage);
        } finally {
            this.busyKind = null;
            this.render();
        }
    }
}
