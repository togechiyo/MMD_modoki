import { z } from "zod";
const name = z.string().min(1).max(200);
export const externalParentSubjectSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("model"), modelInstanceId: name, boneName: name }).strict(),
    z.object({ kind: z.literal("camera") }).strict(),
]);
const frame = z.number().int().min(0).max(1000000);
export const externalParentOperationSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("set"), frame, parent: z.object({ modelInstanceId: name, boneName: name }).strict().nullable(), poseMode: z.enum(["snap", "keepLocal"]) }).strict(),
    z.object({ action: z.literal("delete"), frame }).strict(),
]);
export type ExternalParentSubject = z.infer<typeof externalParentSubjectSchema>;
export type ExternalParentOperation = z.infer<typeof externalParentOperationSchema>;
