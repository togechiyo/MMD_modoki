import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

async function centroid(page, path, time = null) {
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
      media.src = url;
      await ready;
      if (video) {
        const seeked = new Promise(done => media.addEventListener("seeked", done, { once: true }));
        media.currentTime = time;
        await seeked;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(media, 0, 0, 320, 180);
      const pixels = ctx.getImageData(0, 0, 320, 180).data;
      let count = 0, x = 0, y = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 40) continue;
        count++; x += (i / 4) % 320; y += Math.floor(i / 4 / 320);
      }
      return { count, x: x / count, y: y / count };
    } finally {
      media.removeAttribute("src");
      URL.revokeObjectURL(url);
    }
  }, { path, time });
}

for (const fps of [30, 60]) {
  test(`X accessory later keys match viewport, PNG and WebM (${fps} fps)`, async ({}, testInfo) => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    mkdirSync(testInfo.outputDir, { recursive: true });
    launched.app.on("window", window => {
      window.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
      window.on("pageerror", error => console.log("export page error", error.message));
      window.on("console", message => {
        if (message.type() === "error") console.log("export console", message.text());
      });
    });
    try {
      const page = await launched.app.firstWindow();
      page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
      expect(await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path),
        resolve(root, "test/fixtures/accessory/tofu.x"))).toBe(true);
      await page.evaluate(async () => {
        const project = window.mmdModokiE2e.exportProjectState();
        Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
        project.lighting.shadowEnabled = false;
        project.physics.enabled = false;
        project.scene.models[0].visible = false;
        await window.mmdModokiE2e.importProjectState(project);
        window.mmdModokiE2e.setCameraPose({ x: 0.5, y: 0.5, z: -8 }, { x: 0.5, y: 0.5, z: 0 });
      });
      await page.locator("#info-model-select").selectOption("__camera__");
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      const seek = async frame => {
        await page.locator("#current-frame").fill(String(frame));
        await page.locator("#current-frame").press("Enter");
      };
      for (const [frame, x] of [[0, -1], [15, 0], [30, 1]]) {
        await seek(frame);
        const input = page.locator("#accessory-pos-x");
        await input.fill(String(x));
        await input.press("Enter");
        await page.locator("#btn-info-keyframe").click();
        await expect.poll(() => page.evaluate(frame => window.mmdModokiE2e.getAccessoryTransformKeyframe(0, frame)?.position.x, frame)).toBeCloseTo(x, 4);
      }
      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      const previews = [];
      for (const frame of [0, 15, 30]) {
        await seek(frame);
        await expect(page.locator("#accessory-pos-x")).toHaveValue(String(frame / 15 - 1) + ".0");
        const captured = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 320, 180), launched.tempDir);
        previews.push(await centroid(page, captured.path));
      }
      expect(Math.abs(previews[2].x - previews[0].x)).toBeGreaterThan(20);
      console.log("accessory preview", previews);
      // Use real output windows and decode the completed files, not only runtime state.
      for (const video of [true, false]) {
        console.log("starting accessory output", { video, fps });
        const result = await page.evaluate(async ({ project, directory, video, fps }) => {
          const api = window.electronAPI;
          let remove;
          const finished = new Promise(done => {
            remove = video ? api.onWebmExportResult(done) : api.onPngSequenceExportProgress(progress => {
              if (progress.total > 0 && progress.saved === progress.total) done({ status: "completed" });
            });
          });
          try {
            const request = { project, startFrame: 0, endFrame: 30, fps, outputWidth: 320, outputHeight: 180,
              ...(video ? { outputFilePath: directory + "/accessory.webm", includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface" }
                : { outputDirectoryPath: directory, prefix: "accessory", step: 15, precision: 1, transparentBackground: false }) };
            const started = await (video ? api.startWebmExportWindow : api.startPngSequenceExportWindow)(request);
            if (!started?.jobId) throw new Error("Export did not start");
            return await finished;
          } finally { remove(); }
        }, { project, directory: testInfo.outputDir, video, fps });
        expect(result.status, JSON.stringify(result)).toBe("completed");
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
      }
      const samples = [];
      for (const [index, frame] of [0, 15, 30].entries()) {
        const png = await centroid(page, testInfo.outputPath(`accessory_${String(frame).padStart(4, "0")}.png`));
        const webm = await centroid(page, testInfo.outputPath("accessory.webm"), frame / 30 + 0.001);
        samples.push({ frame, preview: previews[index], png, webm });
        for (const output of [png, webm]) {
          expect(output.count).toBeGreaterThan(50);
        }
        expect(Math.abs(webm.x - png.x)).toBeLessThan(3);
        expect(Math.abs(webm.y - png.y)).toBeLessThan(3);
      }
      // Viewport framing and output framing can differ; compare the key motion
      // within each image sequence and use PNG as the video pixel reference.
      for (const source of ["preview", "png", "webm"]) {
        const [first, middle, last] = samples.map(sample => sample[source].x);
        expect(last - first).toBeGreaterThan(20);
        expect((middle - first) / (last - first)).toBeCloseTo(0.5, 1);
      }
      console.log("accessory keyframe output", JSON.stringify({ fps, samples }));
      await testInfo.attach("centroids", { body: JSON.stringify({ fps, samples }, null, 2), contentType: "application/json" });
      expect(errors).toEqual([]);
    } finally { await launched.close(); }
  });
}
