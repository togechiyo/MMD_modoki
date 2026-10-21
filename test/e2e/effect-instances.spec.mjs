import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
  await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}
const difference = (a, b) => a.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0) / (a.length * 0.75);

test("Gamma only with AA off, individual OFF and master resource release", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false; project.viewport.antialiasEnabled = false;
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    const capture = async name => {
      const dir = testInfo.outputPath(name); mkdirSync(dir, { recursive: true });
      await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 640, 360), dir);
      return PNG.sync.read(readFileSync(resolve(dir, "single_rgba_surface_e2e.png"))).data;
    };
    const clean = await capture("clean");
    await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="gamma"]').click();
    const row = page.locator("[data-effect-instance-row]");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const neutral = await capture("neutral");
    await row.locator('[data-instance-field="gamma"]').fill("0"); await row.locator('[data-instance-field="gamma"]').dispatchEvent("input"); await row.locator('[data-instance-field="gamma"]').dispatchEvent("change");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    expect(difference(clean, await capture("gamma"))).toBeGreaterThan(0.2);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    await page.locator("#btn-effect-toggle-framegraph").click();
    expect(difference(clean, await capture("master-off"))).toBeLessThan(0.15);
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances)).toEqual(saved);
    await page.locator("#btn-effect-toggle-framegraph").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    await row.locator('[data-instance-field="enabled"]').uncheck();
    const off = await capture("individual-off");
    // An allocated FrameGraph uses an intermediate scene texture even when its Gamma task is OFF.
    expect(difference(neutral, off)).toBeLessThan(0.15);
    expect(difference(clean, off)).toBeLessThan(1);
    expect(await row.locator('[data-instance-field="gamma"]').inputValue()).toBe("0");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});

