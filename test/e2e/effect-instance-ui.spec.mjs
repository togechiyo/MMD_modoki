import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { dragEffectStackRow, selectEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("automatic effect names and shared stack UI at narrow width", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
    await page.locator("#info-model-select").selectOption("__camera__");
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="post"]').click();
    for (const type of ["ssao", "ssao", "ssgi", "ringParticles"]) {
      await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click();
    }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const before = await state(), [a, b, c] = before.instances.map(item => item.instanceId);
    expect(before.instances.map(item => item.label)).toEqual(["SSAO", "SSAO 2", "SSGI"]);
    const row = id => page.locator(`[data-effect-stack-row="${id}"]`);
    await expect(page.locator('[data-instance-field="label"], [data-instance-action="up"], [data-instance-action="down"]')).toHaveCount(0);
    await dragEffectStackRow(row(a), row("ringParticles"), "before");
    expect((await state()).order).toEqual([b, c, "ringParticles", a]);
    expect((await state()).instances).toEqual(before.instances);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); expect(await state()).toEqual(before);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); expect((await state()).order).toEqual([b, c, "ringParticles", a]);
    await selectEffectInstance(row(b));
    await expect(page.locator("[data-effect-key-label]")).toHaveText("SSAO 2");
    await expect(row(b).locator(".effect-layer-details")).toBeVisible();
    await expect(row(a).locator(".effect-layer-details")).toBeHidden();
    await expect.poll(() => row(b).evaluate(element => [...element.querySelectorAll('.effect-instance-actions button')].every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
    const details = await row(b).locator(".effect-layer-details").boundingBox();
    const color = await row(b).locator('[data-instance-field="color"]').boundingBox();
    expect(color.x + color.width).toBeLessThanOrEqual(details.x + details.width);
    await page.locator("#shader-panel").screenshot({ path: testInfo.outputPath("effect-panel.png") });
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});
