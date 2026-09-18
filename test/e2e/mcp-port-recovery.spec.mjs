import { test, expect } from "@playwright/test";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, client } from "./mcp-client.mjs";

test("MCP recovers an occupied saved port and shows the replacement connection", async () => {
    const blocker = createServer();
    await new Promise((resolveListen, reject) => {
        blocker.once("error", reject);
        blocker.listen(0, "127.0.0.1", resolveListen);
    });
    let launched;
    try {
        launched = await launchMmdModoki(resolve(import.meta.dirname, "../.."));
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const oldPort = blocker.address().port;
        // Seed only the isolated test profile, before the first MCP enable reads credentials.
        const token = randomBytes(32).toString("base64url");
        const encryptedToken = await launched.app.evaluate(({ safeStorage }, value) => safeStorage.encryptString(value).toString("base64"), token);
        const registrationPath = resolve(launched.tempDir, "user-data/mcp-registration.json");
        await writeFile(registrationPath, JSON.stringify({ port: oldPort, encryptedToken }));

        let dialog = await settings(page);
        const enable = () => dialog.getByLabel("MCPを有効にする", { exact: true });
        const status = () => dialog.locator("[data-mcp-status]");
        const connection = async () => {
            await dialog.getByRole("button", { name: "接続設定を表示" }).click();
            return JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki;
        };
        await expect(enable()).not.toBeChecked();
        await enable().click();
        await expect(status()).toContainText("公開中");
        await expect(status()).toContainText(`以前のポート ${oldPort} が使用中`);
        await expect(status()).toContainText("MCPクライアント側の設定を更新");
        const config = await connection();
        const newPort = Number(new URL(config.url).port);
        expect(newPort).not.toBe(oldPort);
        expect(new URL(config.url).hostname).toBe("127.0.0.1");
        // Compare without exposing the credential in assertion failure output.
        expect(config.headers.Authorization === `Bearer ${token}`).toBe(true);
        expect((await client(config)("mmd_get_context")).isError).not.toBe(true);
        expect(JSON.parse(await readFile(registrationPath, "utf8")).port).toBe(newPort);

        await closeSettings(dialog);
        dialog = await settings(page);
        await expect(status()).toContainText(`空きポート ${newPort} に変更`);
        await enable().click();
        await expect(status()).toContainText("OFF：公開していません");
        await expect(status()).not.toContainText("使用中");
        await expect(dialog.getByLabel("MCP接続設定")).toBeHidden();
        await enable().click();
        await expect(status()).toContainText("公開中");
        expect((await connection()).url).toBe(config.url);
        expect((await client(config)("mmd_get_context")).isError).not.toBe(true);
        await closeSettings(dialog);

        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        dialog = await settings(page);
        await expect(enable()).not.toBeChecked();
        await enable().click();
        await expect(status()).toContainText("公開中");
        expect((await connection()).url).toBe(config.url);
    } finally {
        await launched?.close();
        await new Promise((resolveClose, reject) => blocker.close(error => error ? reject(error) : resolveClose()));
    }
});
