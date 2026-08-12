import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

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

    await expect.poll(async () => page.locator("[data-effect-add-post]").evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute("data-effect-add-post"))
    ))).toEqual([
      "ssao", "ssgi", "dof",
      "luminous", "bloom", "directionalLightShafts", "lut",
      "gamma", "motionBlur", "distortion",
      "ringParticles", "aerialPerspective",
      "offsetShadow", "offsetHighlight", "vignette", "grain", "sharpen", "chromatic", "edgeBlur",
      "ssr",
    ]);

    const addSsgiButton = page.locator('[data-effect-add-post="ssgi"]');
    await expect(addSsgiButton).toHaveText("SSGI");
    await addSsgiButton.click();

    const ssgiRow = page.locator('[data-effect-stack-row="ssgi"]');
    await expect(ssgiRow).toBeVisible();
    await expect(ssgiRow.locator(".effect-layer-name")).toHaveText("SSGI");

    const sliders = ssgiRow.locator('input[type="range"][data-effect-stack-control]');
    await expect(sliders).toHaveCount(2);
    for (let index = 0; index < await sliders.count(); index += 1) {
      await expect(sliders.nth(index)).toHaveAttribute("min", "0");
      await expect(sliders.nth(index)).toHaveAttribute("max", "100");
      await expect(sliders.nth(index)).toHaveAttribute("step", "1");
    }

    const strength = ssgiRow.locator('[data-effect-stack-control="ssgiStrength"]');
    await strength.evaluate((input) => {
      input.value = "75";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-effect-stack-value="ssgiStrength"]')).toHaveText("0.75");

    const radius = ssgiRow.locator('[data-effect-stack-control="ssgiSampleRadius"]');
    await radius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-effect-stack-value="ssgiSampleRadius"]')).toHaveText("129px");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();

    const luminousRow = page.locator('[data-effect-stack-row="luminous"]');
    await expect(luminousRow).toBeVisible();
    const luminousRadius = luminousRow.locator('[data-effect-stack-control="luminousRadius"]');
    await expect(luminousRadius).toHaveAttribute("min", "0");
    await expect(luminousRadius).toHaveAttribute("max", "100");
    await luminousRadius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(luminousRow.locator('[data-effect-stack-value="luminousRadius"]')).toHaveText("65px");

    const luminousDragHandle = luminousRow.locator('[data-effect-stack-drag="luminous"]');
    const ssgiTargetBox = await ssgiRow.boundingBox();
    if (!ssgiTargetBox) throw new Error("SSGI stack row has no bounding box");
    await luminousDragHandle.dragTo(ssgiRow, {
      targetPosition: { x: 20, y: Math.max(1, ssgiTargetBox.height - 2) },
    });

    await expect.poll(async () => (
      page.locator("[data-effect-stack-row]").evaluateAll((rows) => (
        rows.map((row) => row.getAttribute("data-effect-stack-row"))
      ))
    )).toEqual(["ssgi", "luminous"]);
    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e?.getFrameGraphPostEffectsState();
      return state?.backend === "frameGraph"
        && state.ready
        && state.executedFrameCount >= 2
        && state.stack.join(",") === "luminous,ssgi";
    });

    const reloadFrameGraph = page.locator("#btn-effect-reload-framegraph");
    await expect(reloadFrameGraph).toBeEnabled();
    await expect(reloadFrameGraph).toHaveAttribute("title", "FrameGraphを再読み込み");
    await reloadFrameGraph.click();

    await expect(page.getByText("FrameGraphを再読み込みしました", { exact: true })).toBeVisible();
    await expect(page.locator('[data-effect-stack-row="ssgi"]')).toBeVisible();
    await expect(page.locator('[data-effect-stack-row="luminous"]')).toBeVisible();
    await expect(page.locator('[data-effect-stack-value="luminousRadius"]')).toHaveText("65px");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="motionBlur"]').click();

    const motionBlurRow = page.locator('[data-effect-stack-row="motionBlur"]');
    await expect(motionBlurRow).toBeVisible();
    const motionBlurSliders = motionBlurRow.locator('input[type="range"][data-effect-stack-control]');
    await expect(motionBlurSliders).toHaveCount(2);
    for (let index = 0; index < await motionBlurSliders.count(); index += 1) {
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("min", "0");
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("max", "100");
      await expect(motionBlurSliders.nth(index)).toHaveAttribute("step", "1");
    }

    const motionBlurStrength = motionBlurRow.locator('[data-effect-stack-control="motionBlurStrength"]');
    await motionBlurStrength.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(motionBlurRow.locator('[data-effect-stack-value="motionBlurStrength"]')).toHaveText("5.00");

    const motionBlurSamples = motionBlurRow.locator('[data-effect-stack-control="motionBlurSamples"]');
    await motionBlurSamples.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(motionBlurRow.locator('[data-effect-stack-value="motionBlurSamples"]')).toHaveText("36");

    await expect.poll(async () => page.evaluate(() => {
      const state = window.mmdModokiE2e?.getFrameGraphPostEffectsState();
      return state ? {
        backend: state.backend,
        ready: state.ready,
        hasExecuted: state.executedFrameCount >= 2,
        stack: state.stack.join(","),
      } : null;
    }), { timeout: 30_000 }).toEqual({
      backend: "frameGraph",
      ready: true,
      hasExecuted: true,
      stack: "luminous,ssgi,motionBlur",
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
    const bloomRow = page.locator('[data-effect-stack-row="bloom"]');
    await expect(bloomRow.locator('[data-effect-stack-control="bloomColor"]')).toHaveValue("#fedcba");
    await expect(bloomRow.locator('[data-effect-stack-control="bloomWeight"]')).toHaveValue("20");
    await expect(bloomRow.locator('[data-effect-stack-control="bloomThreshold"]')).toHaveValue("90");
    await expect(bloomRow.locator('[data-effect-stack-control="bloomKernel"]')).toHaveValue("80");
    await expect(bloomRow.locator('[data-effect-stack-value="bloomWeight"]')).toHaveText("20");
    await expect(bloomRow.locator('[data-effect-stack-value="bloomThreshold"]')).toHaveText("90");
    await expect(bloomRow.locator('[data-effect-stack-value="bloomKernel"]')).toHaveText("80");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="gamma"]').click();
    const gammaRow = page.locator('[data-effect-stack-row="gamma"]');
    const gammaSlider = gammaRow.locator('[data-effect-stack-control="gammaPower"]');
    await expect(gammaSlider).toHaveValue("50");
    await expect(gammaRow.locator('[data-effect-stack-value="gammaPower"]')).toHaveText("50");
    await gammaSlider.evaluate((input) => {
      input.value = "80";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(gammaRow.locator('[data-effect-stack-value="gammaPower"]')).toHaveText("80");
    await expect.poll(async () => page.evaluate(() => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().stack.includes("gamma")
    ))).toBe(true);
    const gammaRendered = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(64, 36)
    ));
    expect(gammaRendered.nonZeroRgbByteCount).toBeGreaterThan(0);
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});
