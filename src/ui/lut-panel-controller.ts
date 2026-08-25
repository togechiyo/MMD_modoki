import { t } from "../i18n";
import { normalizeLutFile } from "../lut-file";
import type { MmdManager } from "../mmd-manager";
import type { EditorAction } from "../actions/types";
import {
    buildProjectLutSavePlan,
    getCurrentLutPresetSelectValue,
    normalizeImportedLutPath,
    resolveLutSelection,
    type ImportedLutRegistryEntry,
    type LutSourceMode,
    type ProjectLutSavePlan,
} from "./lut-panel-state";

type ToastType = "success" | "error" | "info";

type LutPanelElements = {
    sourceSelect: HTMLSelectElement;
    sourceValue: HTMLElement;
    fileButton: HTMLButtonElement;
    fileValue: HTMLElement;
    enabledInput: HTMLInputElement;
    presetSelect: HTMLSelectElement;
    enabledValue: HTMLElement;
    intensityInput: HTMLInputElement;
    intensityValue: HTMLElement;
};

export type LutPanelControllerDeps = {
    mmdManager: MmdManager;
    getBaseNameForRenderer: (filePath: string) => string;
    setStatus: (text: string, loading: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    refreshShaderPanel: () => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function queryRequired<T extends Element>(root: ParentNode, selector: string): T | null {
    return root.querySelector<T>(selector);
}

function resolveLutPanelElements(root: ParentNode): LutPanelElements | null {
    const sourceSelect = queryRequired<HTMLSelectElement>(root, 'select[data-postfx-select="lut-source"]');
    const sourceValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="lut-source"]');
    const fileButton = queryRequired<HTMLButtonElement>(root, 'button[data-postfx-btn="lut-file"]');
    const fileValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="lut-file"]');
    const enabledInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx-check="lut"]');
    const presetSelect = queryRequired<HTMLSelectElement>(root, 'select[data-postfx-select="lut-preset"]');
    const enabledValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="lut"]');
    const intensityInput = queryRequired<HTMLInputElement>(root, 'input[data-postfx="lut-intensity"]');
    const intensityValue = queryRequired<HTMLElement>(root, 'span[data-postfx-val="lut-intensity"]');

    if (
        !sourceSelect ||
        !sourceValue ||
        !fileButton ||
        !fileValue ||
        !enabledInput ||
        !presetSelect ||
        !enabledValue ||
        !intensityInput ||
        !intensityValue
    ) {
        return null;
    }

    return {
        sourceSelect,
        sourceValue,
        fileButton,
        fileValue,
        enabledInput,
        presetSelect,
        enabledValue,
        intensityInput,
        intensityValue,
    };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function lutModeToLabel(mode: string): string {
    switch (mode) {
        case "external-absolute":
            return t("shader.option.externalAbsolute");
        case "project-relative":
            return t("shader.option.projectLut");
        default:
            return t("shader.option.builtin");
    }
}

