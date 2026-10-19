import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { createMedia } from "../fixtures/background-media/create.mjs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

async function menuCommand(page, command) {
  const item = page.locator(`.app-menu-item[data-menu-command="${command}"]`);
  await page.locator(".app-menu-group", { has: item }).locator(".app-menu-trigger").click();
  await item.click();
}

test("dense bone selections keep menus, correction, and undo usable", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/body-source.pmx"));
    const count = 8248, total = count * 3;
    await page.evaluate(async count => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.keyframes.modelAnimations[0].animation = {
        name: "Synthetic dense bone motion", boneTracks: [], morphTracks: [],
        movableBoneTracks: ["センター", "左足ＩＫ", "右足ＩＫ"].map(name => ({
          name, frameNumbers: Array.from({ length: count }, (_, i) => i),
          positions: Array.from({ length: count * 3 }, (_, i) => i % 3 === 0 ? Math.floor(i / 3) / 10000 : 0),
          rotations: Array.from({ length: count * 4 }, (_, i) => i % 4 === 3 ? 1 : 0),
          positionInterpolations: Array(count * 12).fill(20), rotationInterpolations: Array(count * 4).fill(20),
          physicsToggles: Array(count).fill(1),
        })),
        propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] },
      };
      await window.mmdModokiE2e.importProjectState(state);
    }, count);
    await menuCommand(page, "edit.selectAllBoneKeys");
    expect(await page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys.length)).toBe(total);
    await menuCommand(page, "edit.correctBonePosition");
    const dialog = page.locator('[data-popup-id="keyframe-correction-bone"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象 ${total} キー / 変更 0 キー`, { exact: false })).toBeVisible();
    await dialog.locator('[data-correction-channel="position-x"][data-correction-operation="add"]').fill("1");
    await expect(dialog.getByText(`対象 ${total} キー / 変更 ${total} キー`, { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "適用", exact: true }).click();
    await expect(dialog).toBeHidden();
    const firstX = () => page.evaluate(() => {
      const track = window.mmdModokiE2e.exportProjectState().keyframes.modelAnimations[0].animation.movableBoneTracks[0];
      if (Array.isArray(track.positions)) return track.positions[0];
      const bytes = Uint8Array.from(atob(track.positions.data), c => c.charCodeAt(0));
      return new DataView(bytes.buffer).getFloat32(0, true);
    });
    expect(await firstX()).toBe(1);
    await menuCommand(page, "edit.undo"); expect(await firstX()).toBe(0);
    await menuCommand(page, "edit.redo"); expect(await firstX()).toBe(1);
    await menuCommand(page, "edit.correctBonePosition");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

async function exportRestoredSky(page, directory, prefix, video) {
  await page.evaluate(async ({ directory, prefix, video }) => {
    const api = window.electronAPI;
    let remove;
    const completed = new Promise((done, fail) => {
      remove = video ? api.onWebmExportResult(result => result.status === "completed" ? done() : fail(new Error(JSON.stringify(result))))
        : api.onPngSequenceExportProgress(progress => { if (progress.total > 0 && progress.saved === progress.total) done(); });
    });
    try {
      const request = { project: window.mmdModokiE2e.exportProjectState(), outputWidth: 160, outputHeight: 90,
        startFrame: 0, endFrame: 2, fps: 30,
        ...(video ? { outputFilePath: `${directory}/${prefix}.webm`, includeAudio: false,
          preferredVideoCodec: "vp8", captureMode: "rgba-surface" }
          : { outputDirectoryPath: directory, prefix, step: 1, precision: 1, transparentBackground: false }) };
      const result = await (video ? api.startWebmExportWindow(request) : api.startPngSequenceExportWindow(request));
      if (!result?.jobId) throw new Error("Export did not start");
      await completed;
    } finally { remove(); }
  }, { directory, prefix, video });
  const path = resolve(directory, video ? `${prefix}.webm` : `${prefix}_0000.png`);
  await expect.poll(() => existsSync(path), { timeout: 60000 }).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
  return path;
}

async function sampleOutput(page, path, video) {
  if (!video) {
    const png = PNG.sync.read(readFileSync(path)), i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
    return [...png.data.subarray(i, i + 4)];
  }
  return page.evaluate(async path => {
    const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video");
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    try {
      await new Promise((done, fail) => { video.onloadeddata = done; video.onerror = () => fail(new Error("Decode failed")); video.src = url; });
      await new Promise(done => { video.onseeked = done; video.currentTime = 0.001; });
      const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext("2d"); context.drawImage(video, 0, 0, 16, 16);
      return [...context.getImageData(8, 8, 1, 1).data];
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }, path);
}

for (const backend of ["classic", "frameGraph"]) test(`hidden background media preserves sky in project and outputs (${backend})`, async ({}, testInfo) => {
  test.setTimeout(180000);
  mkdirSync(testInfo.outputDir, { recursive: true });
  const launched = await launchMmdModoki(root), report = [];
  try {
    const page = await launched.app.firstWindow(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
    await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    for (const mediaVideo of [false, true]) {
      const path = await createMedia(page, launched.tempDir, mediaVideo);
      const restored = await page.evaluate(async ({ path, mediaVideo }) => {
        const state = window.mmdModokiE2e.exportProjectState();
        Object.assign(state.viewport, { groundVisible: false, skydomeVisible: true, backgroundDisplayMode: "black",
          backgroundImagePath: mediaVideo ? null : path, backgroundVideoPath: mediaVideo ? path : null,
          backgroundMediaVisible: false, skydomeBackground: { mode: mediaVideo ? "gradient" : "solid",
            topColor: { r: 0, g: 1, b: 0 }, bottomColor: { r: 0, g: 0.3, b: 0 }, brightness: 1 } });
        state.physics.enabled = false;
        state.effects.gamma = 1.2; state.effects.glowEnabled = false;
        state.effects.frameGraphPostEnabled = true;
        state.effects.frameGraphPostStack = [{ id: "gamma", enabled: true }];
        const result = await window.mmdModokiE2e.importProjectState(state);
        return { warnings: result.warnings, viewport: window.mmdModokiE2e.exportProjectState().viewport };
      }, { path, mediaVideo });
      expect(restored.warnings).toEqual([]);
      expect(restored.viewport.skydomeVisible).toBe(true);
      expect(restored.viewport.backgroundMediaVisible).toBe(false);
      const command = page.locator('[data-menu-command="view.toggleSkydome"]');
      await page.locator(".app-menu-group", { has: command }).locator(".app-menu-trigger").click();
      await expect(command).toHaveAttribute("aria-checked", "true"); await page.keyboard.press("Escape");
      for (const outputVideo of [false, true]) {
        const prefix = `${mediaVideo ? "video" : "image"}-${outputVideo ? "webm" : "png"}`;
        const file = await exportRestoredSky(page, testInfo.outputDir, prefix, outputVideo);
        const rgba = await sampleOutput(page, file, outputVideo);
        const pngFrames = outputVideo ? undefined : await Promise.all([0, 1, 2].map(frame =>
          sampleOutput(page, resolve(testInfo.outputDir, `${prefix}_${String(frame).padStart(4, "0")}.png`), false)));
        report.push({ backend, mediaVideo, outputVideo, rgba, pngFrames });
        writeFileSync(testInfo.outputPath("sky-report.json"), JSON.stringify(report, null, 2));
        expect(rgba[1], JSON.stringify(rgba)).toBeGreaterThan(rgba[0] + 50);
        expect(rgba[1], JSON.stringify(rgba)).toBeGreaterThan(rgba[2] + 50);
        expect(rgba[3]).toBe(255);
        for (const pixel of pngFrames ?? []) {
          expect(pixel[1]).toBeGreaterThan(pixel[0] + 50);
          expect(pixel[1]).toBeGreaterThan(pixel[2] + 50);
          expect(pixel[3]).toBe(255);
        }
      }
    }
    writeFileSync(testInfo.outputPath("sky-report.json"), JSON.stringify(report, null, 2));
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});
