import { expect, it, vi } from "vitest";
import { buildMorphWeightBatch, morphBatchSchema } from "../../src/automation/morph-batch";
import { executeMorphWeightBatch } from "../../src/editor/morph-weight-batch";
const inputs = [{ morphName: "eye", weight: 0.4 }, { morphName: "mouth", weight: 0.7 }];
const make = () => buildMorphWeightBatch("m", 10, inputs, ["eye", "mouth"], () => 0);
it("validates every name before mutation and drops unchanged values", () => {
    expect(() => buildMorphWeightBatch("m", 0, inputs, ["eye"], () => 0)).toThrow("MORPH_NOT_UNIQUE");
    expect(() => buildMorphWeightBatch("m", 0, inputs, ["eye", "mouth", "mouth"], () => 0)).toThrow("MORPH_NOT_UNIQUE");
    expect(buildMorphWeightBatch("m", 0, inputs, ["eye", "mouth"], name => name === "eye" ? 0.4 : 0).items).toHaveLength(1);
    expect(morphBatchSchema.safeParse([...inputs, inputs[0]]).success).toBe(false);
    expect(morphBatchSchema.safeParse([{ morphName: "eye", weight: 1.1 }]).success).toBe(false);
    expect(morphBatchSchema.safeParse([{ ...inputs[0], offsets: [] }]).success).toBe(false);
});
it("applies, undoes and redoes all values as a unit and rejects intervening changes", () => {
    const values: Record<string, number> = { eye: 0, mouth: 0 };
    const host = { matches: () => true, read: (name: string) => values[name], write: vi.fn((name: string, value: number) => { values[name] = value; return true; }) };
    const diff = make();
    expect(executeMorphWeightBatch(diff, "apply", host)).toBe(true);
    expect(values).toEqual({ eye: 0.4, mouth: 0.7 });
    expect(executeMorphWeightBatch(diff, "revert", host)).toBe(true);
    expect(values).toEqual({ eye: 0, mouth: 0 });
    expect(executeMorphWeightBatch(diff, "apply", host)).toBe(true);
    values.mouth = 0.5;
    host.write.mockClear();
    expect(executeMorphWeightBatch(diff, "revert", host)).toBe(false);
    expect(host.write).not.toHaveBeenCalled();
    expect(executeMorphWeightBatch(diff, "apply", { ...host, matches: () => false })).toBe(false);
});
it("compensates partial writes and surfaces failed compensation", () => {
    const values: Record<string, number> = { eye: 0, mouth: 0 };
    const host = { matches: () => true, read: (name: string) => values[name], write: (name: string, value: number) => {
        values[name] = value;
        return !(name === "mouth" && value === 0.7);
    } };
    expect(executeMorphWeightBatch(make(), "apply", host)).toBe(false);
    expect(values).toEqual({ eye: 0, mouth: 0 });
    expect(() => executeMorphWeightBatch(make(), "apply", { ...host, write: () => false })).toThrow("rollback failed");
});
