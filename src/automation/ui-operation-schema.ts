import { z } from "zod";

// Fully qualified local paths only. No URL, UNC, device path, drive-relative path or NTFS alternate stream.
export const automationLocalPathSchema = z.string().min(1).max(4096).refine(value =>
    !Array.from(value).some(character => character.charCodeAt(0) < 32) && !value.startsWith("\\\\") && !value.startsWith("//") &&
    (/^[A-Za-z]:[\\/][^:]*$/.test(value) || /^\/[^:]*$/.test(value)), "Absolute local path required");
const output = { filePath: automationLocalPathSchema, overwrite: z.boolean() };
export const uiOperationSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("materialMode"), pbr: z.boolean() }).strict(),
    z.object({ kind: z.literal("loadAsset"), filePath: automationLocalPathSchema,
        assetKind: z.enum(["model", "accessory", "motion", "cameraMotion", "pose", "audio", "backgroundImage", "backgroundVideo", "environment", "lut"]),
        modelInstanceId: z.string().min(1).max(200).optional() }).strict(),
    z.object({ kind: z.literal("saveProject"), ...output }).strict(),
    z.object({ kind: z.literal("exportPng"), ...output }).strict(),
    z.object({ kind: z.literal("loadProject"), filePath: automationLocalPathSchema }).strict(),
    z.object({ kind: z.literal("exportMotion"), ...output, format: z.enum(["vmd", "vpd", "bvmd"]),
        scope: z.discriminatedUnion("kind", [z.object({ kind: z.literal("camera") }).strict(), z.object({ kind: z.literal("model"), modelInstanceId: z.string().min(1).max(200) }).strict()]) }).strict(),
]);
export type AutomationUiOperation = z.infer<typeof uiOperationSchema>;
export type AutomationPermission = { sessionId: string; grant: number };
export type AutomationOutput = { filePath: string; overwrite: boolean; format: "project" | "vmd" | "vpd" | "bvmd" | "png" | "lut" | "wgsl"; bytes: Uint8Array };
export type AutomationOutputResult = { status: "saved"; filePath: string; byteLength: number } | { status: "failed"; code: string };
