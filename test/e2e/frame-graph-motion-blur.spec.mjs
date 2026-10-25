import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { expandEffectInstance, registerEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { writeFileSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("PMXモデルでFrameGraph Motion Blurを描画できる", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  const report = { errors: [], navigation: [], console: [] }; let observedPage;
  try {
    const page = await launched.app.firstWindow();
    observedPage = page;
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) report.navigation.push(frame.url()); });
    page.on("console", message => { if (["warning", "error"].includes(message.type())) report.console.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const loaded = await page.evaluate((path) => (
      window.mmdModokiE2e.loadModel(path)
    ), modelPath);
    expect(loaded).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="motionBlur"]').click();

    const motionBlurRow = page.locator('[data-effect-instance-row]');
    await expect(motionBlurRow).toBeVisible();
    const strength = motionBlurRow.locator(
      '[data-instance-field="strength"]',
    );
    await expect(strength).toHaveValue("100");
    await expect(
      motionBlurRow.locator('[data-instance-value="strength"]'),
    ).toHaveText("10.00");

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e?.getFrameGraphPostEffectsState();
      return state?.backend === "frameGraph"
        && state.ready
        && window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects.controller.instances.some(item => item.type === "motionBlur");
    });

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
  } finally {
    report.final = await observedPage?.evaluate(() => ({ runtime: window.mmdModokiE2e?.getFrameGraphPostEffectsState(), project: window.mmdModokiE2e?.exportProjectState().effects.frameGraphInstances, status: document.querySelector("#status-text")?.textContent })).catch(error => ({ error: error.message }));
    writeFileSync(testInfo.outputPath("launch-motion-report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

test("Motion Blur instances evaluate separate keys during PMX bone playback and restore bone texture mode", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => { const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false; await window.mmdModokiE2e.importProjectState(state); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.evaluate(async () => import("/test/e2e/helpers/motion-instance-probe.mjs"));
    const probe = () => page.evaluate(async () => (await import("/test/e2e/helpers/motion-instance-probe.mjs")).motionInstanceState());
    const initial = (await probe()).skeletons;
    const seek = async frame => { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); };
    await selectCenterBone(page);
    for (const [frame, x] of [[0, -3], [30, 3]]) { await seek(frame); const input = page.locator('#bone-controls input[data-control-key="tx"]'); await input.fill(String(x)); await input.press("Enter"); await page.locator("#btn-kf-add").click(); }
    await seek(0); await page.locator("#info-model-select").selectOption("__camera__");
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="post"]').click();
    for (let i = 0; i < 2; i++) { await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="motionBlur"]').click(); }
    const ids = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances.instances.map(item => item.instanceId));
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    await row(ids[1]).locator('[data-instance-field="enabled"]').uncheck();
    await expandEffectInstance(row(ids[0]));
    const slider = row(ids[0]).locator('[data-instance-field="strength"]');
    for (const [frame, value] of [[0, 20], [20, 80]]) {
      await seek(frame); await slider.fill(String(value)); await slider.dispatchEvent("input"); await row(ids[0]).locator('[data-instance-field="enabled"]').setChecked(frame > 0); await registerEffectInstance(row(ids[0]));
    }
    await seek(0); await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await page.evaluate(async () => (await import("/test/e2e/helpers/motion-instance-probe.mjs")).resetMotionInstanceObservations());
    await page.locator("#viewport-seek-play-toggle").click();
    await expect.poll(async () => (await probe()).observations.some(item => item.name.endsWith(ids[0]) && item.frame >= 20 && !item.disabled && item.strength >= 7.99)).toBe(true);
    await page.locator("#viewport-seek-play-toggle").click();
    const playing = await probe();
    expect(playing.observations.some(item => item.name.endsWith(ids[0]) && item.frame > 0 && item.frame < 20 && item.disabled)).toBe(true);
    expect(playing.observations.filter(item => item.name.endsWith(ids[1]) && item.frame > 0).every(item => item.disabled)).toBe(true);
    expect(playing.skeletons.filter(item => item.bones <= 256).every(item => !item.boneTexture)).toBe(true);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await page.locator("#btn-effect-toggle-framegraph").click(); await expect.poll(async () => (await probe()).skeletons).toEqual(initial);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    writeFileSync(testInfo.outputPath("motion-report.json"), JSON.stringify(playing, null, 2));
  } finally { await launched.close(); }
});
