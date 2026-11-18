import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { enableMcpEditing, settings, closeSettings } from "./mcp-client.mjs";
import { openPostEffects } from "./helpers/rc-lighting-controls.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const state = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
const history = (page, action) => page.locator(`.app-menu-quick-button[data-menu-command="edit.${action}"]`).click();

async function fileMenu(page, command) {
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator(`[data-menu-command="${command}"]`).click();
}

async function seek(page, frame) {
    await page.locator("#current-frame").fill(String(frame));
    await page.locator("#current-frame").press("Enter");
    await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}

function tools(rpc) {
    const context = async () => (await rpc("mmd_get_context", { detail: "summary" })).structuredContent;
    const inspect = async (paging = {}) => {
        const current = await context();
        const result = await rpc("mmd_inspect", { target: current.target, expectedEditRevision: current.editRevision, kind: "effects", ...paging });
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        return result.structuredContent;
    };
    const request = async (operation, extra = {}) => {
        const current = await context();
        return { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), operation, ...extra };
    };
    const call = async (operation, extra = {}) => rpc("mmd_edit_effect_instances", await request(operation, extra));
    const edit = async operation => {
        const result = await call(operation, { dryRun: false });
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        expect(result.structuredContent.status).toBe("applied");
        expect(result.structuredContent.editId).toMatch(/^ai:/);
        return result.structuredContent;
    };
    return { context, inspect, request, call, edit };
}

