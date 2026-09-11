import { z } from "zod";

const finite = z.number().finite();
export const diagnosticDetailsSchema = z.object({
    operationIndex: z.number().int().nonnegative().optional(),
    frame: finite.optional(),
    field: z.string().max(200).regex(/^[A-Za-z0-9_.]+$/).optional(),
    expected: finite.optional(), actual: finite.optional(), minimum: finite.optional(), maximum: finite.optional(),
    issues: z.array(z.object({ field: z.string().max(200).regex(/^[A-Za-z0-9_.]+$/), code: z.string().max(60).regex(/^[a-z_]+$/) }).strict()).max(16).optional(),
}).strict();
export type DiagnosticDetails = z.infer<typeof diagnosticDetailsSchema>;
export const automationFailureSchema = z.object({
    code: z.string().max(80).regex(/^[A-Z_]+$/),
    details: diagnosticDetailsSchema,
}).strict();
export type AutomationFailure = z.infer<typeof automationFailureSchema>;

export class AutomationError extends Error {
    public diagnostic?: AutomationDiagnostic;
    constructor(public readonly code: string, public readonly details: DiagnosticDetails = {}) { super(code); }
}

type Recovery = "correct_input" | "refresh_context" | "wait" | "user_action" | "inspect_operation" | "unsupported";
type Rule = { message: string; recovery: Recovery; effects: "none" | "unknown"; helpTopic: string };
const rules: Record<string, Rule> = {};
function group(codes: string[], message: string, recovery: Recovery, effects: Rule["effects"], helpTopic: string): void {
    for (const code of codes) rules[code] = { message, recovery, effects, helpTopic };
}
group(["INVALID_INPUT", "INVALID_EDIT"], "入力が公開schemaの条件を満たしていません。fieldと許容範囲を確認してください。", "correct_input", "none", "getting-started");
group(["INVALID_OUTPUT", "INVALID_PROJECT", "NO_EXPORT_DATA"], "ファイル形式・保存先または出力対象が不適切です。対応形式と対象のキー・ポーズを確認してください。", "correct_input", "unknown", "ui-operations");
group(["OUTPUT_EXISTS"], "保存先が既に存在します。別名を指定するか、上書きを明示してください。付随ファイルまでの部分保存はあり得ます。", "correct_input", "unknown", "ui-operations");
group(["OUTPUT_WRITE_FAILED", "ASSET_LOAD_FAILED"], "ローカルファイル処理が完了しませんでした。パス・形式・現在のシーンを確認してください。", "inspect_operation", "unknown", "ui-operations");
group(["REVISION_CONFLICT", "CURSOR_STALE"], "参照した状態が古くなっています。現在の状態と編集内容を再評価してください。", "refresh_context", "none", "undo-and-conflicts");
group(["SCENE_CHANGED", "TIMELINE_TARGET_CHANGED", "TARGET_REQUIRED"], "シーンまたは編集対象が要求と一致しません。対象を選び直してcontextを取得してください。", "refresh_context", "none", "keyframes");
group(["EDITOR_BUSY", "CAPTURE_BUSY"], "操作や処理が進行中です。statusの理由を確認し、完了後にcontextを取得してください。", "wait", "none", "diagnostics");
group(["PLAYING"], "再生中のため操作できません。停止するか、previewではplaybackPolicyを指定してください。", "correct_input", "none", "getting-started");
group(["READ_ONLY", "MCP_DISABLED"], "MCP公開または編集が許可されていません。実験設定でユーザーが変更できます。", "user_action", "none", "getting-started");
group(["DETAILED_DIAGNOSTICS_DISABLED"], "構造情報を含む詳細診断が許可されていません。実験設定の送信内容の説明をユーザーが確認して許可できます。", "user_action", "none", "detailed-diagnostics");
group(["DETAIL_TARGET_NOT_FOUND"], "指定された詳細診断対象が存在しません。mmd_list_diagnostic_targetsで対象indexを再取得してください。", "refresh_context", "none", "detailed-diagnostics");
group(["ACCESS_REVOKED", "TARGET_UNAVAILABLE", "EDITOR_TIMEOUT", "INVALID_REPLY", "OPERATION_FAILED"], "操作結果を確定できません。operationIdの結果と現在状態を確認してください。", "inspect_operation", "unknown", "diagnostics");
group(["UNDO_CONFLICT", "REDO_CONFLICT"], "履歴の次の対象、frame、または適用元の値が一致しないか、履歴操作を完了できませんでした。", "refresh_context", "unknown", "undo-and-conflicts");
group(["OPERATION_ID_REUSED"], "同じoperationIdが異なる入力で使用されています。元の結果を確認し、新しい編集には新しいIDを使ってください。", "inspect_operation", "none", "undo-and-conflicts");
group(["KEY_COLLISION", "DUPLICATE_KEY"], "キーの書込先が衝突または重複しています。frameと一括操作の内容を確認してください。", "correct_input", "none", "keyframes");
group(["KEY_NOT_FOUND", "TRACK_NOT_UNIQUE", "BONE_NOT_UNIQUE", "MORPH_NOT_UNIQUE", "BONE_NOT_FOUND", "MODEL_NOT_FOUND", "MATERIAL_NOT_FOUND"], "対象が存在しないか名前が一意でありません。現在の対象一覧を取得してください。", "refresh_context", "none", "keyframes");
group(["TARGET_NOT_FOUND"], "対象切替を完了できませんでした。現在の選択と対象一覧を確認してください。", "refresh_context", "unknown", "keyframes");
group(["KEY_KIND_MISMATCH", "IK_TRACKS_MISMATCH", "BONE_CONTROL_LOCKED"], "キー種別、IK名、またはボーンの操作制約と入力が一致しません。", "correct_input", "none", "keyframes");
group(["KEY_VALUE_OUT_OF_RANGE", "FRAME_OUT_OF_RANGE", "EDIT_TOO_LARGE"], "値または編集件数が許容範囲を超えています。値を修正するか編集を分けてください。", "correct_input", "none", "timeline-transforms");
group(["EXTERNAL_PARENT_KEY_UNSUPPORTED", "SETTING_UNAVAILABLE", "UNKNOWN_TOOL"], "この操作は現在の対象またはMCP入口では利用できません。対応表を確認してください。", "unsupported", "none", "ui-coverage");
group(["CAPTURE_UNAVAILABLE", "CAPTURE_TOO_LARGE"], "現在のviewport画像を取得できません。ウィンドウ表示とstatusを確認してください。", "user_action", "none", "viewport");

