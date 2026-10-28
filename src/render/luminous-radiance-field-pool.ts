import type { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { LuminousRadianceHistory } from "./luminous-radiance-history";

export type RadianceFieldResources = { baseFields: FrameGraphTextureHandle[]; probeEpochs: StorageBuffer };
export type RadianceFieldSlot = {
    resources: RadianceFieldResources;
    history: LuminousRadianceHistory;
    revision: number;
    range: number;
    generation: number;
};

// Slots are fixed at graph build time. Only the first active consumer of each range writes its
// slot; followers read it. Reserving each slot lets ranges split/join without new GPU resources.
export class LuminousRadianceFieldPool {
    private readonly slots = new Map<RadianceFieldSlot, (resources: RadianceFieldResources) => void>();
    private readonly claimed = new Map<number, RadianceFieldSlot>();

    constructor(private readonly epochLimit?: number) {}

    public get empty(): boolean { return this.slots.size === 0; }
    public beginExecution(): void { this.claimed.clear(); }

    public register(resources: RadianceFieldResources, addDependencies: (resources: RadianceFieldResources) => void) {
        const slot: RadianceFieldSlot = { resources, history: new LuminousRadianceHistory(this.epochLimit), revision: -1, range: -1, generation: 0 };
        for (const [other, add] of this.slots) { add(resources); addDependencies(other.resources); }
        addDependencies(resources); this.slots.set(slot, addDependencies);
        let released = false;
        const forgetClaims = () => {
            for (const [range, owner] of this.claimed) if (owner === slot) this.claimed.delete(range);
        };
        return {
            slot,
            claim: (range: number, revision: number) => {
                if (released) throw new Error("Cannot use a released RC field slot");
                const owner = this.claimed.get(range);
                if (owner) return { slot: owner, refresh: false, resetEpochs: false };
                this.claimed.set(range, slot);
                const refresh = slot.revision !== revision || slot.range !== range;
                const resetEpochs = refresh && slot.history.advanceField();
                // Persist wrap/reset generations so inactive receivers cannot miss invalidation.
                if (resetEpochs) slot.generation++;
                if (refresh) { slot.revision = revision; slot.range = range; }
                return { slot, refresh, resetEpochs };
            },
            invalidate: () => {
                slot.history.reset(); slot.revision = -1; slot.range = -1; slot.generation++; forgetClaims();
            },
            release: () => {
                if (released) return;
                released = true; this.slots.delete(slot); forgetClaims();
            },
        };
    }
}

const graphs = new WeakMap<FrameGraph, Map<object, LuminousRadianceFieldPool>>();

export function registerLuminousRadianceField(graph: FrameGraph, source: object, resources: RadianceFieldResources,
    addDependencies: (resources: RadianceFieldResources) => void) {
    let sources = graphs.get(graph);
    if (!sources) { sources = new Map(); graphs.set(graph, sources); }
    let pool = sources.get(source);
    if (!pool) { pool = new LuminousRadianceFieldPool(); sources.set(source, pool); }
    const lease = pool.register(resources, addDependencies), owners = sources, group = pool;
    let released = false;
    return { ...lease, release: () => {
        if (released) return;
        released = true; lease.release();
        if (group.empty) owners.delete(source);
        if (owners.size === 0) graphs.delete(graph);
    } };
}

export function beginLuminousRadianceFields(graph: FrameGraph): void {
    for (const pool of graphs.get(graph)?.values() ?? []) pool.beginExecution();
}
