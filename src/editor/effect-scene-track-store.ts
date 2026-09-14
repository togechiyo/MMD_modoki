import { getEffectDefinition, interpolateEffectValue, isEffectId, makeEffectPayload, normalizeEffectValue, type EffectId, type EffectKeyframePayload, type EffectValue } from "./effect-keyframe-definitions";
import { moveSceneKeyframe, removeSceneKeyframe, upsertSceneKeyframe, type SceneKeyframeTrack } from "./scene-keyframe-track";

export type SerializedEffectAnimations = { version: number; tracks: unknown[] };
type Entry = { track: SceneKeyframeTrack<EffectValue>; preview?: { frame: number; value: EffectValue }; revision: number; cache?: { frame: number; revision: number; value: EffectValue } };
const frameNumber = (frame: number): number => Math.max(0, Math.floor(Number.isFinite(frame) ? frame : 0));

/** Owns authored values. Evaluation never mutates base values, keys or previews. */
export class EffectSceneTrackStore {
    private readonly entries = new Map<EffectId, Entry>();
    private unknownTracks: unknown[] = [];
    private unknownBlock: SerializedEffectAnimations | null = null;

    has(id: EffectId): boolean { return this.entries.has(id); }
    ids(): EffectId[] { return [...this.entries.keys()]; }
    frames(id: EffectId): Uint32Array { return new Uint32Array(this.entries.get(id)?.track.keyframes.map(key => key.frame) ?? []); }
    base(id: EffectId): EffectValue | null { const value = this.entries.get(id)?.track.baseValue; return value ? { ...value } : null; }
    ensure(id: EffectId, base: unknown): void {
        if (this.unknownBlock) throw new Error("This project uses a newer effect animation format");
        if (!this.entries.has(id)) this.entries.set(id, { track: { id, interpolation: "linear", baseValue: normalizeEffectValue(getEffectDefinition(id), base), keyframes: [] }, revision: 0 });
    }
    preview(id: EffectId, frame: number, value: unknown, base: unknown): void {
        this.ensure(id, base);
        const entry = this.entries.get(id);
        if (!entry) return;
        const normalized = normalizeEffectValue(getEffectDefinition(id), value);
        if (!entry.track.keyframes.length) entry.track.baseValue = normalized;
        entry.preview = { frame: frameNumber(frame), value: normalized };
        entry.revision++;
    }
    clearPreviews(): void { for (const entry of this.entries.values()) delete entry.preview; }
    clearPreviewsOutside(frame: number): void {
        for (const entry of this.entries.values()) if (entry.preview?.frame !== frameNumber(frame)) delete entry.preview;
    }
    read(id: EffectId, frame: number): EffectKeyframePayload | null {
        const value = this.entries.get(id)?.track.keyframes.find(key => key.frame === frameNumber(frame))?.value;
        return value ? makeEffectPayload(id, value) : null;
    }
    apply(id: EffectId, frame: number, payload: EffectKeyframePayload | null, base: unknown): boolean {
        if (payload && payload.effectId !== id) return false;
        if (!payload && !this.has(id)) return false;
        this.ensure(id, base);
        const entry = this.entries.get(id);
        if (!entry) return false;
        const next = payload ? upsertSceneKeyframe(entry.track, frame, normalizeEffectValue(getEffectDefinition(id), payload.value)) : removeSceneKeyframe(entry.track, frame);
        if (!next) return false;
        entry.track = next;
        delete entry.preview;
        entry.revision++;
        return true;
    }
    remove(id: EffectId, frames: readonly number[]): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;
        let next = entry.track;
        for (const frame of new Set(frames.map(frameNumber))) {
            const removed = removeSceneKeyframe(next, frame);
            if (!removed) return false;
            next = removed;
        }
        entry.track = next;
        delete entry.preview;
        entry.revision++;
        return true;
    }
    move(id: EffectId, from: number, to: number): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;
        const next = moveSceneKeyframe(entry.track, from, to);
        if (!next) return false;
        entry.track = next;
        delete entry.preview;
        entry.revision++;
        return true;
    }
    evaluate(id: EffectId, frame: number, withPreview = false): EffectValue | null {
        const entry = this.entries.get(id);
        if (!entry) return null;
        frame = frameNumber(frame);
        if (withPreview && entry.preview?.frame === frame) return { ...entry.preview.value };
        if (entry.cache?.frame === frame && entry.cache.revision === entry.revision) return { ...entry.cache.value };
        const keys = entry.track.keyframes;
        // Upper bound: reverse seeks cost logarithmic comparisons, not a full key scan.
        let low = 0, high = keys.length;
        while (low < high) { const middle = (low + high) >>> 1; if (keys[middle].frame <= frame) low = middle + 1; else high = middle; }
        const before = keys[low - 1], after = keys[low];
        const value = !before ? entry.track.baseValue : !after ? before.value
            : interpolateEffectValue(getEffectDefinition(id), before.value, after.value, (frame - before.frame) / (after.frame - before.frame));
        entry.cache = { frame, revision: entry.revision, value };
        return { ...value };
    }
    serialize(): SerializedEffectAnimations {
        if (this.unknownBlock && !this.entries.size) return structuredClone(this.unknownBlock);
        return { version: 1, tracks: [ ...this.unknownTracks.map(track => structuredClone(track)), ...[...this.entries].map(([effectId, entry]) => ({
            effectId, valueVersion: 1, base: { ...entry.track.baseValue }, keys: entry.track.keyframes.map(key => ({ frame: key.frame, value: { ...key.value } })),
            ...(entry.preview ? { preview: structuredClone(entry.preview) } : {}),
        })) ] };
    }
    restore(data: unknown): void {
        this.entries.clear(); this.unknownTracks = []; this.unknownBlock = null;
        if (!data || typeof data !== "object") return;
        const block = data as SerializedEffectAnimations;
        if (!Array.isArray(block.tracks)) return;
        if (block.version !== 1) { this.unknownBlock = structuredClone(block); return; }
        for (const raw of block.tracks) {
            if (!raw || typeof raw !== "object") continue;
            const item = raw as { effectId?: string; valueVersion?: number; base?: unknown; keys?: Array<{ frame: number; value: unknown }>; preview?: { frame: number; value: unknown } };
            if (!item.effectId || !isEffectId(item.effectId) || item.valueVersion !== 1) { this.unknownTracks.push(structuredClone(raw)); continue; }
            const id = item.effectId;
            this.ensure(id, item.base);
            const base = this.base(id);
            if (Array.isArray(item.keys)) for (const key of item.keys) {
                if (!key || !Number.isFinite(key.frame) || key.frame < 0) continue;
                this.apply(id, key.frame, makeEffectPayload(id, normalizeEffectValue(getEffectDefinition(id), key.value, base ?? undefined)), base);
            }
            if (item.preview && Number.isFinite(item.preview.frame) && item.preview.frame >= 0) this.preview(id, item.preview.frame, item.preview.value, base);
        }
    }
}
