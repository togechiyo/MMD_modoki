import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance, dragEffectStackRow } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("effect headers drag by name and register their own diamond key state", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), errors = [];
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => { const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false; await window.mmdModokiE2e.importProjectState(project); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
    const showPost = async () => {
      if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
      const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    };
    await showPost();
    for (const type of ["ssao", "ssao", "motionBlur", "dof"]) { await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const [a, b, motion, dof] = (await state()).instances.map(item => item.instanceId);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`), key = id => row(id).locator('[data-instance-action="registerKeyframe"]');
    const edit = async (id, field, position) => {
      await expandEffectInstance(row(id));
      const input = row(id).locator(`[data-instance-field="${field}"], [data-instance-fixed="${field}"]`).locator("..").locator(".range-number-input");
      await input.fill(String(position)); await input.press("Enter");
    };
    const seek = async frame => { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); };
    const undo = () => page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    const redo = () => page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    await expect(page.locator(".effect-layer-drag-handle, .effect-layer-drag-grip")).toHaveCount(0);
    await expect(row(a).locator(".effect-layer-main")).toHaveAttribute("data-effect-stack-drag", a);
    await expect(row(a).locator(".effect-layer-main")).toHaveAttribute("draggable", "true");
    await expect(key(a)).toBeDisabled(); await expect(key(a)).toHaveText("");
    expect(await key(a).evaluate(button => button.draggable)).toBe(false);
    const selected = await page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack);
    await edit(a, "strength", 65);
    await expect(key(a)).toHaveText("♢"); await expect(key(b)).toHaveText("");
    await undo(); await expect(key(a)).toHaveText(""); await redo(); await expect(key(a)).toHaveText("♢");
    // Register directly from a collapsed header without selecting an Effect timeline row.
    await row(a).locator('[data-instance-action="select"]').click(); await key(a).click();
    await expect(key(a)).toHaveText("♦");
    expect(await page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack)).toEqual(selected);
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.timelineTarget)).toBe("model");
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    const registered = await state();
    expect(registered.instances.find(item => item.instanceId === a).animation.tracks[0].keys.map(item => item.frame)).toEqual([0]);
    const history = await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState());
    await key(a).click(); expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState())).toEqual(history);
    await undo(); await expect(key(a)).toHaveText("♢"); await redo(); await expect(key(a)).toHaveText("♦");
    await seek(10); await expect(key(a)).toHaveText("");
    await row(a).locator('[data-instance-field="enabled"]').uncheck(); await expect(key(a)).toHaveText("♢"); await key(a).click();
    await expect(key(a)).toHaveText("♦");
    await row(b).locator('[data-instance-field="enabled"]').uncheck(); await expect(key(b)).toHaveText("♢"); await key(b).click();
    await expect(key(b)).toHaveText("♦");
    await edit(a, "strength", 35); await expect(key(a)).toHaveText("♢"); await expect(key(b)).toHaveText("♦");
    await key(a).click(); await expect(key(a)).toHaveText("♦");
    const updated = await state(); await undo(); await expect(key(a)).toHaveText("♦"); await redo(); expect(await state()).toEqual(updated);
    const expanded = await row(a).locator('[data-instance-action="select"]').getAttribute("aria-expanded");
    await dragEffectStackRow(row(a), row(b), "before");
    expect((await state()).instances).toEqual(updated.instances);
    await expect(row(a).locator('[data-instance-action="select"]')).toHaveAttribute("aria-expanded", expanded);
    await expect(key(a)).toHaveText("♦"); await expect(key(b)).toHaveText("♦");
    // Fixed settings are saved independently and do not create pending value keys.
    await edit(motion, "samples", 70); await expect(key(motion)).toHaveText(""); await expect(key(motion)).toBeDisabled();
    await expandEffectInstance(row(dof));
    await row(dof).locator('[data-dof-instance-field="focusMode"]').selectOption("model-target");
    const model = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models[0].instanceId);
    await row(dof).locator('[data-dof-instance-field="targetModelInstanceId"]').selectOption(model);
    await expect(key(dof)).toHaveText("♢"); await key(dof).click(); await expect(key(dof)).toHaveText("♦");
    expect((await state()).instances.find(item => item.instanceId === dof).animation.tracks[0].keys[0].value.targetModelInstanceId).toBe(model);
    await edit(a, "radius", 25); await row(a).locator('[data-instance-action="select"]').click();
    await expect(key(a)).toHaveText("♢"); await expect(key(b)).toHaveText("♦");
    await page.locator("#shader-panel").screenshot({ path: testInfo.outputPath("diamond-headers.png") });
    for (const locale of ["en", "zh-Hant", "zh-Hans", "ko", "ja"]) {
      await page.locator("#toolbar-locale-select").selectOption(locale);
      expect(await key(a).getAttribute("aria-label")).not.toContain("effect.instance");
      await expect(key(a)).toHaveText("♢"); await expect(key(b)).toHaveText("♦");
    }
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(key(a)).toBeHidden(); await expect(row(a).locator(".effect-layer-main")).toHaveAttribute("draggable", "false");
    await page.locator("#viewport-seek-play-toggle").click(); await seek(11); await seek(10);
    await expect(key(a)).toHaveText("♦"); await expect(key(b)).toHaveText("♦");
    const saved = await state(), file = testInfo.outputPath("header-keys.json");
    const menu = async command => { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); };
    await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
    await menu("file.saveProject"); await expect.poll(() => existsSync(file)).toBe(true); await menu("file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    expect(await state()).toEqual(saved); await expect(key(a)).toHaveText("♦"); await expect(key(motion)).toHaveText("");
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend); await expect.poll(state).toEqual(saved);
    }
    await showPost(); await expect(key(a)).toHaveText("♦"); await expect(key(b)).toHaveText("♦");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { await launched.close(); }
});
