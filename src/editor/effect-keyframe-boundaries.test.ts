import { describe, expect, it, vi } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES, type EffectInstanceType } from "./frame-graph-instance-effects";
import { getEffectDefinition, makeEffectPayload, type EffectValue } from "./effect-keyframe-definitions";
import { executeCommand, type CommandExecutionContext } from "../actions/command-executor";
import type { BuiltCommand } from "../actions/command-types";

function fixture(type: EffectInstanceType) {
    const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, type); store.add("fx-b", undefined, undefined, type);
    const base = store.staticValue("fx-a");
    const values = [0.2, 0.8, 0.4].map((fraction, index): EffectValue => {
        const value: EffectValue = { ...base, enabled: index === 1 };
        for (const [name, field] of Object.entries(getEffectDefinition(type).fields)) {
            if (field.kind === "linear") value[name] = field.min + (field.max - field.min) * fraction;
            if (field.kind === "log") value[name] = [0.5, 2, 1][index];
        }
        if (type === "dof") Object.assign(value, { focusMode: index === 2 ? "camera-target" : "model-target",
            targetModelInstanceId: ["model-a", "model-b", ""][index], targetBoneName: ["頭", "首", ""][index] });
        return value;
    });
    const payload = (value: EffectValue) => ({ ...makeEffectPayload(type, value), instanceId: "fx-a" });
    // Registering in reverse/mixed order must still produce chronological keys.
    for (const index of [2, 0, 1]) expect(store.apply("fx-a", [10, 20, 30][index], payload(values[index]))).toBe(true);
    return { store, base, a: values[0], b: values[1], c: values[2], payload };
}

// Independent weighted-value oracle; do not call the production interpolation helper.
function between(type: EffectInstanceType, a: EffectValue, b: EffectValue, numerator: number, denominator = 10): EffectValue {
    return Object.fromEntries(Object.entries(a).map(([field, x]) => {
        const y = b[field];
        if (typeof x !== "number" || typeof y !== "number") return [field, x];
        return [field, type === "gamma" && field === "gamma"
            ? x ** ((denominator - numerator) / denominator) * y ** (numerator / denominator)
            : (x * (denominator - numerator) + y * numerator) / denominator];
    })) as EffectValue;
}

function assertValue(actual: EffectValue, expected: EffectValue): void {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [field, value] of Object.entries(expected)) {
        if (typeof value === "number") expect(actual[field], field).toBeCloseTo(value, 8);
        else expect(actual[field], field).toBe(value);
    }
}

