import { t } from "../i18n";
import { createPopupFormButton } from "./popup-form-helpers";
import { createExternalWgslParameter } from "./external-wgsl-parameter";
import type { MmdManager } from "../mmd-manager";
import type { EffectAsset, EffectChange, EffectTarget } from "../external-wgsl/contract";

export class ExternalWgslPanel {
    private readonly root = document.createElement("section");
    private loaded: EffectAsset | null = null;
    private busy = false;
    private message = "";
    private readonly expandedColours = new Set<string>();
    constructor(private readonly manager: MmdManager, private readonly targets: (all: boolean) => EffectTarget[], private readonly committed: (changes: EffectChange[]) => void) {
        this.root.id = "external-wgsl-panel";
        this.root.className = "external-wgsl-panel";
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
        const header = document.createElement("div"); header.className = "external-wgsl-header";
        const title = document.createElement("h3"); title.textContent = t("wgsl.title");
        const badge = document.createElement("span"); badge.className = "external-wgsl-badge";
        badge.textContent = t("wgsl.state." + (state?.status ?? (service.enabled ? "none" : "disabled")));
        badge.dataset.state = state?.status ?? "none";
        header.append(title, badge);
        const status = document.createElement("div"); status.id = "external-wgsl-status";
        status.dataset.state = state?.status ?? (service.enabled ? "none" : "disabled");
        const applied = state?.assignment ? service.getAsset(state.assignment.effectRevision) : null;
        const currentName = document.createElement("div"); currentName.className = "external-wgsl-name";
        currentName.textContent = state?.name ?? "";
        if (currentName.textContent) { currentName.title = currentName.textContent; status.append(currentName); }
        if (this.loaded && this.loaded.revision !== state?.assignment?.effectRevision) {
            const pending = document.createElement("div"); pending.className = "external-wgsl-pending";
            pending.textContent = t("wgsl.loaded") + ": " + this.loaded.manifest.name;
            pending.title = pending.textContent; status.append(pending);
        }
        status.title = applied?.manifest.description ?? "";
        this.root.append(header, status);
        const row = document.createElement("div"); row.className = "external-wgsl-actions";
        const button = (key: string, id: string, action: () => Promise<void>, disabled = false): void => {
            const element = createPopupFormButton(t(key + "Short"), id.includes("apply") ? "primary" : "secondary"); element.id = id;
            element.title = t(key); element.setAttribute("aria-label", t(key));
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
        button("wgsl.applySelected", "external-wgsl-apply-selected", () => apply(false), !this.loaded || !target || !service.enabled);
        button("wgsl.applyAll", "external-wgsl-apply-all", () => apply(true), !this.loaded || !this.targets(true).length || !service.enabled);
        this.root.append(row);
        const asset = applied;
        if (asset && state?.assignment && target) {
            for (const [name, parameter] of Object.entries(asset.manifest.parameters ?? {})) {
                this.root.append(createExternalWgslParameter({
                    name, parameter, value: state.assignment.parameters[name], disabled: !service.enabled || service.busy,
                    expanded: this.expandedColours.has(name),
                    expand: open => { if (open) this.expandedColours.add(name); else this.expandedColours.delete(name); },
                    commit: next => void this.run(async () => {
                        this.committed(await this.manager.applyExternalWgsl([target], asset, { ...state.assignment?.parameters, [name]: next }));
                    }),
                }));
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
