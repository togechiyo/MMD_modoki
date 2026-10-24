import type { EffectInstance, SerializedEffectInstances } from "../editor/frame-graph-effect-instances";

export type EffectInstanceDiff = {
    type: "effect.instances";
    beforeOrder: string[];
    afterOrder: string[];
    changes: Array<{ instanceId: string; before: EffectInstance | null; after: EffectInstance | null }>;
};
export function buildEffectInstanceDiff(before: SerializedEffectInstances, after: SerializedEffectInstances): EffectInstanceDiff | null {
    const previous = new Map(before.instances.map(item => [item.instanceId, item]));
    const next = new Map(after.instances.map(item => [item.instanceId, item]));
    const changes: EffectInstanceDiff["changes"] = [];
    for (const instanceId of new Set([...previous.keys(), ...next.keys()])) {
        const a = previous.get(instanceId) ?? null, b = next.get(instanceId) ?? null;
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ instanceId, before: structuredClone(a), after: structuredClone(b) });
    }
    if (!changes.length && JSON.stringify(before.order) === JSON.stringify(after.order)) return null;
    return { type: "effect.instances", beforeOrder: [...before.order], afterOrder: [...after.order], changes };
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function authored(instance: EffectInstance): EffectInstance {
    const result = structuredClone(instance);
    result.animation.tracks = result.animation.tracks.filter(raw => {
        const track = raw as { effectId?: string; keys?: unknown[]; preview?: unknown };
        delete track.preview;
        return track.effectId !== instance.type || !Array.isArray(track.keys) || track.keys.length > 0;
    });
    return result;
}
/** Validate first and change only the authored fields covered by this command. */
export function applyEffectInstanceDiff(current: SerializedEffectInstances, diff: EffectInstanceDiff, direction: "apply" | "revert"): SerializedEffectInstances | null {
    const source = direction === "apply" ? "before" : "after", target = direction === "apply" ? "after" : "before";
    const orderChanged = !equal(diff.beforeOrder, diff.afterOrder);
    if (orderChanged && !equal(current.order, direction === "apply" ? diff.beforeOrder : diff.afterOrder)) return null;
    const instances = new Map(current.instances.map(item => [item.instanceId, structuredClone(item)]));
    for (const change of diff.changes) {
        const actual = instances.get(change.instanceId) ?? null, from = change[source], to = change[target];
        if (!from || !to) {
            if (!equal(actual ? authored(actual) : null, from ? authored(from) : null)) return null;
            if (to) instances.set(change.instanceId, structuredClone(to)); else instances.delete(change.instanceId);
        } else {
            if (!actual || actual.type !== from.type) return null;
            for (const field of ["label", "settings", "animation", "bloomColor"] as const) {
                if (equal(from[field], to[field])) continue;
                if (!equal(actual[field], from[field])) return null;
                Object.assign(actual, { [field]: structuredClone(to[field]) });
            }
        }
    }
    return { version: 1, instances: [...instances.values()], order: orderChanged ? [...(direction === "apply" ? diff.afterOrder : diff.beforeOrder)] : [...current.order] };
}
