import { expect } from "@playwright/test";

export async function settings(page) {
    await page.locator('[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    return page.locator('[data-popup-id="experimental-settings"]');
}
export async function closeSettings(dialog) { await dialog.locator(".app-menu-dialog-close").click(); }
export function client(connection) {
    return async (name, args = {}, method = "tools/call") => {
        const params = method === "tools/call" ? { name, arguments: args } : args;
        const response = await fetch(connection.url, {
            method: "POST", headers: { ...connection.headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
                "Mcp-Method": method, "MCP-Protocol-Version": "2026-07-28", ...(method === "tools/call" ? { "Mcp-Name": name } : {}),
                ...(method === "resources/read" ? { "Mcp-Name": args.uri } : {}),
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
                "io.modelcontextprotocol/clientInfo": { name: "mmd-e2e", version: "1" },
            } } }),
        });
        const result = await response.json();
        if (method === "resources/read" && args.uri?.startsWith("file:")) {
            expect(result.error).toBeTruthy();
            return result;
        }
        expect(result.error, JSON.stringify(result)).toBeUndefined();
        return result.result;
    };
}

export async function enableMcpEditing(page) {
    const dialog = await settings(page);
    await expect(dialog.getByLabel("MCPを有効にする", { exact: true })).not.toBeChecked();
    await expect(dialog.getByLabel("AIからの編集も許可", { exact: true })).toBeDisabled();
    await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
    await expect(dialog.locator("[data-mcp-status]")).toContainText("公開中");
    await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
    await expect(dialog.locator("[data-mcp-status]")).toContainText("参照・編集");
    await dialog.getByRole("button", { name: "接続設定を表示" }).click();
    const config = JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki;
    await closeSettings(dialog);
    return client(config);
}
