import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { expandEffectInstance, selectEffectInstance, registerEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const difference = (a, b) => a.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : Math.abs(value - b[i])), 0) / (a.length * 0.75);
const seek = async (page, frame) => { const input = page.locator("#current-frame"); await input.fill(String(frame)); await input.press("Enter"); await expect(input).toHaveValue(String(frame)); };
async function menu(page, command) { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); }

test("DoF instances: same-file targets, step keys, moving bone, output and missing references", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root), report = { errors: [], dialogs: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("dialog", async dialog => { report.dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false; project.lighting.shadowEnabled = false; project.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(project);
    });
    const modelPath = resolve(root, "test/fixtures/external-parent/tofu.pmx");
    await page.evaluate(async path => { await window.mmdModokiE2e.loadModel(path); await window.mmdModokiE2e.loadModel(path); }, modelPath);
    const boneNumber = async (key, value) => { const input = page.locator(`#bone-controls input[data-control-key='${key}']`); await input.fill(String(value)); await input.press("Enter"); };
    for (const [model, x, z] of [["0", -2, 3], ["1", 2, -4]]) {
      await page.locator("#info-model-select").selectOption(model); await selectCenterBone(page); await boneNumber("tx", x); await boneNumber("tz", z);
      await page.locator("#btn-kf-add").click();
    }
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -5, ry: 0, rz: 0, camDistance: 24 })) await boneNumber(key, value);
    const models = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models);
    expect(models[0].path).toBe(models[1].path); expect(models[0].instanceId).not.toBe(models[1].instanceId);
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const field = (id, name) => row(id).locator(`[data-dof-instance-field="${name}"]`);
    const select = async id => { await selectEffectInstance(row(id)); await expect(row(id).locator(".effect-layer-details")).toBeVisible(); await expect(page.locator("#effect-key-controls")).toHaveCount(0); };
    const number = async (id, name, value) => { const input = row(id).locator(`[data-instance-field="${name}"]`).locator("..").locator(".range-number-input"); await input.fill(String(value)); await input.press("Enter"); };
    const distance = id => row(id).locator("[data-instance-dof-distance]").textContent().then(text => Number.parseFloat(text));
    const capture = async name => { const dir = testInfo.outputPath(name); mkdirSync(dir, { recursive: true }); await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 640, 360), dir); return PNG.sync.read(readFileSync(resolve(dir, "single_rgba_surface_e2e.png"))).data; };
    for (let i = 0; i < 2; i++) { await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="dof"]').click(); }
    const [a, b] = (await state()).instances.filter(item => item.type === "dof").map(item => item.instanceId);
    await row(b).locator('[data-instance-field="enabled"]').uncheck();
    await row(a).locator('[data-instance-field="enabled"]').uncheck();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const prepared = await page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
    expect(prepared.resourcePlan.needsDepthRenderer).toBe(true); expect(prepared.controller.taskNames).not.toContain("dof"); report.prepared = prepared.resourcePlan;
    await field(b, "focusMode").selectOption("model-target"); await field(b, "targetModelInstanceId").selectOption(models[1].instanceId);
    const bSaved = (await state()).instances.find(item => item.instanceId === b);
    await expandEffectInstance(row(a)); await field(a, "focusMode").selectOption("model-target"); await field(a, "targetModelInstanceId").selectOption(models[0].instanceId); await field(a, "targetBoneName").selectOption("センター");
    await number(a, "lensSize", 85);
    await row(a).locator('[data-instance-field="enabled"]').check();
    await expandEffectInstance(row(a)); await seek(page, 0); await registerEffectInstance(row(a));
    const depthA = await distance(a), focusedA = await capture("focus-a");
    await seek(page, 20);
    await field(a, "targetModelInstanceId").selectOption(models[1].instanceId);
    await field(a, "targetBoneName").selectOption("センター"); await registerEffectInstance(row(a));
    const depthB = await distance(a), focusedB = await capture("focus-b");
    report.focusDistances = [depthA, depthB]; report.targetDifference = difference(focusedA, focusedB);
    expect(Math.abs(depthA - depthB)).toBeGreaterThan(3); expect(report.targetDifference).toBeGreaterThan(0.01);
    await seek(page, 40); await row(a).locator('[data-instance-field="enabled"]').uncheck(); await registerEffectInstance(row(a));
    const neutral = await capture("key-off"); expect(difference(neutral, focusedB)).toBeGreaterThan(0.01);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    for (const [frame, model] of [[0, 0], [19, 0], [20, 1], [30, 1], [10, 0]]) {
      await seek(page, frame); await expect(field(a, "targetModelInstanceId")).toHaveValue(models[model].instanceId);
      await expect(page.locator("#effect-key-controls")).toHaveCount(0);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    expect((await state()).instances.find(item => item.instanceId === b)).toEqual(bSaved);
    await seek(page, 0); await page.locator("#viewport-seek-play-toggle").click();
    await expect(field(a, "focusMode")).toBeDisabled();
    await expect(field(a, "targetModelInstanceId")).toHaveValue(models[1].instanceId);
    await page.locator("#viewport-seek-play-toggle").click(); await seek(page, 20);
    await page.locator("#info-model-select").selectOption("1"); await selectCenterBone(page); await boneNumber("tz", -2);
    await expect.poll(() => distance(a)).not.toBe(depthB);
    report.movedDistance = await distance(a); await boneNumber("tz", -4); await page.locator("#info-model-select").selectOption("__camera__"); await select(a);
    await expect.poll(() => distance(a)).toBe(depthB);
    await seek(page, 20); await row(b).locator('[data-instance-field="enabled"]').check();
    report.layerDifference = difference(focusedB, await capture("two-dof")); expect(report.layerDifference).toBeGreaterThan(0.001);
    await row(b).locator('[data-instance-field="enabled"]').uncheck(); await select(a);
    await page.locator("#btn-kf-copy").click(); await seek(page, 60); await expandEffectInstance(row(b));
    await field(b, "focusMode").selectOption("camera-target"); await registerEffectInstance(row(b));
    const bAnimation = (await state()).instances.find(item => item.instanceId === b).animation;
    await select(b); await page.locator("#btn-kf-paste").click();
    expect((await state()).instances.find(item => item.instanceId === b).animation.tracks[0].keys[0].value.targetModelInstanceId).toBe(models[1].instanceId);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await state()).instances.find(item => item.instanceId === b).animation).toEqual(bAnimation);
    await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="dof"]').click();
    const c = (await state()).instances.find(item => ![a, b].includes(item.instanceId)).instanceId;
    expect((await state()).instances.find(item => item.instanceId === c).animation.tracks).toEqual([]);
    await row(c).locator('[data-instance-action="delete"]').click(); await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState()), file = testInfo.outputPath("dof.json");
    await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, file);
    await menu(page, "file.saveProject"); await expect.poll(() => existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).effects.frameGraphInstances).toEqual(saved.effects.frameGraphInstances);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(backend => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === backend, backend); await expect.poll(state).toEqual(saved.effects.frameGraphInstances);
    }
    await seek(page, 20); expect(difference(focusedB, await capture("restored"))).toBeLessThan(0.15);
    const missing = structuredClone(saved); missing.scene.models = missing.scene.models.filter(model => model.instanceId !== models[1].instanceId);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), missing); await seek(page, 20);
    await expect(field(a, "targetModelInstanceId")).toHaveValue(models[1].instanceId);
    await expect(field(a, "targetModelInstanceId").locator("option:checked")).toContainText("対象なし");
    expect((await state()).instances.find(item => item.instanceId === a).animation).toEqual(saved.effects.frameGraphInstances.instances.find(item => item.instanceId === a).animation);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    await seek(page, 20); await page.locator("#btn-effect-toggle-framegraph").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
    await page.locator("#btn-effect-toggle-framegraph").click(); expect(difference(focusedB, await capture("master-restored"))).toBeLessThan(0.15);
    const webm = testInfo.outputPath("dof.webm");
    await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, webm);
    await menu(page, "file.webmExportSettings"); await page.locator("#webm-output-use-playback-range").uncheck();
    for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 20]]) { await page.locator(`#webm-output-${id}`).fill(String(value)); await page.locator(`#webm-output-${id}`).press("Enter"); }
    await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck(); await page.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(() => existsSync(webm) && statSync(webm).size > 1000, { timeout: 60000 }).toBe(true); await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    const frames = await page.evaluate(async path => {
      const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video"), canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext("2d", { willReadFrequently: true }), url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      try {
        const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error("Video decode failed")); }); video.src = url; await ready;
        const frames = []; for (const frame of [0, 20]) { const sought = new Promise(resolve => { video.onseeked = resolve; }); video.currentTime = (frame + 0.1) / 30; await sought; context.drawImage(video, 0, 0); frames.push(Array.from(context.getImageData(0, 0, 640, 360).data)); } return frames;
      } finally { URL.revokeObjectURL(url); }
    }, webm);
    report.video = frames.map((frame, i) => ({ matching: difference(frame, i ? focusedB : focusedA), opposite: difference(frame, i ? focusedA : focusedB) }));
    for (const result of report.video) expect(result.matching).toBeLessThan(result.opposite);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.dialogs).toEqual([]);
    await seek(page, 20); await select(a); await page.screenshot({ path: testInfo.outputPath("dof-ui.png") });
  } finally { writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2)); await launched.close(); }
});
