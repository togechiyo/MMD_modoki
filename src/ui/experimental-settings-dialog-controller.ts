import { t } from "../i18n";
import { wgslRecoveryApi } from "../external-wgsl/recovery";
import { mountAutomationSettings } from "./automation-settings-panel";
import type { PopupContentController } from "./popup-dialog-controller";
import { HdriSettingsDialogController, type HdriSettingsDialogControllerDeps } from "./hdri-settings-dialog-controller";
import { createPopupFormButton, createPopupFormButtonRow } from "./popup-form-helpers";
import { createExperimentalSection, createExperimentalToggle } from "./experimental-settings-layout";

export class ExperimentalSettingsDialogController implements PopupContentController {
    private busy = false;
    private disposeAutomation: (() => void) | undefined;
    private disposeWgsl: (() => void) | undefined;
    public unmount(): void {
        this.disposeAutomation?.(); this.disposeAutomation = undefined;
        this.disposeWgsl?.(); this.disposeWgsl = undefined;
    }
    constructor(private readonly deps: HdriSettingsDialogControllerDeps & { switchPbr: (enabled: boolean) => Promise<void> }) {}

    public canClose(): boolean { return !this.busy; }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form experimental-settings";
        const pbrSection = createExperimentalSection("PBR");
        const wgslSection = createExperimentalSection("WGSL");
        const wgsl = document.createElement("input"); wgsl.type = "checkbox"; wgsl.className = "popup-form-checkbox";
        wgsl.checked = this.deps.mmdManager.getExternalWgslService().enabled;
        this.disposeWgsl = wgslRecoveryApi()?.onBlocked(() => { wgsl.checked = false; });
        wgslSection.append(createExperimentalToggle(t("wgsl.permission"), wgsl));
        const wgslNote = document.createElement("p");
        wgslNote.className = "popup-form-note"; wgslNote.textContent = t("wgsl.safetyNote");
        wgslSection.append(wgslNote);
        wgslNote.id = "experiment-wgsl-note";
        wgsl.setAttribute("aria-describedby", wgslNote.id);
        wgsl.addEventListener("change", () => {
            wgsl.disabled = true; this.busy = true;
            void this.deps.mmdManager.getExternalWgslService().setEnabled(wgsl.checked).catch((error: unknown) => {
                this.deps.showToast(String(error), "error");
            }).finally(() => {
                wgsl.checked = this.deps.mmdManager.getExternalWgslService().enabled;
                wgsl.disabled = false; this.busy = false; this.deps.refreshUi();
            });
        });
        const pbr = document.createElement("input");
        pbr.type = "checkbox";
        pbr.className = "popup-form-checkbox";
        const isPbr = (): boolean => {
            return this.deps.mmdManager.getMmdMaterialPipelinePreset() === "pbr-standard";
        };
        pbr.checked = isPbr();
        pbrSection.append(createExperimentalToggle(t("experiment.pbr"), pbr));
        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.textContent = t("experiment.pbrNote");
        pbrSection.append(note);
        note.id = "experiment-pbr-note";
        pbr.setAttribute("aria-describedby", note.id);
        const details = document.createElement("fieldset");
        details.className = "experimental-settings-subsection";
        details.dataset.experimentalLighting = "true";
        const summary = document.createElement("h4");
        summary.id = "experiment-pbr-details-title";
        details.setAttribute("aria-labelledby", summary.id);
        summary.textContent = t("experiment.pbrDetails");
        details.append(summary);
        const hdri = new HdriSettingsDialogController(this.deps);
        hdri.mount(details);
        const ibl = document.createElement("p");
        ibl.className = "popup-form-note";
        ibl.textContent = t("experiment.iblUnavailable");
        details.append(ibl);
        details.disabled = !isPbr();
        pbrSection.append(details);
        pbr.addEventListener("change", () => {
            this.busy = true;
            pbr.disabled = true;
            details.disabled = true;
            void this.deps.switchPbr(pbr.checked).catch((error: unknown) => {
                window.electronAPI.logError("ui", "Material mode switch failed", {
                    message: error instanceof Error ? error.message : String(error),
                });
                this.deps.showToast(t("experiment.switchFailed"), "error");
            }).finally(() => {
                this.busy = false;
                pbr.disabled = false;
                pbr.checked = isPbr();
                details.disabled = !pbr.checked;
                hdri.refresh();
                this.deps.refreshUi();
            });
        });

        const logs = document.createElement("details");
        logs.className = "experimental-settings-logs experimental-settings-details";
        const heading = document.createElement("summary");
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
        logs.append(heading, path, row);
        form.append(pbrSection, wgslSection);
        this.disposeAutomation = mountAutomationSettings(form);
        form.append(logs);
        container.append(form);
    }
}
