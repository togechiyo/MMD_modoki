import { applyI18nToDom, t } from "../i18n";
import { logError, toLogErrorData } from "../app-logger";
import {
    DEFAULT_RADIANCE_LAB_SETTINGS, decodeRadianceLabSettings, encodeRadianceLabSettings,
    normalizeRadianceLabSettings, type RadianceLabSettings,
} from "../render/radiance-cascade-lab-model";
import { RadianceCascadeLabRenderer, type RadianceLabReport } from "../render/radiance-cascade-lab-renderer";
import type { PopupContentController } from "./popup-dialog-controller";
import "./radiance-cascade-lab.css";

function label(key: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.i18n = `radianceLab.${key}`;
    element.textContent = t(`radianceLab.${key}`);
    return element;
}

export class RadianceCascadeLabDialogController implements PopupContentController {
    private settings = normalizeRadianceLabSettings(DEFAULT_RADIANCE_LAB_SETTINGS);
    private renderer: RadianceCascadeLabRenderer | null = null;
    private container: HTMLElement | null = null;
    private status: HTMLElement | null = null;
    private lastReport: RadianceLabReport | null = null;
    private generation = 0;

    public mount(container: HTMLElement): void {
        this.container = container;
        const generation = ++this.generation;
        const root = document.createElement("div");
        root.className = "radiance-lab";
        const note = document.createElement("p");
        note.className = "popup-form-note";
        note.append(label("note"));
        const canvas = document.createElement("canvas");
        canvas.className = "radiance-lab-canvas";
        canvas.setAttribute("aria-label", t("radianceLab.preview"));
        canvas.dataset.i18nAriaLabel = "radianceLab.preview";
        const controls = document.createElement("div");
        controls.className = "radiance-lab-controls";
        for (const key of ["emitterEnabled", "rcEnabled", "glowEnabled", "blockerEnabled"] as const) {
            const field = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox"; input.name = key;
            field.append(input, label(key)); controls.append(field);
        }
        this.addInput(controls, "emitterColor", "color");
        this.addInput(controls, "emissionGain", "range", { min: "0", max: "24", step: "0.5" });
        this.addInput(controls, "blockerX", "range", { min: "-2.5", max: "2.5", step: "0.1" });
        const cameraField = document.createElement("label");
        cameraField.append(label("camera"));
        const camera = document.createElement("select");
        camera.className = "popup-form-control"; camera.name = "camera";
        for (const value of ["overview", "receiver"] as const) {
            const option = document.createElement("option");
            option.value = value; option.textContent = t(`radianceLab.${value}`);
            option.dataset.i18n = `radianceLab.${value}`; camera.append(option);
        }
        cameraField.append(camera); controls.append(cameraField);
        this.status = document.createElement("p");
        this.status.className = "radiance-lab-status";
        this.status.setAttribute("role", "status");
        this.status.dataset.state = "loading";
        this.status.textContent = t("radianceLab.loading");
        const actions = document.createElement("div");
        actions.className = "popup-form-button-row";
        const file = document.createElement("input");
        file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
        file.setAttribute("aria-label", t("radianceLab.load"));
        file.addEventListener("change", () => { void this.load(file); });
        this.addButton(actions, "save", () => this.save());
        this.addButton(actions, "load", () => file.click());
        this.addButton(actions, "reset", () => {
            this.settings = normalizeRadianceLabSettings(DEFAULT_RADIANCE_LAB_SETTINGS);
            this.syncControls(); this.update();
        });
        root.append(note, canvas, controls, this.status, actions, file);
        container.append(root);
        controls.addEventListener("input", event => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
            const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked
                : input instanceof HTMLInputElement && input.type === "range" ? Number(input.value) : input.value;
            this.settings = normalizeRadianceLabSettings({ ...this.settings, [input.name]: value });
            this.syncControls(); this.update();
        });
        this.syncControls();
        void RadianceCascadeLabRenderer.create(canvas, this.settings, report => {
            if (generation !== this.generation) return;
            this.lastReport = report;
            this.showReport();
            if (report.status === "error") logError("render", "radiance cascade lab GPU failure", { message: report.message });
        }).then(renderer => {
            if (generation !== this.generation) { renderer.dispose(); return; }
            this.renderer = renderer;
            renderer.update(this.settings);
        }).catch(error => {
            if (generation !== this.generation) return;
            logError("render", "radiance cascade lab initialization failed", toLogErrorData(error));
            if (this.status) {
                this.status.dataset.state = "error";
                this.status.textContent = `${t("radianceLab.failed")}: ${error instanceof Error ? error.message : String(error)}`;
            }
        });
    }

    public unmount(): void {
        this.generation++;
        this.renderer?.dispose(); this.renderer = null;
        this.container = null; this.status = null; this.lastReport = null;
    }

    public refreshLocale(): void {
        if (this.container) applyI18nToDom(this.container);
        this.showReport();
    }

    private addInput(parent: HTMLElement, name: string, type: string, attributes: Record<string, string> = {}): void {
        const field = document.createElement("label");
        field.append(label(name));
        const input = document.createElement("input");
        input.type = type; input.name = name;
        Object.entries(attributes).forEach(([key, value]) => input.setAttribute(key, value));
        field.append(input);
        if (type === "range") {
            const output = document.createElement("output"); output.dataset.valueFor = name; field.append(output);
        }
        parent.append(field);
    }

    private addButton(parent: HTMLElement, key: string, action: () => void): void {
        const button = document.createElement("button");
        button.type = "button"; button.className = "popup-form-button popup-form-button-secondary";
        button.append(label(key)); button.addEventListener("click", action); parent.append(button);
    }

    private syncControls(): void {
        this.container?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]").forEach(input => {
            const key = input.name as keyof RadianceLabSettings;
            if (!(key in this.settings)) return;
            if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(this.settings[key]);
            else input.value = String(this.settings[key]);
        });
        this.container?.querySelectorAll<HTMLOutputElement>("[data-value-for]").forEach(output => {
            output.value = String(this.settings[output.dataset.valueFor as keyof RadianceLabSettings]);
        });
    }

    private update(): void {
        if (this.status) { this.status.dataset.state = "loading"; this.status.textContent = t("radianceLab.loading"); }
        this.renderer?.update(this.settings);
    }

    private showReport(): void {
        if (!this.status || !this.lastReport) return;
        const report = this.lastReport;
        this.status.dataset.state = report.status;
        this.status.dataset.renderRevision = String(report.revision);
        this.status.dataset.fieldRevision = String(report.fieldRevision);
        this.status.textContent = report.status === "error" ? `${t("radianceLab.failed")}: ${report.message}`
            : report.giMilliseconds === null ? t("radianceLab.noTiming")
                : `${t("radianceLab.giTime")} ${report.giMilliseconds.toFixed(2)} ms · ${t("radianceLab.renderTime")} ${(report.renderMilliseconds ?? 0).toFixed(2)} ms · ${t("radianceLab.memory")}`;
    }

    private save(): void {
        const blob = new Blob([encodeRadianceLabSettings(this.settings)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = "radiance-cascade-lab.json"; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    private async load(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        if (!file) return;
        const generation = this.generation;
        try {
            if (file.size > 16384) throw new Error("Settings file is too large");
            const settings = decodeRadianceLabSettings(await file.text());
            if (!this.container || generation !== this.generation) return;
            this.settings = settings; this.syncControls(); this.update();
        } catch (error) {
            if (this.status && generation === this.generation) {
                this.status.dataset.state = "error";
                this.status.textContent = `${t("radianceLab.loadFailed")}: ${error instanceof Error ? error.message : String(error)}`;
            }
        } finally { input.value = ""; }
    }
}
