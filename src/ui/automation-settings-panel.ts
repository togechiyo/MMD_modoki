import { createPopupFormButton, createPopupFormButtonRow } from "./popup-form-helpers";
import { createExperimentalSection, createExperimentalToggle } from "./experimental-settings-layout";
import type { AutomationState } from "../automation/contracts";

export function mountAutomationSettings(container: HTMLElement): () => void {
    const section = createExperimentalSection("MCP");
    section.dataset.enabled = "false";
    const title = document.createElement("p");
    title.className = "experimental-settings-subtitle";
    title.textContent = "AI連携";
    const enabled = document.createElement("input");
    enabled.type = "checkbox"; enabled.className = "popup-form-checkbox";
    enabled.disabled = true;
    const editable = document.createElement("input");
    editable.type = "checkbox"; editable.className = "popup-form-checkbox";
    editable.disabled = true;
    const detailed = document.createElement("input");
    detailed.type = "checkbox"; detailed.className = "popup-form-checkbox"; detailed.disabled = true;
    const detailNote = document.createElement("p");
    detailNote.className = "popup-form-note"; detailNote.id = "mcp-detail-sharing-note";
    detailNote.textContent = "許可すると、要求された対象のボーン初期位置・IK・モーフ属性・材質・剛体・ジョイント設定をMCPクライアントへ提供します。接続先によってはクラウドAIへ送信されます。1回につき1対象ですが、繰り返し取得で構造情報が蓄積する可能性があります。モデルファイル・メッシュ・頂点ウェイト・モーフ頂点差分・テクスチャ原本は提供しません。MCPをOFFにすると許可もOFFになります。";
    detailed.setAttribute("aria-describedby", detailNote.id);
    const note = document.createElement("p");
    note.className = "popup-form-note";
    note.id = "mcp-sharing-note";
    enabled.setAttribute("aria-describedby", note.id);
    note.textContent = "このウィンドウの画像・元パス・キー情報とボーン・モーフ・材質の名前一覧を公開します。モデルファイル・メッシュ・テクスチャ原本は提供しません。起動時はOFFです。";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.dataset.mcpStatus = "true";
    status.className = "experimental-settings-status";
    const connection = createPopupFormButton("接続設定を表示", "secondary");
    connection.disabled = true;
    const config = document.createElement("textarea");
    config.className = "popup-form-control";
    config.readOnly = true; config.hidden = true; config.rows = 9;
    config.setAttribute("aria-label", "MCP接続設定");
    const historyButton = createPopupFormButton("詳細情報の提供履歴を更新", "secondary");
    const history = document.createElement("ol");
    history.className = "experimental-settings-history";
    history.setAttribute("aria-label", "詳細情報の提供履歴");
    const historyNote = document.createElement("p");
    historyNote.className = "popup-form-note";
    historyNote.textContent = "このウィンドウで応答を生成した直近50件。クラウドへの到達は確認できません。OFF後も確認でき、画面の再読み込み・終了で消去します。";
    let mounted = true;
    let configuring = false;
    const render = (state: AutomationState): void => {
        if (!mounted) return;
        enabled.checked = state.enabled; editable.checked = state.editable; detailed.checked = state.detailedDiagnostics;
        section.dataset.enabled = String(state.enabled);
        enabled.disabled = configuring; editable.disabled = configuring || !state.enabled;
        detailed.disabled = configuring || !state.enabled;
        connection.disabled = !state.enabled;
        status.textContent = configuring ? "設定変更中…" : state.error ?? (state.enabled ? (state.editable ? "公開中：参照・編集を許可" : "公開中：参照のみ") : "OFF：公開していません");
        if (state.enabled && !configuring && !state.error) status.textContent += state.detailedDiagnostics ? "／詳細診断：許可" : "／詳細診断：OFF";
        if (!state.enabled) { config.value = ""; config.hidden = true; }
    };
    const unsubscribe = window.electronAPI.automation.onState(render);
    void window.electronAPI.automation.getState().then(render).catch(() => { status.textContent = "MCP状態を取得できませんでした。"; });
    const change = (): void => {
        configuring = true; enabled.disabled = true; editable.disabled = true; detailed.disabled = true;
        void window.electronAPI.automation.configure(enabled.checked, editable.checked, detailed.checked).then(state => {
            configuring = false; render(state);
        }).catch(() => {
            configuring = false; enabled.disabled = false; editable.disabled = !enabled.checked; detailed.checked = false; detailed.disabled = !enabled.checked;
            status.textContent = "MCP設定を変更できませんでした。";
        });
    };
    enabled.addEventListener("change", change);
    editable.addEventListener("change", change);
    detailed.addEventListener("change", change);
    const refreshHistory = (): void => {
        historyButton.disabled = true;
        void window.electronAPI.automation.getDetailAccessHistory().then(entries => {
            if (!mounted) return;
            history.replaceChildren();
            if (!entries.length) { const item = document.createElement("li"); item.className = "is-empty"; item.textContent = "提供履歴はありません。"; history.append(item); }
            for (const entry of entries) {
                const item = document.createElement("li");
                item.textContent = `${new Date(entry.timestamp).toLocaleTimeString()} — ${entry.modelName} / ${entry.kind}[${entry.index}] ${entry.name ?? "名称なし"}`;
                history.append(item);
            }
        }).catch(() => { if (mounted) history.textContent = "提供履歴を取得できませんでした。"; })
            .finally(() => { if (mounted) historyButton.disabled = false; });
    };
    historyButton.addEventListener("click", refreshHistory);
    refreshHistory();
    connection.addEventListener("click", () => {
        void window.electronAPI.automation.getConnection().then(value => {
            if (!mounted) return;
            config.hidden = false;
            config.value = JSON.stringify({ mcpServers: { mmd_modoki: { type: "http", url: value.endpoint, headers: { Authorization: `Bearer ${value.token}` } } } }, null, 2);
        }).catch(() => { status.textContent = "公開をONにしてから接続設定を表示してください。"; });
    });
    const permissions = document.createElement("div");
    permissions.className = "experimental-settings-subsection experimental-settings-permissions";
    const permissionTitle = document.createElement("h4"); permissionTitle.textContent = "操作の許可";
    permissions.append(permissionTitle, createExperimentalToggle("AIからの編集も許可", editable));
    const diagnostics = document.createElement("div");
    diagnostics.className = "experimental-settings-subsection experimental-settings-consent experimental-settings-permissions";
    const diagnosticsTitle = document.createElement("h4"); diagnosticsTitle.textContent = "詳細診断の共有";
    diagnostics.append(diagnosticsTitle, detailNote, createExperimentalToggle("構造情報を含む詳細診断を許可", detailed));
    const historySection = document.createElement("div");
    historySection.className = "experimental-settings-subsection";
    const historyTitle = document.createElement("h4"); historyTitle.textContent = "提供履歴";
    historySection.append(historyTitle, historyNote, history, createPopupFormButtonRow([historyButton]));
    section.append(title, createExperimentalToggle("MCPを有効にする", enabled), note, permissions,
        diagnostics, status, createPopupFormButtonRow([connection]), config, historySection);
    container.append(section);
    return () => { mounted = false; config.value = ""; unsubscribe(); };
}