export class LutPanelController {
    private readonly mmdManager: MmdManager;
    private readonly getBaseNameForRenderer: (filePath: string) => string;
    private readonly setStatus: (text: string, loading: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly refreshShaderPanel: () => void;
    private readonly dispatchAction?: (action: EditorAction) => boolean;
    private postFxLutExternalPath: string | null = null;
    private postFxLutExternalText: string | null = null;
    private postFxLutExternalRuntimeText: string | null = null;
    private readonly customLutEntriesByPath = new Map<string, ImportedLutRegistryEntry>();
    private elements: LutPanelElements | null = null;

    constructor(deps: LutPanelControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.getBaseNameForRenderer = deps.getBaseNameForRenderer;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.refreshShaderPanel = deps.refreshShaderPanel;
        this.dispatchAction = deps.dispatchAction;
    }

    public connect(root: ParentNode): boolean {
        const elements = resolveLutPanelElements(root);
        if (!elements) {
            return false;
        }
        this.elements = elements;

        const applyLut = (): void => {
            if (!this.dispatchAction?.({ type: "effect.applyLut", source: "panel" })) {
                this.applyLutFromPanel();
            }
        };

        if (!this.postFxLutExternalPath && this.mmdManager.postEffectLutExternalPath) {
            this.postFxLutExternalPath = this.mmdManager.postEffectLutExternalPath;
        }
        elements.sourceSelect.value = elements.sourceSelect.querySelector(`option[value="${this.mmdManager.postEffectLutSourceMode}"]`)
            ? this.mmdManager.postEffectLutSourceMode
            : "builtin";
        elements.enabledInput.checked = this.mmdManager.postEffectLutEnabled;
        elements.presetSelect.value = getCurrentLutPresetSelectValue({
            sourceMode: this.mmdManager.postEffectLutSourceMode as LutSourceMode,
            externalPath: this.postFxLutExternalPath,
            builtinPreset: this.mmdManager.postEffectLutPreset,
            getImportedEntry: (filePath) => this.getImportedLutEntry(filePath),
        });
        elements.intensityInput.value = String(
            Math.max(0, Math.min(100, Math.round(this.mmdManager.postEffectLutIntensity * 100))),
        );

        applyLut();

        elements.sourceSelect.addEventListener("change", applyLut);
        elements.fileButton.addEventListener("click", () => {
            if (!this.dispatchAction?.({ type: "effect.chooseExternalLut", source: "button" })) {
                void this.chooseExternalLut();
            }
        });
        elements.enabledInput.addEventListener("input", applyLut);
        elements.presetSelect.addEventListener("change", applyLut);
        elements.intensityInput.addEventListener("input", applyLut);

        return true;
    }

    public async chooseExternalLut(): Promise<void> {
        const lutPath = await window.electronAPI.openFileDialog([
            { name: t("shader.group.lutFiles"), extensions: ["3dl", "cube"] },
            { name: t("option.allFiles"), extensions: ["*"] },
        ]);
        if (!lutPath) return;

        this.setStatus(t("status.loadingLut"), true);
        if (await this.importExternalLutFile(lutPath, "dialog")) {
            this.setStatus(t("status.lutLoaded"), false);
        } else {
            this.setStatus(t("status.lutLoadFailed"), false);
        }
    }

    public applyLutFromPanel(): void {
        const elements = this.elements;
        if (!elements) {
            return;
        }
        const selectedPresetValue = elements.presetSelect.value;
        const resolution = resolveLutSelection({
            selectedPresetValue,
            requestedSourceMode: elements.sourceSelect.value,
            getImportedEntry: (filePath) => this.getImportedLutEntry(filePath),
        });
        const selectedMode = resolution.selectedMode;
        const selectedImportedEntry = resolution.selectedImportedEntry;
        const hasLutSource = resolution.hasLutSource;

        if (elements.sourceSelect.value !== selectedMode) {
            elements.sourceSelect.value = selectedMode;
        }

        if (selectedImportedEntry) {
            elements.enabledInput.checked = true;
            this.postFxLutExternalPath = selectedImportedEntry.sourcePath;
            this.postFxLutExternalText = selectedImportedEntry.rawText;
            this.postFxLutExternalRuntimeText = selectedImportedEntry.runtimeText;
            this.mmdManager.setPostEffectExternalLut(
                selectedImportedEntry.sourcePath,
                selectedImportedEntry.runtimeText,
                selectedImportedEntry.sourceFormat,
            );
        } else {
            this.postFxLutExternalPath = null;
            this.postFxLutExternalText = null;
            this.postFxLutExternalRuntimeText = null;
            this.mmdManager.setPostEffectExternalLut(null, null, null);
            this.mmdManager.postEffectLutPreset = selectedPresetValue;
        }

        this.mmdManager.postEffectLutSourceMode = selectedMode;
        this.mmdManager.postEffectLutIntensity = Number(elements.intensityInput.value) / 100;
        this.mmdManager.postEffectLutEnabled = elements.enabledInput.checked
            && hasLutSource
            && this.mmdManager.postEffectLutIntensity > 0.000001;

        elements.intensityInput.disabled = !elements.enabledInput.checked || !hasLutSource;
        elements.sourceValue.textContent = lutModeToLabel(selectedMode);
        elements.fileValue.textContent = this.postFxLutExternalPath
            ? this.getBaseNameForRenderer(this.postFxLutExternalPath)
            : t("option.none");
        elements.enabledValue.textContent = this.mmdManager.postEffectLutEnabled
            ? (selectedImportedEntry
                ? this.getBaseNameForRenderer(selectedImportedEntry.sourcePath)
                : this.mmdManager.postEffectLutPreset)
            : t("status.off");
        elements.intensityValue.textContent = this.mmdManager.postEffectLutEnabled
            ? this.mmdManager.postEffectLutIntensity.toFixed(2)
            : t("status.off");
    }

    public buildPresetOptionsHtml(): string {
        const importedEntries = Array.from(this.customLutEntriesByPath.values())
            .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }) || a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }));
        const labelCounts = new Map<string, number>();
        const importedOptionsHtml = importedEntries
            .map((entry) => {
                const baseName = entry.displayName || this.getBaseNameForRenderer(entry.sourcePath) || t("shader.group.importedLutFallback");
                const count = (labelCounts.get(baseName) ?? 0) + 1;
                labelCounts.set(baseName, count);
                const label = count === 1 ? baseName : `${baseName} (${count})`;
                return `<option value="${escapeHtml(entry.sourcePath)}">${escapeHtml(label)}</option>`;
            })
            .join("");
        const builtInOptionsHtml = this.mmdManager.getPostEffectLutPresetOptions()
            .map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`)
            .join("");

        const importedGroupHtml = importedEntries.length > 0
            ? `<optgroup label="${escapeHtml(t("shader.group.importedLuts"))}">${importedOptionsHtml}</optgroup>`
            : "";
        const builtInGroupHtml = `<optgroup label="${escapeHtml(t("shader.group.builtInLuts"))}">${builtInOptionsHtml}</optgroup>`;

        return importedGroupHtml + builtInGroupHtml;
    }

    public prepareProjectSave(): ProjectLutSavePlan {
        return buildProjectLutSavePlan({
            sourceMode: this.mmdManager.postEffectLutSourceMode as LutSourceMode,
            externalPath: this.postFxLutExternalPath,
            externalText: this.postFxLutExternalText,
            getBaseName: this.getBaseNameForRenderer,
        });
    }

    public getRuntimeReloadExternalAsset(): { path: string | null; text: string | null } {
        return {
            path: this.postFxLutExternalPath,
            text: this.postFxLutExternalText,
        };
    }

    public clearExternalAsset(): void {
        this.postFxLutExternalPath = null;
        this.postFxLutExternalText = null;
        this.postFxLutExternalRuntimeText = null;
        this.mmdManager.setPostEffectExternalLut(null, null, null);
    }

    public restoreProjectExternalAsset(filePath: string | null, rawText: string | null): void {
        this.postFxLutExternalPath = filePath;
        this.postFxLutExternalText = rawText;
        if (!filePath || !rawText) {
            this.postFxLutExternalRuntimeText = null;
            return;
        }

        const entry = this.getImportedLutEntry(filePath);
        if (!entry) {
            this.postFxLutExternalRuntimeText = null;
            return;
        }

        this.postFxLutExternalPath = entry.sourcePath;
        this.postFxLutExternalText = entry.rawText;
        this.postFxLutExternalRuntimeText = entry.runtimeText;
        this.mmdManager.setPostEffectExternalLut(entry.sourcePath, entry.runtimeText, entry.sourceFormat);
    }

    public async importExternalLutFile(
        filePath: string,
        source: "dialog" | "drop" | "project",
        notify = true,
        rawTextOverride?: string,
        sourceModeOverride: LutSourceMode = "external-absolute",
    ): Promise<boolean> {
        const rawText = typeof rawTextOverride === "string"
            ? rawTextOverride
            : await window.electronAPI.readTextFile(filePath);
        if (!rawText) {
            if (notify) {
                this.showToast("Failed to load LUT file", "error");
            }
            return false;
        }

        let normalizedLut: ReturnType<typeof normalizeLutFile>;
        try {
            normalizedLut = normalizeLutFile(filePath, rawText);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (notify) {
                this.showToast(`Failed to load LUT file: ${message}`, "error");
            }
            return false;
        }

        const entry = this.registerImportedLutEntry(filePath, normalizedLut);
        this.postFxLutExternalPath = entry.sourcePath;
        this.postFxLutExternalText = entry.rawText;
        this.postFxLutExternalRuntimeText = entry.runtimeText;
        this.mmdManager.setPostEffectExternalLut(entry.sourcePath, entry.runtimeText, entry.sourceFormat);
        this.mmdManager.postEffectLutSourceMode = sourceModeOverride;
        if (source !== "project") {
            this.mmdManager.postEffectLutEnabled = true;
        }
        if (notify) {
            this.showToast(`Loaded LUT: ${this.getBaseNameForRenderer(filePath)}`, "success");
        }
        this.refreshShaderPanel();
        return true;
    }

    private getImportedLutEntry(filePath: string): ImportedLutRegistryEntry | null {
        return this.customLutEntriesByPath.get(normalizeImportedLutPath(filePath)) ?? null;
    }

    private registerImportedLutEntry(filePath: string, normalizedLut: {
        displayName: string;
        rawText: string;
        runtimeText: string;
        sourceFormat: "3dl" | "cube";
    }): ImportedLutRegistryEntry {
        const entry: ImportedLutRegistryEntry = {
            sourcePath: filePath,
            displayName: normalizedLut.displayName,
            rawText: normalizedLut.rawText,
            runtimeText: normalizedLut.runtimeText,
            sourceFormat: normalizedLut.sourceFormat,
        };
        this.customLutEntriesByPath.set(normalizeImportedLutPath(filePath), entry);
        return entry;
    }
}
