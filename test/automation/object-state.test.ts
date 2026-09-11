import { describe, expect, it } from "vitest";
import { buildObjectStateEdit, executeObjectStateEdit, selectObjectStateFields, type ObjectState, type ObjectSubject } from "../../src/editor/object-state-edit";
import { objectPatchSchema, normalizeObjectPatch } from "../../src/automation/object-state";

const subject: ObjectSubject = { kind: "model", modelInstanceId: "model" };
const initial: ObjectState = { kind: "model", visible: true, castsShadow: true, ikStates: [{ boneName: "left", enabled: true }, { boneName: "right", enabled: true }] };
function harness() {
    let state = structuredClone(initial);
    const host = {
        matches: () => true, validate: () => true, read: () => state,
        write: (_subject: ObjectSubject, patch: ObjectState) => {
            if (patch.kind !== "model" || state.kind !== "model") return;
            state = { ...state, ...patch, ikStates: state.ikStates.map(item => patch.ikStates?.find(value => item.boneName === value.boneName) ?? item) };
        },
    };
    return { host, state: () => state };
}
describe("MCP object state command", () => {
    it("patches one IK without copying unrelated switches into history", () => {
        const diff = buildObjectStateEdit(subject, 0, initial, { kind: "model", ikStates: [{ boneName: "left", enabled: false }] });
        expect(diff.before).toEqual({ kind: "model", ikStates: [{ boneName: "left", enabled: true }] });
        const { host, state } = harness();
        expect(executeObjectStateEdit(diff, "apply", host)).toBe(true);
        expect(state()).toMatchObject({ ikStates: [{ boneName: "left", enabled: false }, { boneName: "right", enabled: true }] });
        expect(executeObjectStateEdit(diff, "revert", host)).toBe(true);
        expect(state()).toEqual(initial);
    });
    it("rejects missing or ambiguous IK names before mutation", () => {
        expect(buildObjectStateEdit(subject, 0, initial, { kind: "model", ikStates: [{ boneName: "missing", enabled: false }] })).toBeNull();
        expect(selectObjectStateFields({ kind: "model", ikStates: [{ boneName: "left", enabled: true }, { boneName: "left", enabled: true }] }, { kind: "model", ikStates: [{ boneName: "left", enabled: false }] })).toBeNull();
    });
    it("rejects conflicting state or frame/selection and leaves it untouched", () => {
        const diff = buildObjectStateEdit(subject, 0, initial, { kind: "model", visible: false });
        const { host, state } = harness();
        expect(executeObjectStateEdit(diff, "apply", { ...host, matches: () => false })).toBe(false);
        expect(executeObjectStateEdit(diff, "revert", host)).toBe(false);
        expect(state()).toEqual(initial);
    });
    it("compensates a partial write before reporting failure", () => {
        const diff = buildObjectStateEdit(subject, 0, initial, { kind: "model", visible: false, castsShadow: false });
        const { host, state } = harness();
        let first = true;
        const write = host.write;
        host.write = (target, patch) => {
            if (first) { first = false; write(target, { kind: "model", visible: false }); throw new Error("write interrupted"); }
            write(target, patch);
        };
        expect(executeObjectStateEdit(diff, "apply", host)).toBe(false);
        expect(state()).toEqual(initial);
    });
    it("guards the parent coordinate system for transform Undo", () => {
        const parent = { modelInstanceId: "parent", boneName: "hand" };
        const transform = { position: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 };
        const diff = buildObjectStateEdit({ kind: "accessory", accessoryIndex: 0, expectedPath: "prop.x" }, 0,
            { kind: "accessory", transform, parent }, { kind: "accessory", transform: { ...transform, scale: 2 } });
        expect(diff.before).toMatchObject({ parent });
        expect(diff.after).toMatchObject({ parent });
        expect(executeObjectStateEdit(diff, "revert", { matches: () => true, validate: () => true, read: () => ({ ...diff.after, kind: "accessory", parent: null }), write: () => { throw new Error("must not write"); } })).toBe(false);
    });
    it("rejects empty patches, duplicate IKs, out-of-UI-range transforms", () => {
        expect(objectPatchSchema.safeParse({ kind: "model" }).success).toBe(false);
        expect(objectPatchSchema.safeParse({ kind: "model", ikStates: [{ boneName: "left", enabled: false }, { boneName: "left", enabled: true }] }).success).toBe(false);
        expect(objectPatchSchema.safeParse({ kind: "accessory", transform: { position: { x: 999, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 } }).success).toBe(false);
    });
    it("keeps parent release explicit and distinguishes omitted parent", () => {
        expect(normalizeObjectPatch(objectPatchSchema.parse({ kind: "accessory", parent: null }))).toEqual({ kind: "accessory", parent: null });
        expect(normalizeObjectPatch(objectPatchSchema.parse({ kind: "accessory", visible: false }))).not.toHaveProperty("parent");
    });
});