/** Never forwards exception messages, stacks, arbitrary request values, or GPU shader messages. */
group(["EXTERNAL_PARENT_CYCLE"], "外部親が自己参照または循環します。frameは循環が生じる最初の切替点です。全モデルの解除キーも含めて確認してください。", "correct_input", "none", "external-parent");
group(["EXTERNAL_PARENT_TARGET_CHANGED"], "親モデルのインスタンスID・pathが一致しません。現在のモデル一覧から指定し直してください。", "refresh_context", "none", "external-parent");
group(["EXTERNAL_PARENT_CHILD_MISMATCH", "EXTERNAL_PARENT_FRAME_CONFLICT"], "子ボーン指定が不一致、または同じモデルの同一フレームに別の子ボーンの外部親キーがあります。関係一覧を確認してください。", "correct_input", "none", "external-parent");
group(["EXTERNAL_PARENT_LOCAL_POSE_REQUIRED"], "keepLocalは既存のポーズキー、または現在フレームの編集値が必要です。そのフレームへseekして登録するか、snapを明示してください。", "correct_input", "none", "external-parent");
group(["ASSET_CHANGED"], "素材IDまたは元pathが一致しません。一覧を再取得してください。", "refresh_context", "none", "files-and-output");
group(["ASSET_REMOVAL_UNSUPPORTED"], "モデルへ統合済みのモーションは履歴単位に分離削除できません。モデル削除は所属モーションも除去します。キー編集の削除は別途利用できます。", "unsupported", "none", "files-and-output");
group(["OPERATION_NOT_CANCELABLE"], "指定jobは取消可能な実行中動画出力ではありません。結果を照会してください。", "inspect_operation", "none", "ui-operations");
group(["OPERATION_CANCELED"], "動画出力を取り消しました。出力先は更新していません。", "inspect_operation", "none", "ui-operations");
group(["VIDEO_EXPORT_FAILED"], "動画出力を完了できませんでした。進捗とローカルログを確認してください。", "inspect_operation", "unknown", "ui-operations");
export function toAutomationFailure(error: unknown): AutomationFailure {
    if (error instanceof AutomationError) {
        const code = Object.hasOwn(rules, error.code) ? error.code : "OPERATION_FAILED";
        const details = diagnosticDetailsSchema.safeParse(error.details);
        return { code, details: details.success ? details.data : {} };
    }
    if (error instanceof z.ZodError) {
        return { code: "INVALID_INPUT", details: {
            issues: error.issues.slice(0, 16).map(issue => ({
                field: issue.path.map(part => typeof part === "number" ? String(part) : /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(part)) ? String(part) : "field").join(".").slice(0, 200) || "input",
                code: issue.code,
            })),
        } };
    }
    return { code: "OPERATION_FAILED", details: {} };
}

