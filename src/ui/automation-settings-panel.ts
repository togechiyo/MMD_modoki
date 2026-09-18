import { getLocale, t } from "../i18n";
import { createPopupFormButton, createPopupFormButtonRow } from "./popup-form-helpers";
import { createExperimentalSection, createExperimentalToggle } from "./experimental-settings-layout";
import type { AutomationState } from "../automation/contracts";

export function mountAutomationSettings(container: HTMLElement): () => void {
    const title = document.createElement("p");
    title.className = "experimental-settings-subtitle";
    title.textContent = t("experiment.mcp.title");
    const enabled = document.createElement("input");
    enabled.type = "checkbox"; enabled.className = "popup-form-checkbox";
    enabled.disabled = true;
    enabled.setAttribute("aria-label", t("experiment.mcp.enabled"));
    const section = createExperimentalSection("MCP", enabled);
    section.dataset.enabled = "false";
    const editable = document.createElement("input");
    editable.type = "checkbox"; editable.className = "popup-form-checkbox";
    editable.disabled = true;
    const detailed = document.createElement("input");
    detailed.type = "checkbox"; detailed.className = "popup-form-checkbox"; detailed.disabled = true;
    const detailNote = document.createElement("p");
    detailNote.className = "popup-form-note"; detailNote.id = "mcp-detail-sharing-note";
    detailNote.textContent = t("experiment.mcp.detailNote");
    detailed.setAttribute("aria-describedby", detailNote.id);
    const note = document.createElement("p");
    note.className = "popup-form-note";
    note.id = "mcp-sharing-note";
    enabled.setAttribute("aria-describedby", note.id);
    note.textContent = t("experiment.mcp.sharingNote");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.dataset.mcpStatus = "true";
    status.className = "experimental-settings-status";
    const connection = createPopupFormButton(t("experiment.mcp.connection"), "secondary");
    connection.disabled = true;
    const config = document.createElement("textarea");
    config.className = "popup-form-control";
    config.readOnly = true; config.hidden = true; config.rows = 9;
    config.setAttribute("aria-label", t("experiment.mcp.connectionLabel"));
    const historyButton = createPopupFormButton(t("experiment.mcp.historyRefresh"), "secondary");
    const history = document.createElement("ol");
    history.className = "experimental-settings-history";
    history.setAttribute("aria-label", t("experiment.mcp.historyLabel"));
    const historyNote = document.createElement("p");
    historyNote.className = "popup-form-note";
    historyNote.textContent = t("experiment.mcp.historyNote");
    let mounted = true;
    let configuring = false;
    const render = (state: AutomationState): void => {
        if (!mounted) return;
        enabled.checked = state.enabled; editable.checked = state.editable; detailed.checked = state.detailedDiagnostics;
        section.dataset.enabled = String(state.enabled);
        enabled.disabled = configuring; editable.disabled = configuring || !state.enabled;
        detailed.disabled = configuring || !state.enabled;
        connection.disabled = !state.enabled;
        status.textContent = configuring ? t("experiment.mcp.configuring") : (state.error ? t("experiment.mcp.configurationFailed") : undefined) ?? (state.enabled ? (state.editable ? t("experiment.mcp.status.editable") : t("experiment.mcp.status.readOnly")) : t("experiment.mcp.status.off"));
        if (state.enabled && !configuring && !state.error) status.textContent += state.detailedDiagnostics ? t("experiment.mcp.status.detailsOn") : t("experiment.mcp.status.detailsOff");
        if (state.enabled && !configuring && !state.error && state.connectionNotice) status.textContent += ` — ${t("experiment.mcp.portChanged", state.connectionNotice)}`;
        if (!state.enabled) { config.value = ""; config.hidden = true; }
    };
    const unsubscribe = window.electronAPI.automation.onState(render);
    void window.electronAPI.automation.getState().then(render).catch(() => { status.textContent = t("experiment.mcp.stateFailed"); });
    const change = (): void => {
        configuring = true; enabled.disabled = true; editable.disabled = true; detailed.disabled = true;
        void window.electronAPI.automation.configure(enabled.checked, editable.checked, detailed.checked).then(state => {
            configuring = false; render(state);
        }).catch(() => {
            configuring = false; enabled.disabled = false; editable.disabled = !enabled.checked; detailed.checked = false; detailed.disabled = !enabled.checked;
            status.textContent = t("experiment.mcp.changeFailed");
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
            if (!entries.length) { const item = document.createElement("li"); item.className = "is-empty"; item.textContent = t("experiment.mcp.historyEmpty"); history.append(item); }
            for (const entry of entries) {
                const item = document.createElement("li");
                item.textContent = `${new Date(entry.timestamp).toLocaleTimeString(getLocale())} — ${entry.modelName} / ${t(`experiment.mcp.kind.${entry.kind}`)}[${entry.index}] ${entry.name ?? t("experiment.mcp.unnamed")}`;
                history.append(item);
            }
        }).catch(() => { if (mounted) history.textContent = t("experiment.mcp.historyFailed"); })
            .finally(() => { if (mounted) historyButton.disabled = false; });
    };
    historyButton.addEventListener("click", refreshHistory);
    refreshHistory();
    connection.addEventListener("click", () => {
        void window.electronAPI.automation.getConnection().then(value => {
            if (!mounted) return;
            config.hidden = false;
            config.value = JSON.stringify({ mcpServers: { mmd_modoki: { type: "http", url: value.endpoint, headers: { Authorization: `Bearer ${value.token}` } } } }, null, 2);
        }).catch(() => { status.textContent = t("experiment.mcp.connectionFailed"); });
    });
    const permissions = document.createElement("div");
    permissions.className = "experimental-settings-subsection experimental-settings-permissions";
    const permissionTitle = document.createElement("h4"); permissionTitle.textContent = t("experiment.mcp.permissions");
    permissions.append(permissionTitle, createExperimentalToggle(t("experiment.mcp.editable"), editable));
    const diagnostics = document.createElement("div");
    diagnostics.className = "experimental-settings-subsection experimental-settings-consent experimental-settings-permissions";
    const diagnosticsTitle = document.createElement("h4"); diagnosticsTitle.textContent = t("experiment.mcp.diagnostics");
    diagnostics.append(diagnosticsTitle, detailNote, createExperimentalToggle(t("experiment.mcp.detailed"), detailed));
    const historySection = document.createElement("div");
    historySection.className = "experimental-settings-subsection";
    const historyTitle = document.createElement("h4"); historyTitle.textContent = t("experiment.mcp.history");
    historySection.append(historyTitle, historyNote, history, createPopupFormButtonRow([historyButton]));
    section.append(title, note, permissions,
        diagnostics, status, createPopupFormButtonRow([connection]), config, historySection);
    container.append(section);
    return () => { mounted = false; config.value = ""; unsubscribe(); };
}
