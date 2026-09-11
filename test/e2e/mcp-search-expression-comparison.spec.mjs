import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing, settings, closeSettings } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`MCP key search, expression batch and viewport comparison (PBR=${pbr})`, async () => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (tool, args) => {
            const c = await context();
            const input = { target: c.target, expectedEditRevision: c.editRevision, operationId: randomUUID(), ...args };
            const result = await rpc(tool, input);
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            return { input, data: result.structuredContent };
        };
        const mode = await edit("mmd_start_ui_operation", { operation: { kind: "materialMode", pbr } });
        await expect.poll(async () => (await rpc("mmd_get_operation", { target: mode.input.target, operationId: mode.input.operationId })).structuredContent.status).toBe("completed");
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/expression-test.pmx"));
        const modelInstanceId = (await context()).models[0].instanceId;
        const scope = { kind: "model", modelInstanceId };
        await edit("mmd_select_timeline", { scope });
        const morphs = [{ morphName: "材質テスト", weight: 0.4 }, { morphName: "表情テスト", weight: 0.7 }];
        const batch = { modelInstanceId, morphs, mode: "preview" };
        const weights = async () => (await rpc("mmd_inspect", { target: (await context()).target, modelInstanceId, kind: "morphs" })).structuredContent.items.map(item => item.weight);
        const guiWeights = async values => {
            for (const [i, morph] of morphs.entries()) {
                const row = page.locator(".morph-slider-row").filter({ has: page.locator(`[data-morph-name="${morph.morphName}"]`) });
                await expect(row).toHaveCount(1);
                await expect.poll(async () => Number(await row.locator('input[type="range"]').inputValue())).toBeCloseTo(values[i]);
            }
        };
        const snapshot = async label => {
            const c = await context();
            const result = await rpc("mmd_capture_snapshot", { target: c.target, expectedEditRevision: c.editRevision, label });
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            const images = result.content.filter(item => item.type === "image");
            expect(images).toHaveLength(1);
            expect(result.structuredContent.snapshot).toMatchObject({ frame: c.frame, editRevision: c.editRevision, camera: c.camera });
            expect(typeof result.structuredContent.snapshot.physicsEnabled).toBe("boolean");
            expect([...Buffer.from(images[0].data, "base64").subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
            return { data: result.structuredContent.snapshot, image: images[0].data };
        };
        const wait = async () => {
            const c = await context();
            const result = await rpc("mmd_wait_for_render", { target: c.target, expectedEditRevision: c.editRevision });
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            expect(result.structuredContent).toMatchObject({ status: "observed", engineFrameEnds: 2, frame: c.frame, editRevision: c.editRevision, physicsConvergence: "not_observed" });
        };
        await wait();
        const before = await snapshot("before expression");
        const baseline = await context();
        const dry = await edit("mmd_set_morphs", { ...batch, dryRun: true });
        expect(dry.data).toMatchObject({ status: "validated", editId: null, plan: { changedMorphCount: 2, keyframesRegistered: false } });
        expect(await weights()).toEqual([0, 0]);
        expect((await context()).undoId).toBe(baseline.undoId);
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: true, scope: "morph" } });
        const changed = await edit("mmd_set_morphs", { ...batch, dryRun: false });
        expect(changed.data.editId).toBeTruthy();
        await guiWeights([0.4, 0.7]);
        expect((await rpc("mmd_set_morphs", changed.input)).structuredContent.editId).toBe(changed.data.editId);
        const filter = { categories: ["morph"], names: morphs.map(m => m.morphName) };
        const search = async (extra = {}) => {
            const c = await context();
            return rpc("mmd_search_keyframes", { target: c.target, scope, filter, ...extra });
        };
        expect((await search()).structuredContent.totalCount).toBe(0);
        await edit("mmd_undo", { editId: changed.data.editId }); await guiWeights([0, 0]);
        await edit("mmd_redo", { editId: changed.data.editId }); await guiWeights([0.4, 0.7]);
        await wait();
        const after = await snapshot("after expression");
        expect(after.image).not.toBe(before.image);
        const compareBefore = await context();
        const comparison = await rpc("mmd_compare_snapshots", { target: compareBefore.target, snapshotIds: [before.data.id, after.data.id] });
        expect(comparison.isError, JSON.stringify(comparison)).not.toBe(true);
        expect(comparison.content.filter(item => item.type === "image").map(item => item.data)).toEqual([before.image, after.image]);
        expect(comparison.structuredContent.snapshots.map(item => item.label)).toEqual(["before expression", "after expression"]);
        expect(await context()).toMatchObject({ frame: compareBefore.frame, editRevision: compareBefore.editRevision, undoId: compareBefore.undoId });
        await guiWeights([0.4, 0.7]);

        await edit("mmd_register_keyframes", { scope, tracks: morphs.map(m => ({ category: "morph", name: m.morphName })), collision: "reject" });
        await edit("mmd_edit_keyframes", { scope, collision: "reject", operations: morphs.map((m, i) => ({ action: "copy", track: { category: "morph", name: m.morphName }, frame: 0, toFrame: 20 + i * 20 })) });
        const stateBeforeSearch = await context();
        const page1 = (await search({ filter: { ...filter, startFrame: 0, endFrame: 40, anchorFrame: 20, includePayload: true }, limit: 2 })).structuredContent;
        expect(page1).toMatchObject({ totalCount: 4, matchedTrackCount: 2, firstFrame: 0, lastFrame: 40, previousFrame: 0, nextFrame: 40, nextOffset: 2 });
        const page2 = (await search({ filter: { ...filter, startFrame: 0, endFrame: 40, anchorFrame: 20, includePayload: true }, offset: 2, limit: 2, expectedEditRevision: page1.editRevision })).structuredContent;
        expect(page2.nextOffset).toBeNull();
        expect([...page1.items, ...page2.items].map(item => item.payload.kind)).toEqual(["morph", "morph", "morph", "morph"]);
        expect((await search({ filter: { categories: ["morph"], nameContains: "表情" } })).structuredContent.totalCount).toBe(2);
        expect(await context()).toMatchObject({ frame: stateBeforeSearch.frame, editRevision: stateBeforeSearch.editRevision, undoId: stateBeforeSearch.undoId });
        await edit("mmd_set_playback", { action: "seek", frame: 20 }); await wait();
        const stale = await search({ expectedEditRevision: page1.editRevision });
        expect(stale.structuredContent.error.code).toBe("REVISION_CONFLICT");
        const staleWait = await rpc("mmd_wait_for_render", { target: (await context()).target, expectedEditRevision: page1.editRevision });
        expect(staleWait.structuredContent.error.code).toBe("REVISION_CONFLICT");
        const at20 = await snapshot("frame 20");
        const multi = await rpc("mmd_compare_snapshots", { target: (await context()).target, snapshotIds: [after.data.id, at20.data.id] });
        expect(multi.structuredContent.snapshots.map(item => item.frame)).toEqual([0, 20]);
        expect((await context()).frame).toBe(20);
        const listed = await rpc("mmd_list_snapshots", { target: (await context()).target });
        expect(listed.structuredContent.snapshots).toHaveLength(3);
        expect(listed.content.every(item => item.type === "text")).toBe(true);

        const dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await closeSettings(dialog);
        expect((await rpc("mmd_list_snapshots", { target: (await context()).target })).structuredContent.snapshots).toEqual([]);
        const expired = await rpc("mmd_compare_snapshots", { target: (await context()).target, snapshotIds: [before.data.id, after.data.id] });
        expect(expired.structuredContent.error.code).toBe("SNAPSHOT_NOT_FOUND");
        await wait(); await snapshot("read only");
        const readonly = await context();
        expect((await rpc("mmd_set_morphs", { ...batch, dryRun: false, target: readonly.target, expectedEditRevision: readonly.editRevision, operationId: randomUUID() })).structuredContent.error.code).toBe("READ_ONLY");
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
