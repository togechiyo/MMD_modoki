import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
function colored(png, channel) {
  let count = 0;
  for (let y = 0; y < png.height * 0.8; y++) for (let x = 0; x < png.width * 0.8; x++) {
    const offset = (y * png.width + x) * 4;
    if (png.data[offset + channel] > 40 && [0, 1, 2].filter(value => value !== channel)
      .every(value => png.data[offset + channel] > png.data[offset + value] + 15)) count++;
  }
  return count;
}
function sample(png, point, channel) {
  const x = Math.round(point[0] * png.width), y = Math.round(point[1] * png.height);
  let sum = 0;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) sum += png.data[((y + dy) * png.width + x + dx) * 4 + channel];
  return sum / 169;
}

test("existing Luminous emits world-space RC light in Frame Graph", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  const errors = [], states = {};
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -20, rz: 0, camDistance: 12 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await page.locator('[data-effect-stack-row="luminous"]').count()) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => page.locator(`[data-effect-stack-control="${key}"]`);
    async function slider(key, value) {
      await control(key).evaluate((input, value) => { input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    }
    async function probe(value = {}) { return page.evaluate(async value => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState(value), value); }
    async function capture(name) {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready, null, { timeout: 60000 });
      const position = await probe();
      const path = testInfo.outputPath(`${name}.png`);
      await page.locator("#render-canvas").screenshot({ path });
      states[name] = { position, runtime: await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState()),
        validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()) };
      writeFileSync(testInfo.outputPath("report.json"), JSON.stringify({ states, errors }, null, 2));
      return PNG.sync.read(readFileSync(path));
    }
    await expect(control("luminousRadianceEnabled")).toHaveValue("0");
    await slider("luminousRadianceRange", 3);
    await slider("luminousIntensity", 0);
    const off = await capture("rc-off");
    await control("luminousRadianceEnabled").selectOption("1");
    const on = await capture("rc-on");
    await slider("luminousIntensity", 10);
    await capture("glow-on-rc-on");
    await slider("luminousIntensity", 0);
    const glowOff = await capture("glow-off-rc-on");
    expect(states["glow-off-rc-on"].runtime.luminousRadiance.emitters).toBeGreaterThan(0);
    expect(colored(glowOff, 0) - colored(off, 0)).toBeGreaterThan(100);
    await slider("luminousRadianceStrength", 0);
    await capture("zero-strength");
    await slider("luminousRadianceStrength", 12);
    const resumed = await capture("strength-restored");
    expect(colored(resumed, 0) - colored(off, 0)).toBeGreaterThan(100);
    await probe({ color: [0.03, 0.08, 1] });
    const blue = await capture("blue");
    expect(colored(blue, 2)).toBeGreaterThan(100);
    await probe({ emitter: false });
    const dark = await capture("emitter-off");
    expect(colored(dark, 2)).toBeLessThan(colored(blue, 2));
    await probe({ emitter: true });
    for (const [key, value] of Object.entries({ tx: 1, ty: 0.5, tz: 0, rx: -25, ry: 0, camDistance: 7 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    const blocked = await capture("offscreen-blue-blocked");
    expect(states["offscreen-blue-blocked"].position.emitter[0]).toBeLessThan(0);
    expect(colored(blocked, 2)).toBeGreaterThan(100);
    const revision = states["offscreen-blue-blocked"].runtime.luminousRadiance.updates;
    await probe({ blocker: false });
    const unblocked = await capture("offscreen-blue-unblocked");
    const point = states["offscreen-blue-unblocked"].position.floor;
    states.shadow = { blocked: sample(blocked, point, 2), unblocked: sample(unblocked, point, 2) };
    expect(states["offscreen-blue-unblocked"].runtime.luminousRadiance.updates).toBeGreaterThan(revision);
    expect(states.shadow.unblocked - states.shadow.blocked).toBeGreaterThan(5);
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="gamma"]').click();
    const gamma = page.locator('[data-effect-stack-row="gamma"]');
    const gammaBox = await gamma.boundingBox();
    if (!gammaBox) throw new Error("Gamma row has no bounds");
    await page.locator('[data-effect-stack-drag="luminous"]').dragTo(gamma, { targetPosition: { x: 20, y: gammaBox.height - 2 } });
    const reordered = await capture("reordered-with-gamma");
    expect(colored(reordered, 2)).toBeGreaterThan(100);
    await control("luminousRadianceEnabled").selectOption("0");
    const offscreenOff = await capture("offscreen-rc-off");
    expect(colored(offscreenOff, 2)).toBeLessThan(20);
    await control("luminousRadianceEnabled").selectOption("1");
    await probe({ position: [-3, 2, -0.5] });
    await capture("moved-emitter");
    const output = testInfo.outputPath("export"); mkdirSync(output, { recursive: true });
    await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
    expect(colored(PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))), 2)).toBeGreaterThan(100);
    await page.locator('[data-effect-stack-toggle="luminous"]').uncheck();
    const stackOff = await capture("stack-off");
    expect(colored(stackOff, 2)).toBeLessThan(20);
    await page.locator('[data-effect-stack-toggle="luminous"]').check();
    const restored = await capture("stack-restored");
    expect(colored(restored, 2)).toBeGreaterThan(100);
    for (const state of Object.values(states)) if (state.validation) expect(state.validation.count).toBe(0);
    expect(errors).toEqual([]);
    expect(on.width).toBe(glowOff.width);
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify({ states, errors }, null, 2));
  } finally { await launched.close(); }
});

