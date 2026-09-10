import { t } from "../i18n";
import { mountAutomationSettings } from "./automation-settings-panel";
import type { PopupContentController } from "./popup-dialog-controller";
import { HdriSettingsDialogController, type HdriSettingsDialogControllerDeps } from "./hdri-settings-dialog-controller";
import { createPopupFormButton, createPopupFormButtonRow, createPopupFormField } from "./popup-form-helpers";

export class ExperimentalSettingsDialogController implements PopupContentController {
    private busy = false;
    private disposeAutomation: (() => void) | undefined;
    public unmount(): void { this.disposeAutomation?.(); this.disposeAutomation = undefined; }
    constructor(private readonly deps: HdriSettingsDialogControllerDeps & { switchPbr: (enabled: boolean) => Promise<void> }) {}

    public canClose(): boolean { return !this.busy; }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form";
        this.disposeAutomation = mountAutomationSettings(form);
        const pbr = document.createElement("input");
        pbr.type = "checkbox";
        pbr.className = "popup-form-checkbox";
        const isPbr = (): boolean => {
            return this.deps.mmdManager.getMmdMaterialPipelinePreset() === "pbr-standard";
        };
        pbr.checked = isPbr();
        form.append(createPopupFormField(t("experiment.pbr"), pbr));
        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("experiment.pbrNote");
        form.append(note);
        const details = document.createElement("section");
        details.dataset.experimentalLighting = "true";
        const summary = document.createElement("h3");
        summary.textContent = t("experiment.pbrDetails");
        details.append(summary);
        const hdri = new HdriSettingsDialogController(this.deps);
        hdri.mount(details);
        const ibl = document.createElement("p");
        ibl.className = "popup-form-note";
        ibl.textContent = t("experiment.iblUnavailable");
        details.append(ibl);
        form.append(details);
        pbr.addEventListener("change", () => {
            this.busy = true;
            pbr.disabled = true;
            details.inert = true;
            void this.deps.switchPbr(pbr.checked).catch((error: unknown) => {
                window.electronAPI.logError("ui", "Material mode switch failed", {
                    message: error instanceof Error ? error.message : String(error),
                });
                this.deps.showToast(t("experiment.switchFailed"), "error");
            }).finally(() => {
                this.busy = false;
                pbr.disabled = false;
                details.inert = false;
                pbr.checked = isPbr();
                hdri.refresh();
                this.deps.refreshUi();
            });
        });

        const heading = document.createElement("h3");
        heading.textContent = t("experiment.logs");
        const path = document.createElement("input");
        path.type = "text";
        path.readOnly = true;
        path.className = "popup-form-control";
        path.setAttribute("aria-label", t("experiment.logPath"));
        void window.electronAPI.getLogFileInfo().then(info => { path.value = info.path; }).catch(() => {
            this.deps.showToast(t("experiment.logFailed"), "error");
        });
        const buttons = [
            ["menu.tools.openLogFolder", () => window.electronAPI.openLogFolder()],
            ["experiment.openLog", () => window.electronAPI.openCurrentLog()],
            ["experiment.copyLog", () => window.electronAPI.copyCurrentLog()],
        ] as const;
        const row = createPopupFormButtonRow(buttons.map(([key, action]) => {
            const button = createPopupFormButton(t(key), "secondary");
            button.addEventListener("click", () => {
                button.disabled = true;
                void action().then(ok => {
                    this.deps.showToast(t(ok ? "experiment.logDone" : "experiment.logFailed"), ok ? "success" : "error");
                }).catch(() => this.deps.showToast(t("experiment.logFailed"), "error"))
                    .finally(() => { button.disabled = false; });
            });
            return button;
        }));
        form.append(heading, path, row);
        container.append(form);
    }
}
