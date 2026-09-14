import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function selectGamma(page) {
  // Camera mode has one spacer row after Camera.
  const index = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().findIndex(track => track.category === "gamma"));
  expect(index).toBeGreaterThan(0);
  await page.locator("#timeline-labels").evaluate(element => { element.scrollTop = 0; });
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 20 + (index + 1) * 18 + 9 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack)).toEqual({ name: "Gamma", category: "gamma" });
}

for (const backend of ["frameGraph", "classic"]) {
test(`camera gamma keys: ${backend} registration, playback, save and output`, async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic") {
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.locator("#btn-toolbar-mode-toggle").click();
    await selectGamma(page);
    await expect(page.locator("#gamma-key-controls")).toBeVisible();
    await expect(page.locator("#gamma-key-controls label")).toHaveText("ガンマ");
    const enabled = page.locator("#gamma-key-enabled");
    const slider = page.locator("#gamma-key-value");
    const savedKeys = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.gammaAnimation);
    const add = async (frame, on, offset) => {
      await seek(page, frame);
      await enabled.setChecked(on);
      await slider.fill(String(offset));
      await slider.dispatchEvent("input");
      await page.locator("#btn-kf-add").click();
    };
    await add(0, true, 100);
    await add(20, false, -100);
    await add(40, true, 0);
    expect(await savedKeys()).toMatchObject({ frameNumbers: [0, 20, 40], enabled: [true, false, true], gammas: [0.5, 2, 1] });
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await savedKeys()).frameNumbers).toEqual([0, 20]);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect((await savedKeys()).frameNumbers).toEqual([0, 20, 40]);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(page, 10);
    await expect(slider).toHaveValue("0");
    await expect(enabled).toBeChecked();
    await seek(page, 19);
    await expect(enabled).toBeChecked();
    await seek(page, 20);
    await expect(enabled).not.toBeChecked();
    await expect(slider).toHaveValue("-100");
    await seek(page, 30);
    await expect(slider).toHaveValue("-50");
    await expect(enabled).not.toBeChecked();
    await seek(page, 40);
    await expect(enabled).toBeChecked();
    await seek(page, 0);
    await expect(slider).toHaveValue("100");
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await page.screenshot({ path: testInfo.outputPath("gamma-key-ui.png") });

    // Copy/paste and delete share normal command history.
    await page.locator("#btn-kf-copy").click();
    await seek(page, 60);
    await page.locator("#btn-kf-paste").click();
    expect((await savedKeys()).frameNumbers).toContain(60);
    await page.locator("#btn-kf-delete").click();
    expect((await savedKeys()).frameNumbers).not.toContain(60);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await savedKeys()).frameNumbers).toContain(60);

    const path = testInfo.outputPath("gamma-project.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
    await menu(page, "file.saveProject");
    await expect.poll(() => existsSync(path)).toBe(true);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.keyframes.gammaAnimation.frameNumbers).toContain(60);
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, path);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await selectGamma(page);
    await seek(page, 20);
    await expect(enabled).not.toBeChecked();
    await expect(slider).toHaveValue("-100");
    expect(await savedKeys()).toEqual(saved.keyframes.gammaAnimation);

    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeDisabled();
    await expect(enabled).toBeDisabled();
    await expect(page.locator("#btn-kf-add")).toBeDisabled();
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeEnabled();
    for (const [locale, label] of [["en", "Gamma"], ["zh-Hant", "伽瑪"], ["zh-Hans", "伽马"], ["ko", "감마"], ["ja", "ガンマ"]]) {
      await page.locator("#toolbar-locale-select").selectOption(locale);
      await expect(page.locator("#gamma-key-controls label")).toHaveText(label);
    }

    const pngPaths = [];
    for (const frame of [0, 20, 40]) {
      await seek(page, frame);
      const output = testInfo.outputPath(`png-${frame}`);
      mkdirSync(output, { recursive: true });
      await page.evaluate(({ output, width, height }) => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, width, height), { output, width: 640, height: 360 });
      pngPaths.push(resolve(output, "single_rgba_surface_e2e.png"));
    }
    const pngs = pngPaths.map(path => PNG.sync.read(readFileSync(path)).data);
    const difference = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
      return sum / (a.length * 0.75);
    };
    expect(difference(pngs[0], pngs[1])).toBeGreaterThan(1);
    expect(difference(pngs[1], pngs[2])).toBeLessThan(0.05);

    const webmPath = testInfo.outputPath("gamma.webm");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, webmPath);
    await menu(page, "file.webmExportSettings");
    await page.locator("#webm-output-use-playback-range").uncheck();
    for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 40]]) {
      await page.locator(`#webm-output-${id}`).fill(String(value));
      await page.locator(`#webm-output-${id}`).press("Enter");
    }
    await page.locator("#webm-output-fps").selectOption("30");
    await page.locator("#webm-output-include-audio").uncheck();
    await page.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1000, { timeout: 60000 }).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    const videoFrames = await page.evaluate(async path => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      try {
        const loaded = new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () => reject(new Error("Gamma WebM decode failed"));
        });
        video.src = url;
        await loaded;
        const frames = [];
        for (const frame of [0, 20, 40]) {
          const time = (frame + 0.1) / 30;
          const seeked = new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }));
          video.currentTime = time;
          await seeked;
          context.drawImage(video, 0, 0, 640, 360);
          frames.push(Array.from(context.getImageData(0, 0, 640, 360).data));
        }
        return frames;
      } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
      }
    }, webmPath);
    const report = videoFrames.map((frame, index) => ({ frame: [0, 20, 40][index], matchingPngDifference: difference(frame, pngs[index]), oppositePngDifference: difference(frame, pngs[index === 0 ? 1 : 0]) }));
    writeFileSync(testInfo.outputPath("gamma-output-comparison.json"), JSON.stringify(report, null, 2));
    for (const item of report) expect(item.matchingPngDifference).toBeLessThan(item.oppositePngDifference);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
}