describe("effect key ordering and frame boundaries", () => {
    it.each(FRAME_GRAPH_INSTANCE_EFFECT_TYPES)("%s: base, exact keys, adjacent frames, gaps and tail are seek-order independent", type => {
        const { store, base, a, b, c } = fixture(type), saved = store.serialize();
        const samples: Array<[number, EffectValue]> = [[0, base], [9, base], [9.9, base], [10, a], [11, between(type, a, b, 1)],
            [15, between(type, a, b, 5)], [19, between(type, a, b, 9)], [20, b], [21, between(type, b, c, 1)],
            [25, between(type, b, c, 5)], [29, between(type, b, c, 9)], [30, c], [31, c], [300, c]];
        expect([...store.frames("fx-a")]).toEqual([10, 20, 30]);
        const restored = new FrameGraphEffectInstances(); restored.restore(saved);
        for (const [frame, expected] of [...samples, ...[...samples].reverse(), samples[8], samples[0], samples[6], samples[11]]) {
            assertValue(store.value("fx-a", frame), expected);
            assertValue(restored.value("fx-a", frame), expected);
            assertValue(store.value("fx-b", frame), base);
            const key = store.read("fx-a", frame);
            if ([10, 20, 30].includes(Math.floor(frame))) { expect(key?.instanceId).toBe("fx-a"); assertValue(key?.value ?? { enabled: false }, expected); }
            else expect(key).toBeNull();
        }
        expect(store.serialize()).toEqual(saved);
    });

    it.each(FRAME_GRAPH_INSTANCE_EFFECT_TYPES)("%s: overwrite, moving across earlier keys and deletions invalidate cached neighbours", type => {
        const { store, base, a, b, c, payload } = fixture(type);
        store.value("fx-a", 15); store.value("fx-a", 20);
        expect(store.apply("fx-a", 20, payload(c))).toBe(true);
        expect([...store.frames("fx-a")]).toEqual([10, 20, 30]);
        assertValue(store.value("fx-a", 15), between(type, a, c, 5)); assertValue(store.value("fx-a", 20), c);
        store.apply("fx-a", 20, payload(b));
        const saved = store.serialize();
        expect(store.move("fx-a", 30, 20)).toBe(false); expect(store.move("fx-a", 99, 5)).toBe(false);
        expect(store.remove("fx-a", [10, 999])).toBe(false); expect(store.serialize()).toEqual(saved);
        expect(store.move("fx-a", 30, 5)).toBe(true); expect([...store.frames("fx-a")]).toEqual([5, 10, 20]);
        assertValue(store.value("fx-a", 4), base); assertValue(store.value("fx-a", 5), c);
        assertValue(store.value("fx-a", 9), between(type, c, a, 4, 5)); assertValue(store.value("fx-a", 10), a);
        assertValue(store.value("fx-a", 15), between(type, a, b, 5)); assertValue(store.value("fx-a", 300), b);
        expect(store.remove("fx-a", [10])).toBe(true);
        assertValue(store.value("fx-a", 10), between(type, c, b, 5, 15));
        expect(store.remove("fx-a", [5])).toBe(true);
        assertValue(store.value("fx-a", 19), base); assertValue(store.value("fx-a", 20), b);
        expect(store.remove("fx-a", [20])).toBe(true);
        expect([...store.frames("fx-a")]).toEqual([]);
        for (const frame of [0, 9, 10, 20, 30, 300]) assertValue(store.value("fx-a", frame), base);
        assertValue(store.value("fx-b", 20), base);
    });

    it.each(FRAME_GRAPH_INSTANCE_EFFECT_TYPES)("%s: unregistered edits do not leak to neighbouring frames or playback/export", type => {
        const { store, a, b, c, payload } = fixture(type);
        const neighbour = between(type, a, b, 9);
        store.value("fx-a", 19); store.setValue("fx-a", c, 19);
        assertValue(store.value("fx-a", 19, true), c); assertValue(store.value("fx-a", 19, false), neighbour);
        assertValue(store.value("fx-a", 20, true), b);
        store.setValue("fx-a", c, 20);
        const saved = store.serialize(), restored = new FrameGraphEffectInstances(); restored.restore(saved);
        assertValue(restored.value("fx-a", 20, true), c); assertValue(restored.value("fx-a", 20, false), b);
        assertValue(restored.value("fx-a", 19, true), neighbour);
        restored.clearPreviews(19); assertValue(restored.value("fx-a", 20, true), b);
        expect(store.apply("fx-a", 20, payload(c))).toBe(true);
        assertValue(store.value("fx-a", 19, true), between(type, a, c, 9)); assertValue(store.value("fx-a", 20, true), c);
    });

    it("keeps adjacent ON/OFF and DoF target changes atomic, including reverse seeks", () => {
        const { store, a, b, c, payload } = fixture("dof");
        store.remove("fx-a", [10, 20, 30]);
        for (const [frame, value] of [[10, a], [11, b], [12, c]] as const) store.apply("fx-a", frame, payload(value));
        for (const [frame, expected] of [[10, a], [11, b], [12, c], [13, c], [11, b], [10, a]] as const) assertValue(store.value("fx-a", frame), expected);
    });

    it("replays actual move, overwrite and delete Commands without changing earlier/later segments", () => {
        const { store, base, a, b, c, payload } = fixture("gamma");
        const track = { category: "effect" as const, name: "fx-a" };
        const context: CommandExecutionContext = {
            addTimelineKeyframe: (ref, frame) => store.apply(ref.name, frame, store.capture(ref.name, frame)),
            removeTimelineKeyframe: (ref, frame) => store.apply(ref.name, frame, null),
            moveTimelineKeyframe: (ref, from, to) => store.move(ref.name, from, to),
            applyTimelineKeyframePayload: (ref, frame, value) => {
                if (!value) return store.apply(ref.name, frame, null);
                return value.kind === "effect" ? store.apply(ref.name, frame, value) : false;
            },
            setSelectedFrame: vi.fn(), seekToBoundary: vi.fn(), refreshAfterKeyframeEdit: vi.fn(),
        };
        const command = (diff: BuiltCommand["diff"]): BuiltCommand => ({ id: "boundary-test", label: "boundary test", scope: "keyframe", createdAtMs: 0, diff });
        const original = store.serialize();
        const move = command({ type: "keyframe.move", track, fromFrame: 30, toFrame: 5, beforeFrames: [10, 20, 30], afterFrames: [5, 10, 20] });
        expect(executeCommand(move, "apply", context)).toBe(true); assertValue(store.value("fx-a", 5), c);
        expect(executeCommand(move, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        const overwrite = command({ type: "keyframe.paste", track, frame: 20, before: payload(b), after: payload(c) });
        for (let repeat = 0; repeat < 3; repeat++) {
            expect(executeCommand(overwrite, "apply", context)).toBe(true); assertValue(store.value("fx-a", 19), between("gamma", a, c, 9));
            expect(executeCommand(overwrite, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        }
        const remove = command({ type: "keyframe.batchDelete", items: [10, 20, 30].map((frame, index) => ({ track, frame, before: payload([a, b, c][index]) })) });
        expect(executeCommand(remove, "apply", context)).toBe(true); assertValue(store.value("fx-a", 100), base);
        expect(executeCommand(remove, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        expect(context.refreshAfterKeyframeEdit).toHaveBeenCalled();
    });
});
