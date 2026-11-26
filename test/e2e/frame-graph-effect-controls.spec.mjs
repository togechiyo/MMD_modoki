import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { effectInstanceRuntimeState, effectStackRow } from "./helpers/effect-instance-controls.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("FrameGraph詳細操作と並べ替え後もruntimeを維持できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath);

    await page.locator("#btn-toggle-shader-panel").click();
    await expect(page.locator("#shader-panel")).toBeVisible();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();

    await expect(page.locator('[data-effect-add-post="ocean"]')).toBeHidden();
    await expect.poll(async () => page.locator("[data-effect-add-post]:not([hidden])").evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute("data-effect-add-post"))
    ))).toEqual([
      "ssao", "ssgi", "rcSkyAmbient", "rcDiffuseGi", "dof",
      "luminous", "luminousRadiance", "bloom", "directionalLightShafts", "lut",
      "gamma", "motionBlur", "distortion",
      "ringParticles", "aerialPerspective",
      "offsetShadow", "offsetHighlight", "vignette", "grain", "sharpen", "chromatic", "edgeBlur",
      "ssr",
    ]);

    const addSsgiButton = page.locator('[data-effect-add-post="ssgi"]');
    await expect(addSsgiButton).toHaveText("間接光 (SSGI)");
    await addSsgiButton.click();

    const ssgiRow = effectStackRow(page, "ssgi");
    await expect(ssgiRow).toBeVisible();
    await expect(ssgiRow.locator(".effect-layer-name")).toHaveText("間接光 (SSGI)");

    const sliders = ssgiRow.locator('input[type="range"][data-instance-field], input[type="range"][data-instance-fixed]');
    await expect(sliders).toHaveCount(2);
    for (let index = 0; index < await sliders.count(); index += 1) {
      await expect(sliders.nth(index)).toHaveAttribute("min", "0");
      await expect(sliders.nth(index)).toHaveAttribute("max", "100");
      await expect(sliders.nth(index)).toHaveAttribute("step", "1");
    }

    const strength = ssgiRow.locator('[data-instance-field="strength"]');
    await strength.evaluate((input) => {
      input.value = "75";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-instance-value="strength"]')).toHaveText("0.75");

    const radius = ssgiRow.locator('[data-instance-field="sampleRadius"]');
    await radius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-instance-value="sampleRadius"]')).toHaveText("129.00");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();

    const luminousRow = effectStackRow(page, "luminous");
    await expect(luminousRow).toBeVisible();
    const luminousRadius = luminousRow.locator('[data-instance-field="radius"]');
    await expect(luminousRadius).toHaveAttribute("min", "0");
    await expect(luminousRadius).toHaveAttribute("max", "100");
    await luminousRadius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(luminousRow.locator('[data-instance-value="radius"]')).toHaveText("65.00");

    const luminousDragHandle = luminousRow.locator('[data-effect-stack-drag]');
    const ssgiTargetBox = await ssgiRow.boundingBox();
    if (!ssgiTargetBox) throw new Error("SSGI stack row has no bounding box");
    await luminousDragHandle.dragTo(ssgiRow, {
      targetPosition: { x: 20, y: Math.max(1, ssgiTargetBox.height - 2) },
    });

    await expect.poll(async () => (
      page.locator("[data-effect-stack-row]").evaluateAll((rows) => (
        rows.map((row) => row.getAttribute("data-effect-instance-type") ?? row.getAttribute("data-effect-stack-row"))
      ))
    )).toEqual(["ssgi", "luminous"]);
    await expect.poll(() => page.evaluate(effectInstanceRuntimeState), { timeout: 30_000 }).toEqual({
      backend: "frameGraph",
      ready: true,
      hasExecuted: true,
      stack: "luminous,ssgi",
      connectedInstanceOrder: ["luminous", "ssgi"],
    });

    const masterFrameGraph = page.locator("#btn-effect-toggle-framegraph");
    await expect(masterFrameGraph).toBeEnabled();
    await masterFrameGraph.click();
    await page.waitForFunction(() => !window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated);
    await expect(masterFrameGraph).toHaveAttribute("aria-pressed", "false");
    await masterFrameGraph.click();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    await expect(effectStackRow(page, "ssgi")).toBeVisible();
    await expect(effectStackRow(page, "luminous")).toBeVisible();
    await expect(luminousRow.locator('[data-instance-value="radius"]')).toHaveText("65.00");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="motionBlur"]').click();

    const motionBlurRow = effectStackRow(page, "motionBlur");
    await expect(motionBlurRow).toBeVisible();
    const motionBlurSliders = motionBlurRow.locator('input[type="range"][data-instance-field], input[type="range"][data-instance-fixed]');
    await expect(motionBlurSliders).toHaveCount(2);
    for (let index = 0; index < await motionBlurSliders.count(); index += 1) {
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("min", "0");
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("max", "100");
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("step", "1");
    }

    const motionBlurStrength = motionBlurRow.locator('[data-instance-field="strength"]');
    await motionBlurStrength.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(motionBlurRow.locator('[data-instance-value="strength"]')).toHaveText("5.00");

    const motionBlurSamples = motionBlurRow.locator('[data-instance-fixed="samples"]');
    await motionBlurSamples.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(motionBlurRow.locator('[data-instance-fixed-value="samples"]')).toHaveText("36.00");

    await expect.poll(() => page.evaluate(effectInstanceRuntimeState), { timeout: 30_000 }).toEqual({
      backend: "frameGraph",
      ready: true,
      hasExecuted: true,
      stack: "luminous,ssgi,motionBlur",
      connectedInstanceOrder: ["luminous", "ssgi", "motionBlur"],
    });

    await page.waitForFunction(() => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount >= 10
    ));
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });

    const rendered = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(64, 36)
    ));
    expect(rendered).toMatchObject({
      backend: "frameGraph",
      ready: true,
      width: 64,
      height: 36,
    });
    expect(rendered.nonZeroRgbByteCount).toBeGreaterThan(0);

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="bloom"]').click();
    const bloomRow = effectStackRow(page, "bloom");
    await expect(bloomRow.locator('[data-instance-field="color"]')).toHaveValue("#fedcba");
    await expect(bloomRow.locator('[data-instance-field="weight"]')).toHaveValue("20");
    await expect(bloomRow.locator('[data-instance-field="threshold"]')).toHaveValue("45");
    await expect(bloomRow.locator('[data-instance-field="kernel"]')).toHaveValue("80");
    await expect(bloomRow.locator('[data-instance-value="weight"]')).toHaveText("0.40");
    await expect(bloomRow.locator('[data-instance-value="threshold"]')).toHaveText("0.90");
    await expect(bloomRow.locator('[data-instance-value="kernel"]')).toHaveText("205.00");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="gamma"]').click();
    const gammaRow = effectStackRow(page, "gamma");
    const gammaSlider = gammaRow.locator('[data-instance-field="gamma"]');
    await expect(gammaSlider).toHaveValue("50");
    await expect(gammaRow.locator('[data-instance-value="gamma"]')).toHaveText("1.00");
    await gammaSlider.evaluate((input) => {
      input.value = "80";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(gammaRow.locator('[data-instance-value="gamma"]')).toHaveText("0.66");
    await expect.poll(async () => page.evaluate(() => (
      window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects.controller?.instances.some(instance => instance.type === "gamma")
    ))).toBe(true);
    const gammaRendered = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(64, 36)
    ));
    expect(gammaRendered.nonZeroRgbByteCount).toBeGreaterThan(0);
    const postOrder = (await page.evaluate(effectInstanceRuntimeState)).connectedInstanceOrder;
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ringParticles"]').click();
    await expect(effectStackRow(page, "ringParticles").locator('input[type="color"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(effectInstanceRuntimeState)).toMatchObject({
      stack: "luminous,ssgi,motionBlur,bloom,gamma,ringParticles",
      connectedInstanceOrder: postOrder,
    });
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});