export function validationDetails(error: z.ZodError, value: unknown): DiagnosticDetails {
    const details = toAutomationFailure(error).details;
    const first = error.issues[0];
    if (!first) return details;
    let actual: unknown = value;
    for (const part of first.path) actual = actual && typeof actual === "object" && Object.hasOwn(actual, part) ? (actual as Record<PropertyKey, unknown>)[part] : undefined;
    return { ...details, field: details.issues?.[0]?.field,
        ...(typeof actual === "number" && Number.isFinite(actual) ? { actual } : {}),
        ...(first.code === "too_small" && typeof first.minimum === "number" ? { minimum: first.minimum } : {}),
        ...(first.code === "too_big" && typeof first.maximum === "number" ? { maximum: first.maximum } : {}),
    };
}

export function describeAutomationFailure(failure: AutomationFailure) {
    const rule = rules[failure.code] ?? rules.OPERATION_FAILED;
    const nextTool = rule.recovery === "inspect_operation" ? "mmd_get_operation" : rule.recovery === "wait" ? "mmd_get_diagnostics" : rule.recovery === "refresh_context" ? "mmd_get_context" : "mmd_help";
    return {
        ok: false as const,
        error: { code: failure.code, message: rule.message, details: failure.details },
        effects: { state: rule.effects },
        recovery: { strategy: rule.recovery, retrySameInput: false, nextTool, helpTopic: rule.helpTopic },
    };
}

export function createAutomationDiagnostic(error: unknown, identity: { diagnosticId: string; tool: string; operationId: string | null; timestamp: string }) {
    return { ...describeAutomationFailure(toAutomationFailure(error)), ...identity };
}
export type AutomationDiagnostic = ReturnType<typeof createAutomationDiagnostic>;

/** A grant-local bounded buffer, filtered again by scene when queried. */
export class AutomationDiagnosticHistory {
    private entries: { sceneGeneration: number; diagnostic: AutomationDiagnostic }[] = [];
    public clear(): void { this.entries = []; }
    public add(sceneGeneration: number, diagnostic: AutomationDiagnostic): void {
        this.entries.push({ sceneGeneration, diagnostic });
        if (this.entries.length > 50) this.entries.shift();
    }
    public read(sceneGeneration: number, limit: number, operationId?: string) {
        const matches = this.entries.filter(entry => entry.sceneGeneration === sceneGeneration && (!operationId || entry.diagnostic.operationId === operationId));
        return { items: matches.slice(-limit).reverse().map(entry => entry.diagnostic), retainedMatchingCount: matches.length, truncated: matches.length > limit, capacity: 50 };
    }
}
