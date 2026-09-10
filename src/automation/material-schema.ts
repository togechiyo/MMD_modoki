import { z } from "zod";
export const automationMaterialTargetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("model"), modelInstanceId: z.string().min(1).max(200) }).strict(),
    z.object({ kind: z.literal("accessory"), accessoryIndex: z.number().int().min(0).max(100000) }).strict(),
]);
export type AutomationMaterialTarget = z.infer<typeof automationMaterialTargetSchema>;
