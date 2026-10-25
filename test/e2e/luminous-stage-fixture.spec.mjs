import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceRow, luminousRadianceInstanceRow, setLuminousInstancePosition, getLuminousInstanceRuntime } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), preset = process.env.MMD_LUMINOUS_STAGE_PRESET ?? "fixture";
const stagePath = resolve(root, preset === "fixture" ? "test/fixtures/luminous-stage" : `local-references/luminous-stage/${preset}`, `luminous-stage-${preset}.pmx`);
const heavy = preset !== "fixture", mode = process.env.MMD_LUMINOUS_STAGE_MODE ?? "rc";

test(`luminous PMX stage (${preset}, ${mode}) loads and renders`, async () => {
  test.skip(heavy && !existsSync(stagePath), "Generate the optional local stage first");
  test.setTimeout(240000);
  expect(["fixture", "heavy", "stress"]).toContain(preset); expect(["off", "rc", "glow-rc"]).toContain(mode);
  const manifest = JSON.parse(readFileSync(`${stagePath}.json`, "utf8"));
  const launched = await launchMmdModoki(root), errors = [], consoleMessages = [], navigations = [], captures = {}, result = { preset, mode, manifest, captures, consoleMessages, navigations };
  const output = resolve(root, "artifacts/e2e/luminous-stage", `${preset}-${mode}`);
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["warning", "error"].includes(message.type()) || /vite|device.*lost/i.test(message.text())) consoleMessages.push(message.text()); });
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    const loadStart = Date.now();
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stagePath)).not.toBeNull();
    result.loadMs = Date.now() - loadStart;
    await expect(page.locator('#info-model-select option[value="0"]')).toContainText(`luminous-stage-${preset}`);
    const stage = () => page.evaluate(async () => (await import("/test/e2e/helpers/luminous-stage-probe.mjs")).luminousStageState());
    await expect.poll(async () => (await stage()).materials.filter(value => value.name.startsWith("AutoLuminous_") && value.textureReady).length).toBe(64);
    expect((await stage()).triangles).toBe(manifest.triangleCount);
    expect((await stage()).engine).toBe("WebGPU");
    // Fixture-only lighting setup; normal MMD materials stay in their original mode.
    for (const id of ["light-intensity", "light-ambient"]) await page.locator(`#${id}`).evaluate(input => {
      input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(camera => window.mmdModokiE2e.setCameraPose(camera.position, camera.target), manifest.camera);
    if (!await page.locator("#btn-effect-add-post").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    await luminousInstanceRow(page).locator('[data-instance-field="enabled"]').uncheck();
    await ensureLuminousRadianceInstance(page);
    await setLuminousInstancePosition(page, "luminousRadianceRange", 7);
    const rc = luminousRadianceInstanceRow(page).locator('[data-instance-field="enabled"]');
    await rc.uncheck();
    async function capture(name) {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      await expect(page.locator(".toast")).toHaveCount(0);
      const png = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) }));
      let brightness = 0;
      for (let index = 0; index < png.data.length; index += 4) brightness += png.data[index] + png.data[index + 1] + png.data[index + 2];
      captures[name] = { brightness, stage: await stage(), runtime: await getLuminousInstanceRuntime(page) };
      writeFileSync(resolve(output, "report.json"), JSON.stringify(result, null, 2));
      return brightness;
    }
    if (!heavy) {
      const off = await capture("rc-off"); await rc.check();
      await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters).toBe(manifest.sourceTriangleCount);
      const on = await capture("rc-on"); expect(on).toBeGreaterThan(off + 10000);
      const morph = name => page.locator("#morph-controls .morph-slider-row").filter({ has: page.locator(`[data-morph-name="${name}"]`) }).locator('input[type="range"]');
      const beforeOff = (await getLuminousInstanceRuntime(page)).luminousRadiance.updates;
      await morph("LightOff").fill("1"); await morph("LightOff").dispatchEvent("input");
      await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.updates).toBeGreaterThan(beforeOff);
      expect(await capture("light-off")).toBeLessThan(on);
      await morph("LightOff").fill("0"); await morph("LightOff").dispatchEvent("input");
      await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters).toBe(manifest.sourceTriangleCount);
      await morph("LightUp").fill("0.25"); await morph("LightUp").dispatchEvent("input");
      expect(await capture("light-up")).toBeGreaterThan(on);
      await morph("LightUp").fill("0"); await morph("LightUp").dispatchEvent("input");
      const revision = (await getLuminousInstanceRuntime(page)).luminousRadiance.updates;
      await morph("遮蔽板スライド").fill("1"); await morph("遮蔽板スライド").dispatchEvent("input");
      await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.updates).toBeGreaterThan(revision);
      await morph("遮蔽板スライド").fill("0"); await morph("遮蔽板スライド").dispatchEvent("input");
      await page.evaluate(camera => window.mmdModokiE2e.setCameraPose(camera.position, camera.target), manifest.coveredCamera);
      await capture("under-canopy");
    } else {
      await rc.setChecked(mode !== "off");
      await luminousInstanceRow(page).locator('[data-instance-field="enabled"]').setChecked(mode === "glow-rc");
      if (mode !== "off") await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters, { timeout: 60000 }).toBe(manifest.sourceTriangleCount);
      result.beforeWarmup = { stage: await stage(), runtime: await getLuminousInstanceRuntime(page) };
      await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => requestAnimationFrame(resolve)); });
      for (const moving of [false, true]) {
        result[moving ? "moving" : "static"] = await page.evaluate(async moving =>
          (await import("/test/e2e/helpers/luminous-stage-probe.mjs")).profileLuminousStage({ frames: 90, moving }), moving);
      }
      if (process.env.MMD_LUMINOUS_STAGE_CHANGES === "1") {
        result.changingEmission = await page.evaluate(async () =>
          (await import("/test/e2e/helpers/luminous-stage-probe.mjs")).profileLuminousStage({ frames: 30, changingEmission: true }));
        if (mode !== "off") expect(result.changingEmission.geometryUpdates).toBeGreaterThanOrEqual(28);
      }
      await capture("overview");
    }
    result.runtime = await getLuminousInstanceRuntime(page);
    result.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); result.errors = errors;
    if (!heavy || mode !== "off") expect(result.runtime.luminousRadiance).toMatchObject({ triangles: manifest.triangleCount, emitters: manifest.sourceTriangleCount, error: null });
    expect(result.validation.count).toBe(0); expect(errors).toEqual([]); expect(navigations).toEqual([]);
    writeFileSync(resolve(output, "report.json"), JSON.stringify(result, null, 2));
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify(result, null, 2)); await launched.close(); }
});
