import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");

test("MCP capture explains unavailable windows and recovers after restoring them", async () => {
    test.setTimeout(120000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const { target } = (await rpc("mmd_get_context", { detail: "summary" })).structuredContent;
        for (const reason of ["window_minimized", "window_hidden"]) {
            // Change only this isolated test window through Electron's own window API.
            await launched.app.evaluate(({ BrowserWindow }, reason) => {
                const window = BrowserWindow.getAllWindows()[0];
                if (reason === "window_minimized") window.minimize();
                else window.hide();
            }, reason);
            await expect.poll(() => launched.app.evaluate(({ BrowserWindow }, reason) => {
                const window = BrowserWindow.getAllWindows()[0];
                return reason === "window_minimized" ? window.isMinimized() : !window.isVisible();
            }, reason)).toBe(true);
            try {
                const result = await rpc("mmd_capture_viewport", { target, quality: "preview" });
                expect(result.isError).toBe(true);
                expect(result.structuredContent.error).toMatchObject({ code: "CAPTURE_UNAVAILABLE", details: { reason } });
                expect(result.structuredContent.error.message).toContain(reason === "window_minimized" ? "最小化" : "非表示");
            } finally {
                await launched.app.evaluate(({ BrowserWindow }) => {
                    const window = BrowserWindow.getAllWindows()[0];
                    window.restore();
                    window.show();
                });
            }
            await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => {
                const window = BrowserWindow.getAllWindows()[0];
                return !window.isMinimized() && window.isVisible();
            })).toBe(true);
            const recovered = await rpc("mmd_capture_viewport", { target, quality: "preview" });
            expect(recovered.isError, JSON.stringify(recovered.structuredContent)).not.toBe(true);
            expect(recovered.content.some(block => block.type === "image" && block.mimeType === "image/jpeg")).toBe(true);
        }
    } finally {
        await launched.close();
    }
});
