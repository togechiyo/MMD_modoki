import type { MmdManager } from "../mmd-manager";
import { t } from "../i18n";
import type { PopupContentController } from "./popup-dialog-controller";
import {
    createPopupFormButton,
    createPopupFormButtonRow,
    createPopupFormField,
    createPopupFormRange,
    createPopupFormValueText,
} from "./popup-form-helpers";

type ToastType = "success" | "error" | "info";

export type HdriSettingsDialogControllerDeps = {
    mmdManager: MmdManager;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    refreshUi: () => void;
};

function getBaseName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.split("/").pop() ?? normalized;
}

export class HdriSettingsDialogController implements PopupContentController {
    private refreshState: (() => void) | null = null;

    public refresh(): void { this.refreshState?.(); }
    private readonly mmdManager: MmdManager;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly refreshUi: () => void;

    constructor(deps: HdriSettingsDialogControllerDeps) {
        this.mmdManager = deps.mmdManager;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.refreshUi = deps.refreshUi;
    }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        const grid = document.createElement("div");
        grid.className = "popup-form-grid";
        form.appendChild(grid);

        const sourceValue = createPopupFormValueText();
        const sourcePath = this.mmdManager.getEnvironmentLightingSourcePath();
        sourceValue.textContent = sourcePath ? getBaseName(sourcePath) : t("dialog.hdri.bundled");
        sourceValue.title = sourcePath ?? "";
        grid.appendChild(createPopupFormField(t("dialog.hdri.current"), sourceValue, "div"));

        const backgroundVisible = document.createElement("input");
        backgroundVisible.type = "checkbox";
        backgroundVisible.className = "popup-form-checkbox";
        backgroundVisible.checked = this.mmdManager.isEnvironmentBackgroundVisible();
        backgroundVisible.disabled = !this.mmdManager.canShowEnvironmentBackground();
        grid.appendChild(createPopupFormField(t("dialog.hdri.backgroundVisible"), backgroundVisible));

        const backgroundIntensity = document.createElement("input");
        backgroundIntensity.type = "range";
        backgroundIntensity.className = "popup-form-control popup-form-range";
        backgroundIntensity.min = "0";
        backgroundIntensity.max = "100";
        backgroundIntensity.step = "1";
        backgroundIntensity.value = String(Math.round(
            this.mmdManager.getEnvironmentBackgroundIntensity() * 100,
        ));
        backgroundIntensity.disabled = !this.mmdManager.canShowEnvironmentBackground()
            || !backgroundVisible.checked;
        const backgroundIntensityValue = createPopupFormValueText(
            this.mmdManager.getEnvironmentBackgroundIntensity().toFixed(2),
        );
        grid.appendChild(createPopupFormField(
            t("dialog.hdri.backgroundIntensity"),
            createPopupFormRange(backgroundIntensity, backgroundIntensityValue),
        ));

        const lightingEnabled = document.createElement("input");
        lightingEnabled.type = "checkbox";
        lightingEnabled.className = "popup-form-checkbox";
        lightingEnabled.checked = this.mmdManager.isEnvironmentLightingEnabled();
        grid.appendChild(createPopupFormField(t("dialog.hdri.lightingEnabled"), lightingEnabled));

        const intensity = document.createElement("input");
        intensity.type = "range";
        intensity.className = "popup-form-control popup-form-range";
        intensity.min = "0";
        intensity.max = "400";
        intensity.step = "1";
        intensity.value = String(Math.round(this.mmdManager.getEnvironmentLightingIntensity() * 100));
        intensity.disabled = !lightingEnabled.checked;
        const intensityValue = createPopupFormValueText(
            this.mmdManager.getEnvironmentLightingIntensity().toFixed(2),
        );
        grid.appendChild(createPopupFormField(
            t("dialog.hdri.intensity"),
            createPopupFormRange(intensity, intensityValue),
        ));

