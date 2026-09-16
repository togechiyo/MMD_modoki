import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function readColor(page, file, time = null) {
  return page.evaluate(async ({ file, time }) => {
    const bytes = await window.electronAPI.readBinaryFile(file);
    const video = time !== null;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: video ? "video/webm" : "image/png" }));
    const media = document.createElement(video ? "video" : "img");
    try {
      const ready = new Promise((done, fail) => {
        media.addEventListener(video ? "loadeddata" : "load", done, { once: true });
        media.addEventListener("error", () => fail(new Error(`Cannot decode ${file}`)), { once: true });
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
      const rgb = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) {
        for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
      }
      return rgb.map(value => value / (320 * 180));
    } finally { media.removeAttribute("src"); URL.revokeObjectURL(url); }
  }, { file, time });
}

function expectDominant(rgb, channel) {
  expect(rgb[channel], JSON.stringify(rgb)).toBeGreaterThan(2);
  for (let c = 0; c < 3; c++) if (c !== channel) expect(rgb[channel], JSON.stringify(rgb)).toBeGreaterThan(rgb[c] * 1.5);
}

test("V022-074: three registered light/shadow changes survive PNG and WebM export", async () => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const handleDialogs = page => page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
  launched.app.on("window", handleDialogs);
  try {
    const page = await launched.app.firstWindow();
    handleDialogs(page);
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    const imported = await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      project.lighting.ambientIntensity = 0;
      return window.mmdModokiE2e.importProjectState(project);
    });
    expect(imported.warnings).toEqual([]);
    await page.locator("#btn-toolbar-mode-toggle").click();
    for (let index = 0; index < 3; index++) {
      await seek(page, index * 30);
      for (const [channel, name] of ["r", "g", "b"].entries()) {
        await setRange(page, `#light-color-${name}`, channel === index ? 128 : 0);
      }
      await page.locator("#btn-light-keyframe").click();
      await setRange(page, "#light-intensity", 50 + index * 50);
      await page.locator("#btn-shadow-keyframe").click();
    }
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.keyframes.lightAnimation.frameNumbers).toEqual([0, 30, 60]);
    expect(saved.keyframes.shadowAnimation.lightIntensities).toEqual([0.5, 1, 1.5]);
    expect((await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved)).warnings).toEqual([]);
    for (let index = 0; index < 3; index++) {
      await seek(page, index * 30);
      await expect(page.locator("#light-intensity")).toHaveValue(String(50 + index * 50));
      const preview = resolve(launched.tempDir, `preview${index}.png`);
      await expect.poll(async () => {
        await page.locator("#render-canvas").screenshot({ path: preview });
        const rgb = await readColor(page, preview);
        return rgb[index] > 2 && rgb.every((value, c) => c === index || rgb[index] > value * 1.5);
      }).toBe(true);
    }
    for (const video of [false, true]) {
      const result = await page.evaluate(async ({ video, directory }) => {
        const api = window.electronAPI;
        let remove;
        const finished = new Promise(done => {
          remove = video ? api.onWebmExportResult(done) : api.onPngSequenceExportProgress(progress => {
            if (progress.total > 0 && progress.saved === progress.total) done({ status: "completed" });
          });
        });
        try {
          const request = {
            project: window.mmdModokiE2e.exportProjectState(),
            startFrame: 0, endFrame: 60, fps: 30, outputWidth: 320, outputHeight: 180,
            ...(video ? { outputFilePath: directory + "/light.webm", includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface" }
              : { outputDirectoryPath: directory, prefix: "light", step: 30, precision: 1, transparentBackground: false }),
          };
          const started = await (video ? api.startWebmExportWindow : api.startPngSequenceExportWindow)(request);
          if (!started?.jobId) throw new Error("Export did not start");
          return await finished;
        } finally { remove(); }
      }, { video, directory: launched.tempDir });
      expect(result.status).toBe("completed");
      await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    }
    for (let index = 0; index < 3; index++) {
      const png = await readColor(page, resolve(launched.tempDir, `light_${String(index * 30).padStart(4, "0")}.png`));
      const webm = await readColor(page, resolve(launched.tempDir, "light.webm"), index + 0.001);
      expectDominant(png, index);
      expectDominant(webm, index);
      expect(Math.abs(png[index] - webm[index])).toBeLessThan(Math.max(1, png[index] * 0.15));
    }
  } finally { await launched.close(); }
});
