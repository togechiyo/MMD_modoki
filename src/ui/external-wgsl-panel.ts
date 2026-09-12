import { t } from "../i18n";
import { createPopupFormButton, createPopupFormField } from "./popup-form-helpers";
import type { MmdManager } from "../mmd-manager";
import type { EffectAsset, EffectChange, EffectTarget, EffectValue } from "../external-wgsl/contract";

export class ExternalWgslPanel {
    private readonly root = document.createElement("section");
    private loaded: EffectAsset | null = null;
    private busy = false;
    private message = "";
    constructor(private readonly manager: MmdManager, private readonly targets: (all: boolean) => EffectTarget[], private readonly committed: (changes: EffectChange[]) => void) {
        this.root.id = "external-wgsl-panel";
        this.root.className = "popup-form";
        this.root.style.display = "grid"; this.root.style.gap = "8px";
        document.getElementById("shader-material-list")?.before(this.root);
    }
    public refresh(): void {
        const service = this.manager.getExternalWgslService();
        const target = this.targets(false)[0];
        const state = target ? service.state(target) : null;
        this.root.hidden = !service.enabled && !state?.assignment;
        this.root.style.display = this.root.hidden ? "none" : "grid";
        if (this.busy || this.root.contains(document.activeElement)) return;
        this.root.replaceChildren();
        const title = document.createElement("h3"); title.textContent = t("wgsl.title");
        const status = document.createElement("p"); status.id = "external-wgsl-status"; status.className = "popup-form-note";
        status.dataset.state = state?.status ?? (service.enabled ? "none" : "disabled");
        status.textContent = [state?.name, t("wgsl.state." + (state?.status ?? "none")), this.loaded ? t("wgsl.loaded") + ": " + this.loaded.manifest.name : ""].filter(Boolean).join(" / ");
        this.root.append(title, status);
        const row = document.createElement("div"); row.className = "popup-form-button-row";
        const button = (key: string, id: string, action: () => Promise<void>, disabled = false): void => {
            const element = createPopupFormButton(t(key), id.includes("apply") ? "primary" : "secondary"); element.id = id;
            element.disabled = disabled || this.busy || service.busy;
            element.addEventListener("click", () => void this.run(action)); row.append(element);
        };
        button("wgsl.load", "external-wgsl-load", async () => {
            const path = await window.electronAPI.openFileDialog([{ name: "Modoki WGSL manifest", extensions: ["json"] }]);
            if (!path) return;
            this.loaded = await this.read(path); this.message = "";
        }, !service.enabled);
        const apply = async (all: boolean): Promise<void> => {
            if (!this.loaded) return;
            const targets = this.targets(all);
            if (!targets.length) throw new Error(t("wgsl.selectMaterial"));
            this.committed(await this.manager.applyExternalWgsl(targets, this.loaded));
        };
        button("wgsl.applySelected", "external-wgsl-apply-selected", () => apply(false), !this.loaded || !target || !service.enabled);
        button("wgsl.applyAll", "external-wgsl-apply-all", () => apply(true), !this.loaded || !this.targets(true).length || !service.enabled);
        button("wgsl.reload", "external-wgsl-reload", async () => {
            const targets = this.targets(false); const assignment = state?.assignment;
            const previous = assignment ? service.getAsset(assignment.effectRevision) : null;
            if (!previous?.originPath) throw new Error(t("wgsl.selectMaterial"));
            const asset = await this.read(previous.originPath);
            this.committed(await this.manager.applyExternalWgsl(targets, asset)); this.loaded = asset;
        }, !state?.assignment || !service.enabled);
        button("wgsl.clear", "external-wgsl-clear", async () => {
            this.committed(await this.manager.applyExternalWgsl(this.targets(false), null));
        }, !state?.assignment);
        this.root.append(row);
        const asset = state?.assignment ? service.getAsset(state.assignment.effectRevision) : null;
        if (asset && state?.assignment && target) {
            for (const [name, parameter] of Object.entries(asset.manifest.parameters ?? {})) {
                const value = state.assignment.parameters[name];
                const values = Array.isArray(value) ? value : [value];
                const row = document.createElement("div"); row.className = "external-wgsl-parameter-row";
                row.style.display = "grid"; row.style.gap = "4px";
                if (parameter.ui?.control === "color") {
                    const picker = document.createElement("input"); picker.type = "color"; picker.className = "popup-form-control";
                    picker.value = "#" + values.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0")).join("");
                    picker.disabled = !service.enabled || service.busy;
                    row.append(createPopupFormField((parameter.ui.label ?? name) + " RGB", picker));
                    picker.addEventListener("change", () => { picker.blur(); void this.run(async () => {
                        const rgb = [1, 3, 5].map(offset => parseInt(picker.value.slice(offset, offset + 2), 16) / 255);
                        const next = values.length === 4 ? [...rgb, values[3]] : rgb;
                        this.committed(await this.manager.applyExternalWgsl([target], asset, { ...state.assignment?.parameters, [name]: next }));
                    }); });
                }
                const inputs: HTMLInputElement[] = [];
                values.forEach((component, index) => {
                    const input = document.createElement("input"); input.type = "number"; input.value = String(component); input.step = String(parameter.ui?.step ?? "any");
                    input.className = "popup-form-control";
                    input.dataset.wgslParameter = name; input.dataset.component = String(index); input.disabled = !service.enabled || service.busy;
                    if (parameter.ui?.min !== undefined) input.min = String(parameter.ui.min);
                    if (parameter.ui?.max !== undefined) input.max = String(parameter.ui.max);
                    inputs.push(input); row.append(createPopupFormField((parameter.ui?.label ?? name) + (values.length > 1 ? ` [${index}]` : ""), input));
                    input.addEventListener("change", () => { input.blur(); void this.run(async () => {
                        const next: EffectValue = values.length === 1 ? Number(inputs[0].value) : inputs.map(item => Number(item.value));
                        this.committed(await this.manager.applyExternalWgsl([target], asset, { ...state.assignment?.parameters, [name]: next }));
                    }); });
                });
                this.root.append(row);
            }
        }
        const details = document.createElement("details");
        const summary = document.createElement("summary"); summary.textContent = t("wgsl.diagnostics");
        const diagnostic = document.createElement("pre"); diagnostic.id = "external-wgsl-diagnostic";
        diagnostic.style.whiteSpace = "pre-wrap"; diagnostic.style.maxHeight = "240px"; diagnostic.style.overflow = "auto";
        diagnostic.textContent = [this.message, service.diagnostic, target ? service.source(target) : ""].filter(Boolean).join("\n\n");
        details.open = Boolean(this.message || service.diagnostic); details.append(summary, diagnostic); this.root.append(details);
    }
    private async read(path: string): Promise<EffectAsset> {
        const result = await window.electronAPI.readEffectPackage(path);
        if (!result.asset) throw new Error(result.error ?? "WGSL read failed");
        return result.asset;
    }
    private async run(action: () => Promise<void>): Promise<void> {
        this.busy = true;
        for (const input of this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")) input.disabled = true;
        try { await action(); this.message = ""; }
        catch (error) {
            this.message = t("wgsl.failed") + ": " + (error instanceof Error ? error.message : String(error));
            window.electronAPI.logError("ui", "External WGSL operation failed", { message: this.message });
            // Use the same viewport error card as model loading. Keep full compiler output in diagnostics.
            const summary = this.message.split(/\r?\n/, 1)[0].slice(0, 300);
            this.manager.onError?.("WGSL: " + summary + (summary.length < this.message.length ? "…" : ""));
        } finally { this.busy = false; (document.activeElement as HTMLElement | null)?.blur(); this.refresh(); }
    }
}
