import { t } from "../i18n";
import { wgslRecoveryApi } from "../external-wgsl/recovery";
import { mountAutomationSettings } from "./automation-settings-panel";
import type { PopupContentController } from "./popup-dialog-controller";
import { HdriSettingsDialogController, type HdriSettingsDialogControllerDeps } from "./hdri-settings-dialog-controller";
import { createPopupFormButton, createPopupFormButtonRow, createPopupFormField } from "./popup-form-helpers";
import { createExperimentalSection } from "./experimental-settings-layout";
import { RADIANCE_LIGHTING_LAB_ENABLED } from "../render/radiance-sky-visibility-availability";

export class ExperimentalSettingsDialogController implements PopupContentController {
    private busy = false;
    private disposeAutomation: (() => void) | undefined;
    private disposeWgsl: (() => void) | undefined;
    private disposeRadianceSky: (() => void) | undefined;
    public unmount(): void {
        this.disposeAutomation?.(); this.disposeAutomation = undefined;
        this.disposeWgsl?.(); this.disposeWgsl = undefined;
        this.disposeRadianceSky?.(); this.disposeRadianceSky = undefined;
    }
    constructor(private readonly deps: HdriSettingsDialogControllerDeps & { switchPbr: (enabled: boolean) => Promise<void> }) {}

    public canClose(): boolean { return !this.busy; }

    public mount(container: HTMLElement): void {
        const form = document.createElement("div");
        form.className = "popup-form experimental-settings";
        const wgsl = document.createElement("input"); wgsl.type = "checkbox"; wgsl.className = "popup-form-checkbox";
        wgsl.setAttribute("aria-label", t("wgsl.permission"));
        const wgslSection = createExperimentalSection("WGSL", wgsl);
        wgsl.checked = this.deps.mmdManager.getExternalWgslService().enabled;
        this.disposeWgsl = wgslRecoveryApi()?.onBlocked(() => { wgsl.checked = false; });
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
        pbr.setAttribute("aria-label", t("experiment.pbr"));
        const pbrSection = createExperimentalSection("PBR", pbr);
        const isPbr = (): boolean => {
            return this.deps.mmdManager.getMmdMaterialPipelinePreset() === "pbr-standard";
        };
        pbr.checked = isPbr();
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
        if (RADIANCE_LIGHTING_LAB_ENABLED) this.mountRadianceSky(form);
        this.disposeAutomation = mountAutomationSettings(form);
        form.append(logs);
        container.append(form);
    }

    private mountRadianceSky(parent: HTMLElement): void {
        const lab = this.deps.mmdManager.getRadianceSkyVisibilityLab();
        const section = document.createElement("section");
        section.className = "experimental-settings-section";
        section.dataset.experimentSection = "radiance-sky";
        const heading = document.createElement("h3");
        heading.id = "experiment-radiance-sky-title";
        heading.textContent = t("experiment.radianceSky.title");
        section.setAttribute("aria-labelledby", heading.id);
        const enabled = document.createElement("input");
        enabled.type = "checkbox"; enabled.className = "popup-form-checkbox";
        enabled.name = "radianceSkyEnabled";
        const note = document.createElement("p");
        note.className = "popup-form-note"; note.id = "experiment-radiance-sky-note";
        note.textContent = t("experiment.radianceSky.note");
        enabled.setAttribute("aria-describedby", note.id);
        const mode = document.createElement("select");
        mode.name = "radianceSkyMode"; mode.className = "popup-form-control";
        for (const value of ["cascade", "reference", "difference"] as const) {
            const option = document.createElement("option");
            option.value = value; option.textContent = t(`experiment.radianceSky.${value}`);
            mode.append(option);
        }
        const status = document.createElement("p");
        status.className = "popup-form-note";
        status.dataset.radianceSkyStatus = "true";
        status.setAttribute("role", "status");
        let pending = false;
        const refresh = (): void => {
            if (!pending) enabled.checked = lab.enabled;
            enabled.disabled = pending;
            mode.value = lab.mode;
            mode.disabled = pending;
            const info = lab.diagnostics;
            status.dataset.state = info.status;
            status.dataset.resourcesAllocated = String(info.resourcesAllocated);
            status.dataset.prepareCount = String(info.prepareCount);
            status.dataset.fieldRevision = String(info.fieldRevision);
            const text = `${t(`experiment.radianceSky.status.${info.status}`)}${info.reason ? `: ${info.reason}` : ""}`
                + ` · ${t("experiment.radianceSky.frames")} ${info.prepareCount}`
                + ` · ${t("experiment.radianceSky.triangles")} ${info.triangleCount}`;
            if (status.textContent !== text) status.textContent = text;
        };
        enabled.addEventListener("change", () => {
            pending = true; this.busy = true;
            const requested = enabled.checked;
            refresh();
            void lab.setEnabled(requested).catch((error: unknown) => {
                window.electronAPI.logError("ui", "Radiance sky visibility lab toggle failed", {
                    message: error instanceof Error ? error.message : String(error),
                });
                this.deps.showToast(t("experiment.radianceSky.failed"), "error");
            }).finally(() => {
                pending = false; this.busy = false; refresh();
            });
        });
        mode.addEventListener("change", () => {
            if (mode.value === "cascade" || mode.value === "reference" || mode.value === "difference") lab.setMode(mode.value);
            refresh();
        });
        section.append(heading, createPopupFormField(t("experiment.radianceSky.enabled"), enabled), note,
            createPopupFormField(t("experiment.radianceSky.mode"), mode), status);
        parent.append(section);
        refresh();
        const timer = window.setInterval(refresh, 250);
        this.disposeRadianceSky = () => window.clearInterval(timer);
    }
}
