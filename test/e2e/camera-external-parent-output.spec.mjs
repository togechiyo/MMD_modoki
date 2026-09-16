import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { createMedia } from "../fixtures/background-media/create.mjs";

const root = resolve(import.meta.dirname, "../..");

async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
}

async function commit(page, key, value) {
  const input = page.locator(`#bone-controls input[data-control-key='${key}']`);
  await input.fill(String(value));
  await input.press("Enter");
}

async function imageStats(page, path, time = null) {
  return page.evaluate(async ({ path, time }) => {
    const bytes = await window.electronAPI.readBinaryFile(path);
    const video = time !== null;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: video ? "video/webm" : "image/png" }));
    const media = document.createElement(video ? "video" : "img");
    try {
      const ready = new Promise((done, fail) => {
        media.addEventListener(video ? "loadeddata" : "load", done, { once: true });
        media.addEventListener("error", () => fail(new Error(`Decode failed: ${path}`)), { once: true });
      });
      media.src = url; await ready;
      if (video) {
        const seeked = new Promise(done => media.addEventListener("seeked", done, { once: true }));
        media.currentTime = time; await seeked;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(media, 0, 0, 320, 180);
      const pixels = ctx.getImageData(0, 0, 320, 180).data;
      let count = 0, x = 0, y = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // Ignore both black and synthetic red backgrounds, plus colored editor markers.
        if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 40) continue;
        count++; x += (i / 4) % 320; y += Math.floor(i / 4 / 320);
      }
      return { count, x: x / count, y: y / count };
    } finally { media.removeAttribute("src"); URL.revokeObjectURL(url); }
  }, { path, time });
}

async function exportMedia(page, project, directory, video, fps) {
  return page.evaluate(async ({ project, directory, video, fps }) => {
    const api = window.electronAPI;
    let remove;
    const finished = new Promise(done => {
      remove = video ? api.onWebmExportResult(done) : api.onPngSequenceExportProgress(progress => {
        if (progress.total > 0 && progress.saved === progress.total) done({ status: "completed" });
      });
    });
    try {
      const request = { project, startFrame: 0, endFrame: 30, fps, outputWidth: 320, outputHeight: 180,
        ...(video ? { outputFilePath: directory + "/parent.webm", includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface" }
          : { outputDirectoryPath: directory, prefix: "parent", step: 15, precision: 1, transparentBackground: false }) };
      const started = await (video ? api.startWebmExportWindow : api.startPngSequenceExportWindow)(request);
      if (!started?.jobId) throw new Error("Export did not start");
      return await finished;
    } finally { remove(); }
  }, { project, directory, video, fps });
}

for (const { backend, legacy, background, fps } of [
  { backend: "frameGraph", legacy: false, background: false, fps: 60 },
  { backend: "classic", legacy: false, background: false, fps: 30 },
  { backend: "frameGraph", legacy: true, background: false, fps: 30 },
  { backend: "frameGraph", legacy: false, background: true, fps: 30 },
]) {
  test(`external-parent camera output (${backend}, ${legacy ? "legacy static" : "keyed"}, ${background ? "image" : "no background"}, ${fps}fps)`, async () => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    const handleDialogs = page => page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
    launched.app.on("window", handleDialogs);
    try {
      const page = await launched.app.firstWindow();
      handleDialogs(page);
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
      await page.evaluate(async () => {
        const project = window.mmdModokiE2e.exportProjectState();
        Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
        project.physics.enabled = false;
        await window.mmdModokiE2e.importProjectState(project);
      });
      await page.locator("#info-model-select").selectOption("0");
      await selectCenterBone(page);
      await commit(page, "tx", 0);
      await page.locator("#btn-bone-keyframe").click();
      await seek(page, 30);
      await commit(page, "tx", 40);
      await commit(page, "ry", 30);
      await page.locator("#btn-bone-keyframe").click();
      await seek(page, 0);
      await page.locator("#info-model-select").selectOption("__camera__");
      await page.locator("#camera-external-parent-select").selectOption("0");
      await page.locator("#camera-parent-bone-select").selectOption({ label: "センター" });
      await page.locator("[data-testid='camera-external-parent-register']").click();
      await commit(page, "ty", 3);
      await commit(page, "tz", -20);
      await page.locator("#btn-bone-keyframe").click();
      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      if (background) project.viewport.backgroundImagePath = await createMedia(page, launched.tempDir, false);
      expect(project.camera.target).toEqual({ x: 0, y: 3, z: -20 });
      if (legacy) {
        project.keyframes.cameraAnimation = null;
        project.keyframes.cameraExternalParents = null;
      }
      const beforePosition = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
      const previews = [];
      for (const frame of [0, 15, 30]) {
        await seek(page, frame);
        const path = resolve(launched.tempDir, `preview${frame}.png`);
        await page.locator("#render-canvas").screenshot({ path });
        expect((await imageStats(page, path)).count).toBeGreaterThan(200);
        // Normalize the same viewport camera to output dimensions and omit editor overlays.
        const captured = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 320, 180), launched.tempDir);
        previews.push(await imageStats(page, captured.path));
        expect(previews.at(-1).count).toBeGreaterThan(200);
      }
      const movedPosition = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
      expect(movedPosition.x).toBeCloseTo(30, 2);
      expect(movedPosition.y).toBeCloseTo(3, 2);
      expect(movedPosition.z).toBeCloseTo(-20 * Math.cos(Math.PI / 6), 2);
      for (const video of [false, true]) {
        expect((await exportMedia(page, project, launched.tempDir, video, fps)).status).toBe("completed");
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
      }
      for (const [index, frame] of [0, 15, 30].entries()) {
        const png = await imageStats(page, resolve(launched.tempDir, `parent_${String(frame).padStart(4, "0")}.png`));
        const webm = await imageStats(page, resolve(launched.tempDir, "parent.webm"), frame / 30 + 0.001);
        console.log("output stats", { frame, png, webm, preview: previews[index] });
        for (const output of [png, webm]) {
          expect(output.count, JSON.stringify({ frame, output, previews })).toBeGreaterThan(200);
          expect(Math.abs(output.x - previews[index].x)).toBeLessThan(5);
          expect(Math.abs(output.y - previews[index].y)).toBeLessThan(5);
        }
        expect(Math.abs(webm.count - png.count)).toBeLessThan(png.count * 0.15);
      }
      const imported = await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project);
      expect(imported.warnings).toEqual([]);
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().camera.target)).toEqual(project.camera.target);
      await expect.poll(async () => {
        const actual = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
        return Math.hypot(...["x", "y", "z"].map(axis => actual[axis] - beforePosition[axis]));
      }).toBeLessThan(0.01);
      if (legacy) expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraExternalParents ?? null)).toBeNull();

      // A following project using the same model must not inherit the previous parent keys.
      project.keyframes.cameraExternalParents = null;
      project.keyframes.cameraAnimation = null;
      project.camera.externalParent = null;
      project.camera.target = { x: 0, y: 3, z: 0 };
      project.camera.distance = 20;
      expect((await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project)).warnings).toEqual([]);
      await seek(page, 15);
      expect(await page.evaluate(() => window.mmdModokiE2e.getCameraExternalParent())).toBeNull();
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraExternalParents ?? null)).toBeNull();
    } finally { await launched.close(); }
  });
}
