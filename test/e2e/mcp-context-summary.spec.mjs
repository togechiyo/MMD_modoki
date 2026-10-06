import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing, settings, closeSettings } from "./mcp-client.mjs";

test("MCP summary supports guarded editing and follows GUI state", async () => {
    const launched = await launchMmdModoki(resolve(import.meta.dirname, "../.."));
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const full = (await rpc("mmd_get_context")).structuredContent;
        const summary = async () => (await rpc("mmd_get_context", { target: full.target, detail: "summary" })).structuredContent;
        const compact = await summary();
        expect(compact).toMatchObject({ target: full.target, editRevision: full.editRevision, modelCount: full.models.length,
            busy: false, status: { editPermission: true } });
        expect(compact).not.toHaveProperty("camera");
        expect(compact).not.toHaveProperty("models");
        expect((await rpc("mmd_get_context", { detail: "full" })).structuredContent.camera).toEqual(full.camera);
        const edited = await rpc("mmd_set_playback", { target: compact.target, expectedEditRevision: compact.editRevision,
            operationId: randomUUID(), action: "seek", frame: 25 });
        expect(edited.isError).not.toBe(true);
        await expect(page.locator("#current-frame")).toHaveValue("25");
        const updated = await summary();
        expect(updated.frame).toBe(25);
        expect(updated.editRevision).toBeGreaterThan(compact.editRevision);
        const stale = await rpc("mmd_set_playback", { target: compact.target, expectedEditRevision: compact.editRevision,
            operationId: randomUUID(), action: "seek", frame: 26 });
        expect(stale.structuredContent.error.code).toBe("REVISION_CONFLICT");
        const dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).uncheck();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await closeSettings(dialog);
        expect((await summary()).status).toMatchObject({ editPermission: false, editBlockers: ["read_only"] });
        await expect(page.locator("#current-frame")).toHaveValue("25");
    } finally { await launched.close(); }
});
