import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const backend of ["frameGraph", "classic"]) test(`MCP read-only model inventories preserve selection (${backend})`, async () => {
    test.setTimeout(120000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (backend === "classic") {
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        for (const file of ["material-switch.pmx", "tofu.pmx"]) await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent", file));
        await page.locator("#info-model-select").selectOption("1");
        const rpc = await enableMcpEditing(page);
        let dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await closeSettings(dialog);
        for (const pbr of [false, true]) {
            if (pbr) {
                dialog = await settings(page);
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await closeSettings(dialog);
            }
            const before = (await rpc("mmd_get_context")).structuredContent;
            const modelInstanceId = before.models[0].instanceId;
            expect(before.timelineScope.modelInstanceId).not.toBe(modelInstanceId);
            expect(before.status.editPermission).toBe(false);
            const allowed = {
                bones: ["index", "name", "nameUnique", "transform", "movable", "rotatable", "editable"],
                morphs: ["index", "name", "weight", "nameUnique", "editable", "editBlockedReason"],
                materials: ["index", "key", "name", "visible", "presetId", "pbrPresetId"],
            };
            for (const kind of ["bones", "morphs", "materials"]) {
                const items = [];
                let offset = 0;
                let totalCount;
                do {
                    const result = await rpc("mmd_inspect", { target: before.target, modelInstanceId, kind, offset, limit: 1, expectedEditRevision: before.editRevision });
                    expect(result.isError, JSON.stringify(result)).not.toBe(true);
                    const data = result.structuredContent;
                    expect(data.modelContentShared).toBe(false);
                    expect(data.modelInstanceId).toBe(modelInstanceId);
                    totalCount = data.totalCount;
                    items.push(...data.items);
                    offset = data.nextOffset;
                } while (offset !== null);
                expect(items.length).toBeGreaterThan(0);
                expect(items).toHaveLength(totalCount);
                items.forEach((item, index) => {
                    expect(item.index).toBe(index);
                    expect(Object.keys(item).every(key => allowed[kind].includes(key))).toBe(true);
                    if (kind === "morphs") expect(item).toMatchObject({ editable: false, editBlockedReason: "model_not_selected" });
                });
            }
            const after = (await rpc("mmd_get_context")).structuredContent;
            expect(after.editRevision).toBe(before.editRevision);
            expect(after.timelineScope).toEqual(before.timelineScope);
            expect(after.frame).toBe(before.frame);
            expect(after.undoId).toBe(before.undoId);
            await expect(page.locator("#info-model-select")).toHaveValue("1");
        }
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
