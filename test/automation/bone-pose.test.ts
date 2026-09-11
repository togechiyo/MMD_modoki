import { describe, expect, it } from "vitest";
import { bonePoseSchema, buildBonePoseBatch } from "../../src/automation/bone-pose";
import { executeBonePoseBatch } from "../../src/editor/bone-pose-batch";
import type { BoneTransformCommandSnapshot } from "../../src/actions/command-types";

const zero = { x: 0, y: 0, z: 0 };
const pose = (x: number): BoneTransformCommandSnapshot => ({ position: { ...zero, x }, rotation: { ...zero } });
function setup() {
    const state = new Map([['a', pose(0)], ['b', pose(0)]]);
    const host = { names: ['a', 'b'], read: (name: string) => state.get(name) ?? null,
        controls: () => ({ movable: true, rotatable: true }), matches: () => true,
        write: (name: string, value: BoneTransformCommandSnapshot) => { state.set(name, structuredClone(value)); return true; } };
    const poses = [{ boneName: 'a', ...pose(1) }, { boneName: 'b', ...pose(2) }];
    return { state, host, poses };
}
describe("MCP batch bone pose", () => {
    it("validates all bones, reports the offending index, and never writes while planning", () => {
        const { state, host, poses } = setup();
        expect(() => buildBonePoseBatch('model', 0, [poses[0], { ...poses[1], boneName: 'missing' }], host))
            .toThrow(expect.objectContaining({ code: 'BONE_NOT_UNIQUE', details: { operationIndex: 1 } }));
        expect(state.get('a')).toEqual(pose(0));
        expect(() => buildBonePoseBatch('model', 0, poses, { ...host, controls: () => ({ movable: false, rotatable: true }) }))
            .toThrow(expect.objectContaining({ code: 'BONE_CONTROL_LOCKED', details: { operationIndex: 0 } }));
    });
    it("applies and undoes a batch without touching unrelated bones", () => {
        const { state, host, poses } = setup();
        state.set('other', pose(9));
        const diff = buildBonePoseBatch('model', 0, poses, host);
        expect(executeBonePoseBatch(diff, 'apply', host)).toBe(true);
        expect(state.get('a')).toEqual(pose(1));
        expect(state.get('b')).toEqual(pose(2));
        expect(executeBonePoseBatch(diff, 'revert', host)).toBe(true);
        expect(state.get('a')).toEqual(pose(0));
        expect(state.get('other')).toEqual(pose(9));
    });
    it("rejects any changed precondition before writing the first bone", () => {
        const { state, host, poses } = setup();
        const diff = buildBonePoseBatch('model', 0, poses, host);
        state.set('b', pose(3));
        expect(executeBonePoseBatch(diff, 'apply', host)).toBe(false);
        expect(state.get('a')).toEqual(pose(0));
        expect(executeBonePoseBatch(diff, 'apply', { ...host, matches: () => false })).toBe(false);
    });
    it("compensates all attempted writes, including a partially failed bone", () => {
        const { state, host, poses } = setup();
        const diff = buildBonePoseBatch('model', 0, poses, host);
        const write = host.write;
        let count = 0;
        host.write = (name, value) => { write(name, value); if (++count === 2) throw new Error('failure'); return true; };
        expect(executeBonePoseBatch(diff, 'apply', host)).toBe(false);
        expect(state.get('a')).toEqual(pose(0));
        expect(state.get('b')).toEqual(pose(0));
    });
    it("reports a failed compensation and still attempts the remaining rollback", () => {
        const { state, host, poses } = setup();
        const diff = buildBonePoseBatch('model', 0, poses, host);
        const write = host.write;
        host.write = (name, value) => name === 'b' ? false : write(name, value);
        expect(() => executeBonePoseBatch(diff, 'apply', host)).toThrow('rollback failed');
        expect(state.get('a')).toEqual(pose(0));
    });
    it("omits unchanged bones and rejects empty, duplicate, nonfinite or oversized input", () => {
        const { host, poses } = setup();
        expect(buildBonePoseBatch('model', 0, [{ boneName: 'a', ...pose(0) }], host).items).toEqual([]);
        expect(buildBonePoseBatch('model', 0, [{ boneName: 'a', ...pose(0.000001) }], host).items).toEqual([]);
        for (const value of [[], [poses[0], poses[0]], [{ boneName: 'a', ...pose(Infinity) }], Array.from({ length: 101 }, (_, i) => ({ ...poses[0], boneName: String(i) }))]) expect(bonePoseSchema.safeParse(value).success).toBe(false);
    });
});
