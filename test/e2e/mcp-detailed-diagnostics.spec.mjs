import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
const label = "構造情報を含む詳細診断を許可";
for (const backend of ["frameGraph", "classic"]) test(`MCP detailed diagnostics require consent and show access history (${backend})`, async () => {
    test.setTimeout(180000);
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
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/material-switch.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const request = async (tool, extra) => {
            const ctx = await context();
            return rpc(tool, { target: ctx.target, modelInstanceId: ctx.models[0].instanceId, expectedEditRevision: ctx.editRevision, ...extra });
        };
        expect((await context()).status.detailedDiagnostics).toBe(false);
        for (const [tool, extra] of [["mmd_list_diagnostic_targets", { kind: "bone" }], ["mmd_inspect_detail", { subject: { kind: "bone", index: 0 } }]]) {
            const denied = await request(tool, extra);
            expect(denied.isError).toBe(true);
            expect(denied.structuredContent.error.code).toBe("DETAILED_DIAGNOSTICS_DISABLED");
            expect(denied.structuredContent.detail).toBeUndefined();
        }
        let dialog = await settings(page);
        await expect(dialog.getByLabel(label, { exact: true })).not.toBeChecked();
        await expect(dialog.locator("#mcp-detail-sharing-note")).toContainText("クラウドAIへ送信");
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await dialog.getByLabel(label, { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("詳細診断：許可");
        await closeSettings(dialog);
        for (const pbr of [false, true]) {
            if (pbr) {
                dialog = await settings(page);
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await expect(dialog.getByLabel(label, { exact: true })).toBeChecked();
                await closeSettings(dialog);
            }
            const before = await context();
            expect(before.materialMode).toBe(pbr ? "pbr-standard" : "mmd-standard");
            expect(before.backend).toBe(backend);
            expect(before.status.editPermission).toBe(false);
            for (const kind of ["bone", "morph", "material", "rigidBody", "joint"]) {
                const list = await request("mmd_list_diagnostic_targets", { kind, limit: 1 });
                expect(list.isError, JSON.stringify(list)).not.toBe(true);
                expect(list.structuredContent.totalCount, kind).toBeGreaterThan(0);
                expect(list.structuredContent.items).toHaveLength(1);
                expect(Object.keys(list.structuredContent.items[0]).sort()).toEqual(["index", "name"]);
                const result = await request("mmd_inspect_detail", { subject: { kind, index: list.structuredContent.items[0].index } });
                expect(result.isError, JSON.stringify(result)).not.toBe(true);
                const data = result.structuredContent;
                expect(data.modelContentShared).toBe(false);
                expect(data.subject).toEqual({ kind, index: 0 });
                expect(data.materialMode).toBe(before.materialMode);
                expect(data.detail.name).toBe(list.structuredContent.items[0].name);
                if (kind === "bone") {
                    expect(data.detail.bindPosition).toHaveLength(3);
                    expect(data.detail.bindPosition.every(Number.isFinite)).toBe(true);
                    expect(data.detail.bindPositionSpace).toBe("model");
                }
                if (kind === "morph") expect(data.detail.elementDataShared).toBe(false);
                if (kind === "material") {
                    expect(Number.isFinite(data.detail.roughness)).toBe(true);
                    expect(Number.isFinite(data.detail[pbr ? "albedoColor" : "diffuseColor"].r)).toBe(true);
                }
                if (kind === "rigidBody") expect(data.detail).toMatchObject({ physicsMode: 0, solverEffectiveValues: "not_observed", angleUnit: "radians" });
                if (kind === "joint") expect(data.detail.positionMin).toHaveLength(3);
                expect(JSON.stringify(data)).not.toMatch(/"(vertices|indices|offsets|weights|textureData|meshes|metadata|elements)"\s*:/);
            }
            expect((await context()).editRevision).toBe(before.editRevision);
            expect((await context()).undoId).toBe(before.undoId);
            await expect(page.locator("#info-model-select")).toHaveValue("__camera__");
            dialog = await settings(page);
            await expect(dialog.getByLabel(label, { exact: true })).toBeChecked();
            await dialog.getByRole("button", { name: "詳細情報の提供履歴を更新" }).click();
            await expect(dialog.getByRole("list", { name: "詳細情報の提供履歴" }).locator("li")).toHaveCount(pbr ? 10 : 5);
            await expect(dialog.getByRole("list", { name: "詳細情報の提供履歴" })).toContainText("rigidBody[0]");
            await closeSettings(dialog);
        }
        dialog = await settings(page);
        await dialog.getByLabel(label, { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("詳細診断：OFF");
        await closeSettings(dialog);
        expect((await request("mmd_inspect_detail", { subject: { kind: "bone", index: 0 } })).structuredContent.error.code).toBe("DETAILED_DIAGNOSTICS_DISABLED");
        dialog = await settings(page);
        await dialog.getByLabel(label, { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("詳細診断：許可");
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("OFF：");
        await expect(dialog.getByLabel("AIからの編集も許可", { exact: true })).toBeDisabled();
        await expect(dialog.getByLabel(label, { exact: true })).toBeDisabled();
        await expect(dialog.getByLabel(label, { exact: true })).not.toBeChecked();
        await expect(dialog.getByRole("list", { name: "詳細情報の提供履歴" }).locator("li")).toHaveCount(10);
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("公開中");
        await expect(dialog.getByLabel("AIからの編集も許可", { exact: true })).toBeEnabled();
        await expect(dialog.getByLabel(label, { exact: true })).toBeEnabled();
        await expect(dialog.getByLabel(label, { exact: true })).not.toBeChecked();
        await dialog.getByLabel(label, { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("詳細診断：許可");
        await closeSettings(dialog);
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        dialog = await settings(page);
        await expect(dialog.getByLabel("MCPを有効にする", { exact: true })).not.toBeChecked();
        await expect(dialog.getByLabel(label, { exact: true })).not.toBeChecked();
        await expect(dialog.getByRole("list", { name: "詳細情報の提供履歴" })).toContainText("提供履歴はありません");
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
