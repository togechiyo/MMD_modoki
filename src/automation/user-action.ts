/** Describe the action without forwarding dialog/model text or accepting it on the user's behalf. */
export function automationUserAction(busyReasons: readonly string[]) {
    if (busyReasons.includes("model_comment_confirmation")) return {
        kind: "model_comment_confirmation" as const,
        message: "モデルのコメント確認待ちです。ユーザーがアプリの表示内容を確認してOKまたはキャンセルを選んでください。",
    };
    if (busyReasons.includes("modal")) return { kind: "dialog" as const, message: "アプリのダイアログでユーザー操作を待っています。" };
    return null;
}
