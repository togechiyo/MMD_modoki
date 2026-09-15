import { z } from "zod";
import type { MmdManager } from "../mmd-manager";
import { AutomationError } from "./diagnostics";

export const menuActionSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("cameraView"), view: z.enum(["front", "back", "left", "right", "top", "bottom"]) }).strict(),
    z.object({ kind: z.literal("adjacentKey"), direction: z.union([z.literal(-1), z.literal(1)]) }).strict(),
    z.object({ kind: z.literal("selectAllKeys"), category: z.enum(["camera", "light", "shadow", "gravity", "bone", "morph"]) }).strict(),
    z.object({ kind: z.literal("clearModelMotion"), modelInstanceId: z.string().min(1).max(200), dryRun: z.boolean().default(true) }).strict(),
    z.object({ kind: z.literal("moveModelRenderOrder"), modelInstanceId: z.string().min(1).max(200), direction: z.union([z.literal(-1), z.literal(1)]) }).strict(),
    z.object({ kind: z.literal("resetSky") }).strict(),
]);
export type MenuAction = z.infer<typeof menuActionSchema>;
export const menuKeyCategories = {
    camera: ["camera"], light: ["light"], shadow: ["shadow"], gravity: ["gravity"],
    bone: ["root", "semi-standard", "bone"], morph: ["morph"],
} as const;

export function moveMenuModelRenderOrder(manager: MmdManager, modelInstanceId: string, direction: -1 | 1) {
    const model = manager.getLoadedModels().find(item => item.instanceId === modelInstanceId);
    if (!model) throw new AutomationError("MODEL_NOT_FOUND");
    const changed = manager.moveModelRenderOrder(model.index, direction);
    return { changed, undoable: false, models: manager.getLoadedModels().map(item => ({ modelInstanceId: item.instanceId, renderOrder: item.renderOrder })) };
}
