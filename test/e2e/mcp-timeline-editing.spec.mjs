import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
const modelPath = resolve(root, "test/fixtures/external-parent/material-switch.pmx");
const ref = ({ category, name }) => ({ category, name });
const scalar = (multiply = 1, add = 0) => ({ multiply, add });
const vector = () => ({ x: scalar(), y: scalar(), z: scalar() });

for (const backend of ["frameGraph", "classic"]) test(`MCP morph, redo, and timeline transforms (${backend})`, async () => {
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
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
        await page.locator("#info-model-select").selectOption("0");
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const callEdit = async (name, args) => {
            const current = await context();
            const result = await rpc(name, { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...args });
            return result.isError ? { ...result, contextAtRequest: current, contextAfterFailure: await context() } : result;
        };
        const edit = async (name, args) => {
            const result = await callEdit(name, args);
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            return result.structuredContent;
        };
        const inspect = async kind => (await rpc("mmd_inspect", { target: (await context()).target, kind, modelInstanceId: (await context()).models[0].instanceId })).structuredContent.items;
        const seek = async frame => {
            await page.locator("#current-frame").fill(String(frame));
            await page.locator("#current-frame").press("Enter");
            await expect(page.locator("#current-frame")).toHaveValue(String(frame));
        };
        await edit("mmd_set_setting", { setting: { id: "runtime.physics", value: false } });
        for (const pbr of [false, true]) {
            if (pbr) {
                const dialog = await settings(page);
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await closeSettings(dialog);
            }
            await seek(0);
            const current = await context();
            const scope = current.timelineScope;
            const modelInstanceId = current.models[0].instanceId;
            const morph = (await inspect("morphs")).find(item => item.editable);
            expect(morph).toBeTruthy();
            const slider = page.locator("#morph-controls .morph-slider").first();
            const previewArgs = { modelInstanceId, morphName: morph.name, weight: 0.6, mode: "preview", playbackPolicy: "reject" };
            const preview = await edit("mmd_set_morph", previewArgs);
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.6);
            expect((await inspect("keyframes")).filter(key => key.category === "morph")).toEqual([]);
            await edit("mmd_undo", { editId: preview.editId });
            expect((await context()).redoId).toBe(preview.editId);
            const redo = await edit("mmd_redo", { editId: preview.editId });
            expect(redo.editId).toBe(preview.editId);
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.6);
            await edit("mmd_undo", { editId: preview.editId });
            await slider.fill("0.4");
            await slider.dispatchEvent("input");
            const conflict = await callEdit("mmd_redo", { editId: preview.editId });
            expect(conflict.content[0].text).toContain("REDO_CONFLICT");
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.4);
            await slider.fill("0");
            await slider.dispatchEvent("input");
            await edit("mmd_redo", { editId: preview.editId });
            await slider.blur();
            await page.keyboard.press("Control+z");
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0);
            await page.keyboard.press("Control+y");
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.6);
            await edit("mmd_undo", { editId: preview.editId });
            const tracks = await inspect("tracks");
            const morphTrack = ref(tracks.find(track => track.category === "morph" && track.name === morph.name));
            const boneTrack = ref(tracks.find(track => track.payloadKind === "movableBone"));
            await edit("mmd_set_morph", previewArgs);
            const registered = await edit("mmd_register_keyframes", { scope, collision: "replace", tracks: [morphTrack] });
            const button = page.getByRole("button", { name: `${morph.name} keyframe`, exact: true });
            await expect(button).toHaveClass(/is-registered/);
            const changedPreview = await edit("mmd_set_morph", { ...previewArgs, weight: 0.4 });
            await expect(button).not.toHaveClass(/is-registered/);
            await edit("mmd_undo", { editId: changedPreview.editId });
            await expect(button).toHaveClass(/is-registered/);
            await edit("mmd_undo", { editId: registered.editId });
            expect((await inspect("keyframes")).filter(key => key.category === "morph")).toEqual([]);
            const seed = await edit("mmd_edit_keyframes", { scope, collision: "replace", operations: [
                { action: "set", track: morphTrack, frame: 0, payload: { kind: "morph", weights: [0.2] } },
                { action: "set", track: morphTrack, frame: 10, payload: { kind: "morph", weights: [0.6] } },
                { action: "set", track: boneTrack, frame: 10, payload: { kind: "movableBone", positions: [2, 3, 4], rotations: [0, 0, 0, 1], physicsToggles: [0], positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107], rotationInterpolations: [20, 107, 20, 107] } },
            ] });
            const transform = operation => edit("mmd_transform_keyframes", { scope, operation });
            const inserted = await transform({ action: "insertFrames", frame: 10, count: 5 });
            await seek(15);
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.6);
            expect(await page.evaluate(name => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === name)?.frames, morph.name)).toEqual([0, 15]);
            const removed = await transform({ action: "deleteFrames", frame: 0, count: 3 });
            expect((await inspect("keyframes")).filter(key => key.name === morph.name).map(key => key.frame)).toEqual([12]);
            await edit("mmd_undo", { editId: removed.editId });
            await edit("mmd_undo", { editId: inserted.editId });
            await edit("mmd_redo", { editId: inserted.editId });
            await edit("mmd_undo", { editId: inserted.editId });
            const mirrored = await transform({ action: "mirror", keys: [{ track: boneTrack, frame: 10 }], frameOffset: 5, collision: "reject" });
            const mirroredKey = (await inspect("keyframes")).find(key => key.frame === 15 && key.payload?.kind === "movableBone");
            expect(mirroredKey.payload.positions).toEqual([-2, 3, 4]);
            await seek(15);
            await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, mirroredKey.name)).toBeCloseTo(-2);
            const corrected = await transform({ action: "correct", keys: [{ track: morphTrack, frame: 10 }], correction: { kind: "morph", weight: scalar(0.5, 0.1) } });
            await seek(10);
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.4);
            const original = await inspect("keyframes");
            const bad = await callEdit("mmd_transform_keyframes", { scope, operation: { action: "correct", keys: [{ track: morphTrack, frame: 0 }, { track: boneTrack, frame: 10 }], correction: { kind: "morph", weight: scalar(0.5) } } });
            expect(bad.content[0].text).toContain("KEY_KIND_MISMATCH");
            expect(bad.structuredContent).toMatchObject({ error: { code: "KEY_KIND_MISMATCH", details: { operationIndex: 1, frame: 10 } }, effects: { state: "none" } });
            expect(await inspect("keyframes")).toEqual(original);
            const beforeDiagnostic = await context();
            const rangeErrorId = randomUUID();
            const rangeError = await callEdit("mmd_transform_keyframes", { operationId: rangeErrorId, scope, operation: { action: "correct", keys: [{ track: morphTrack, frame: 10 }], correction: { kind: "morph", weight: scalar(10) } } });
            expect(rangeError.isError).toBe(true);
            expect(rangeError.structuredContent).toMatchObject({ operationId: rangeErrorId, error: { code: "KEY_VALUE_OUT_OF_RANGE", details: { operationIndex: 0, frame: 10, field: "weights.0", maximum: 1 } }, effects: { state: "none" }, recovery: { strategy: "correct_input", retrySameInput: false } });
            expect(rangeError.structuredContent.error.details.actual).toBeCloseTo(4);
            const diagnostic = (await rpc("mmd_get_diagnostics", { target: beforeDiagnostic.target, operationId: rangeErrorId })).structuredContent;
            expect(diagnostic.recentFailures.items).toEqual([rangeError.structuredContent]);
            expect(diagnostic.runtime).toMatchObject({ engine: "WebGPU", backend, physicsEnabled: false });
            expect(diagnostic.modelContentShared).toBe(false);
            expect(diagnostic.status.busyReasons).toEqual([]);
            expect(diagnostic.status.renderCompletion).toBe("not_observed");
            expect((await context()).editRevision).toBe(beforeDiagnostic.editRevision);
            expect((await context()).undoId).toBe(beforeDiagnostic.undoId);
            await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.4);
            const failedOperation = (await rpc("mmd_get_operation", { target: beforeDiagnostic.target, operationId: rangeErrorId })).structuredContent;
            expect(failedOperation).toMatchObject({ status: "failed", diagnostic: { diagnosticId: rangeError.structuredContent.diagnosticId } });
            expect((await rpc("mmd_get_diagnostics", { target: beforeDiagnostic.target, operationId: randomUUID() })).structuredContent.recentFailures.items).toEqual([]);
            const stale = await callEdit("mmd_set_morph", { ...previewArgs, expectedEditRevision: Math.max(0, beforeDiagnostic.editRevision - 1) });
            expect(stale.structuredContent.error).toMatchObject({ code: "REVISION_CONFLICT", details: { actual: beforeDiagnostic.editRevision } });
            const modal = await settings(page);
            const modalContext = await context();
            const busyDiagnostic = (await rpc("mmd_get_diagnostics", { target: modalContext.target })).structuredContent;
            expect(busyDiagnostic.status.busyReasons).toContain("modal");
            const busyError = await callEdit("mmd_set_morph", previewArgs);
            expect(busyError.structuredContent).toMatchObject({ error: { code: "EDITOR_BUSY" }, effects: { state: "none" }, recovery: { strategy: "wait" } });
            await closeSettings(modal);
            expect((await context()).status.busyReasons).toEqual([]);
            const boneCorrected = await transform({ action: "correct", keys: [{ track: boneTrack, frame: 10 }], correction: { kind: "bone", position: { ...vector(), x: scalar(2, 1) }, rotation: vector() } });
            await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, boneTrack.name)).toBeCloseTo(5);
            const saved = pbr ? await page.evaluate(() => window.mmdModokiE2e.exportProjectState()) : null;
            for (const editId of [boneCorrected.editId, corrected.editId, mirrored.editId, seed.editId]) await edit("mmd_undo", { editId });
            expect((await inspect("keyframes")).filter(key => key.category === "morph")).toEqual([]);
            if (saved) {
                // Feed only the saved fixture project through the import hook, then observe GUI/runtime.
                const imported = await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
                expect(imported.loadedModels).toBe(1);
                expect(imported.warnings).toEqual([]);
                const restored = await context();
                await edit("mmd_select_timeline", { scope: { kind: "model", modelInstanceId: restored.models[0].instanceId } });
                await seek(10);
                await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(0.4);
                await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, boneTrack.name)).toBeCloseTo(5);
                expect((await inspect("keyframes")).find(key => key.name === morph.name && key.frame === 10).payload.weights[0]).toBeCloseTo(0.4);
            }
            await seek(25);
            const active = await context();
            await edit("mmd_set_bone", { modelInstanceId: active.models[0].instanceId, boneName: boneTrack.name, position: { x: 7, y: 3, z: 4 }, rotation: { x: 10, y: 20, z: 30 }, mode: "preview", playbackPolicy: "reject" });
            const boneRegistered = await edit("mmd_register_keyframes", { scope: active.timelineScope, tracks: [boneTrack], collision: "replace" });
            const boneKey = (await inspect("keyframes")).find(key => key.name === boneTrack.name && key.frame === 25);
            expect(boneKey.payload.positions).toEqual([7, 3, 4]);
            expect(boneKey.payload.rotations).toHaveLength(4);
            await seek(0);
            await seek(25);
            await expect.poll(() => page.evaluate(name => window.mmdModokiE2e.getActiveBoneTransform(name)?.position.x, boneTrack.name)).toBeCloseTo(7);
            await edit("mmd_undo", { editId: boneRegistered.editId });
            await edit("mmd_select_timeline", { scope: { kind: "camera" } });
            const cameraTrack = ref((await inspect("tracks")).find(track => track.category === "camera"));
            await edit("mmd_set_camera", { camera: { target: { x: 7, y: 10, z: 0 }, rotation: { x: 10, y: 20, z: 30 }, distance: 42, fov: 55 }, mode: "preview", playbackPolicy: "reject" });
            const cameraRegistered = await edit("mmd_register_keyframes", { scope: { kind: "camera" }, tracks: [cameraTrack], collision: "replace" });
            const cameraKey = (await inspect("keyframes")).find(key => key.category === "camera" && key.frame === 25);
            expect(cameraKey.payload.positions).toEqual([7, 10, 0]);
            expect(cameraKey.payload.distances[0]).toBeCloseTo(-42);
            expect(cameraKey.payload.fovs[0]).toBeCloseTo(55);
            cameraKey.payload.rotations.forEach((value, index) => expect(value).toBeCloseTo([10, 20, 30][index] * Math.PI / 180));
            await seek(0);
            await seek(25);
            await expect.poll(async () => Number(await page.locator('#bone-controls input[data-control-key="tx"]').inputValue())).toBeCloseTo(7);
            await edit("mmd_undo", { editId: cameraRegistered.editId });
            await edit("mmd_select_timeline", { scope: active.timelineScope });
        }
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});