test("Gamma instances: separate keys, lifecycle history, stack order, project and output", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], comparisons: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.lighting.shadowEnabled = false;
      state.viewport.groundVisible = true; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    const tab = page.locator('[data-effect-tab="post"]');
    if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    const add = async type => {
      await page.locator("#btn-effect-add-post").click();
      await page.locator(`[data-effect-add-post="${type}"]`).click();
    };
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    await add("gamma");
    const a = (await state()).instances[0].instanceId;
    await add("bloom"); await add("gamma");
    const b = (await state()).instances[1].instanceId;
    expect((await state()).order).toEqual([a, "bloom", b]);
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().version)).toBe(2);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const select = async id => { await row(id).locator('[data-instance-action="select"]').click(); await expect(page.locator("#effect-key-controls")).toBeVisible(); };
    await row(b).locator(".range-number-input").fill("25");
    await row(b).locator(".range-number-input").press("Enter");
    const bValue = (await state()).instances[1].settings.gamma;
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await state()).instances[1].settings.gamma).toBe(1);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await state()).instances.map(item => item.instanceId)).toEqual([a]);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect((await state()).instances[1].instanceId).toBe(b);
    expect((await state()).instances[1].settings.gamma).toBe(bValue);
    await select(a);
    const slider = page.locator("#effect-key-value");
    for (const [frame, value] of [[0, 100], [20, -100]]) {
      await seek(page, frame); await slider.fill(String(value)); await slider.dispatchEvent("input");
      await page.locator("#effect-key-enabled").setChecked(frame > 0); await page.locator("#btn-kf-add").click();
    }
    const savedA = (await state()).instances.find(item => item.instanceId === a).animation;
    expect(savedA.tracks[0].keys.map(key => key.frame)).toEqual([0, 20]);
    expect((await state()).instances.find(item => item.instanceId === b).settings.gamma).toBe(bValue);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(page, 10); await expect(slider).toHaveValue("0");
    await expect(row(a).locator(".range-number-input")).toHaveValue("50");
    await expect(page.locator("#effect-key-enabled")).not.toBeChecked();
    await seek(page, 20); await expect(page.locator("#effect-key-enabled")).toBeChecked();
    await seek(page, 0); await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeDisabled();
    await expect(row(a).locator('[data-instance-action="duplicate"]')).toBeDisabled();
    await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(12);
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeEnabled();
    await seek(page, 0); await select(a); await page.locator("#btn-kf-copy").click();
    await select(b); await seek(page, 40); await page.locator("#btn-kf-paste").click();
    expect((await state()).instances.find(item => item.instanceId === b).animation.tracks[0].keys[0].value.gamma).toBe(0.5);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await state()).instances.find(item => item.instanceId === b).animation.tracks[0].keys).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await row(a).locator('[data-instance-action="duplicate"]').click();
    const c = (await state()).instances.find(item => ![a, b].includes(item.instanceId)).instanceId;
    expect((await state()).instances.find(item => item.instanceId === c).animation.tracks[0].keys).toEqual(savedA.tracks[0].keys);
    await row(c).locator('[data-instance-action="delete"]').click();
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await state()).instances.some(item => item.instanceId === c)).toBe(true);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    await row(a).locator('[data-instance-field="label"]').fill("Gamma A");
    await row(a).locator('[data-instance-field="label"]').press("Enter");
    await row(a).locator('[data-instance-field="label"]').blur();
    await select(a); await expect(page.locator("[data-effect-key-label]")).toHaveText("Gamma A");
    await row(a).locator('[data-instance-action="suspend"]').click();
    await expect(page.locator("[data-effect-key-state]")).toContainText("スタックから外れています");
    await row(a).locator('[data-instance-action="resume"]').click();
    await row(a).locator('[data-instance-action="down"]').click();
    await row(a).locator('[data-instance-action="down"]').click();
    expect((await state()).order).toEqual([a, "bloom", b]);
    const capture = async name => {
      const output = testInfo.outputPath(name); mkdirSync(output, { recursive: true });
      await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
      return PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data;
    };
    await seek(page, 0); const png0 = await capture("frame-0");
    await seek(page, 20); const png20 = await capture("frame-20");
    await select(a); await seek(page, 10); await slider.fill("17"); await slider.dispatchEvent("input");
    const withPreview = await capture("preview-export");
    await seek(page, 11); await seek(page, 10);
    const withoutPreview = await capture("authored-export");
    expect(difference(withPreview, withoutPreview)).toBeLessThan(0.05);
    await seek(page, 20);
    expect(difference(png0, png20)).toBeGreaterThan(0.2);
    await row(b).locator('[data-instance-action="down"]').click();
    expect((await state()).order).toEqual([a, b, "bloom"]);
    const reordered = await capture("reordered");
    report.comparisons.push({ frameDifference: difference(png0, png20), orderDifference: difference(png20, reordered) });
    expect(difference(png20, reordered)).toBeGreaterThan(0.02);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    const projectPath = testInfo.outputPath("instances.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
    await menu(page, "file.saveProject"); await expect.poll(() => existsSync(projectPath)).toBe(true);
    const saved = JSON.parse(readFileSync(projectPath, "utf8"));
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, projectPath);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    expect(await state()).toEqual(saved.effects.frameGraphInstances);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect.poll(state).toEqual(saved.effects.frameGraphInstances);
    }
    await seek(page, 20); const restored = await capture("restored");
    expect(difference(png20, restored)).toBeLessThan(0.15);
    const webmPath = testInfo.outputPath("instances.webm");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, webmPath);
    await menu(page, "file.webmExportSettings");
    await page.locator("#webm-output-use-playback-range").uncheck();
    for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 20]]) {
      await page.locator(`#webm-output-${id}`).fill(String(value)); await page.locator(`#webm-output-${id}`).press("Enter");
    }
    await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck();
    await page.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1000, { timeout: 60000 }).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    const frames = await page.evaluate(async path => {
      const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video"), canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext("2d", { willReadFrequently: true }), url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      try {
        const loaded = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error("WebM decode failed")); });
        video.src = url; await loaded;
        const result = [];
        for (const frame of [0, 20]) {
          const sought = new Promise(resolve => { video.onseeked = resolve; });
          video.currentTime = (frame + 0.1) / 30; await sought;
          context.drawImage(video, 0, 0); result.push(Array.from(context.getImageData(0, 0, 640, 360).data));
        }
        return result;
      } finally { URL.revokeObjectURL(url); }
    }, webmPath);
    report.video = frames.map((frame, index) => ({ matching: difference(frame, index ? png20 : png0), opposite: difference(frame, index ? png0 : png20) }));
    for (const result of report.video) expect(result.matching).toBeLessThan(result.opposite);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    await select(a);
    for (const locale of ["en", "zh-Hant", "zh-Hans", "ko", "ja"]) {
      await page.locator("#toolbar-locale-select").selectOption(locale);
      await expect(row(a).locator('[data-instance-field="label"]')).toHaveValue("Gamma A");
      expect(await row(a).locator('[data-instance-action="delete"]').getAttribute("aria-label")).not.toContain("effect.instance");
    }
    await page.screenshot({ path: testInfo.outputPath("final-ui.png") });
  } finally {
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
