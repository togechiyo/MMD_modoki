import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const withWebm = process.env.MMD_RC_SKY_SETTINGS_WEBM === "1";
const dialog = page => page.locator('[data-popup-id="experimental-settings"]');
const section = page => dialog(page).locator('[data-experiment-section="rc-sky-occlusion"]');
const input = (page, field) => section(page).locator(`[name="rcSkyOcclusion${field}"]`);
const status = page => section(page).locator("[data-rc-sky-occlusion-status]");
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const settings = async page => (await project(page)).lighting.rcSkyOcclusion;
const keys = async page => (await project(page)).keyframes?.effectAnimations?.tracks.find(track => track.effectId === "rcSkyOcclusion");

async function open(page) {
  await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
  await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
  await expect(input(page, "Enabled")).toBeVisible();
}
async function close(page) { await dialog(page).locator(".app-menu-dialog-close").click(); }
async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
  await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}
async function history(page, operation) { await page.locator(`.app-menu-quick-button[data-menu-command="edit.${operation}"]`).click(); }
async function register(page) { await section(page).getByRole("button", { name: /キー登録|キーを更新|Register key|Update key/ }).click(); }
async function automatic(page) { await section(page).getByRole("button", { name: /^(自動範囲|Automatic volume)$/ }).click(); }
function difference(a, b) {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] - b[i + c]);
  return sum / (a.length * 0.75);
}