test("MCP effect instance edits share GUI history, display order, and project persistence", async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root), errors = [];
    try {
        const page = await launched.app.firstWindow();
        page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        const rpc = await enableMcpEditing(page);
        const { context, inspect, request, call, edit } = tools(rpc);
        const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
        const item = async id => (await inspect()).items.find(candidate => candidate.instanceId === id);
        const guiOrder = () => page.locator("[data-effect-instance-row]").evaluateAll(rows => rows.map(row => row.dataset.effectInstanceRow));
        await openPostEffects(page);
        expect((await inspect()).items).toEqual([]);

        // Omitted dryRun defaults to validation and does not consume a history slot.
        const initial = await state(page), initialContext = await context();
        const validation = await call({ action: "add", effectType: "bloom" });
        expect(validation.isError, JSON.stringify(validation)).not.toBe(true);
        expect(validation.structuredContent).toMatchObject({ status: "validated", editId: null, plan: { instanceId: expect.any(String) } });
        expect(await state(page)).toEqual(initial);
        expect(await context()).toMatchObject({ editRevision: initialContext.editRevision, undoId: initialContext.undoId });
        await expect(page.locator("[data-effect-instance-row]")).toHaveCount(0);

        const addRequest = await request({ action: "add", effectType: "bloom" }, { dryRun: false });
        const added = await rpc("mmd_edit_effect_instances", addRequest);
        expect(added.isError, JSON.stringify(added)).not.toBe(true);
        expect(added.structuredContent.status).toBe("applied");
        const bloomId = added.structuredContent.control.instanceId;
        await expect(row(bloomId).locator(".effect-layer-name")).toHaveText("Bloom");
        expect(await item(bloomId)).toMatchObject({ instanceId: bloomId, effectType: "bloom", label: "Bloom", suspended: false });
        expect((await item(bloomId)).publicFields).toMatchObject({ value: expect.arrayContaining(["enabled"]), fixed: ["bloomColor"] });
        const retried = await rpc("mmd_edit_effect_instances", addRequest);
        expect(retried.structuredContent).toEqual(added.structuredContent);
        expect((await inspect()).totalCount).toBe(1);
        const reused = await rpc("mmd_edit_effect_instances", { ...addRequest, operation: { action: "add", effectType: "gamma" } });
        expect(reused.structuredContent.error.code).toBe("OPERATION_ID_REUSED");
        for (const action of ["undo", "redo"]) {
            const current = await context();
            const result = await rpc(`mmd_${action}`, { target: current.target, expectedEditRevision: current.editRevision,
                operationId: randomUUID(), editId: added.structuredContent.editId });
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            expect(result.structuredContent.status).toBe("applied");
            await expect(row(bloomId)).toHaveCount(action === "undo" ? 0 : 1);
        }
        await history(page, "undo");
        await expect(row(bloomId)).toHaveCount(0);
        expect((await inspect()).items).toEqual([]);
        await history(page, "redo");
        await expect(row(bloomId)).toHaveCount(1);

        await expandEffectInstance(row(bloomId));
        const color = row(bloomId).locator('[data-instance-field="color"]');
        const initialColor = await color.inputValue();
        const bloomColor = { r: 0.2, g: 0.4, b: 0.6 };
        await edit({ action: "fixed", instanceId: bloomId, settings: { bloomColor } });
        await expect(color).toHaveValue("#336699");
        expect((await item(bloomId)).fixedSettings).toMatchObject({ bloomColor });
        const guarded = await context();
        const oldUndo = await rpc("mmd_undo", { target: guarded.target, expectedEditRevision: guarded.editRevision,
            operationId: randomUUID(), editId: added.structuredContent.editId });
        expect(oldUndo.structuredContent.error.code).toBe("UNDO_CONFLICT");
        await expect(color).toHaveValue("#336699");
        await history(page, "undo");
        await expandEffectInstance(row(bloomId));
        await expect(color).toHaveValue(initialColor);
        await history(page, "redo");
        await expandEffectInstance(row(bloomId));
        await expect(color).toHaveValue("#336699");

        const staleContext = await context();
        await edit({ action: "rename", instanceId: bloomId, label: "AI Bloom" });
        await expect(row(bloomId).locator(".effect-layer-name")).toHaveText("AI Bloom");
        const stale = await call({ action: "add", effectType: "gamma" }, { dryRun: false, expectedEditRevision: staleContext.editRevision });
        expect(stale.structuredContent.error.code).toBe("REVISION_CONFLICT");
        expect((await inspect()).totalCount).toBe(1);
        const noChangeContext = await context();
        const noChange = await call({ action: "rename", instanceId: bloomId, label: "AI Bloom" }, { dryRun: false });
        expect(noChange.isError, JSON.stringify(noChange)).not.toBe(true);
        expect(noChange.structuredContent.status).toBe("no-change");
        expect(await context()).toMatchObject({ editRevision: noChangeContext.editRevision, undoId: noChangeContext.undoId });

        const gammaId = (await edit({ action: "add", effectType: "gamma" })).control.instanceId;
        const duplicateId = (await edit({ action: "duplicate", instanceId: bloomId })).control.instanceId;
        expect(duplicateId).not.toBe(bloomId);
        expect(await item(duplicateId)).toMatchObject({ effectType: "bloom", suspended: false, fixedSettings: { bloomColor } });
        const discovered = await inspect();
        expect(discovered.items.map(item => item.instanceId)).toEqual(await guiOrder());
        const firstPage = await inspect({ offset: 0, limit: 1 });
        expect(firstPage).toMatchObject({ totalCount: 3, nextOffset: 1 });
        expect(firstPage.items).toHaveLength(1);
        const secondPage = await inspect({ offset: firstPage.nextOffset, limit: 1 });
        expect(secondPage.items[0].instanceId).toBe(discovered.items[1].instanceId);

        // The API's before/after order must agree with the panel, not internal render order.
        const orderBefore = discovered.items.map(item => item.instanceId);
        const movedId = orderBefore[0], anchorId = orderBefore.at(-1);
        await edit({ action: "reorder", instanceId: movedId, targetId: anchorId, placement: "after" });
        const reordered = [...orderBefore.slice(1), movedId];
        expect((await inspect()).items.map(item => item.instanceId)).toEqual(reordered);
        await expect.poll(guiOrder).toEqual(reordered);
        await history(page, "undo");
        await expect.poll(guiOrder).toEqual(orderBefore);
        await history(page, "redo");
        await expect.poll(guiOrder).toEqual(reordered);
        await edit({ action: "reorder", instanceId: movedId, targetId: reordered[0], placement: "before" });
        await expect.poll(guiOrder).toEqual(orderBefore);

        await edit({ action: "suspend", instanceId: duplicateId });
        expect((await item(duplicateId)).suspended).toBe(true);
        expect((await inspect()).displayOrder).not.toContain(duplicateId);
        await expandEffectInstance(row(duplicateId));
        await expect(row(duplicateId).locator('[data-instance-action="resume"]')).toBeVisible();
        await edit({ action: "resume", instanceId: duplicateId });
        expect((await item(duplicateId)).suspended).toBe(false);
        expect((await inspect()).displayOrder).toContain(duplicateId);
        await expect(row(duplicateId).locator('[data-instance-action="resume"]')).toHaveCount(0);
        await edit({ action: "delete", instanceId: duplicateId });
        await expect(row(duplicateId)).toHaveCount(0);
        expect(await item(duplicateId)).toBeUndefined();
        await history(page, "undo");
        await expect(row(duplicateId)).toHaveCount(1);
        expect((await item(duplicateId)).fixedSettings).toMatchObject({ bloomColor });
        await history(page, "redo");
        await expect(row(duplicateId)).toHaveCount(0);

        // Save suspended membership and public settings through the real file-menu path.
        await edit({ action: "suspend", instanceId: gammaId });
        const savedState = await state(page), projectPath = resolve(launched.tempDir, "mcp-effects.mmdproj");
        await launched.app.evaluate(({ dialog }, filePath) => {
            dialog.showSaveDialog = async () => ({ canceled: false, filePath });
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, projectPath);
        await fileMenu(page, "file.saveProject");
        await expect.poll(() => {
            try { return JSON.parse(readFileSync(projectPath, "utf8")).effects.frameGraphInstances; }
            catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
        }).toEqual(savedState);
        await edit({ action: "delete", instanceId: bloomId });
        await expect(row(bloomId)).toHaveCount(0);
        await fileMenu(page, "file.loadProject");
        await expect(page.locator("#status-text")).toContainText("Project loaded");
        await expect.poll(() => state(page)).toEqual(savedState);
        await openPostEffects(page);
        await expect(row(bloomId).locator(".effect-layer-name")).toHaveText("AI Bloom");
        await expandEffectInstance(row(bloomId));
        await expect(color).toHaveValue("#336699");
        expect((await item(gammaId)).suspended).toBe(true);

        // Running playback and revoked edit permission must leave the stack untouched.
        await page.locator("#info-model-select").selectOption("__camera__");
        await selectTimelineTrack(page, "camera", "Camera");
        await seek(page, 600);
        await page.locator("#btn-kf-add").click();
        await seek(page, 0);
        await page.locator("#viewport-seek-play-toggle").click();
        await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(2);
        const playing = await call({ action: "add", effectType: "gamma" }, { dryRun: false });
        expect(playing.structuredContent.error.code).toBe("PLAYING");
        expect(await state(page)).toEqual(savedState);
        await expect(page.locator("#viewport-seek-play-toggle")).toHaveAccessibleName(/^(一時停止|Pause)$/);
        await page.locator("#viewport-seek-play-toggle").click();
        await expect(page.locator("#viewport-seek-play-toggle")).toHaveAccessibleName(/^(再生|Play)$/);
        const dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).uncheck();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await closeSettings(dialog);
        const denied = await call({ action: "delete", instanceId: bloomId }, { dryRun: false });
        expect(denied.structuredContent.error.code).toBe("READ_ONLY");
        expect(await state(page)).toEqual(savedState);
        expect((await inspect()).totalCount).toBe(2);
        expect(errors).toEqual([]);
    } finally {
        await launched.close();
    }
});

test("MCP effect instance edits reject Classic without changing the stack", async () => {
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        // Backend selection is a startup fixture; requests still use the public HTTP tools.
        await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const { context, inspect, call } = tools(rpc);
        const before = await state(page), current = await context();
        expect((await inspect()).backend).toBe("classic");
        const result = await call({ action: "add", effectType: "bloom" }, { dryRun: false });
        expect(result.structuredContent.error.code).toBe("EFFECT_BACKEND_REQUIRED");
        expect(await state(page)).toEqual(before);
        expect((await context()).editRevision).toBe(current.editRevision);
    } finally {
        await launched.close();
    }
});