        const loadButton = createPopupFormButton(t("dialog.hdri.load"), "secondary");
        const clearButton = createPopupFormButton(t("dialog.hdri.clear"), "secondary");
        clearButton.disabled = sourcePath === null;
        grid.appendChild(createPopupFormField(
            "",
            createPopupFormButtonRow([loadButton, clearButton]),
            "div",
        ));

        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("dialog.hdri.note");
        grid.appendChild(note);

        const refreshSource = (): void => {
            const path = this.mmdManager.getEnvironmentLightingSourcePath();
            sourceValue.textContent = path ? getBaseName(path) : t("dialog.hdri.bundled");
            sourceValue.title = path ?? "";
            clearButton.disabled = path === null;
            backgroundVisible.disabled = !this.mmdManager.canShowEnvironmentBackground();
            backgroundVisible.checked = this.mmdManager.isEnvironmentBackgroundVisible();
            backgroundIntensity.disabled = !this.mmdManager.canShowEnvironmentBackground()
                || !backgroundVisible.checked;
        };

        this.refreshState = () => {
            refreshSource();
            lightingEnabled.checked = this.mmdManager.isEnvironmentLightingEnabled();
            intensity.disabled = !lightingEnabled.checked;
            intensity.value = String(Math.round(this.mmdManager.getEnvironmentLightingIntensity() * 100));
            intensityValue.textContent = this.mmdManager.getEnvironmentLightingIntensity().toFixed(2);
        };

        backgroundVisible.addEventListener("change", () => {
            this.mmdManager.setEnvironmentBackgroundVisible(backgroundVisible.checked);
            backgroundIntensity.disabled = !backgroundVisible.checked;
            this.refreshUi();
        });
        backgroundIntensity.addEventListener("input", () => {
            const applied = this.mmdManager.setEnvironmentBackgroundIntensity(
                Number(backgroundIntensity.value) / 100,
            );
            backgroundIntensityValue.textContent = applied.toFixed(2);
            this.refreshUi();
        });
        lightingEnabled.addEventListener("change", () => {
            this.mmdManager.setEnvironmentLightingEnabled(lightingEnabled.checked);
            intensity.disabled = !lightingEnabled.checked;
            this.refreshUi();
        });
        intensity.addEventListener("input", () => {
            const applied = this.mmdManager.setEnvironmentLightingIntensity(Number(intensity.value) / 100);
            intensityValue.textContent = applied.toFixed(2);
            this.refreshUi();
        });
        loadButton.addEventListener("click", () => {
            void (async () => {
                const filePath = await window.electronAPI.openFileDialog([
                    { name: t("dialog.hdri.hdrFiles"), extensions: ["hdr"] },
                    { name: t("option.allFiles"), extensions: ["*"] },
                ]);
                if (!filePath) return;

                loadButton.disabled = true;
                clearButton.disabled = true;
                this.setStatus(t("dialog.hdri.loading"), true);
                const loaded = await this.mmdManager.setEnvironmentLightingSourcePath(filePath);
                loadButton.disabled = false;
                if (loaded) {
                    backgroundVisible.checked = true;
                    backgroundVisible.disabled = false;
                    backgroundIntensity.disabled = false;
                    lightingEnabled.checked = true;
                    intensity.disabled = false;
                    this.mmdManager.setEnvironmentLightingEnabled(true);
                    refreshSource();
                    this.setStatus(t("dialog.hdri.loaded"), false);
                    this.showToast(t("dialog.hdri.loaded"), "success");
                } else {
                    refreshSource();
                    this.setStatus(t("dialog.hdri.loadFailed"), false);
                    this.showToast(t("dialog.hdri.loadFailed"), "error");
                }
                this.refreshUi();
            })();
        });
        clearButton.addEventListener("click", () => {
            this.mmdManager.clearExternalEnvironmentLightingSource();
            backgroundVisible.checked = false;
            refreshSource();
            this.refreshUi();
            this.showToast(t("dialog.hdri.cleared"), "info");
        });

        container.appendChild(form);
    }
}
