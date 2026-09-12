import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { EffectAsset, EffectChange, EffectTarget } from "../external-wgsl/contract";

const prefix = "external-effect::";
export function externalEffectPresetId(asset: EffectAsset): string {
    const path = asset.originPath?.replace(/\\/g, "/");
    return prefix + (path ? (/^(?:[a-z]:|\/\/)/i.test(path) ? path.toLowerCase() : path) : asset.revision);
}

/** Session imports augment the normal preset catalog; assigned packages come from project assets. */
export class ExternalWgslPresets {
    private readonly imported = new Map<string, EffectAsset>();
    private readonly loadButton = document.createElement("button");
    public busy = false;
    constructor(private readonly manager: MmdManager, private readonly committed: (changes: EffectChange[]) => void,
        private readonly refresh: () => void, private readonly select: (id: string) => void) {
        this.loadButton.id = "external-wgsl-load";
        this.loadButton.type = "button"; this.loadButton.className = "info-action-btn";
        document.getElementById("shader-preset-select")?.parentElement?.after(this.loadButton);
        this.loadButton.addEventListener("click", () => void this.run(async () => {
            const path = await window.electronAPI.openFileDialog([{ name: "Modoki WGSL", extensions: ["wgsl"] }]);
            if (!path) return;
            const result = await window.electronAPI.readEffectPackage(path);
            if (!result.asset) throw new Error(result.error ?? "WGSL read failed");
            const id = externalEffectPresetId(result.asset);
            this.imported.set(id, result.asset);
            this.refresh(); this.select(id);
        }));
    }
    public update(available: boolean): void {
        const service = this.manager.getExternalWgslService();
        this.loadButton.textContent = t("wgsl.import");
        this.loadButton.hidden = !service.enabled;
        this.loadButton.disabled = !available || this.busy || service.busy;
    }
    private assets(): Map<string, EffectAsset> {
        return new Map([...this.manager.getExternalWgslService().getAssets().map(asset => [externalEffectPresetId(asset), asset] as const), ...this.imported]);
    }
    public catalog() {
        return [...this.assets()].map(([id, asset]) => ({ id, label: `WGSL: ${asset.manifest.name}`, description: asset.manifest.description ?? "" }));
    }
    public static isExternal(id: string): boolean { return id.startsWith(prefix); }
    public assigned(target: EffectTarget): { id: string; label: string } | null {
        const service = this.manager.getExternalWgslService(); const state = service.state(target);
        const asset = state.assignment ? service.getAsset(state.assignment.effectRevision) : null;
        if (!state.assignment) return null;
        return { id: asset ? externalEffectPresetId(asset) : prefix + state.assignment.effectRevision,
            label: `WGSL: ${state.name || t("wgsl.state.unresolved")}` + (state.status === "ready" ? "" : ` / ${t("wgsl.state." + state.status)}`) };
    }
    public async apply(id: string, targets: EffectTarget[]): Promise<boolean> {
        return this.run(async () => {
            const service = this.manager.getExternalWgslService();
            const restored = targets.map(target => service.state(target).assignment)
                .map(assignment => assignment ? service.getAsset(assignment.effectRevision) : null)
                .find(asset => asset && externalEffectPresetId(asset) === id);
            // An explicit import wins; otherwise keep the selected material's saved revision.
            const asset = this.imported.get(id) ?? restored ?? this.assets().get(id);
            if (!asset) throw new Error("WGSL preset is unavailable");
            this.committed(await this.manager.applyExternalWgsl(targets, asset));
        }, targets);
    }
    public async clear(targets: EffectTarget[]): Promise<boolean> {
        const assigned = targets.filter(target => this.manager.getExternalWgslService().state(target).assignment);
        if (!assigned.length) return true;
        return this.run(async () => this.committed(await this.manager.applyExternalWgsl(assigned, null)), assigned);
    }
    private async run(action: () => Promise<void>, targets: EffectTarget[] = []): Promise<boolean> {
        if (this.busy || this.manager.getExternalWgslService().busy) return false;
        this.busy = true; this.refresh();
        try { await action(); return true; }
        catch (error) {
            const message = t("wgsl.failed") + ": " + (error instanceof Error ? error.message : String(error));
            window.electronAPI.logError("ui", "External WGSL operation failed", {
                message, source: targets[0] ? this.manager.getExternalWgslService().source(targets[0]) : undefined,
            });
            const summary = message.split(/\r?\n/, 1)[0].slice(0, 300);
            this.manager.onError?.("WGSL: " + summary + (summary.length < message.length ? "…" : ""));
            return false;
        } finally { this.busy = false; this.refresh(); }
    }
}
