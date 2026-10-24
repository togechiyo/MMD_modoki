import { EffectSceneTrackStore, type SerializedEffectAnimations } from "./effect-scene-track-store";
import { makeEffectPayload, type EffectKeyframePayload, type EffectValue } from "./effect-keyframe-definitions";
import { instanceValue, instanceColor, isEffectInstanceType, INSTANCE_EFFECT_NAMES, type EffectInstanceType, type InstanceColor, type EvaluatedEffectInstance } from "./frame-graph-instance-effects";
import { isFrameGraphPostEffectId, type FrameGraphPostEffectId } from "../shared/frame-graph-post-effect-stack";
import { instanceFixedSettings, type InstanceFixedSettings } from "./frame-graph-instance-fixed-settings";

export type EffectInstance = {
    instanceId: string;
    type: EffectInstanceType;
    label: string;
    settings: EffectValue;
    bloomColor?: InstanceColor;
    fixedSettings?: InstanceFixedSettings;
    animation: SerializedEffectAnimations;
};
export type SerializedEffectInstances = { version: 1; instances: EffectInstance[]; order: string[] };
type Entry = Omit<EffectInstance, "animation"> & { tracks: EffectSceneTrackStore };
const validId = (value: unknown): value is string => typeof value === "string" && /^fx-[a-zA-Z0-9-]{1,190}$/.test(value);

/** Each authored instance owns a track store. Evaluation does not mutate authored values. */
export class FrameGraphEffectInstances {
    private entries = new Map<string, Entry>();
    private ordered: string[] = [];
    has(id: string): boolean { return this.entries.has(id); }
    ids(): string[] { return [...this.entries.keys()]; }
    type(id: string): EffectInstanceType | null { return this.entries.get(id)?.type ?? null; }
    label(id: string): string { return this.get(id).label; }
    present(id: string): boolean { return this.ordered.includes(id); }
    order(): string[] { return [...this.ordered]; }
    hasTrack(id: string): boolean { const entry = this.get(id); return entry.tracks.has(entry.type); }
    frames(id: string): Uint32Array { const entry = this.get(id); return entry.tracks.frames(entry.type); }
    staticValue(id: string): EffectValue { return { ...this.get(id).settings }; }
    value(id: string, frame: number, preview = false): EffectValue {
        const entry = this.get(id);
        return instanceValue(entry.type, entry.tracks.evaluate(entry.type, frame, preview) ?? entry.settings);
    }
    /** Fixed assets are immutable until replaced; do not clone embedded LUT text per frame. */
    renderState(id: string, frame: number, preview: boolean): EvaluatedEffectInstance {
        const entry = this.get(id);
        return { instanceId: id, type: entry.type, value: this.value(id, frame, preview), bloomColor: entry.bloomColor, fixedSettings: entry.fixedSettings };
    }
    capture(id: string, frame: number, preview = true): EffectKeyframePayload {
        return { ...makeEffectPayload(this.get(id).type, this.value(id, frame, preview)), instanceId: id };
    }
    read(id: string, frame: number): EffectKeyframePayload | null {
        const entry = this.get(id), payload = entry.tracks.read(entry.type, frame);
        return payload ? { ...payload, instanceId: id } : null;
    }
    setValue(id: string, value: EffectValue, frame: number, keyPreview = false): void {
        const entry = this.get(id);
        if (entry.tracks.has(entry.type) || keyPreview) entry.tracks.preview(entry.type, frame, value, entry.settings);
        else entry.settings = instanceValue(entry.type, value);
    }
    apply(id: string, frame: number, payload: EffectKeyframePayload | null): boolean {
        const entry = this.get(id);
        if (payload && (payload.instanceId !== id || payload.effectId !== entry.type)) return false;
        return entry.tracks.apply(entry.type, frame, payload, entry.settings);
    }
    remove(id: string, frames: readonly number[]): boolean { const entry = this.get(id); return entry.tracks.remove(entry.type, frames); }
    move(id: string, from: number, to: number): boolean { const entry = this.get(id); return entry.tracks.move(entry.type, from, to); }
    clearPreviews(frame?: number): void {
        for (const entry of this.entries.values()) {
            if (frame === undefined) entry.tracks.clearPreviews();
            else entry.tracks.clearPreviewsOutside(frame);
        }
    }
    add(id: string, settings?: unknown, animation?: unknown, type: EffectInstanceType = "gamma"): void {
        if (!validId(id) || this.has(id)) throw new Error("Invalid or duplicate effect instance ID");
        const tracks = new EffectSceneTrackStore(); tracks.restore(animation);
        this.entries.set(id, { instanceId: id, type, label: `${INSTANCE_EFFECT_NAMES[type]} ${[...this.entries.values()].filter(entry => entry.type === type).length + 1}`, settings: instanceValue(type, settings), tracks,
            ...(type === "bloom" ? { bloomColor: { r: 254 / 255, g: 220 / 255, b: 186 / 255 } } : {}) });
        const fixed = instanceFixedSettings(type);
        if (fixed) this.get(id).fixedSettings = fixed;
        this.ordered.push(id);
    }
    duplicate(id: string, nextId: string): void {
        const entry = this.get(id), animation = entry.tracks.serialize();
        for (const track of animation.tracks) if (track && typeof track === "object") delete (track as { preview?: unknown }).preview;
        this.add(nextId, entry.settings, animation, entry.type);
        if (entry.bloomColor) this.setBloomColor(nextId, entry.bloomColor);
        if (entry.fixedSettings) this.setFixedSettings(nextId, entry.fixedSettings);
    }
    setFixedSettings(id: string, value: InstanceFixedSettings): void {
        const entry = this.get(id), fixed = instanceFixedSettings(entry.type, value);
        if (!fixed) throw new Error("Effect has no fixed settings");
        entry.fixedSettings = fixed;
    }
    fixedSettings(id: string): InstanceFixedSettings | undefined { return structuredClone(this.get(id).fixedSettings); }
    setBloomColor(id: string, value: unknown): void {
        const entry = this.get(id);
        if (entry.type !== "bloom") throw new Error("Only Bloom owns a color");
        entry.bloomColor = instanceColor(value);
    }
    bloomColor(id: string): InstanceColor | undefined { const color = this.get(id).bloomColor; return color ? { ...color } : undefined; }
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
                if (!item || !isEffectInstanceType(item.type)) throw new Error("Unsupported effect instance type");
                next.add(item.instanceId, item.settings, item.animation, item.type);
                if (item.type === "bloom") next.setBloomColor(item.instanceId, item.bloomColor);
                if (item.fixedSettings) next.setFixedSettings(item.instanceId, item.fixedSettings);
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
