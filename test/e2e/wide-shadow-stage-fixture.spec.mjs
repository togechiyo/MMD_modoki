import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const stagePath = resolve(repoRoot, "test/fixtures/shadow-stage/shadow-stage-wide.pmx");

async function shadowDialog(page) {
  const command = page.locator('[data-menu-command="view.lightShadowSettings"]');
  await page.locator(".app-menu-group", { has: command }).locator(".app-menu-trigger").click();
  await command.click();
  return page.locator('[data-popup-id="lighting-shadow-settings"]');
}

test("loads the wide PMX shadow stage and renders near and overview shadows", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stagePath)).not.toBeNull();
    await expect(page.locator('#info-model-select option[value="0"]')).toContainText("shadow-stage-wide");
    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");
    await page.locator("#light-shadow-max-z").fill("10000");
    let dialog = await shadowDialog(page);
    await dialog.locator("#light-shadow-distance-multiplier").fill("2");
    await page.keyboard.press("Escape");
    await page.locator("#info-model-select").selectOption("__camera__");
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting)).toMatchObject({ shadowMaxZ: 10000, shadowDistanceMultiplier: 2 });
    for (const mode of ["cascaded", "standard"]) {
      dialog = await shadowDialog(page);
      await dialog.locator("#light-shadow-mode").selectOption(mode);
      await page.keyboard.press("Escape");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().effectiveMode)).toBe(mode);
      for (const [name, position, target] of [
        ["overview", { x: 4200, y: 4800, z: -4200 }, { x: 0, y: 0, z: 2000 }],
        ["near", { x: 240, y: 200, z: -450 }, { x: 30, y: 1, z: 500 }],
      ]) {
        await page.evaluate(({ position, target }) => window.mmdModokiE2e.setCameraPose(position, target), { position, target });
        await page.evaluate(async () => {
          for (let frame = 0; frame < 12; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
        });
        const png = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${mode}-${name}.png`) }));
        let geometryPixels = 0;
        for (let offset = 0; offset < png.data.length; offset += 4) {
          if (png.data[offset] > 5 && png.data[offset] < 230) geometryPixels++;
        }
        expect(geometryPixels).toBeGreaterThan(50000);
        const diagnostics = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
        expect(diagnostics.lightSamplingEnabled).toBe(true);
        expect(diagnostics.models).toHaveLength(1);
        expect(diagnostics.models[0].casterMeshCount).toBeGreaterThan(0);
        expect(diagnostics.models[0].receiverMeshCount).toBeGreaterThan(0);
      }
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
