import { expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";

async function fileDialog(page, command, popup) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
  const dialog = page.locator(`[data-popup-id="${popup}"]`);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function number(dialog, id, value) {
  const input = dialog.locator("#" + id);
  await input.fill(String(value)); await input.press("Enter");
  await expect(input).toHaveValue(String(value));
}

async function size(dialog, prefix, width, height) {
  await number(dialog, prefix + "-output-width", width);
  await number(dialog, prefix + "-output-height", height);
}

// PNG sequences share the export range and FPS with the video settings dialog.
async function videoSettings(page, { startFrame, endFrame, fps }) {
  const dialog = await fileDialog(page, "file.webmExportSettings", "webm-export");
  await dialog.locator("#webm-output-use-playback-range").uncheck();
  await number(dialog, "webm-output-start-frame", startFrame);
  await number(dialog, "webm-output-end-frame", endFrame);
  await dialog.locator("#webm-output-fps").selectOption(String(fps));
  return dialog;
}

function readPng(path, width, height) {
  const image = PNG.sync.read(readFileSync(path));
  expect([image.width, image.height]).toEqual([width, height]);
  return image;
}

export async function exportRcPng(launched, page, filePath, { width = 640, height = 360 } = {}) {
  // The application's E2E save picker directs these GUI exports to this run's userData.
  const directory = await launched.app.evaluate(({ app }) => app.getPath("userData"));
  const names = () => readdirSync(directory).filter(name => name.startsWith(`mmd_capture_${width}x${height}_`) && name.endsWith(".png"));
  const before = new Map(names().map(name => [name, statSync(resolve(directory, name)).mtimeMs]));
  const dialog = await fileDialog(page, "file.exportPng", "png-export");
  await size(dialog, "png", width, height);
  await dialog.locator(".popup-form-button-primary").click();
  let saved;
  await expect.poll(() => {
    saved = names().find(name => before.get(name) !== statSync(resolve(directory, name)).mtimeMs);
    return Boolean(saved);
  }, { timeout: 90000 }).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
  mkdirSync(dirname(filePath), { recursive: true });
  copyFileSync(resolve(directory, saved), filePath);
  return readPng(filePath, width, height);
}

export async function exportRcPngSequence(launched, page, directory, { startFrame, endFrame, width = 640, height = 360, fps = 30 }) {
  mkdirSync(directory, { recursive: true });
  const before = new Set(readdirSync(directory));
  await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, directory);
  const settings = await videoSettings(page, { startFrame, endFrame, fps });
  await settings.locator(".popup-form-button-secondary").last().click();
  const dialog = await fileDialog(page, "file.exportPngSequence", "png-sequence-export");
  await size(dialog, "png", width, height);
  await dialog.locator(".popup-form-button-primary").click();
  const prefix = `mmd_seq_${width}x${height}`;
  let files = [];
  await expect.poll(() => {
    const folder = readdirSync(directory).find(name => !before.has(name) && name.startsWith(prefix + "_"));
    if (!folder) return 0;
    const path = resolve(directory, folder);
    files = readdirSync(path).filter(name => name.endsWith(".png")).sort().map(name => resolve(path, name));
    return files.length;
  }, { timeout: 120000 }).toBe(endFrame - startFrame + 1);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
  return files.map((path, index) => {
    const frame = startFrame + index;
    expect(path.endsWith(`${prefix}_${String(frame).padStart(Math.max(4, String(endFrame).length), "0")}.png`)).toBe(true);
    return { path, image: readPng(path, width, height) };
  });
}

export async function exportRcWebm(launched, page, filePath, { startFrame, endFrame, width = 640, height = 360, fps = 30 }) {
  mkdirSync(dirname(filePath), { recursive: true });
  expect(existsSync(filePath)).toBe(false);
  await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, filePath);
  const dialog = await videoSettings(page, { startFrame, endFrame, fps });
  await size(dialog, "webm", width, height);
  await dialog.locator("#webm-output-include-audio").uncheck();
  // Each test runs one GUI job at a time in its own editor. Subscribe before
  // clicking so a fast startup failure is visible even when no file was opened.
  const job = await page.evaluateHandle(() => {
    const state = { result: null, progress: null };
    const offProgress = window.electronAPI.onWebmExportProgress(event => { state.progress = event; });
    const offResult = window.electronAPI.onWebmExportResult(event => { state.result = event; });
    state.stop = () => { offProgress(); offResult(); };
    return state;
  });
  try {
    await dialog.locator(".popup-form-button-primary").click();
    try { await page.waitForFunction(state => Boolean(state.result), job, { timeout: 120000 }); }
    catch (error) { throw new Error(`WebM job did not finish; last progress: ${JSON.stringify(await job.evaluate(state => state.progress))}`, { cause: error }); }
    const { result, progress } = await job.evaluate(state => ({ result: state.result, progress: state.progress }));
    expect(result, JSON.stringify({ result, progress })).toMatchObject({ status: "completed", filePath });
    expect(statSync(filePath).size).toBeGreaterThan(0);
  } finally {
    await job.evaluate(state => state.stop()); await job.dispose();
  }
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 90000 });
}

export async function decodeRcWebm(page, filePath, { startFrame, frames, width = 640, height = 360, fps = 30 }) {
  const shots = await page.evaluate(async ({ filePath, startFrame, frames, width, height, fps }) => {
    const bytes = await window.electronAPI.readBinaryFile(filePath);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    const video = document.createElement("video"), canvas = document.createElement("canvas");
    try {
      await new Promise((done, fail) => { video.onloadeddata = done; video.onerror = () => fail(Error("WebM decode failed")); video.src = url; });
      if (video.videoWidth !== width || video.videoHeight !== height) throw Error("Unexpected WebM dimensions");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"), images = [];
      for (const frame of frames) {
        // Project frames are always 1/30 sec; sample just inside the encoded frame.
        const time = (frame - startFrame) / 30 + 0.1 / fps;
        if (time >= video.duration) throw Error("Requested frame lies outside the WebM");
        await new Promise(done => { video.onseeked = done; video.currentTime = time; });
        context.drawImage(video, 0, 0);
        images.push(canvas.toDataURL("image/png").split(",")[1]);
      }
      return images;
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }, { filePath, startFrame, frames, width, height, fps });
  return shots.map(data => PNG.sync.read(Buffer.from(data, "base64")));
}
