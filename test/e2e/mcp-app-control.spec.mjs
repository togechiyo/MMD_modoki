import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, client } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
const modelPath = resolve(root, "test/fixtures/external-parent/tofu.pmx");

for (const backend of ["frameGraph", "classic"]) test(`MCP app operations preserve model content boundary (${backend})`, async ({}, testInfo) => {
    test.setTimeout(180_000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (backend === "classic") {
            // Initial backend fixture; MCP settings and all tested edits use GUI/HTTP below.
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
        await page.locator("#info-model-select").selectOption("__camera__");
        // Existing GUI key registration provides key metadata for the read-only query.
        await page.locator('#bone-controls input[data-control-key="tx"]').fill("1");
        await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
        await page.locator("#btn-bone-keyframe").click();
        await page.locator("#current-frame").fill("60");
        await page.locator("#current-frame").press("Enter");
        await page.locator('#bone-controls input[data-control-key="tx"]').fill("2");
        await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
        await page.locator("#btn-bone-keyframe").click();
        await page.locator("#current-frame").fill("0");
        await page.locator("#current-frame").press("Enter");
        let dialog = await settings(page);
        await expect(dialog.getByLabel("MCPを有効にする", { exact: true })).not.toBeChecked();
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("公開中");
        await dialog.getByRole("button", { name: "接続設定を表示" }).click();
        const config = JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki;
        const rpc = client(config);
        await closeSettings(dialog);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        let ctx = await context();
        expect(ctx.backend).toBe(backend);
        const assets = await rpc("mmd_list_assets", { target: ctx.target });
        expect(assets.structuredContent.assets).toContainEqual(expect.objectContaining({ recordedPath: modelPath, kind: "model" }));
        const allowedAssetKeys = ["assetId", "kind", "modelInstanceId", "recordedPath", "usageRole", "frame", "availability", "removal"];
        for (const asset of assets.structuredContent.assets) {
            expect(Object.keys(asset).sort()).toEqual([...allowedAssetKeys].sort());
            expect(Object.keys(asset.removal).sort()).toEqual(["deletesSourceFile", "removable", "removalScope", "undoable"]);
            expect(asset.removal).toMatchObject({ deletesSourceFile: false, undoable: false });
        }
        const keys = await rpc("mmd_inspect", { target: ctx.target, kind: "keyframes" });
        expect(keys.structuredContent.items).toContainEqual(expect.objectContaining({ category: "camera", frame: 0 }));
        const denied = await rpc("mmd_set_camera", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), mode: "preview", playbackPolicy: "reject", camera: ctx.camera });
        expect(denied.isError).toBe(true);
        expect(denied.content[0].text).toContain("READ_ONLY");
        expect(denied.structuredContent).toMatchObject({ error: { code: "READ_ONLY" }, effects: { state: "none" }, recovery: { strategy: "user_action" } });
        const readOnlyDiagnostic = (await rpc("mmd_get_diagnostics", { target: ctx.target })).structuredContent;
        expect(readOnlyDiagnostic.status.editPermission).toBe(false);
        expect(readOnlyDiagnostic.status.editBlockers).toContain("read_only");
        expect(readOnlyDiagnostic.recentFailures.items[0].diagnosticId).toBe(denied.structuredContent.diagnosticId);
        dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照・編集");
        await closeSettings(dialog);
        for (const pbr of [false, true]) {
            if (pbr) {
                dialog = await settings(page);
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await closeSettings(dialog);
            }
            ctx = await context();
            expect(ctx.materialMode).toBe(pbr ? "pbr-standard" : "mmd-standard");
            const before = ctx.camera;
            const request = { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), mode: "preview", playbackPolicy: "reject", camera: { ...before, target: { ...before.target, x: before.target.x + 3 } } };
            const edited = await rpc("mmd_set_camera", request);
            expect(edited.isError, JSON.stringify(edited)).not.toBe(true);
            expect(edited.structuredContent.status).toBe("applied");
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBeCloseTo(request.camera.target.x);
            const repeated = await rpc("mmd_set_camera", request);
            expect(repeated.structuredContent).toEqual(edited.structuredContent);
            const reused = await rpc("mmd_set_camera", { ...request, camera: { ...request.camera, distance: request.camera.distance + 1 } });
            expect(reused.content[0].text).toContain("OPERATION_ID_REUSED");
            ctx = await context();
            const capture = await rpc("mmd_capture_viewport", { target: ctx.target });
            expect(capture.isError, JSON.stringify(capture)).not.toBe(true);
            const image = capture.content.find(item => item.type === "image");
            const png = Buffer.from(image.data, "base64");
            const decoded = PNG.sync.read(png);
            expect(decoded.width).toBeGreaterThan(100);
            expect(Math.max(decoded.width, decoded.height)).toBeLessThanOrEqual(1280);
            expect(new Set(decoded.data).size).toBeGreaterThan(16);
            await writeFile(testInfo.outputPath(`mcp-${pbr ? "pbr" : "normal"}.png`), png);
            ctx = await context();
            const undone = await rpc("mmd_undo", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), editId: edited.structuredContent.editId });
            expect(undone.isError, JSON.stringify(undone)).not.toBe(true);
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBeCloseTo(before.target.x);
            const afterImage = await rpc("mmd_capture_viewport", { target: ctx.target });
            expect(createHash("sha256").update(afterImage.content.find(item => item.type === "image").data).digest("hex"))
                .not.toBe(createHash("sha256").update(image.data).digest("hex"));
            ctx = await context();
            const another = await rpc("mmd_set_camera", { ...request, target: ctx.target, operationId: randomUUID(), expectedEditRevision: ctx.editRevision });
            await page.locator('#bone-controls input[data-control-key="tx"]').fill("8");
            await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
            ctx = await context();
            const conflict = await rpc("mmd_undo", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), editId: another.structuredContent.editId });
            expect(conflict.content[0].text).toContain("UNDO_CONFLICT");
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBe(8);
            await page.locator('#bone-controls input[data-control-key="tx"]').fill(String(before.target.x));
            await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
            const editKeys = async operations => {
                const current = await context();
                const result = await rpc("mmd_edit_keyframes", { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), scope: current.timelineScope, collision: "replace", operations });
                expect(result.isError, JSON.stringify(result)).not.toBe(true);
                return result.structuredContent;
            };
            const readKeys = async () => (await rpc("mmd_inspect", { target: (await context()).target, kind: "keyframes" })).structuredContent.items;
            const cameraKey = (await readKeys()).find(key => key.category === "camera" && key.frame === 0);
            const track = { category: cameraKey.category, name: cameraKey.name };
            const registered = await editKeys([{ action: "set", track, frame: 30, payload: { ...cameraKey.payload, positions: [6, ...cameraKey.payload.positions.slice(1)] } }]);
            expect(registered.editId).toMatch(/^ai:/);
            await page.locator("#current-frame").fill("30");
            await page.locator("#current-frame").press("Enter");
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBeCloseTo(6);
            const moved = await editKeys([{ action: "move", track, frame: 30, toFrame: 35 }, { action: "copy", track, frame: 0, toFrame: 40 }]);
            expect((await readKeys()).filter(key => key.category === "camera").map(key => key.frame)).toEqual([0, 35, 40, 60]);
            await page.locator("#current-frame").fill("35");
            await page.locator("#current-frame").press("Enter");
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBeCloseTo(6);
            const deleted = await editKeys([{ action: "delete", track, frame: 35 }]);
            expect((await readKeys()).some(key => key.frame === 35 && key.category === "camera")).toBe(false);
            ctx = await context();
            expect((await rpc("mmd_undo", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), editId: deleted.editId })).isError).not.toBe(true);
            // Shared GUI history can undo/redo a single MCP batch.
            await page.locator("#current-frame").blur();
            await page.keyboard.press("Control+z");
            expect((await readKeys()).filter(key => key.category === "camera").map(key => key.frame)).toEqual([0, 30, 60]);
            await page.keyboard.press("Control+y");
            expect((await readKeys()).filter(key => key.category === "camera").map(key => key.frame)).toEqual([0, 35, 40, 60]);
            // Changing UI target must never apply undo to another model's keys.
            ctx = await context();
            const select = async scope => {
                const current = await context();
                const result = await rpc("mmd_select_timeline", { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), scope });
                expect(result.isError, JSON.stringify(result)).not.toBe(true);
            };
            await select({ kind: "model", modelInstanceId: ctx.models[0].instanceId });
            await expect(page.locator("#info-model-select")).toHaveValue("0");
            ctx = await context();
            expect((await rpc("mmd_undo", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), editId: moved.editId })).content[0].text).toContain("UNDO_CONFLICT");
            await select({ kind: "camera" });
            await expect(page.locator("#info-model-select")).toHaveValue("__camera__");
            for (const editId of [moved.editId, registered.editId]) {
                ctx = await context();
                expect((await rpc("mmd_undo", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), editId })).isError).not.toBe(true);
            }
            expect((await readKeys()).filter(key => key.category === "camera").map(key => key.frame)).toEqual([0, 60]);
            await page.locator("#current-frame").fill("0");
            await page.locator("#current-frame").press("Enter");
            const settingsState = (await rpc("mmd_get_settings", { target: (await context()).target })).structuredContent.settings;
            const setSetting = async (id, value) => {
                const current = await context();
                const result = await rpc("mmd_set_setting", { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), setting: { id, value } });
                expect(result.isError, JSON.stringify(result)).not.toBe(true);
                expect((await rpc("mmd_get_settings", { target: current.target })).structuredContent.settings[id].value).toBe(value);
            };
            await setSetting("viewport.ground", !settingsState["viewport.ground"].value);
            await expect(page.locator("#btn-toggle-ground")).toHaveAttribute("aria-pressed", String(!settingsState["viewport.ground"].value));
            await setSetting("viewport.ground", settingsState["viewport.ground"].value);
            await setSetting("effect.contrastPercent", 50);
            await page.locator("#btn-toggle-shader-panel").click();
            await expect(page.locator(backend === "classic" ? '[data-postfx="contrast"]' : '[data-postfx="frame-graph-contrast"]')).toHaveValue("50");
            await setSetting("effect.contrastPercent", settingsState["effect.contrastPercent"].value);
            // Material visibility uses explicit IDs and synchronizes the actual checkbox.
            ctx = await context();
            await select({ kind: "model", modelInstanceId: ctx.models[0].instanceId });
            await page.locator('[data-effect-tab="materials"]').click();
            const material = (await rpc("mmd_inspect", { target: (await context()).target, kind: "materials", modelInstanceId: ctx.models[0].instanceId })).structuredContent.items[0];
            for (const visible of [false, true]) {
                const current = await context();
                const result = await rpc("mmd_set_material_visibility", { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), modelInstanceId: ctx.models[0].instanceId, materialKey: material.key, visible });
                expect(result.isError, JSON.stringify(result)).not.toBe(true);
                await expect(page.locator("#shader-material-list .shader-material-toggle").first()).toBeChecked({ checked: visible });
            }
            await page.locator("#btn-toggle-shader-panel").click();
            await select({ kind: "camera" });
        }
        // Capture the active model without returning its file bytes, then edit a named bone.
        ctx = await context();
        const modelId = ctx.models[0].instanceId;
        await page.locator("#info-model-select").selectOption("0");
        ctx = await context();
        const bones = await rpc("mmd_inspect", { target: ctx.target, kind: "bones", modelInstanceId: modelId });
        const bone = bones.structuredContent.items.find(item => item.editable && item.movable && item.transform);
        expect(bone).toBeTruthy();
        const boneEdit = await rpc("mmd_set_bone", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), mode: "preview", playbackPolicy: "reject", modelInstanceId: modelId, boneName: bone.name, position: { ...bone.transform.position, x: bone.transform.position.x + 2 }, rotation: bone.transform.rotation });
        expect(boneEdit.isError, JSON.stringify(boneEdit)).not.toBe(true);
        await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, bone.name)).toBeCloseTo(bone.transform.position.x + 2);
        ctx = await context();
        const tracks = (await rpc("mmd_inspect", { target: ctx.target, kind: "tracks" })).structuredContent.items;
        const boneTrack = tracks.find(track => track.name === bone.name);
        const boneKey = await rpc("mmd_edit_keyframes", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), scope: ctx.timelineScope, collision: "replace", operations: [{
            action: "set", track: { category: boneTrack.category, name: boneTrack.name }, frame: 20,
            payload: { kind: "movableBone", positions: [3, 0, 0], positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107], rotations: [0, 0, 0, 1], rotationInterpolations: [20, 107, 20, 107], physicsToggles: [0] },
        }] });
        expect(boneKey.isError, JSON.stringify(boneKey)).not.toBe(true);
        await page.locator("#current-frame").fill("20");
        await page.locator("#current-frame").press("Enter");
        await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, bone.name)).toBeCloseTo(3);
        expect(await page.evaluate(name => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === name)?.frames, bone.name)).toContain(20);
        // Saved project key values contain the new source animation, with no model content on MCP.
        const savedKeys = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.modelAnimations);
        expect(savedKeys.some(entry => entry.animation?.movableBoneTracks.some(track => track.name === bone.name))).toBe(true);
        ctx = await context();
        const seek = await rpc("mmd_set_playback", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), action: "seek", frame: 10 });
        expect(seek.isError, JSON.stringify(seek)).not.toBe(true);
        await expect(page.locator("#current-frame")).toHaveValue("10");
        ctx = await context();
        const play = await rpc("mmd_set_playback", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), action: "play" });
        expect(play.structuredContent.playing).toBe(true);
        await expect.poll(async () => (await context()).frame).toBeGreaterThan(11);
        ctx = await context();
        const pause = await rpc("mmd_set_playback", { target: ctx.target, expectedEditRevision: ctx.editRevision, operationId: randomUUID(), action: "pause" });
        expect(pause.isError, JSON.stringify(pause)).not.toBe(true);
        expect(pause.structuredContent.playing).toBe(false);
        await page.evaluate(() => window.electronAPI.setWindowZoomFactor(0.8));
        ctx = await context();
        const zoomed = await rpc("mmd_capture_viewport", { target: ctx.target });
        expect(zoomed.isError, JSON.stringify(zoomed)).not.toBe(true);
        const bounds = await page.locator("#render-canvas").boundingBox();
        expect(zoomed.structuredContent.width / zoomed.structuredContent.height).toBeCloseTo(bounds.width / bounds.height, 1);
        await page.evaluate(() => window.electronAPI.setWindowZoomFactor(1));
        const listed = await rpc("", {}, "tools/list");
        expect(listed.tools.map(tool => tool.name).some(name => /file|export|download|model_data/.test(name))).toBe(false);
        const fileResource = await rpc("", { uri: `file:///${modelPath.replaceAll("\\", "/")}` }, "resources/read");
        expect(fileResource.result).toBeUndefined();
        dialog = await settings(page);
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("OFF");
        await expect(fetch(config.url)).rejects.toThrow();
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("公開中");
        await dialog.getByRole("button", { name: "接続設定を表示" }).click();
        expect(JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki).toEqual(config);
        await closeSettings(dialog);
        const stale = await rpc("mmd_list_assets", { target: ctx.target });
        expect(stale.content[0].text).toContain("SCENE_CHANGED");
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        dialog = await settings(page);
        await expect(dialog.getByLabel("MCPを有効にする", { exact: true })).not.toBeChecked();
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