test("RC sky occlusion settings: GUI, singleton keys, Undo, project and backend roundtrip", async ({}, testInfo) => {
  test.setTimeout(withWebm ? 300000 : 180000);
  const launched = await launchMmdModoki(root); // No developer lighting/timeline flags.
  const report = { errors: [], consoleErrors: [], checkpoints: {}, captures: {}, webm: { requested: withWebm } };
  let page;
  try {
    launched.app.on("window", exportPage => {
      exportPage.on("pageerror", error => report.errors.push(error.stack ?? error.message));
      exportPage.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    });
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await page.locator("#info-model-select").selectOption("__camera__");
    // Use the editor camera state so project restore and the export worker use the same pose.
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    report.camera = (await project(page)).camera;
    const validation = async name => {
      const value = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      report.checkpoints[name] = value; expect(value.count).toBe(0); expect(report.errors).toEqual([]);
    };
    const capture = async name => {
      const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
      const result = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), directory);
      report.captures[name] = result; expect(result.surfaceReleased).toBe(true);
      await validation(name);
      const image = PNG.sync.read(readFileSync(result.path)); expect([image.width, image.height]).toEqual([640, 360]);
      return image.data;
    };

    await open(page);
    await expect(dialog(page).locator('[data-experiment-section="radiance-sky"]')).toHaveCount(0);
    expect(await settings(page)).toEqual({ enabled: false, strength: 0.75, minimum: 0.2, volume: null });
    await input(page, "Enabled").check();
    await expect(status(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await expect(status(page)).toHaveAttribute("data-automatic-volume", "true");
    await expect(input(page, "Size")).not.toHaveValue("");
    expect((await settings(page)).volume).toBeNull();
    await close(page);
    // Automatic bounds resolving on a later render must not invalidate this Undo snapshot.
    await history(page, "undo"); expect((await settings(page)).enabled).toBe(false);
    await history(page, "redo"); expect((await settings(page)).enabled).toBe(true);
    await open(page); await expect(status(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await input(page, "Minimum").focus(); await input(page, "Minimum").press("ArrowRight");
    expect((await settings(page)).minimum).toBe(0.21);
    await close(page); await history(page, "undo"); expect((await settings(page)).minimum).toBe(0.2);
    await history(page, "redo"); expect((await settings(page)).minimum).toBe(0.21);

    await open(page);
    for (const [field, value] of [["MinX", -12], ["MinY", -2], ["MinZ", -12], ["Size", 24]]) await input(page, field).fill(String(value));
    expect((await settings(page)).volume).toBeNull(); // Numeric values commit only on Enter.
    await input(page, "Size").press("Enter");
    const fixedVolume = { min: [-12, -2, -12], size: 24 };
    expect((await settings(page)).volume).toEqual(fixedVolume);
    await input(page, "MinX").fill("-99"); await input(page, "MinX").press("Escape");
    expect((await settings(page)).volume).toEqual(fixedVolume);
    // Numeric Escape cancels the edit, then the shared popup Escape handler closes the dialog.
    await expect(dialog(page)).not.toBeVisible();
    await history(page, "undo"); expect((await settings(page)).volume).toBeNull();
    await history(page, "redo"); expect((await settings(page)).volume).toEqual(fixedVolume);
    await open(page); await automatic(page); await close(page);
    expect((await settings(page)).volume).toBeNull();
    await history(page, "undo"); expect((await settings(page)).volume).toEqual(fixedVolume);
    await history(page, "redo"); expect((await settings(page)).volume).toBeNull();
    await open(page); await section(page).getByRole("button", { name: /範囲を再計算|Recalculate volume/ }).click();
    const recalculated = (await settings(page)).volume;
    expect(recalculated?.size).toBeGreaterThan(0); expect(recalculated?.min).toHaveLength(3);
    await close(page); await history(page, "undo"); expect((await settings(page)).volume).toBeNull();
    await history(page, "redo"); expect((await settings(page)).volume).toEqual(recalculated);
    await open(page); await automatic(page); await close(page);

    await seek(page, 0); await open(page);
    await input(page, "Strength").focus(); await input(page, "Strength").press("Home");
    await expect(input(page, "Strength")).toHaveValue("0"); await register(page); await close(page);
    await history(page, "undo"); expect((await keys(page))?.keys ?? []).toEqual([]);
    await history(page, "undo"); expect((await settings(page)).strength).toBe(0.75);
    await history(page, "redo"); expect((await settings(page)).strength).toBe(0);
    await history(page, "redo"); expect((await keys(page)).keys).toEqual([{ frame: 0, value: { enabled: true, strength: 0 } }]);
    await seek(page, 20); await open(page);
    await input(page, "Strength").focus(); await input(page, "Strength").press("End");
    await expect(input(page, "Strength")).toHaveValue("100"); await register(page); await close(page);
    await seek(page, 40); await open(page); await input(page, "Enabled").uncheck(); await register(page); await close(page);
    await seek(page, 60); await open(page); await input(page, "Enabled").check(); await register(page); await close(page);
    const expectedKeys = [
      { frame: 0, value: { enabled: true, strength: 0 } },
      { frame: 20, value: { enabled: true, strength: 1 } },
      { frame: 40, value: { enabled: false, strength: 1 } },
      { frame: 60, value: { enabled: true, strength: 1 } },
    ];
    expect((await keys(page)).keys).toEqual(expectedKeys);
    expect((await project(page)).effects.frameGraphInstances?.instances?.some(item => item.type === "rcSkyOcclusion") ?? false).toBe(false);
    await seek(page, 10); await open(page);
    await expect(input(page, "Enabled")).toBeChecked(); await expect(input(page, "Strength")).toHaveValue("50");
    await input(page, "Strength").focus(); await input(page, "Strength").press("End"); await close(page);
    await seek(page, 11); await history(page, "undo"); // Seek discarded the temporary preview.
    expect((await keys(page)).keys).toEqual(expectedKeys); expect((await keys(page)).preview).toBeUndefined();
    await open(page); await expect(input(page, "Strength")).toHaveValue("55"); await close(page);

    await seek(page, 0); const png0 = await capture("key-0");
    await seek(page, 20); await open(page); await expect(status(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 }); await close(page);
    const png20 = await capture("key-20"); report.keyImageDifference = difference(png0, png20);
    expect(report.keyImageDifference).toBeGreaterThan(0.1);
    await seek(page, 10);
    const file = testInfo.outputPath("rc-sky-project.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await menu(page, "file.saveProject"); await expect.poll(() => existsSync(file)).toBe(true);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.camera).toEqual(report.camera);
    const expectSavedState = async () => expect.poll(async () => {
      const state = await project(page);
      return { settings: state.lighting.rcSkyOcclusion, keys: state.keyframes?.effectAnimations?.tracks.find(track => track.effectId === "rcSkyOcclusion")?.keys, frame: state.scene.currentFrame };
    }).toEqual({ settings: saved.lighting.rcSkyOcclusion, keys: expectedKeys, frame: 10 });
    expect(saved.lighting.rcSkyOcclusion.volume).toBeNull();
    expect(saved.keyframes.effectAnimations.tracks.find(track => track.effectId === "rcSkyOcclusion").keys).toEqual(expectedKeys);
    await open(page); await input(page, "Minimum").focus(); await input(page, "Minimum").press("End"); await close(page);
    expect((await settings(page)).minimum).toBe(1);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await expectSavedState();
    await open(page); await expect(input(page, "Strength")).toHaveValue("50"); await expect(input(page, "Minimum")).toHaveValue("21"); await close(page);
    for (const backend of ["classic", "frameGraph"]) {
      if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="post"]').click();
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expectSavedState();
      await open(page); await expect(input(page, "Enabled")).toBeChecked(); await expect(input(page, "Strength")).toHaveValue("50");
      await expect(status(page)).toHaveAttribute("data-state", backend === "classic" ? "unsupported" : "ready", { timeout: 45000 });
      if (backend === "classic") await expect(status(page)).toContainText(/Frame Graph|WebGPU/);
      await close(page); await validation(backend);
    }
    await seek(page, 20); const restored = await capture("roundtrip-key-20");
    report.restoredDifference = difference(png20, restored); expect(report.restoredDifference).toBeLessThan(0.15);

    // Capture must prepare the newly enabled field without a viewport redraw or a ready wait.
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    await seek(page, 40); const png40 = await capture("manual-key-40-off");
    await seek(page, 60); const png60 = await capture("manual-key-60-on");
    report.manualCapture = { offDifference: difference(png0, png40), onDifference: difference(png20, png60), transitionDifference: difference(png40, png60) };
    expect(report.manualCapture.offDifference).toBeLessThan(0.15);
    expect(report.manualCapture.onDifference).toBeLessThan(0.15);
    expect(report.manualCapture.transitionDifference).toBeGreaterThan(0.1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);

    if (withWebm) {
      const webm = testInfo.outputPath("rc-sky-keys.webm");
      await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, webm);
      await menu(page, "file.webmExportSettings"); await page.locator("#webm-output-use-playback-range").uncheck();
      for (const [name, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 60]]) {
        await page.locator(`#webm-output-${name}`).fill(String(value)); await page.locator(`#webm-output-${name}`).press("Enter");
      }
      await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck();
      await page.getByRole("button", { name: /^(WebM出力|Export WebM)$/ }).click();
      await expect.poll(() => existsSync(webm) && statSync(webm).size > 1000, { timeout: 90000 }).toBe(true);
      await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
      const frames = await page.evaluate(async path => {
        const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video"), canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 360;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D context unavailable");
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
        try {
          const loaded = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error("RC sky WebM decode failed")); });
          video.src = url; await loaded;
          const result = [];
          for (const frame of [0, 20, 40, 60]) {
            const sought = new Promise(resolve => { video.onseeked = resolve; });
            video.currentTime = (frame + 0.1) / 30; await sought;
            context.drawImage(video, 0, 0); result.push(Array.from(context.getImageData(0, 0, 640, 360).data));
          }
          return result;
        } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
      }, webm);
      const references = [png0, png20, png40, png60];
      frames.forEach((pixels, index) => writeFileSync(testInfo.outputPath(`webm-frame-${index * 20}.png`),
        PNG.sync.write({ width: 640, height: 360, data: Buffer.from(pixels) })));
      report.webm = { requested: true, path: webm, frames: frames.map((frame, index) => ({ frame: index * 20, matching: difference(frame, references[index]), opposite: difference(frame, index % 2 ? png0 : png20) })) };
      for (const result of report.webm.frames) {
        expect(result.matching).toBeLessThan(result.opposite);
        // Uniformly darkened ON frames can still be closer to ON than OFF. Bound the
        // absolute error as well; ordinary video compression is about 0.4 RGB8 here.
        expect(result.matching).toBeLessThan(1);
      }
      expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
      await validation("webm");
    }
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));
    await seek(page, 40); await open(page); await expect(input(page, "Enabled")).not.toBeChecked();
    await expect(status(page)).toHaveAttribute("data-state", "off");
    await section(page).screenshot({ path: testInfo.outputPath("final-settings.png") });
    await validation("final");
  } finally {
    if (page && !page.isClosed()) {
      try { report.finalProject = await project(page); report.finalValidation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); }
      catch (error) { report.finalDiagnosticError = String(error); }
    }
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
