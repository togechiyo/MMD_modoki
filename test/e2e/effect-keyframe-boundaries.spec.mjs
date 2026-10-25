import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance, selectEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("Effect key boundaries survive reverse seeks, navigation, moves, deletion, preview and reload", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root), report = { errors: [], samples: [] };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => { const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false; project.lighting.shadowEnabled = false; project.viewport.skydomeVisible = false; await window.mmdModokiE2e.importProjectState(project); });
    await page.evaluate(async path => { await window.mmdModokiE2e.loadModel(path); await window.mmdModokiE2e.loadModel(path); }, resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    const models = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models.map(model => model.instanceId));
    const showPost = async () => {
      if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
      const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    };
    await showPost();
    for (const type of ["ssao", "ssao", "gamma", "dof"]) { await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const [a, b, gamma, dof] = (await state()).instances.map(item => item.instanceId);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`), key = id => row(id).locator('[data-instance-action="registerKeyframe"]');
    const seek = async frame => { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); await expect(page.locator("#current-frame")).toHaveValue(String(frame)); };
    const number = async (id, field, position) => {
      await expandEffectInstance(row(id)); const input = row(id).locator(`[data-instance-field="${field}"]`).locator("..").locator(".range-number-input");
      await input.fill(String(position)); await input.press("Enter");
    };
    const undo = () => page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    const redo = () => page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    const keys = async id => (await state()).instances.find(item => item.instanceId === id).animation.tracks[0]?.keys ?? [];
    await row(dof).locator('[data-instance-field="enabled"]').uncheck();
    // A saved fixture supplies unchanged initial keys; subsequent registration and editing use the visible GUI.
    await page.evaluate(async ids => {
      const project = window.mmdModokiE2e.exportProjectState();
      for (const instance of project.effects.frameGraphInstances.instances.filter(item => ids.includes(item.instanceId))) {
        instance.animation = { version: 1, tracks: [{ effectId: instance.type, valueVersion: 1, base: { ...instance.settings }, keys: [{ frame: 10, value: { ...instance.settings } }] }] };
      }
      await window.mmdModokiE2e.importProjectState(project);
    }, [a, gamma, dof]);
    await showPost();
    for (const [frame, position, enabled] of [[10, 20, false], [30, 40, false], [20, 80, true]]) {
      await seek(frame); await number(a, "strength", position); await row(a).locator('[data-instance-field="enabled"]').setChecked(enabled); await key(a).click();
    }
    for (const [frame, position] of [[10, 100], [30, 50], [20, 0]]) { await seek(frame); await number(gamma, "gamma", position); await key(gamma).click(); }
    for (const [frame, mode, model] of [[10, "model-target", models[0]], [30, "camera-target", null], [20, "model-target", models[1]]]) {
      await seek(frame); await expandEffectInstance(row(dof)); await row(dof).locator('[data-dof-instance-field="focusMode"]').selectOption(mode);
      if (model) { await row(dof).locator('[data-dof-instance-field="targetModelInstanceId"]').selectOption(model); await row(dof).locator('[data-dof-instance-field="targetBoneName"]').selectOption("センター"); }
      await key(dof).click();
    }
    for (const id of [a, gamma, dof]) expect((await keys(id)).map(item => item.frame)).toEqual([10, 20, 30]);
    expect(await keys(b)).toEqual([]);
    await page.evaluate(async () => import("/test/e2e/helpers/effect-boundary-probe.mjs"));
    const probe = () => page.evaluate(async () => (await import("/test/e2e/helpers/effect-boundary-probe.mjs")).effectBoundaryState());
    const renderedFrame = async frame => {
      const sequence = (await probe()).sequence; await seek(frame);
      await expect.poll(async () => { const rendered = await probe(); return rendered.frame === frame && rendered.sequence > sequence; }).toBe(true);
      return probe();
    };
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    const expected = frame => ({
      strength: frame < 10 ? 0.5 : frame < 20 ? 0.2 + 0.06 * (frame - 10) : frame < 30 ? 0.8 - 0.04 * (frame - 20) : 0.4,
      enabled: frame < 10 || (frame >= 20 && frame < 30),
      gamma: frame < 10 ? 1 : frame < 20 ? 0.5 * 4 ** ((frame - 10) / 10) : frame < 30 ? 2 ** ((30 - frame) / 10) : 1,
    });
    const sample = async frame => {
      const wanted = expected(frame), rendered = await renderedFrame(frame);
      const ao = rendered.tasks.find(task => task.name === `ssao-${a}`), other = rendered.tasks.find(task => task.name === `ssao-${b}`), tone = rendered.tasks.find(task => task.name === `gamma-${gamma}`);
      expect(ao?.disabled, `SSAO at ${frame}`).toBe(!wanted.enabled); expect(ao?.strength, `SSAO strength at ${frame}`).toBeCloseTo(wanted.strength * 2, 6);
      expect(other?.disabled).toBe(false); expect(other?.strength).toBeCloseTo(1, 6); expect(tone?.gamma).toBeCloseTo(wanted.gamma, 6);
      await expect(row(a).locator('[data-instance-field="enabled"]')).toBeChecked({ checked: wanted.enabled });
      await expect(row(a).locator('[data-instance-field="strength"]')).toHaveValue(String(Math.round(wanted.strength * 100)));
      await expect(key(a)).toHaveText([10, 20, 30].includes(frame) ? "♦" : "");
      await expect(row(dof).locator('[data-dof-instance-field="focusMode"]')).toHaveValue(frame < 10 ? "person-auto" : frame < 30 ? "model-target" : "camera-target");
      await expect(row(dof).locator('[data-dof-instance-field="targetModelInstanceId"]')).toHaveValue(frame < 10 ? "" : frame < 20 ? models[0] : frame < 30 ? models[1] : models[0]);
      report.samples.push({ frame, ...wanted, ao: { disabled: ao.disabled, strength: ao.strength }, gamma: tone.gamma });
    };
    const frames = [0, 9, 10, 11, 19, 20, 21, 29, 30, 31, 300];
    for (const frame of [...frames, ...[...frames].reverse(), 19, 10, 29, 9, 20]) await sample(frame);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    // Key navigation must use strict predecessor/successor, not insertion or selected-key order.
    await selectEffectInstance(row(a)); await seek(15); await page.locator("#btn-kf-nudge-left").click(); await expect(page.locator("#current-frame")).toHaveValue("10");
    await page.locator("#btn-kf-nudge-right").click(); await expect(page.locator("#current-frame")).toHaveValue("20");
    await page.locator("#btn-kf-nudge-right").click(); await expect(page.locator("#current-frame")).toHaveValue("30");
    await page.locator("#btn-kf-nudge-right").click(); await expect(page.locator("#current-frame")).toHaveValue("30");
    await seek(0); await page.locator("#btn-kf-nudge-left").click(); await expect(page.locator("#current-frame")).toHaveValue("0");
    // Select actual canvas key markers, then move/delete through the normal GUI and shortcuts.
    const selectKey = async frame => {
      await seek(frame); await selectEffectInstance(row(a));
      const position = await page.evaluate(id => {
        const tracks = window.mmdModokiE2e.getTimelineTracks(), index = tracks.findIndex(track => track.name === id);
        const labels = document.getElementById("timeline-labels"), scroll = document.getElementById("timeline-tracks-scroll");
        return { x: Math.max(12, Math.round((scroll.clientWidth - labels.clientWidth) / 2)) + 192,
          y: tracks.slice(0, index).reduce((y, track) => y + 18 + (track.category === "camera" ? 18 : 0), 0) + 9 };
      }, a);
      await page.locator("#timeline-canvas").click({ position });
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeFrame)).toBe(frame);
    };
    const original = await keys(a); await selectKey(20); await page.keyboard.press("Alt+ArrowRight");
    expect((await keys(a)).map(item => item.frame)).toEqual([10, 21, 30]);
    expect((await renderedFrame(20)).tasks.find(task => task.name === `ssao-${a}`).disabled).toBe(true);
    await seek(21); await expect(row(a).locator('[data-instance-field="enabled"]')).toBeChecked();
    await undo(); expect(await keys(a)).toEqual(original); await redo(); expect((await keys(a)).map(item => item.frame)).toEqual([10, 21, 30]); await undo();
    for (const [frame, checkFrame, strength, enabled] of [[20, 20, 0.3, false], [30, 100, 0.8, true], [10, 19, 0.5, true]]) {
      await selectKey(frame); await page.locator("#btn-kf-delete").click();
      expect((await keys(a)).map(item => item.frame)).toEqual([10, 20, 30].filter(item => item !== frame));
      const ao = (await renderedFrame(checkFrame)).tasks.find(task => task.name === `ssao-${a}`); expect(ao.strength).toBeCloseTo(strength * 2, 6); expect(ao.disabled).toBe(!enabled);
      await undo(); expect(await keys(a)).toEqual(original); await redo(); await undo(); expect(await keys(a)).toEqual(original);
    }
    // A stopped preview may change the viewport, but may not change neighbouring frames or exported images.
    const capture = async name => {
      const dir = testInfo.outputPath(name); mkdirSync(dir, { recursive: true });
      await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 640, 360), dir);
      return PNG.sync.read(readFileSync(resolve(dir, "single_rgba_surface_e2e.png"))).data;
    };
    await seek(15); const authored = await capture("authored-15");
    await number(a, "strength", 95); await row(a).locator('[data-instance-field="enabled"]').check(); await expect(key(a)).toHaveText("♢");
    const previewExport = await capture("preview-export-15");
    const delta = authored.reduce((sum, value, index) => sum + Math.abs(value - previewExport[index]), 0) / authored.length;
    expect(delta).toBeLessThan(0.05); expect(await keys(a)).toEqual(original); report.previewExportDifference = delta;
    await sample(16); await sample(15);
    const saved = await state(), file = testInfo.outputPath("boundaries.json");
    const menu = async command => { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); };
    await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
    await menu("file.saveProject"); await expect.poll(() => existsSync(file)).toBe(true); await menu("file.loadProject"); await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    expect(await state()).toEqual(saved);
    for (const backend of ["classic", "frameGraph"]) { await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true }); await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend); await expect.poll(state).toEqual(saved); }
    await showPost(); await page.evaluate(async () => import("/test/e2e/helpers/effect-boundary-probe.mjs"));
    for (const frame of [31, 30, 29, 20, 19, 10, 9, 0]) await sample(frame);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
  } finally { writeFileSync(testInfo.outputPath("boundary-report.json"), JSON.stringify(report, null, 2)); await launched.close(); }
});
