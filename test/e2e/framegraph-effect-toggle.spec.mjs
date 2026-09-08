import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const groups = [
  ["gamma"],
  ["ssao", "ssgi", "ssr", "offsetShadow", "offsetHighlight", "aerialPerspective", "directionalLightShafts"],
  ["dof", "luminous", "bloom", "lut", "gamma"],
  ["motionBlur", "distortion", "ringParticles", "vignette", "grain", "sharpen", "chromatic", "edgeBlur"],
];
test.setTimeout(180000);
async function settle(page) {
  await page.evaluate(async () => (await import("/test/e2e/helpers/shader-outline-probe.mjs")).outlineProbe());
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
}
function imageDifference(a, b) {
  const first = PNG.sync.read(a), second = PNG.sync.read(b);
  let changed = 0, lit = 0;
  for (let i = 0; i < first.data.length; i += 4) {
    const x = (i / 4) % first.width, y = Math.floor(i / 4 / first.width);
    // The lower-right camera handle overlay changes with mouse/focus, outside PostFX.
    if (x > first.width - 200 && y > first.height - 140) continue;
    if ([0, 1, 2].some(c => Math.abs(first.data[i + c] - second.data[i + c]) > 8)) changed++;
    if ([0, 1, 2].some(c => second.data[i + c] > 8)) lit++;
  }
  return { changed, lit };
}
for (const ids of groups) test(`FrameGraph warm toggles and all off: ${ids.join(",")}`, async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack ?? error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async singleEffect => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      if (singleEffect) project.viewport.antialiasEnabled = false;
      await window.mmdModokiE2e.importProjectState(project);
    }, ids.length === 1);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    for (const id of ids) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator(`[data-effect-add-post="${id}"]`).click();
      await settle(page);
    }
    if (ids.includes("gamma")) {
      const row = page.locator('[data-effect-stack-row="gamma"]');
      if (!await row.locator('input[type="range"]').isVisible()) await row.locator('.effect-layer-name').click();
      await row.locator('input[type="range"]').first().fill("70");
      await row.locator('input[type="range"]').first().dispatchEvent("input");
    }
    await settle(page);
    const getState = () => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState());
    const assertGpu = async (phase) => {
      expect(errors, `${phase} page errors`).toEqual([]);
      const diagnostics = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(diagnostics.count, `${phase}: ${diagnostics.messages.join("\n")}`).toBe(0);
    };
    await assertGpu("initial stack");
    const warm = await getState();
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const canvas = page.locator("#render-canvas");
    await expect(page.locator(".toast")).toHaveCount(0);
    const before = await canvas.screenshot();
    const timings = [];
    for (const id of ids) {
      const toggle = page.locator(`[data-effect-stack-toggle="${id}"]`);
      const start = Date.now();
      await toggle.uncheck();
      await settle(page);
      expect((await getState()).buildGeneration, `${id} OFF`).toBe(warm.buildGeneration);
      await toggle.check();
      await settle(page);
      expect((await getState()).buildGeneration, `${id} ON`).toBe(warm.buildGeneration);
      await assertGpu(`${id} toggle`);
      timings.push({ id, offOnWithUiAndSettleMs: Date.now() - start });
    }
    const master = page.locator("#btn-effect-toggle-framegraph");
    await master.click();
    await settle(page);
    await expect(master).toHaveAttribute("aria-pressed", "false");
    for (const id of ids) await expect(page.locator(`[data-effect-stack-toggle="${id}"]`)).toBeChecked();
    expect((await getState()).buildGeneration).toBe(warm.buildGeneration);
    expect((await getState()).resourcesAllocated).toBe(false);
    await assertGpu("all off");
    const off = await canvas.screenshot();
    expect(imageDifference(before, off).lit).toBeGreaterThan(1000);
    const offProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await master.click();
    await settle(page);
    expect((await getState()).buildGeneration).toBe(warm.buildGeneration + 1);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).effects).toEqual(saved.effects);
    const restored = await canvas.screenshot();
    const output = testInfo.outputPath("toggle-images");
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "on.png"), before);
    writeFileSync(resolve(output, "off.png"), off);
    writeFileSync(resolve(output, "restored.png"), restored);
    writeFileSync(resolve(output, "report.json"), JSON.stringify({ warm, timings, difference: imageDifference(before, off), restored: imageDifference(before, restored) }, null, 2));
    if (!ids.includes("ringParticles")) expect(imageDifference(before, restored).changed).toBeLessThan(100);
    if (ids.includes("gamma")) expect(imageDifference(before, off).changed).toBeGreaterThan(1000);

    // Project fixture supply replaces only file IO; inspect restored controls through the GUI.
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), offProject);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).effects.frameGraphPostStack).toEqual(offProject.effects.frameGraphPostStack);
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator('[data-effect-tab="post"]').click();
    await settle(page);
    for (const id of ids) await expect(page.locator(`[data-effect-stack-toggle="${id}"]`)).toBeChecked();
    await assertGpu("import all off");
    await expect(master).toHaveAttribute("aria-pressed", "false");
    expect((await getState()).resourcesAllocated).toBe(false);
    await master.click();
    await settle(page);
    await expect(master).toHaveAttribute("aria-pressed", "true");
    await assertGpu("reenable after import");
    await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), output);
    await assertGpu("PNG output");
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
