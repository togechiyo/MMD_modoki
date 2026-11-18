import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, client } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
const enabled = dialog => dialog.getByLabel("MCPを有効にする", { exact: true });
const editable = dialog => dialog.getByLabel("AIからの編集も許可", { exact: true });
const detailed = dialog => dialog.getByLabel("構造情報を含む詳細診断を許可", { exact: true });
const status = dialog => dialog.locator("[data-mcp-status]");

async function ready(app) {
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    return page;
}

async function connection(dialog) {
    await dialog.getByRole("button", { name: "接続設定を表示" }).click();
    return JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki;
}

test("MCP enabled intent survives process restart with fresh permissions and only the first editor published", async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
        let page = await ready(launched.app);
        let dialog = await settings(page);
        await expect(enabled(dialog)).not.toBeChecked();
        await expect(editable(dialog)).not.toBeChecked();
        await expect(editable(dialog)).toBeDisabled();
        await expect(detailed(dialog)).not.toBeChecked();
        // configure first revokes the old grant and briefly publishes OFF. Observe
        // the completed UI state instead of check()'s immediate post-click state.
        await enabled(dialog).click();
        await expect(status(dialog)).toContainText("公開中");
        await expect(enabled(dialog)).toBeChecked();
        await editable(dialog).click();
        await expect(status(dialog)).toContainText("参照・編集");
        await expect(editable(dialog)).toBeChecked();
        await detailed(dialog).click();
        await expect(detailed(dialog)).toBeEnabled();
        await expect(detailed(dialog)).toBeChecked();
        const previousConnection = await connection(dialog);
        const previousRpc = client(previousConnection);
        const previousContext = (await previousRpc("mmd_get_context", { detail: "summary" })).structuredContent;
        expect(previousContext.target.editorSessionId).toBeTruthy();
        await closeSettings(dialog);
        expect(JSON.parse(await readFile(resolve(launched.tempDir, "user-data/mcp-settings.json"), "utf8"))).toEqual({ version: 1, enabled: true });

        await launched.restart();
        page = await ready(launched.app);
        dialog = await settings(page);
        await expect(enabled(dialog)).toBeChecked();
        await expect(status(dialog)).toContainText("公開中");
        await expect(editable(dialog)).not.toBeChecked();
        await expect(detailed(dialog)).not.toBeChecked();
        const restoredConnection = await connection(dialog);
        expect(restoredConnection.url).toBe(previousConnection.url);
        // Compare credentials without including them in assertion failure output.
        expect(restoredConnection.headers.Authorization === previousConnection.headers.Authorization).toBe(true);
        const rpc = client(restoredConnection);
        const context = (await rpc("mmd_get_context", { detail: "summary" })).structuredContent;
        expect(context.target.editorSessionId).not.toBe(previousContext.target.editorSessionId);
        expect((await rpc("mmd_get_context", { target: previousContext.target })).structuredContent.error.code).toBe("TARGET_UNAVAILABLE");
        expect((await rpc("mmd_set_playback", { target: context.target, expectedEditRevision: context.editRevision, operationId: randomUUID(), action: "pause" })).structuredContent.error.code).toBe("READ_ONLY");
        expect((await rpc("mmd_inspect_detail", { target: context.target, expectedEditRevision: context.editRevision, modelInstanceId: "not-loaded", subject: { kind: "bone", index: 0 } })).structuredContent.error.code).toBe("DETAILED_DIAGNOSTICS_DISABLED");
        expect((await rpc("mmd_list_snapshots", { target: context.target })).structuredContent.snapshots).toEqual([]);
        await closeSettings(dialog);

        const newWindow = launched.app.waitForEvent("window");
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.newProjectWindow"]').click();
        const child = await newWindow;
        await child.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const childDialog = await settings(child);
        await expect(enabled(childDialog)).not.toBeChecked();
        await expect(editable(childDialog)).not.toBeChecked();
        await expect(detailed(childDialog)).not.toBeChecked();
        await expect(status(childDialog)).toContainText("OFF：公開していません");
        await child.close();
        // The original editor remains the sole target even after another editor was opened.
        expect((await rpc("mmd_get_context", { detail: "summary" })).structuredContent.target.editorSessionId).toBe(context.target.editorSessionId);

        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        dialog = await settings(page);
        await expect(enabled(dialog)).not.toBeChecked();
        await expect(editable(dialog)).not.toBeChecked();
        await expect(detailed(dialog)).not.toBeChecked();
        expect(JSON.parse(await readFile(resolve(launched.tempDir, "user-data/mcp-settings.json"), "utf8"))).toEqual({ version: 1, enabled: true });
        await closeSettings(dialog);

        // Reload revocation does not become an implicit preference change.
        await launched.restart();
        page = await ready(launched.app);
        dialog = await settings(page);
        await expect(enabled(dialog)).toBeChecked();
        await expect(status(dialog)).toContainText("公開中");
        expect((await client(await connection(dialog))("mmd_get_context")).isError).not.toBe(true);
        await enabled(dialog).click();
        await expect(status(dialog)).toContainText("OFF：公開していません");
        await expect(enabled(dialog)).not.toBeChecked();
        await expect(dialog.getByLabel("MCP接続設定")).toBeHidden();
        expect(JSON.parse(await readFile(resolve(launched.tempDir, "user-data/mcp-settings.json"), "utf8"))).toEqual({ version: 1, enabled: false });
        await closeSettings(dialog);

        await launched.restart();
        page = await ready(launched.app);
        dialog = await settings(page);
        await expect(enabled(dialog)).not.toBeChecked();
        await expect(editable(dialog)).not.toBeChecked();
        await expect(detailed(dialog)).not.toBeChecked();
        await expect(status(dialog)).toContainText("OFF：公開していません");
        await expect(dialog.getByRole("button", { name: "接続設定を表示" })).toBeDisabled();
    } finally {
        await launched.close();
    }
});
