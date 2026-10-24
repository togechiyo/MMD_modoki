import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { dragEffectStackRow, selectEffectInstance, expandEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("automatic effect names and shared stack UI at narrow width", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.timelineTarget)).toBe("model");
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="post"]').click();
    for (const type of ["ssao", "ssao", "ssgi", "ringParticles"]) {
      await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click();
    }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const effectRows = () => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().filter(track => track.category === "effect"));
    const before = await state(), [a, b, c] = before.instances.map(item => item.instanceId);
    expect(before.instances.map(item => item.label)).toEqual(["SSAO", "SSAO 2", "SSGI"]);
    const row = id => page.locator(`[data-effect-stack-row="${id}"]`);
    await expect(page.locator('[data-instance-field="label"], [data-instance-action="up"], [data-instance-action="down"]')).toHaveCount(0);
    await expect(row(a).locator('.effect-layer-main[data-effect-stack-drag]')).toHaveCount(1);
    await expect(row("ringParticles").locator('.effect-layer-main[data-effect-stack-drag]')).toHaveCount(1);
    await dragEffectStackRow(row(a), row("ringParticles"), "before");
    expect((await state()).order).toEqual([b, c, "ringParticles", a]);
    expect((await state()).instances).toEqual(before.instances);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); expect(await state()).toEqual(before);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); expect((await state()).order).toEqual([b, c, "ringParticles", a]);
    await expandEffectInstance(row(b));
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.timelineTarget)).toBe("model");
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    await page.locator("#info-model-select").selectOption("__camera__");
    expect(await effectRows()).toEqual([]);
    const strength = row(b).locator('[data-instance-field="strength"]');
    await strength.locator("..").locator(".range-number-input").fill("60");
    await strength.locator("..").locator(".range-number-input").press("Enter");
    expect(await effectRows()).toEqual([]);
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("normal-effect-settings.png") });
    await selectEffectInstance(row(b));
    expect(await effectRows()).toEqual([{ category: "effect", name: b, frames: [] }]);
    await expect(page.locator("[data-effect-key-label]")).toHaveText("SSAO 2");
    await expect(row(b).locator(".effect-layer-details")).toBeVisible();
    await expect(row(a).locator(".effect-layer-details")).toBeHidden();
    await expect.poll(() => row(b).evaluate(element => [...element.querySelectorAll('.effect-instance-actions button')].every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
    await expect(row(b).locator('[data-instance-field="color"], [data-instance-fixed="toonInfluence"]')).toHaveCount(0);
    await expect(row(b).locator('[data-instance-field="strength"], [data-instance-field="radius"]')).toHaveCount(2);
    await page.locator("#shader-panel").screenshot({ path: testInfo.outputPath("effect-panel.png") });
    // Leaving an unregistered edit session drops its temporary row without making a key.
    await selectTimelineTrack(page, "camera", "Camera");
    expect(await effectRows()).toEqual([]);
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    await selectEffectInstance(row(b));
    await page.locator("#btn-kf-add").click();
    await selectTimelineTrack(page, "camera", "Camera");
    expect(await effectRows()).toEqual([{ category: "effect", name: b, frames: [0] }]);
    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), savedProject);
    expect(await state()).toEqual(savedProject.effects.frameGraphInstances);
    expect(await effectRows()).toEqual([{ category: "effect", name: b, frames: [0] }]);
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    // Existing keyed rows remain editable; deleting the last key hides the row, including on Redo.
    await selectTimelineTrack(page, "effect", b);
    await expect(page.locator("#effect-key-controls")).toBeVisible();
    await page.locator("#btn-kf-delete").click();
    expect(await effectRows()).toEqual([]);
    await expect(page.locator("#effect-key-controls")).toBeHidden();
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(await effectRows()).toEqual([{ category: "effect", name: b, frames: [0] }]);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect(await effectRows()).toEqual([]);
    expect((await state()).instances).toHaveLength(3);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});

test("fixed effect sliders preview continuously, commit one gesture and retain saved settings", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], navigation: [], console: [], stderr: "" };
  try {
    const page = await launched.app.firstWindow(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) report.navigation.push(frame.url()); });
    page.on("console", message => { if (["warning", "error"].includes(message.type())) report.console.push(message.text()); });
    launched.app.process().stderr.on("data", data => { report.stderr = `${report.stderr}${data}`.slice(-20000); });
    await page.evaluate(async () => { const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false; await window.mmdModokiE2e.importProjectState(project); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    const showPost = async () => {
      if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
      const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    };
    await showPost();
    for (const type of ["motionBlur", "luminous"]) { await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const [motion, luminous] = (await state()).instances.map(item => item.instanceId), row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const specs = [[motion, "samples", 50], [luminous, "radianceStrength", 6], [luminous, "radianceRange", 75.25]];
    const actual = async (id, field) => { const fixed = (await state()).instances.find(item => item.instanceId === id).fixedSettings; return field === "samples" ? fixed.samples : fixed.radiance[field === "radianceStrength" ? "strength" : "range"]; };
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    for (const [id, field, enteredValue] of specs) {
      await expandEffectInstance(row(id));
      const slider = row(id).locator(`[data-instance-fixed="${field}"]`), number = slider.locator("..").locator(".range-number-input");
      await expect(slider).toHaveAttribute("type", "range"); await expect(slider).toHaveAttribute("min", "0"); await expect(slider).toHaveAttribute("max", "100");
      await expect(number).toBeVisible();
      const before = await state(), initial = await actual(id, field), handle = await slider.elementHandle();
      await slider.scrollIntoViewIfNeeded(); const box = await slider.boundingBox(); if (!box || !handle) throw new Error("Slider is not visible");
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
      await expect.poll(() => actual(id, field)).not.toBe(initial);
      expect(await handle.evaluate(element => element.isConnected)).toBe(true);
      await page.mouse.up(); const dragged = await state();
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); expect(await state()).toEqual(before);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); expect(await state()).toEqual(dragged);
      await expandEffectInstance(row(id));
      await number.fill("25"); await number.press("Escape"); expect(await state()).toEqual(dragged);
      await expect(number).toHaveValue(await slider.inputValue());
      await number.fill("60"); await slider.focus(); expect(await state()).toEqual(dragged);
      await expect(number).toHaveValue(await slider.inputValue());
      await number.fill("75"); await number.press("Enter"); expect(await actual(id, field)).toBe(enteredValue);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); expect(await state()).toEqual(dragged);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); expect(await actual(id, field)).toBe(enteredValue);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await selectEffectInstance(row(luminous)); await page.locator("#btn-kf-add").click();
    expect(Object.keys((await state()).instances.find(item => item.instanceId === luminous).animation.tracks[0].keys[0].value).sort()).toEqual(["enabled", "intensity", "radius", "threshold"]);
    await page.locator("#viewport-seek-play-toggle").click();
    for (const [id, field] of specs) { const slider = row(id).locator(`[data-instance-fixed="${field}"]`); await expect(slider).toBeDisabled(); await expect(slider.locator("..").locator(".range-number-input")).toBeDisabled(); }
    await page.locator("#viewport-seek-play-toggle").click();
    const saved = await state();
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend); await expect.poll(state).toEqual(saved);
    }
    await showPost(); await expandEffectInstance(row(luminous));
    await page.locator("#shader-panel").screenshot({ path: testInfo.outputPath("fixed-sliders.png") });
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    expect(report.errors).toEqual([]);
  } finally {
    writeFileSync(testInfo.outputPath("slider-report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
