import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { WebGPUPipelineContext } from "@babylonjs/core/Engines/WebGPU/webgpuPipelineContext";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { ExternalWgslMaterialPlugin } from "./material-plugin";
import { beforeDeadline, WgslTimeoutError } from "./deadline";
import { checkProjectEffectCount } from "./limits";
import { isWgslRecoveryBlocked, setWgslRecoveryBlocked, wgslPermissionKey as permissionKey, wgslRecoveryApi } from "./recovery";
import { t } from "../i18n";
import { EffectClock, resolveEffectInputs, type EffectTime } from "./inputs";
import { canonicalEffectContent, defaultEffectAssignment, getEffectAssignment, parseEffectManifest, setEffectAssignment, validateEffectSources, validateParameter,
    type EffectAsset, type EffectAssetReference, type EffectAssignment, type EffectChange, type EffectTarget } from "./contract";

export type LiveEffectTarget = { target: EffectTarget; material: StandardMaterial; meshes: AbstractMesh[] };
type ServiceHost = { scene: Scene; targets: () => LiveEffectTarget[]; frame: () => number; playing: () => boolean;
    viewportSize: () => { width: number; height: number };
    available: () => boolean; suspend: () => void; resume: () => void; changed: () => void; failed: (message: string) => void };
export class ExternalWgslService {
    public busy = false;
    public enabled = false;
    public diagnostic = "";
    private diagnosticSource = "";
    private readonly assets = new Map<string, EffectAsset | EffectAssetReference>();
    private readonly plugins = new WeakMap<StandardMaterial, ExternalWgslMaterialPlugin>();
    private clock = new EffectClock();
    private time: EffectTime = { frame: 0, time: 0, elapsed: 0, asyncTime: 0, asyncElapsed: 0 };
    private output: { elapsed: number; frame?: number } | undefined;
    private pendingPermission: boolean | null = null;
    private compilation: AbortController | null = null;
    private armed = false;
    constructor(private readonly host: ServiceHost) {
        try { this.enabled = localStorage.getItem(permissionKey) === "true"; } catch { this.enabled = false; }
        if (isWgslRecoveryBlocked()) this.enabled = false;
        const removeBlockedListener = wgslRecoveryApi()?.onBlocked(() => this.stopAfterFailure(t("wgsl.recovered"), false));
        const engine = host.scene.getEngine();
        const lost = engine.onContextLostObservable.add(() => {
            if (this.armed) this.stopAfterFailure(t("wgsl.deviceLost"));
        });
        host.scene.onDisposeObservable.addOnce(() => {
            removeBlockedListener?.(); engine.onContextLostObservable.remove(lost);
            this.compilation?.abort(new Error("WGSL scene disposed"));
        });
        const onStorage = (event: StorageEvent): void => {
            if (event.key !== permissionKey) return;
            const enabled = event.newValue === "true";
            if (this.busy) this.pendingPermission = enabled;
            else void this.setEnabled(enabled, false).catch(error => { this.diagnostic = String(error); this.host.changed(); });
        };
        globalThis.addEventListener?.("storage", onStorage);
        host.scene.onDisposeObservable.addOnce(() => globalThis.removeEventListener?.("storage", onStorage));
        host.scene.onBeforeRenderObservable.add(() => {
            if (!this.enabled || !this.assets.size) return;
            this.time = this.clock.evaluate(this.output?.frame ?? host.frame(), host.playing(), performance.now() / 1000, this.output);
        });
    }
    public setOutput(elapsed: number | null, frame?: number): void { this.output = elapsed === null ? undefined : { elapsed, frame }; }
    public freezeForCapture(frame: number): () => void {
        const previous = this.output; this.output = { frame, elapsed: 0 };
        return () => { this.output = previous; };
    }
    public async setEnabled(enabled: boolean, persist = true): Promise<void> {
        if (this.busy) throw new Error("WGSL operation is in progress");
        if (enabled && persist) {
            const api = wgslRecoveryApi();
            if (!api) throw new Error("WGSL recovery service unavailable");
            await beforeDeadline(api.allow(), performance.now() + 15000);
            setWgslRecoveryBlocked(false);
        }
        if (enabled && isWgslRecoveryBlocked()) enabled = false;
        this.enabled = enabled;
        let persistenceFailure = "";
        if (persist) {
            try { localStorage.setItem(permissionKey, String(enabled)); }
            catch { persistenceFailure = "WGSL permission changed for this session; setting could not be saved"; }
        }
        await this.reconcile();
        if (!this.enabled) { this.armed = false; await wgslRecoveryApi()?.disarm(); }
        if (persistenceFailure) this.diagnostic = persistenceFailure;
        this.host.changed();
    }
    private stopAfterFailure(message: string, report = true): void {
        const alreadyStopped = isWgslRecoveryBlocked() && !this.enabled;
        setWgslRecoveryBlocked(true);
        this.enabled = false; this.armed = false; this.pendingPermission = null;
        this.compilation?.abort(new Error(message));
        // Preserve assignments and assets for save/edit, but never restore the previous GPU shader here.
        for (const item of this.host.targets()) this.plugins.get(item.material)?.configure(null, null);
        if (!alreadyStopped) {
            this.diagnostic = message; this.host.changed(); this.host.failed(message);
        }
        if (report) void wgslRecoveryApi()?.fail().catch(error => {
            this.diagnostic = message + "\nWGSL recovery marker: " + String(error);
            this.host.failed(this.diagnostic);
        });
    }
    public async addAsset(value: EffectAsset): Promise<void> {
        const manifest = parseEffectManifest(value.manifest);
        validateEffectSources(manifest, value.sources);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalEffectContent({ manifest, sources: value.sources })));
        const revision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (revision !== value.revision) throw new Error("WGSL content hash mismatch");
        this.assets.set(revision, structuredClone({ ...value, manifest }));
    }
    public getAsset(revision: string): EffectAsset | null { const asset = this.assets.get(revision); return asset && "manifest" in asset ? asset : null; }
    public getAssets(): EffectAsset[] { return [...this.assets.values()].filter((asset): asset is EffectAsset => "manifest" in asset); }
    public exportAssets(revisions: Set<string>): Array<EffectAsset | EffectAssetReference> {
        return [...revisions].map(revision => {
            const asset = this.assets.get(revision);
            if (!asset) throw new Error("Missing WGSL revision: " + revision);
            return structuredClone(asset);
        });
    }
    public async importAssets(values: Array<EffectAsset | EffectAssetReference>): Promise<string[]> {
        checkProjectEffectCount(values);
        this.assets.clear(); this.clock = new EffectClock();
        const warnings: string[] = [];
        for (const value of values) {
            try {
                if ("manifest" in value) await this.addAsset(value);
                else { this.assets.set(value.revision, structuredClone(value)); warnings.push("WGSL asset unavailable: " + value.path); }
            } catch (error) { warnings.push(String(error)); }
        }
        return warnings;
    }
    private find(target: EffectTarget): LiveEffectTarget | undefined {
        return this.host.targets().find(item => item.target.modelInstanceId === target.modelInstanceId && item.target.materialKey === target.materialKey);
    }
    private plugin(item: LiveEffectTarget): ExternalWgslMaterialPlugin {
        let plugin = this.plugins.get(item.material);
        if (!plugin) {
            plugin = new ExternalWgslMaterialPlugin(item.material, (asset, assignment, mesh) => resolveEffectInputs(asset, assignment, item.material, mesh, this.time, this.host.viewportSize()));
            this.plugins.set(item.material, plugin);
        }
        return plugin;
    }
    public source(target: EffectTarget): string {
        if (this.diagnostic && this.diagnosticSource) return this.diagnosticSource;
        const item = this.find(target); return item ? this.plugins.get(item.material)?.generatedSource() ?? "" : "";
    }
    public state(target: EffectTarget): { assignment: EffectAssignment | null; status: string; name: string } {
        const item = this.find(target);
        const assignment = item ? getEffectAssignment(item.material) : null;
        const asset = assignment ? this.getAsset(assignment.effectRevision) : null;
        const failure = item ? this.plugins.get(item.material)?.failure : null;
        return { assignment, name: asset?.manifest.name ?? "",
            status: !this.enabled || assignment?.enabled === false ? "disabled" : !this.host.available() ? "unsupported" : this.busy ? "compiling" : failure ? "error" : assignment && !asset ? "unresolved" : assignment ? "ready" : "none" };
    }
    public async apply(targets: EffectTarget[], asset: EffectAsset | null, parameters?: EffectAssignment["parameters"]): Promise<EffectChange[]> {
        if (!targets.length) throw new Error("No WGSL target selected");
        const alreadyStored = asset ? this.assets.has(asset.revision) : false;
        if (asset) await this.addAsset(asset);
        const changes = targets.map(target => {
            const item = this.find(target); if (!item) throw new Error("WGSL target no longer exists");
            const after = asset ? defaultEffectAssignment(asset) : null;
            if (after && parameters) after.parameters = structuredClone(parameters);
            return { target, before: getEffectAssignment(item.material), after };
        });
        try { await this.transaction(changes, Boolean(asset), true); }
        catch (error) { if (asset && !alreadyStored) this.assets.delete(asset.revision); throw error; }
        return changes;
    }
    public pruneAssets(retained: Set<string>): void {
        for (const revision of this.assets.keys()) if (!retained.has(revision)) this.assets.delete(revision);
    }
    public restore(changes: EffectChange[], direction: "apply" | "revert"): boolean {
        if (this.busy || changes.some(change => !this.find(change.target))) return false;
        for (const change of changes) {
            const item = this.find(change.target); if (!item) return false;
            setEffectAssignment(item.material, direction === "apply" ? change.after : change.before);
            this.plugins.get(item.material)?.configure(null, null);
        }
        void this.reconcile(); this.host.changed(); return true;
    }
    public async reconcile(): Promise<void> {
        if (this.busy) return;
        const changes = this.host.targets().filter(item => getEffectAssignment(item.material) || this.plugins.has(item.material))
            .map(item => ({ target: item.target, before: getEffectAssignment(item.material), after: getEffectAssignment(item.material) }));
        if (!this.enabled || !this.host.available()) {
            for (const item of this.host.targets()) this.plugins.get(item.material)?.configure(null, null);
            return;
        }
        for (const change of changes) {
            if (!this.enabled) break;
            if (change.after?.enabled === false) {
                const item = this.find(change.target);
                if (item) this.plugins.get(item.material)?.configure(null, null);
                continue;
            }
            try { await this.transaction([change], false); }
            catch (error) { this.diagnostic = String(error); }
        }
        this.host.changed();
    }
    private async transaction(changes: EffectChange[], requireEnabled: boolean, rollbackPrevious = false): Promise<void> {
        if (this.busy) throw new Error("WGSL operation is in progress");
        if (requireEnabled && (!this.enabled || !this.host.available())) throw new Error("Enable external WGSL in experimental settings; WebGPU / MMD material mode is required");
        const live = changes.map(change => {
            const item = this.find(change.target); if (!item) throw new Error("WGSL target no longer exists");
            const asset = change.after ? this.getAsset(change.after.effectRevision) : null;
            if (change.after && !asset) throw new Error("Unresolved WGSL asset: " + change.after.effectRevision);
            if (asset && change.after) {
                for (const [name, parameter] of Object.entries(asset.manifest.parameters ?? {})) validateParameter(parameter, change.after.parameters[name]);
                if (asset.manifest.requires?.includes("uv0") && item.meshes.some(mesh => !mesh.isVerticesDataPresent("uv"))) throw new Error("Target has no UV0");
            }
            return { item, change, asset, oldHotSwap: item.material.allowShaderHotSwapping };
        });
        this.busy = true; this.host.suspend(); this.host.changed();
        this.compilation = new AbortController();
        try {
            const deadline = performance.now() + 15000;
            if (live.some(({ asset }) => asset)) {
                const api = wgslRecoveryApi();
                if (!api) throw new Error("WGSL recovery service unavailable");
                await beforeDeadline(api.arm(), deadline, this.compilation.signal);
                this.armed = true;
            }
            this.compilation.signal.throwIfAborted();
            for (const { item, change, asset } of live) {
                item.material.allowShaderHotSwapping = false;
                if (asset) this.plugin(item).configure(asset, change.after);
                else this.plugins.get(item.material)?.configure(null, null);
            }
            this.diagnosticSource = live.map(({ item }) => this.plugins.get(item.material)?.generatedSource() ?? "").find(Boolean) ?? "";
            if (this.host.available()) for (const { item } of live) await this.compile(item, deadline);
            this.compilation.signal.throwIfAborted();
            for (const { item, change } of live) {
                if (this.find(change.target)?.material !== item.material) throw new Error("WGSL target changed during compilation");
            }
            for (const { item, change } of live) setEffectAssignment(item.material, change.after);
            this.diagnostic = "";
            this.diagnosticSource = "";
        } catch (error) {
            if (error instanceof WgslTimeoutError) this.stopAfterFailure(error.message);
            for (const { item, change } of live) {
                if (this.find(change.target)?.material !== item.material) continue;
                const previous = change.before ? this.getAsset(change.before.effectRevision) : null;
                const plugin = this.plugins.get(item.material);
                const restore = rollbackPrevious && this.enabled && !isWgslRecoveryBlocked();
                plugin?.configure(restore ? previous : null, restore ? change.before : null);
                if (!rollbackPrevious && plugin) plugin.failure = String(error);
                if (rollbackPrevious) setEffectAssignment(item.material, change.before);
            }
            this.diagnostic = String(error);
            throw error;
        } finally {
            for (const { item, oldHotSwap } of live) item.material.allowShaderHotSwapping = oldHotSwap;
            this.compilation = null;
            this.busy = false; this.host.resume(); this.host.changed();
            if (this.pendingPermission !== null) {
                const enabled = this.pendingPermission; this.pendingPermission = null;
                void this.setEnabled(enabled, false).catch(error => { this.diagnostic = String(error); this.host.changed(); });
            }
        }
    }
    private async compile(item: LiveEffectTarget, deadline: number): Promise<void> {
        const engine = this.host.scene.getEngine();
        if (!(engine instanceof WebGPUEngine)) throw new Error("WebGPU is required");
        engine._device.pushErrorScope("validation");
        let failure: unknown;
        try { await this.compileStages(item, deadline); }
        catch (error) { failure = error; }
        const validation = await beforeDeadline(engine._device.popErrorScope(), deadline, this.compilation?.signal);
        if (failure) throw failure;
        if (validation) throw new Error(validation.message);
    }
    private async compileStages(item: LiveEffectTarget, deadline: number): Promise<void> {
        for (const mesh of item.meshes) for (const subMesh of mesh.subMeshes ?? []) {
            if (subMesh.getMaterial() !== item.material || mesh.getTotalVertices() === 0) continue;
            while (!item.material.isReadyForSubMesh(mesh, subMesh)) {
                this.compilation?.signal.throwIfAborted();
                if (mesh.isDisposed() || this.find(item.target)?.material !== item.material) throw new Error("WGSL target removed");
                const error = subMesh.effect?.getCompilationError(); if (error) throw new Error(error);
                if (performance.now() > deadline) throw new WgslTimeoutError();
                await new Promise<void>(resolve => setTimeout(resolve, 16));
            }
            // Babylon's WebGPU isReady can precede native WGSL validation.
            const context = subMesh.effect?.getPipelineContext() as WebGPUPipelineContext | null;
            if (!context?.stages) throw new Error("WGSL pipeline stages unavailable");
            for (const stage of [context.stages.vertexStage, context.stages.fragmentStage]) {
                if (!stage) continue;
                const info = await beforeDeadline(stage.module.getCompilationInfo(), deadline, this.compilation?.signal);
                const errors = info.messages.filter(message => message.type === "error");
                if (errors.length) throw new Error(errors.map(message => `Generated WGSL ${message.lineNum}:${message.linePos}: ${message.message}`).join("\n"));
            }
        }
    }
}
