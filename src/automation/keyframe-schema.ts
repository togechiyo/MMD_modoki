import { z } from "zod";

const number = z.number().finite().min(-1000000).max(1000000);
const vector = z.object({ x: number, y: number, z: number }).strict();
const color = z.object({ r: z.number().min(0).max(1), g: z.number().min(0).max(1), b: z.number().min(0).max(1) }).strict();
const floats = (length: number) => z.array(number).length(length);
const interpolation = (length: number) => z.array(z.number().int().min(0).max(127)).length(length);
const name = z.string().min(1).max(200);
const path = z.string().max(4096).nullable();
const parent = z.object({ modelInstanceId: name.nullable().optional(), modelPath: path, boneName: name.nullable() }).strict();
const boneParent = z.object({ childBoneName: name, parentModelInstanceId: name.nullable().optional(), parentModelPath: path, parentBoneName: name.nullable() }).strict();
const rotation = z.array(number).length(4).refine(values => Math.abs(Math.hypot(...values) - 1) < 0.001, "Quaternion must be normalized (x,y,z,w)");
const bone = { rotations: rotation, rotationInterpolations: interpolation(4), physicsToggles: z.array(z.number().int().min(0).max(1)).length(1), externalParent: boneParent.optional() };

/** Only editable animation values; never model, mesh, texture, or arbitrary object data. */
export const keyframePayloadSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("bone"), ...bone }).strict(),
    z.object({ kind: z.literal("movableBone"), ...bone, positions: floats(3), positionInterpolations: interpolation(12) }).strict(),
    z.object({ kind: z.literal("morph"), weights: z.array(z.number().min(0).max(1)).length(1) }).strict(),
    z.object({ kind: z.literal("camera"), positions: floats(3), positionInterpolations: interpolation(12), rotations: floats(3), rotationInterpolations: interpolation(4), distances: z.array(z.number().min(-100000).max(0)).length(1), distanceInterpolations: interpolation(4), fovs: z.array(z.number().min(10).max(120)).length(1), fovInterpolations: interpolation(4), externalParent: parent }).strict(),
    z.object({ kind: z.literal("property"), visible: z.boolean(), ikStates: z.array(z.object({ boneName: name, enabled: z.boolean() }).strict()).max(256) }).strict(),
    z.object({ kind: z.literal("light"), color, direction: vector }).strict(),
    z.object({ kind: z.literal("shadow"), color, toonInfluence: z.number().min(0).max(1), maxZ: z.number().min(0).max(100000), lightIntensity: z.number().min(0).max(10) }).strict(),
    z.object({ kind: z.literal("gravity"), acceleration: z.number().min(0).max(1000), direction: vector }).strict(),
    z.object({ kind: z.literal("accessory"), position: vector, rotationDeg: vector, scale: z.number().min(0.001).max(10000) }).strict(),
]);
export const timelineScopeSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("camera") }).strict(),
    z.object({ kind: z.literal("model"), modelInstanceId: name }).strict(),
    z.object({ kind: z.literal("accessory"), accessoryIndex: z.number().int().nonnegative() }).strict(),
]);
const track = z.object({ category: z.enum(["root", "camera", "accessory", "light", "shadow", "gravity", "property", "semi-standard", "bone", "morph"]), name }).strict();
const frame = z.number().int().min(0).max(1000000);
export const keyframeOperationSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("set"), track, frame, payload: keyframePayloadSchema }).strict(),
    z.object({ action: z.literal("delete"), track, frame }).strict(),
    z.object({ action: z.literal("move"), track, frame, toFrame: frame }).strict(),
    z.object({ action: z.literal("copy"), track, frame, toFrame: frame }).strict(),
]);
export type AutomationKeyframeOperation = z.infer<typeof keyframeOperationSchema>;
