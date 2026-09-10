import { z } from "zod";
import { keyframeOperationSchema, timelineScopeSchema } from "./keyframe-schema";
import { automationSettingSchema } from "./settings";

const vector = z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
export const cameraSchema = z.object({ target: vector, rotation: vector, distance: z.number().min(0).max(100000), fov: z.number().min(10).max(120) }).strict();
const target = z.object({ editorSessionId: z.string().uuid(), sceneGeneration: z.number().int().nonnegative() }).strict();
const query = { target };
const paging = { offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(200).default(100) };
const edit = { target, expectedEditRevision: z.number().int().nonnegative(), operationId: z.string().uuid() };
export const automationTools = {
    mmd_get_context: { description: "公開ウィンドウとシーン概要。モデル本体は返しません。", edit: false, schema: z.object({ target: target.optional() }).strict() },
    mmd_list_assets: { description: "読込元パスと使用先の一覧。ファイル内容・モデル本体は返しません。", edit: false, schema: z.object({ ...query, ...paging, expectedAssetRevision: z.number().int().optional() }).strict() },
    mmd_capture_viewport: { description: "現在表示中のビューポートのPNG画像。モデルファイルは返しません。", edit: false, schema: z.object(query).strict() },
    mmd_get_settings: { description: "対応済みUI設定の値と利用可否。idと値の範囲はmmd_set_settingのschemaを参照。", edit: false, schema: z.object(query).strict() },
    mmd_set_setting: { description: "対応済みUI設定1項目を指定値へ変更。UIと同じsetterを使用し結果を再取得。Undo対象外。", edit: true, schema: z.object({ ...edit, setting: automationSettingSchema }).strict() },
    mmd_inspect: { description: "現在のタイムラインのトラック・キー値と補間、または指定モデルのボーン・材質の編集情報。形状データは返しません。", edit: false, schema: z.object({ ...query, ...paging, kind: z.enum(["keyframes", "tracks", "bones", "materials"]), modelInstanceId: z.string().max(200).optional(), expectedEditRevision: z.number().int().optional() }).strict() },
    mmd_set_material_visibility: { description: "指定モデルの材質の表示/非表示。alpha値と区別。通常/PBR共通、Undo対象外。", edit: true, schema: z.object({ ...edit, modelInstanceId: z.string().min(1).max(200), materialKey: z.string().min(1).max(200), visible: z.boolean() }).strict() },
    mmd_select_timeline: { description: "UIと同じモデル・カメラ・アクセサリの編集対象切替。Undo対象外。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema }).strict() },
    mmd_edit_keyframes: { description: "キー値・補間の設定、削除、コピー、移動を1つのUndo単位で適用。現在選択中のscopeを指定。source形式の値はkeyframesヘルプを参照。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, collision: z.enum(["reject", "replace"]), operations: z.array(keyframeOperationSchema).min(1).max(100) }).strict() },
    mmd_set_playback: { description: "再生・停止・シーク。Undo対象外。", edit: true, schema: z.object({ ...edit, action: z.enum(["play", "pause", "seek"]), frame: z.number().int().min(0).max(1000000).optional() }).strict().refine(v => (v.action === "seek") === (v.frame !== undefined), { message: "frameはseek時のみ必須" }) },
    mmd_set_camera: { description: "カメラの未登録編集。targetは注視点、rotationは度、distanceはMMD距離。キー登録は行いません。", edit: true, schema: z.object({ ...edit, mode: z.literal("preview"), playbackPolicy: z.enum(["pause", "reject"]), camera: cameraSchema }).strict() },
    mmd_set_bone: { description: "単一ボーンの未登録編集。positionはローカル移動量、rotationは度。キー登録は行いません。", edit: true, schema: z.object({ ...edit, mode: z.literal("preview"), playbackPolicy: z.enum(["pause", "reject"]), modelInstanceId: z.string().max(200), boneName: z.string().min(1).max(200), position: vector, rotation: vector }).strict() },
    mmd_undo: { description: "指定AI編集が共有履歴の末尾の場合だけUndo。手動編集を巻き戻しません。", edit: true, schema: z.object({ ...edit, editId: z.string().max(200) }).strict() },
    mmd_get_operation: { description: "操作の結果を照会。unknownなら再実行せず状況を再取得。", edit: false, schema: z.object({ ...query, operationId: z.string().uuid() }).strict() },
} as const;
export type AutomationToolName = keyof typeof automationTools;
export type AutomationTarget = z.infer<typeof target>;
export type AutomationRequest = { requestId: string; sessionId: string; grant: number; tool: AutomationToolName; args: unknown };
export type AutomationResult = { data: Record<string, unknown>; image?: { data: string; mimeType: "image/png" } };
export type AutomationReply = { requestId: string; result?: AutomationResult; error?: string };
export type AutomationState = { enabled: boolean; editable: boolean; sessionId: string; grant: number; endpoint: string | null; error?: string };
export type AutomationApi = {
    getState(): Promise<AutomationState>;
    configure(enabled: boolean, editable: boolean): Promise<AutomationState>;
    getConnection(): Promise<{ endpoint: string; token: string }>;
    onState(callback: (state: AutomationState) => void): () => void;
    onRequest(callback: (request: AutomationRequest) => void): () => void;
    reply(reply: AutomationReply): void;
};
export type AutomationAsset = { assetId: string; kind: string; modelInstanceId: string | null; recordedPath: string; usageRole: "unknown"; frame: number | null; availability: "unchecked" };
export class AutomationError extends Error {
    constructor(public readonly code: string) { super(code); }
}