test("Luminous materials illuminate together with independent colors and additive mixing", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  const errors = [], states = {};
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe({ multicolor: true }));
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await page.locator('[data-effect-stack-row="luminous"]').count()) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => page.locator(`[data-effect-stack-control="${key}"]`);
    for (const [key, value] of [["luminousRadianceRange", 3], ["luminousIntensity", 0]]) {
      await control(key).evaluate((input, value) => { input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    }
    async function capture(name, value = {}) {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const position = await page.evaluate(async value => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState(value), value);
      const path = testInfo.outputPath(`${name}.png`);
      await page.locator("#render-canvas").screenshot({ path });
      const png = PNG.sync.read(readFileSync(path));
      const rgb = point => [0, 1, 2].map(channel => sample(png, point, channel));
      states[name] = { position, floor: rgb(position.floor), left: rgb(position.floorLeft), right: rgb(position.floorRight),
        runtime: await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState()),
        validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()) };
      writeFileSync(testInfo.outputPath("multicolor-report.json"), JSON.stringify({ states, errors }, null, 2));
      return states[name];
    }
    const off = await capture("multicolor-off", { blocker: false });
    await control("luminousRadianceEnabled").selectOption("1");
    const mixed = await capture("red-blue-mixed");
    expect(mixed.runtime.luminousRadiance.emitters).toBe(24);
    expect(mixed.left[0]).toBeGreaterThan(mixed.left[2] + 10);
    expect(mixed.right[2]).toBeGreaterThan(mixed.right[0] + 10);
    expect(mixed.floor[0]).toBeGreaterThan(off.floor[0] + 10);
    expect(mixed.floor[2]).toBeGreaterThan(off.floor[2] + 10);
    const red = await capture("two-red", { secondColor: [1, 0, 0] });
    const blue = await capture("two-blue", { color: [0, 0, 1], secondColor: [0, 0, 1] });
    expect(mixed.floor[2]).toBeGreaterThan(red.floor[2] + 10);
    expect(mixed.floor[0]).toBeGreaterThan(blue.floor[0] + 10);
    const green = await capture("red-green-mixed", { color: [1, 0, 0], secondColor: [0, 1, 0] });
    expect(green.floor[1]).toBeGreaterThan(mixed.floor[1] + 10);
    expect(Math.abs(green.floor[0] - mixed.floor[0])).toBeLessThan(3);
    expect(mixed.floor[2]).toBeGreaterThan(green.floor[2] + 10);
    const hidden = await capture("second-emitter-hidden", { secondEmitter: false });
    expect(hidden.runtime.luminousRadiance.emitters).toBe(12);
    expect(hidden.floor[1]).toBeLessThan(green.floor[1]);
    const restored = await capture("multicolor-restored", { secondEmitter: true, secondColor: [0, 0, 1] });
    expect(restored.runtime.luminousRadiance.emitters).toBe(24);
    expect(restored.floor[0]).toBeGreaterThan(off.floor[0] + 10);
    expect(restored.floor[2]).toBeGreaterThan(off.floor[2] + 10);
    const output = testInfo.outputPath("export"); mkdirSync(output, { recursive: true });
    await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
    const exported = PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png")));
    const center = [0, 1, 2].map(channel => sample(exported, restored.position.floor, channel));
    expect(center[0]).toBeGreaterThan(center[1] + 10);
    expect(center[2]).toBeGreaterThan(center[1] + 10);
    states.export = { center };
    for (const state of Object.values(states)) if (state.validation) expect(state.validation.count).toBe(0);
    expect(errors).toEqual([]);
    writeFileSync(testInfo.outputPath("multicolor-report.json"), JSON.stringify({ states, errors }, null, 2));
  } finally { await launched.close(); }
});

test("RC controls survive project load, master toggle and backend changes", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();
    const control = key => page.locator(`[data-effect-stack-control="${key}"]`);
    await expect(control("luminousRadianceEnabled")).toHaveValue("0");
    await control("luminousRadianceEnabled").selectOption("1");
    for (const [key, value] of [["luminousRadianceStrength", 30], ["luminousRadianceRange", 3], ["luminousRadius", 80]]) {
      await control(key).evaluate((input, value) => { input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    }
    const settings = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.luminousRadiance);
    expect(settings).toMatchObject({ enabled: true, strength: 2.4 });
    expect(settings.range).toBeCloseTo(3.97);
    const menu = async command => {
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator(`[data-menu-command="${command}"]`).click();
    };
    const saved = testInfo.outputPath("rc-project.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
    await menu("file.saveProject"); await expect.poll(() => existsSync(saved)).toBe(true);
    expect(JSON.parse(readFileSync(saved, "utf8")).effects.luminousRadiance).toEqual(settings);
    await control("luminousRadianceEnabled").selectOption("0");
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
    await menu("file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await expect(control("luminousRadianceEnabled")).toHaveValue("1");
    await expect(control("luminousRadianceStrength")).toHaveValue("30");
    await expect(control("luminousRadianceRange")).toHaveValue("3");
    await page.locator("#btn-effect-toggle-framegraph").click();
    await page.waitForFunction(() => !window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated);
    await page.locator("#btn-effect-toggle-framegraph").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await page.waitForFunction(() => /Project restored|Project restore failed/.test(document.querySelector("#status-text")?.textContent ?? ""));
      expect(await page.locator("#status-text").textContent(), await page.locator("body").innerText()).toContain("Project restored after Runtime change");
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.luminousRadiance)).toEqual(settings);
    }
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    const row = page.locator('[data-effect-stack-row="luminous"]');
    if (!await control("luminousRadianceEnabled").isVisible()) await row.locator('[data-effect-stack-item="luminous"]').click();
    await expect(control("luminousRadianceEnabled")).toHaveValue("1");
    await expect(control("luminousRadianceStrength")).toHaveValue("30");
    await expect(control("luminousRadius")).toHaveValue("80");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    await row.screenshot({ path: testInfo.outputPath("luminous-controls.png") });
  } finally { await launched.close(); }
});
