import { describe, expect, it } from "vitest";
import { z } from "zod";
import { keyframePayloadSchema } from "../../src/automation/keyframe-schema";

const camera = { kind: "camera", positions: [0, 0, 0], rotations: [0, 0, 0], positionInterpolations: Array(12).fill(0),
    rotationInterpolations: [0, 0, 127, 127], distances: [-45], distanceInterpolations: [0, 0, 127, 127], fovs: [30],
    fovInterpolations: [0, 0, 127, 127], externalParent: { modelPath: null, boneName: null } };

describe("shared keyframe value schemas", () => {
    it("retains array lengths, interpolation integer/range checks and camera bounds", () => {
        expect(keyframePayloadSchema.parse(camera)).toEqual(camera);
        for (const field of ["positionInterpolations", "rotationInterpolations", "distanceInterpolations", "fovInterpolations"]) {
            for (const value of [Array(3).fill(0), Array(field === "positionInterpolations" ? 12 : 4).fill(128),
                Array(field === "positionInterpolations" ? 12 : 4).fill(0.5)]) {
                expect(keyframePayloadSchema.safeParse({ ...camera, [field]: value }).success).toBe(false);
            }
        }
        for (const patch of [{ positions: [0, 0] }, { rotations: [0, Infinity, 0] }, { distances: [1] }, { fovs: [121] }, { vertices: [] }]) {
            expect(keyframePayloadSchema.safeParse({ ...camera, ...patch }).success).toBe(false);
        }
    });
    it("keeps quaternion normalization separate from camera Euler angles", () => {
        const bone = { kind: "movableBone", positions: [0, 0, 0], positionInterpolations: Array(12).fill(0),
            rotations: [0, 0, 0, 1], rotationInterpolations: [0, 0, 127, 127], physicsToggles: [1] };
        expect(keyframePayloadSchema.safeParse(bone).success).toBe(true);
        expect(keyframePayloadSchema.safeParse({ ...bone, rotations: [0, 0, 0, 2] }).success).toBe(false);
        expect(keyframePayloadSchema.safeParse({ ...camera, rotations: [2, 3, 4] }).success).toBe(true);
    });
    it("emits only resolvable local JSON Schema references", () => {
        const schema = z.toJSONSchema(keyframePayloadSchema, { io: "input", reused: "ref" });
        const visit = (value: unknown): void => {
            if (!value || typeof value !== "object") return;
            for (const [key, child] of Object.entries(value)) {
                if (key === "$ref") {
                    expect(typeof child).toBe("string");
                    const ref = String(child);
                    expect(ref).toMatch(/^#\//);
                    const resolved = ref.slice(2).split("/").reduce<unknown>((current, segment) =>
                        current && typeof current === "object" ? Reflect.get(current, segment.replace(/~1/g, "/").replace(/~0/g, "~")) : undefined, schema);
                    expect(resolved).toBeDefined();
                } else visit(child);
            }
        };
        visit(schema);
    });
});
