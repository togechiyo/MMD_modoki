import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const dialog = page => page.locator('[data-popup-id="experimental-settings"]');
const section = page => dialog(page).locator('[data-experiment-section="rc-sky-occlusion"]');
const enabled = page => section(page).locator('[name="rcSkyOcclusionEnabled"]');
const status = page => section(page).locator('[data-rc-sky-occlusion-status]');
const saved = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.rcSkyOcclusion);
async function open(page) {
  await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
  await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
  await expect(enabled(page)).toBeVisible();
}
async function close(page) { await dialog(page).locator('.app-menu-dialog-close').click(); }
async function slider(page, name, value) {
  const input = section(page).locator(`[name="rcSkyOcclusion${name}"]`);
  await input.focus(); await input.press("Home");
  for (let i = 0; i < value; i++) await input.press("ArrowRight");
  await expect(input).toHaveValue(String(value));
}
function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / (a.width * a.height * 3);
}

test("RC sky occlusion: normal MMD material, UI, neutral off and PNG", async ({}, testInfo) => {
  test.setTimeout(180000);
  // Neither the old effect timeline nor the fixed-floor lighting lab flag is enabled.
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], captures: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => { report.errors.push(error.stack ?? error.message); console.log("RC pageerror", error.stack ?? error.message); });
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 18, y: 12, z: -23 }, { x: 0, y: 1.5, z: 0 }));
    report.backend = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState());
    const capture = async name => {
      const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
      const result = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360), directory);
      report.captures[name] = result;
      expect(result.surfaceReleased).toBe(true);
      return PNG.sync.read(readFileSync(result.path));
    };
    const off = await capture("off");
    await open(page); await expect(enabled(page)).not.toBeChecked();
    await enabled(page).check();
    await expect(status(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    expect((await saved(page)).volume).toBeNull();
    report.status = await status(page).textContent();
    await close(page); const on = await capture("on");
    report.onDifference = difference(off, on); expect(report.onDifference).toBeGreaterThan(0.15);
    await open(page); await slider(page, "Strength", 0); await close(page);
    const zero = await capture("zero"); report.zeroDifference = difference(off, zero); expect(report.zeroDifference).toBeLessThan(0.1);
    await open(page); await enabled(page).uncheck(); await expect(status(page)).toHaveAttribute("data-state", "off"); await close(page);
    const restored = await capture("off-restored"); report.offDifference = difference(off, restored); expect(report.offDifference).toBeLessThan(0.1);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.errors).toEqual([]); expect(report.validation.count).toBe(0);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
