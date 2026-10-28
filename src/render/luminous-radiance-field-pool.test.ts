import { describe, expect, it } from "vitest";
import type { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { beginLuminousRadianceFields, LuminousRadianceFieldPool, registerLuminousRadianceField } from "./luminous-radiance-field-pool";

const resources = (id: number) => ({ baseFields: [id, id + 1], probeEpochs: {} as StorageBuffer });
const ignoreDependencies = () => undefined;

describe("RC field sharing", () => {
    it("declares every fixed slot before build, shares equal ranges, and splits/rejoins live", () => {
        const pool = new LuminousRadianceFieldPool(), aHandles = new Set<number>(), bHandles = new Set<number>();
        const a = pool.register(resources(10), resource => resource.baseFields.forEach(handle => aHandles.add(handle)));
        const b = pool.register(resources(20), resource => resource.baseFields.forEach(handle => bHandles.add(handle)));
        expect([...aHandles].sort()).toEqual([10, 11, 20, 21]); expect(bHandles).toEqual(aHandles);
        pool.beginExecution();
        expect(a.claim(12, 1).refresh).toBe(true);
        expect(b.claim(12, 1)).toMatchObject({ slot: a.slot, refresh: false });
        pool.beginExecution();
        expect(a.claim(12, 1).refresh).toBe(false);
        expect(b.claim(20, 1)).toMatchObject({ slot: b.slot, refresh: true });
        pool.beginExecution();
        expect(a.claim(12, 2).refresh).toBe(true);
        expect(b.claim(12, 2)).toMatchObject({ slot: a.slot, refresh: false });
        expect(a.slot.history.epoch).toBe(2); expect(b.slot.history.epoch).toBe(1);
        a.release(); b.release();
    });

    it("selects the first active consumer in execution order and does no work while all are off", () => {
        const pool = new LuminousRadianceFieldPool();
        const a = pool.register(resources(10), ignoreDependencies), b = pool.register(resources(20), ignoreDependencies);
        pool.beginExecution(); expect(a.slot.history.epoch).toBe(0); expect(b.slot.history.epoch).toBe(0);
        expect(b.claim(12, 1)).toMatchObject({ slot: b.slot, refresh: true });
        expect(a.claim(12, 1)).toMatchObject({ slot: b.slot, refresh: false });
        pool.beginExecution();
        expect(a.claim(12, 1)).toMatchObject({ slot: a.slot, refresh: true });
        expect(b.claim(12, 1)).toMatchObject({ slot: a.slot, refresh: false });
        a.release(); a.release();
        expect(b.claim(12, 1)).toMatchObject({ slot: b.slot, refresh: false });
        b.release();
    });

    it("persists epoch-wrap and resource-reset generations for sleeping followers", () => {
        const pool = new LuminousRadianceFieldPool(2);
        const a = pool.register(resources(10), ignoreDependencies), b = pool.register(resources(20), ignoreDependencies);
        a.claim(12, 1); const remembered = b.claim(12, 1).slot.generation;
        pool.beginExecution(); a.claim(12, 2);
        pool.beginExecution(); expect(a.claim(12, 3).resetEpochs).toBe(true);
        pool.beginExecution(); expect(a.claim(12, 3).refresh).toBe(false);
        const resumed = b.claim(12, 3).slot;
        expect(resumed.generation).toBeGreaterThan(remembered); expect(resumed.history.epoch).toBe(1);
        const generation = resumed.generation;
        a.invalidate();
        expect(a.slot.generation).toBe(generation + 1); expect(a.slot.history.epoch).toBe(0);
        expect(a.claim(12, 3).refresh).toBe(true);
        a.release(); b.release();
    });

    it("does not mix graphs or source identities", () => {
        const graph = {} as FrameGraph, otherGraph = {} as FrameGraph, source = {}, otherSource = {};
        const a = registerLuminousRadianceField(graph, source, resources(10), ignoreDependencies);
        const b = registerLuminousRadianceField(graph, source, resources(20), ignoreDependencies);
        const c = registerLuminousRadianceField(otherGraph, source, resources(30), ignoreDependencies);
        const d = registerLuminousRadianceField(graph, otherSource, resources(40), ignoreDependencies);
        beginLuminousRadianceFields(graph); beginLuminousRadianceFields(otherGraph);
        a.claim(12, 1);
        expect(b.claim(12, 1).slot).toBe(a.slot);
        expect(c.claim(12, 1).slot).toBe(c.slot); expect(d.claim(12, 1).slot).toBe(d.slot);
        for (const lease of [a, b, c, d]) lease.release();
    });
});
