import { z } from "zod";
import { bonePoseSchema } from "./bone-pose";
import { keySelectionSchema } from "./keyframe-selection";
import { objectSubjectSchema, objectPatchSchema } from "./object-state";
import { externalParentSubjectSchema, externalParentOperationSchema } from "./external-parent-schema";
import { automationTrackSchema, keyframeOperationSchema, timelineScopeSchema, timelineTransformSchema } from "./keyframe-schema";
import { automationSettingSchema } from "./settings";
import type { AutomationFailure } from "./diagnostics";
import { diagnosticKindSchema, diagnosticSelectorSchema, type DetailAccessRecord } from "./model-detail";
import { automationControlSchema } from "./controls";
import { editorOptionsSchema } from "./editor-options";
import { automationMaterialTargetSchema } from "./material-schema";
import { uiOperationSchema, type AutomationOutput, type AutomationOutputResult, type AutomationPermission } from "./ui-operation-schema";
export { AutomationError } from "./diagnostics";

const vector = z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
export const cameraSchema = z.object({ target: vector, rotation: vector, distance: z.number().min(0).max(100000), fov: z.number().min(10).max(120) }).strict();
const target = z.object({ editorSessionId: z.string().uuid(), sceneGeneration: z.number().int().nonnegative() }).strict();
const query = { target };
const paging = { offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(200).default(100) };
const edit = { target, expectedEditRevision: z.number().int().nonnegative(), operationId: z.string().uuid() };
export const automationTools = {
    mmd_get_keyframe_selection: { description: "現在のGUIキー選択をページ取得。scopeとframeを確認でき、選択やseekは変更しない。", edit: false, schema: z.object({ ...query, ...paging, expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_select_keyframes: { description: "指定scopeのキーを明示リストまたは両端を含むフレーム範囲で選択。最大100件、GUI選択を置換。clearで解除。Undo対象外。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, selection: keySelectionSchema }).strict() },
    mmd_copy_keyframes: { description: "現在選択中の最大100キーをアプリ内部のGUI共通クリップボードへコピー。OSクリップボードは使わない。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema }).strict() },
    mmd_get_keyframe_clipboard: { description: "アプリ内部キークリップボードのID、元種別、相対frame、payloadをページ取得。モデル本体は返さない。", edit: false, schema: z.object({ ...query, ...paging, expectedClipboardId: z.string().uuid().optional() }).strict() },
    mmd_paste_keyframes: { description: "確認したclipboardIdのキーを指定frameへ相対間隔を維持して貼り付け。scopeと同名トラックを照合、最大100件、dryRunと共有Undo。key-selectionヘルプ参照。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, clipboardId: z.string().uuid(), frame: z.number().int().min(0).max(1000000), collision: z.enum(["reject", "replace"]), dryRun: z.boolean().default(false) }).strict() },
    mmd_edit_keyframe_selection: { description: "現在選択中のキーをまとめて移動または削除。最大100件、dryRunで事前検証し1回の共有Undo。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, operation: z.discriminatedUnion("action", [z.object({ action: z.literal("delete") }).strict(), z.object({ action: z.literal("move"), frameOffset: z.number().int().min(-1000000).max(1000000) }).strict()]), collision: z.enum(["reject", "replace"]), dryRun: z.boolean().default(false) }).strict() },
    mmd_set_pose: { description: "選択中モデルの最大100ボーンをまとめてpreview調整。全件事前検証、dryRun、1回の共有Undo。位置はローカル移動、回転は度。キー登録なし。pose-editingヘルプ参照。", edit: true, schema: z.object({ ...edit, modelInstanceId: z.string().min(1).max(200), poses: bonePoseSchema, mode: z.literal("preview"), dryRun: z.boolean().default(false) }).strict() },
    mmd_get_object_state: { description: "指定モデルの表示・影・IK、またはアクセサリの親・ローカル変形・表示・影を取得。選択は変更しない。モデルのIK一覧はページ取得。", edit: false, schema: z.object({ ...query, ...paging, subject: objectSubjectSchema, expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_set_object_state: { description: "選択中モデルの表示・影・複数IK、またはアクセサリの親・変形・表示・影を一括変更。未登録編集で自動キーなし。1回のUndo単位、dryRunで差分確認。object-editingヘルプ参照。", edit: true, schema: z.object({ ...edit, subject: objectSubjectSchema, patch: objectPatchSchema, mode: z.literal("preview"), dryRun: z.boolean().default(false) }).strict() },
    mmd_get_external_parent: { description: "指定モデルまたはカメラの外部親キーと現在フレームの関係。選択を変えずページ取得。モデル構造・本体は返さない。", edit: false, schema: z.object({ ...query, ...paging, scope: z.discriminatedUnion("kind", [z.object({ kind: z.literal("camera") }).strict(), z.object({ kind: z.literal("model"), modelInstanceId: z.string().min(1).max(200) }).strict()]), expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_edit_external_parent: { description: "選択中モデルの指定ボーン、またはカメラの外部親を最大100フレーム一括編集。parent:nullは解除キー、deleteはポーズを含むキー削除。poseModeと制限はexternal-parentヘルプ参照。dryRunで無変更の事前検証。1回のUndo単位。", edit: true, schema: z.object({ ...edit, subject: externalParentSubjectSchema, operations: z.array(externalParentOperationSchema).min(1).max(100), collision: z.enum(["reject", "replace"]), dryRun: z.boolean().default(false) }).strict() },
    mmd_cancel_operation: { description: "MCPで開始した動画・PNG連番出力の取消を要求。受付後は元のjobOperationIdで終端状態を確認する。", edit: true, schema: z.object({ ...edit, jobOperationId: z.string().uuid() }).strict() },
    mmd_list_material_presets: { description: "モデル/アクセサリで利用できる内蔵材質プリセットと材質キー一覧。通常/PBR別、モデル本体やshaderソースは返さない。材質はページ取得。", edit: false, schema: z.object({ ...query, ...paging, subject: automationMaterialTargetSchema, expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_set_material_preset: { description: "指定材質へUIと同じ内蔵プリセットを適用。materialKey:nullは対象全材質。Undo対象外。外部shaderの文字列は受け付けない。", edit: true, schema: z.object({ ...edit, subject: automationMaterialTargetSchema, materialKey: z.string().min(1).max(200).nullable(), presetId: z.string().min(1).max(100) }).strict() },
    mmd_get_editor_options: { description: "自動キー・再生範囲・出力設定・言語・UI倍率・選択ボーンの現在状態。", edit: false, schema: z.object(query).strict() },
    mmd_set_editor_options: { description: "自動キー・再生範囲・出力設定・言語・UI倍率・全画面をUIと共通の処理で変更。Undo対象外。MCP previewは自動キーに関係なく明示登録。", edit: true, schema: z.object({ ...edit, options: editorOptionsSchema }).strict() },
    mmd_select_bones: { description: "選択中モデルのボーンを名前で複数選択。GUI選択とVPD出力対象を同期。ポーズは変更しない。", edit: true, schema: z.object({ ...edit, modelInstanceId: z.string().min(1).max(200), boneNames: z.array(z.string().min(1).max(200)).min(1).max(200).refine(values => new Set(values).size === values.length, "Duplicate bone") }).strict() },
    mmd_start_ui_operation: { description: "ローカル素材読込・project保存/読込・モーション出力・通常/PBR切替を開始。結果はmmd_get_operationで照会。受付は完了ではない。モデルバイナリを返さない。", edit: true, schema: z.object({ ...edit, operation: uiOperationSchema }).strict() },
    mmd_list_controls: { description: "対応済みUI設定の検索。設定ID・現在値・値schema・単位・利用可否を返す。値は保持設定で描画完了を保証しない。", edit: false, schema: z.object({ ...query, ...paging, query: z.string().max(100).default(""), expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_set_control: { description: "mmd_list_controlsの設定1項目を変更。UIと共通のsetterを使い適用値を返す。Undo対象外。", edit: true, schema: z.object({ ...edit, control: automationControlSchema }).strict() },
    mmd_get_context: { description: "公開ウィンドウとシーン概要。モデル本体は返しません。", edit: false, schema: z.object({ target: target.optional() }).strict() },
    mmd_list_assets: { description: "読込元パスと使用先の一覧。ファイル内容・モデル本体は返しません。", edit: false, schema: z.object({ ...query, ...paging, expectedAssetRevision: z.number().int().optional() }).strict() },
    mmd_capture_viewport: { description: "現在表示中のビューポートのPNG画像。モデルファイルは返しません。", edit: false, schema: z.object(query).strict() },
    mmd_get_settings: { description: "対応済みUI設定の値と利用可否。idと値の範囲はmmd_set_settingのschemaを参照。", edit: false, schema: z.object(query).strict() },
    mmd_list_diagnostic_targets: { description: "詳細診断用の対象index/name一覧。kindごとにページ取得。ユーザーの詳細診断許可が必要。indexはこの一覧の値を使ってください。", edit: false, schema: z.object({ ...query, ...paging, modelInstanceId: z.string().min(1).max(200), kind: diagnosticKindSchema, expectedEditRevision: z.number().int().nonnegative().optional() }).strict() },
    mmd_inspect_detail: { description: "要求された1対象のみのボーン/モーフ/材質/剛体/ジョイント診断情報。詳細診断の明示許可が必要。モデル本体、頂点、ウェイト、モーフ頂点差分、テクスチャ原本は返しません。", edit: false, schema: z.object({ ...query, modelInstanceId: z.string().min(1).max(200), subject: diagnosticSelectorSchema, expectedEditRevision: z.number().int().nonnegative() }).strict() },
    mmd_get_diagnostics: { description: "編集できない理由、実行環境、WebGPU検証エラー件数、直近MCP失敗の原因と復旧案内。状態を変更せず、モデル本体や生ログは返しません。", edit: false, schema: z.object({ ...query, limit: z.number().int().min(1).max(50).default(10), operationId: z.string().uuid().optional() }).strict() },
    mmd_set_setting: { description: "対応済みUI設定1項目を指定値へ変更。UIと同じsetterを使用し結果を再取得。Undo対象外。", edit: true, schema: z.object({ ...edit, setting: automationSettingSchema }).strict() },
    mmd_inspect: { description: "現在のタイムラインのトラック・キー値と補間、または指定モデルのボーン・モーフ・材質一覧。モデル選択を変えず参照でき、総件数・項目番号・名前を返します。形状データは返しません。", edit: false, schema: z.object({ ...query, ...paging, kind: z.enum(["keyframes", "tracks", "bones", "morphs", "materials"]), modelInstanceId: z.string().max(200).optional(), expectedEditRevision: z.number().int().optional() }).strict() },
    mmd_set_material_visibility: { description: "指定モデルの材質の表示/非表示。alpha値と区別。通常/PBR共通、Undo対象外。", edit: true, schema: z.object({ ...edit, modelInstanceId: z.string().min(1).max(200), materialKey: z.string().min(1).max(200), visible: z.boolean() }).strict() },
    mmd_select_timeline: { description: "UIと同じモデル・カメラ・アクセサリの編集対象切替。Undo対象外。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema }).strict() },
    mmd_edit_keyframes: { description: "キー値・補間の設定、削除、コピー、移動を1つのUndo単位で適用。現在選択中のscopeを指定。source形式の値はkeyframesヘルプを参照。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, collision: z.enum(["reject", "replace"]), operations: z.array(keyframeOperationSchema).min(1).max(100) }).strict() },
    mmd_transform_keyframes: { description: "フレーム列の挿入/削除、左右反転コピー、キー値の乗算加算補正。1回の共有Undo単位。詳細と単位はtimeline-transformsヘルプを参照。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, operation: timelineTransformSchema }).strict() },
    mmd_register_keyframes: { description: "現在フレームのUI編集値を指定トラックへまとめて登録。カメラ/ボーンの単位変換と補間はGUI登録処理を共用。1つの共有Undo単位。", edit: true, schema: z.object({ ...edit, scope: timelineScopeSchema, tracks: z.array(automationTrackSchema).min(1).max(100), collision: z.enum(["reject", "replace"]) }).strict() },
    mmd_set_playback: { description: "再生・停止・シーク。Undo対象外。", edit: true, schema: z.object({ ...edit, action: z.enum(["play", "pause", "seek"]), frame: z.number().int().min(0).max(1000000).optional() }).strict().refine(v => (v.action === "seek") === (v.frame !== undefined), { message: "frameはseek時のみ必須" }) },
    mmd_set_camera: { description: "カメラの未登録編集。targetは注視点、rotationは度、distanceはMMD距離。キー登録は行いません。", edit: true, schema: z.object({ ...edit, mode: z.literal("preview"), playbackPolicy: z.enum(["pause", "reject"]), camera: cameraSchema }).strict() },
    mmd_set_bone: { description: "単一ボーンの未登録編集。positionはローカル移動量、rotationは度。キー登録は行いません。", edit: true, schema: z.object({ ...edit, mode: z.literal("preview"), playbackPolicy: z.enum(["pause", "reject"]), modelInstanceId: z.string().max(200), boneName: z.string().min(1).max(200), position: vector, rotation: vector }).strict() },
    mmd_undo: { description: "指定AI編集が共有履歴の末尾の場合だけUndo。手動編集を巻き戻しません。", edit: true, schema: z.object({ ...edit, editId: z.string().max(200) }).strict() },
    mmd_redo: { description: "指定AI編集がRedo履歴の先頭にあり、対象と変更前の値が一致する場合だけ再適用。", edit: true, schema: z.object({ ...edit, editId: z.string().max(200) }).strict() },
    mmd_set_morph: { description: "選択中モデルの単一モーフの未登録編集。weightは0..1。共有Undo/Redoに対応し、キー登録は行いません。", edit: true, schema: z.object({ ...edit, modelInstanceId: z.string().min(1).max(200), morphName: z.string().min(1).max(200), weight: z.number().min(0).max(1), mode: z.literal("preview"), playbackPolicy: z.enum(["pause", "reject"]) }).strict() },
    mmd_get_operation: { description: "操作の結果を照会。unknownなら再実行せず状況を再取得。", edit: false, schema: z.object({ ...query, operationId: z.string().uuid() }).strict() },
} as const;
export type AutomationToolName = keyof typeof automationTools;
export type AutomationTarget = z.infer<typeof target>;
export type AutomationRequest = { requestId: string; sessionId: string; grant: number; tool: AutomationToolName; args: unknown };
export type AutomationResult = { data: Record<string, unknown>; image?: { data: string; mimeType: "image/png" } };
export type AutomationReply = { requestId: string; result?: AutomationResult; error?: string; failure?: AutomationFailure };
export type AutomationState = { enabled: boolean; editable: boolean; detailedDiagnostics: boolean; sessionId: string; grant: number; endpoint: string | null; error?: string };
export type AutomationApi = {
    saveMotion(input: { filePath: string; overwrite: boolean; format: "vmd" | "vpd"; document: unknown }, permission: AutomationPermission): Promise<AutomationOutputResult & { warningCodes?: string[] }>;
    writeOutput(input: AutomationOutput, permission: AutomationPermission): Promise<AutomationOutputResult>;
    getState(): Promise<AutomationState>;
    configure(enabled: boolean, editable: boolean, detailedDiagnostics?: boolean): Promise<AutomationState>;
    getDetailAccessHistory(): Promise<DetailAccessRecord[]>;
    getConnection(): Promise<{ endpoint: string; token: string }>;
    onState(callback: (state: AutomationState) => void): () => void;
    onRequest(callback: (request: AutomationRequest) => void): () => void;
    reply(reply: AutomationReply): void;
};
export type AutomationAsset = { assetId: string; kind: string; modelInstanceId: string | null; recordedPath: string; usageRole: "unknown"; frame: number | null; availability: "unchecked" };
