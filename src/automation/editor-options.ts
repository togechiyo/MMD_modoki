import { z } from "zod";
const frame = z.number().int().min(0).max(1000000);
export const editorOptionsSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("physicsKeyInput"), enabled: z.boolean() }).strict(),
    z.object({ kind: z.literal("autoKey"), enabled: z.boolean(), scope: z.enum(["all", "bone", "morph", "camera"]) }).strict(),
    z.object({ kind: z.literal("playbackRange"), startFrame: frame, endFrame: frame, startEnabled: z.boolean(), loop: z.boolean() }).strict().refine(value => value.startFrame <= value.endFrame),
    z.object({ kind: z.literal("output"), width: z.number().int().min(320).max(8192), height: z.number().int().min(180).max(8192),
        qualityScale: z.number().min(0.25).max(4), fps: z.number().int().min(1).max(120), transparent: z.boolean(), includeAudio: z.boolean(),
        webmCodec: z.enum(["auto", "vp8", "vp9"]), startFrame: frame, endFrame: frame, usePlaybackRange: z.boolean() }).strict().refine(value => value.startFrame <= value.endFrame),
    z.object({ kind: z.literal("locale"), value: z.enum(["ja", "en", "zh-Hant", "zh-Hans", "ko"]) }).strict(),
    z.object({ kind: z.literal("uiScale"), value: z.union([z.literal(75), z.literal(100), z.literal(125), z.literal(150)]) }).strict(),
    z.object({ kind: z.literal("fullscreen"), enabled: z.boolean() }).strict(),
]);
export type AutomationEditorOptions = z.infer<typeof editorOptionsSchema>;
