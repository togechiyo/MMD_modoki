import { createPopupFormButton, createPopupFormField } from "./popup-form-helpers";
import type { AutomationState } from "../automation/contracts";

export function mountAutomationSettings(container: HTMLElement): () => void {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent = "AI連携（MCP）";
    const enabled = document.createElement("input");
    enabled.type = "checkbox"; enabled.className = "popup-form-checkbox";
    enabled.disabled = true;
    const editable = document.createElement("input");
    editable.type = "checkbox"; editable.className = "popup-form-checkbox";
    editable.disabled = true;
    const note = document.createElement("p");
    note.className = "popup-form-note";
    note.textContent = "このウィンドウの画像・元パス・キー情報を公開します。モデル本体・テクスチャ・形状データは送信しません。起動時はOFFです。";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.dataset.mcpStatus = "true";
    const connection = createPopupFormButton("接続設定を表示", "secondary");
    connection.disabled = true;
    const config = document.createElement("textarea");
    config.className = "popup-form-control";
    config.readOnly = true; config.hidden = true; config.rows = 9;
    config.setAttribute("aria-label", "MCP接続設定");
    let mounted = true;
    let configuring = false;
    const render = (state: AutomationState): void => {
        if (!mounted) return;
        enabled.checked = state.enabled; editable.checked = state.editable;
        enabled.disabled = configuring; editable.disabled = configuring;
        connection.disabled = !state.enabled;
        status.textContent = configuring ? "設定変更中…" : state.error ?? (state.enabled ? (state.editable ? "公開中：参照・編集を許可" : "公開中：参照のみ") : "OFF：公開していません");
        if (!state.enabled) { config.value = ""; config.hidden = true; }
    };
    const unsubscribe = window.electronAPI.automation.onState(render);
    void window.electronAPI.automation.getState().then(render).catch(() => { status.textContent = "MCP状態を取得できませんでした。"; });
    const change = (): void => {
        configuring = true; enabled.disabled = true; editable.disabled = true;
        void window.electronAPI.automation.configure(enabled.checked, editable.checked).then(state => {
            configuring = false; render(state);
        }).catch(() => {
            configuring = false; enabled.disabled = false; editable.disabled = false;
            status.textContent = "MCP設定を変更できませんでした。";
        });
    };
    enabled.addEventListener("change", change);
    editable.addEventListener("change", change);
    connection.addEventListener("click", () => {
        void window.electronAPI.automation.getConnection().then(value => {
            if (!mounted) return;
            config.hidden = false;
            config.value = JSON.stringify({ mcpServers: { mmd_modoki: { type: "http", url: value.endpoint, headers: { Authorization: `Bearer ${value.token}` } } } }, null, 2);
        }).catch(() => { status.textContent = "公開をONにしてから接続設定を表示してください。"; });
    });
    section.append(title, createPopupFormField("MCPを有効にする", enabled), createPopupFormField("AIからの編集も許可", editable), note, status, connection, config);
    container.append(section);
    return () => { mounted = false; config.value = ""; unsubscribe(); };
}
