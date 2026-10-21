import { EffectSceneTrackStore, type SerializedEffectAnimations } from "./effect-scene-track-store";
import { makeEffectPayload, normalizeEffectValue, getEffectDefinition, type EffectKeyframePayload, type EffectValue } from "./effect-keyframe-definitions";
import { isFrameGraphPostEffectId, type FrameGraphPostEffectId } from "../shared/frame-graph-post-effect-stack";

export type GammaInstance = {
    instanceId: string;
    type: "gamma";
    label: string;
    settings: { enabled: boolean; gamma: number };
    animation: SerializedEffectAnimations;
};
export type SerializedEffectInstances = { version: 1; instances: GammaInstance[]; order: string[] };
type Entry = Omit<GammaInstance, "animation"> & { tracks: EffectSceneTrackStore };
const gamma = (value: unknown): GammaInstance["settings"] => normalizeEffectValue(getEffectDefinition("gamma"), value) as GammaInstance["settings"];
const validId = (value: unknown): value is string => typeof value === "string" && /^fx-[a-zA-Z0-9-]{1,190}$/.test(value);

/** Each authored instance owns a track store. Evaluation does not mutate authored values. */
export class FrameGraphEffectInstances {
    private entries = new Map<string, Entry>();
    private ordered: string[] = [];
    has(id: string): boolean { return this.entries.has(id); }
    ids(): string[] { return [...this.entries.keys()]; }
    type(id: string): "gamma" | null { return this.has(id) ? "gamma" : null; }
    label(id: string): string { return this.get(id).label; }
    present(id: string): boolean { return this.ordered.includes(id); }
    order(): string[] { return [...this.ordered]; }
    hasTrack(id: string): boolean { return this.get(id).tracks.has("gamma"); }
    frames(id: string): Uint32Array { return this.get(id).tracks.frames("gamma"); }
    staticValue(id: string): GammaInstance["settings"] { return { ...this.get(id).settings }; }
    value(id: string, frame: number, preview = false): GammaInstance["settings"] {
        const entry = this.get(id);
        return gamma(entry.tracks.evaluate("gamma", frame, preview) ?? entry.settings);
    }
    capture(id: string, frame: number, preview = true): EffectKeyframePayload {
        return { ...makeEffectPayload("gamma", this.value(id, frame, preview)), instanceId: id };
    }
    read(id: string, frame: number): EffectKeyframePayload | null {
        const payload = this.get(id).tracks.read("gamma", frame);
        return payload ? { ...payload, instanceId: id } : null;
    }
    setValue(id: string, value: EffectValue, frame: number, keyPreview = false): void {
        const entry = this.get(id);
        if (entry.tracks.has("gamma") || keyPreview) entry.tracks.preview("gamma", frame, value, entry.settings);
        else entry.settings = gamma(value);
    }
    apply(id: string, frame: number, payload: EffectKeyframePayload | null): boolean {
        if (payload && (payload.instanceId !== id || payload.effectId !== "gamma")) return false;
        const entry = this.get(id);
        return entry.tracks.apply("gamma", frame, payload, entry.settings);
    }
    remove(id: string, frames: readonly number[]): boolean { return this.get(id).tracks.remove("gamma", frames); }
    move(id: string, from: number, to: number): boolean { return this.get(id).tracks.move("gamma", from, to); }
    clearPreviews(frame?: number): void {
        for (const entry of this.entries.values()) {
            if (frame === undefined) entry.tracks.clearPreviews();
            else entry.tracks.clearPreviewsOutside(frame);
        }
    }
    add(id: string, settings: unknown = { enabled: true, gamma: 1 }, animation?: unknown): void {
        if (!validId(id) || this.has(id)) throw new Error("Invalid or duplicate effect instance ID");
        const tracks = new EffectSceneTrackStore(); tracks.restore(animation);
        this.entries.set(id, { instanceId: id, type: "gamma", label: `Gamma ${this.entries.size + 1}`, settings: gamma(settings), tracks });
        this.ordered.push(id);
    }
    duplicate(id: string, nextId: string): void {
        const entry = this.get(id), animation = entry.tracks.serialize();
        for (const track of animation.tracks) if (track && typeof track === "object") delete (track as { preview?: unknown }).preview;
        this.add(nextId, entry.settings, animation);
    }
    rename(id: string, label: string): void {
        const normalized = label.trim();
        if (!normalized || normalized.length > 80 || [...normalized].some(char => char.charCodeAt(0) < 32)) throw new Error("Invalid effect instance name");
        this.get(id).label = normalized;
    }
    suspend(id: string): void { this.get(id); this.ordered = this.ordered.filter(token => token !== id); }
    resume(id: string): void { this.get(id); if (!this.present(id)) this.ordered.push(id); }
    delete(id: string): void { this.suspend(id); this.entries.delete(id); }
    setOrder(order: readonly string[]): void {
        if (new Set(order).size !== order.length || order.some(id => !this.has(id) && !isFrameGraphPostEffectId(id))) throw new Error("Invalid effect order");
        this.ordered = [...order];
    }
    /** Preserve instance slots while the existing singleton stack changes. */
    syncLegacyOrder(legacy: readonly FrameGraphPostEffectId[]): void {
        const next = [...legacy];
        const order = this.ordered.filter(id => this.has(id) || next.includes(id as FrameGraphPostEffectId));
        let index = 0;
        this.ordered = order.map(id => this.has(id) ? id : next[index++]);
        this.ordered.push(...next.slice(index));
    }
    serialize(): SerializedEffectInstances {
        return { version: 1, instances: [...this.entries.values()].map(({ tracks, ...entry }) => ({ ...structuredClone(entry), animation: tracks.serialize() })), order: this.order() };
    }
    restore(data: unknown): void {
        const next = new FrameGraphEffectInstances();
        if (data !== null && data !== undefined) {
            const state = data as SerializedEffectInstances;
            if (state.version !== 1 || !Array.isArray(state.instances) || !Array.isArray(state.order)) throw new Error("Unsupported effect instance format");
            for (const item of state.instances) {
                if (item?.type !== "gamma") throw new Error("Unsupported effect instance type");
                next.add(item.instanceId, item.settings, item.animation);
                next.rename(item.instanceId, item.label);
            }
            next.setOrder(state.order);
        }
        this.entries = next.entries; this.ordered = next.ordered;
    }
    private get(id: string): Entry {
        const entry = this.entries.get(id);
        if (!entry) throw new Error(`Unknown effect instance: ${id}`);
        return entry;
    }
}
