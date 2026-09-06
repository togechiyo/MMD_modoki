import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, statSync, copyFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";

// Opt-in visual regression with diagnostic exports; original reporter hardware still needs retesting.
test.skip(process.env.MMD_MODOKI_ISSUE24_REPRO !== "1", "Explicit visual reproduction run only");
test.setTimeout(300_000);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "test-results/issue24");
const fixture = resolve(root, "test/fixtures/external-parent/tofu.pmx");

async function input(page, key, value) {
  const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
  await field.fill(String(value));
  await field.press("Enter");
}

async function settle(page) {
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  await page.evaluate(() => new Promise(resolveFrame => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  }));
}

async function setup() {
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  console.log("[issue24] Electron launched");
  try {
    const page = await launched.app.firstWindow();
    console.log("[issue24] first window", page.url());
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 30_000 });
    console.log("[issue24] renderer ready");
    await page.evaluate(async () => {
      localStorage.setItem("mmd_modoki.debug.renderStability", "1");
      const project = window.mmdModokiE2e.exportProjectState();
      project.viewport.groundVisible = false;
      project.viewport.skydomeVisible = false;
      project.viewport.backgroundBlack = true;
      project.viewport.backgroundDisplayMode = "black";
      project.physics.enabled = false;
      await window.mmdModokiE2e.importProjectState(project);
    });
    console.log("[issue24] blank project configured");
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture)).not.toBeNull();
    await expect(page.locator("#info-model-select option")).toHaveCount(2);
    console.log("[issue24] fixture loaded");
    return { ...launched, page, errors };
  } catch (error) {
    const pages = launched.app.windows();
    for (let index = 0; index < pages.length; index++) {
      console.log("[issue24] window on failure", pages[index].url());
      await pages[index].screenshot({ path: resolve(output, `setup-failure-${index}.png`) }).catch(() => {});
    }
    await launched.close();
    throw error;
  }
}

async function camera(page, x, z, distance, roll = 0) {
  await page.locator("#info-model-select").selectOption("__camera__");
  for (const [key, value] of Object.entries({ tx: x, ty: 1.5, tz: z, rx: 0, ry: 0, rz: roll, camDistance: distance })) {
    await input(page, key, value);
  }
  await settle(page);
}

async function imageMetrics(page, path) {
  return page.evaluate(async path => {
    const bytes = await window.electronAPI.readBinaryFile(path);
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    let intermediate = 0;
    for (let y = Math.ceil(canvas.height * 0.16); y < canvas.height * 0.84; y++) {
      for (let x = Math.ceil(canvas.width * 0.2); x < canvas.width * 0.8; x++) {
        const red = data[(y * canvas.width + x) * 4];
        if (red > 150) bright++;
        if (red > 5 && red < 240) intermediate++;
      }
    }
    return { bright, intermediate };
  }, path);
}

test("Issue 24: collect camera translation and distance observations", async () => {
  const launched = await setup();
  const { page } = launched;
  const observations = [];
  try {
    for (const scenario of [
      { name: "origin", x: 0, z: 0, cx: 0, cz: 0 },
      { name: "x40", x: 40, z: 0, cx: 40, cz: 0 },
      { name: "z40", x: 0, z: 40, cx: 0, cz: 40 },
      { name: "reported-z40-camera35", x: 0, z: 40, cx: 0, cz: 35 },
      { name: "z25-camera30", x: 0, z: 25, cx: 0, cz: 30 },
    ]) {
      await page.locator("#info-model-select").selectOption("0");
      await selectCenterBone(page);
      await input(page, "tx", scenario.x);
      await input(page, "tz", scenario.z);
      await page.locator("#btn-kf-add").click();
      await camera(page, scenario.cx, scenario.cz, 20);
      for (const distance of [20, 12, 8, 5, 3, 2]) {
        await input(page, "camDistance", distance);
        await settle(page);
        const state = await page.evaluate(() => ({
          model: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
          camera: window.mmdModokiE2e.getCameraKeyframePose(),
          backend: window.mmdModokiE2e.getFrameGraphPostEffectsState(),
        }));
        const name = `${scenario.name}-d${distance}`;
        await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
        const metrics = await imageMetrics(page, resolve(output, `${name}.png`));
        if (["origin", "x40", "z40", "reported-z40-camera35"].includes(scenario.name) && distance >= 12) {
          expect(metrics.bright, `${name}: translated model must remain visible`).toBeGreaterThan(1000);
        }
        observations.push({ name, ...state, metrics });
      }
    }
    writeFileSync(resolve(output, "camera-observations.json"), JSON.stringify({ observations,
      errors: launched.errors, validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()),
    }, null, 2));
    expect(launched.errors).toEqual([]);
  } finally { await launched.close(); }
});

async function inspectSavedVideoAndActiveAa() {
  const launched = await setup();
  const { page } = launched;
  const videoObservations = [];
  try {
    for (const aa of ["on", "off"]) {
      for (const fps of [30, 60]) {
        const path = resolve(output, `aa-${aa}-${fps}fps.webm`);
        expect(existsSync(path), "Run the AA export scenario first").toBe(true);
        const decoded = await page.evaluate(async path => {
          const bytes = await window.electronAPI.readBinaryFile(path);
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
          const video = document.createElement("video");
          video.muted = true;
          video.src = url;
          await new Promise((done, reject) => {
            video.addEventListener("loadeddata", done, { once: true });
            video.addEventListener("error", () => reject(new Error("Video decode failed")), { once: true });
          });
          await new Promise(done => {
            video.addEventListener("seeked", done, { once: true });
            video.currentTime = 0.25;
          });
          const frameReady = new Promise(done => video.requestVideoFrameCallback(done));
          await video.play();
          await frameReady;
          video.pause();
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video, 0, 0);
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let brightPixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] > 150) brightPixels++;
          }
          const png = canvas.toDataURL("image/png").split(",")[1];
          const result = { png, brightPixels, width: video.videoWidth, height: video.videoHeight, duration: video.duration, time: video.currentTime };
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(url);
          return result;
        }, path);
        expect(decoded.brightPixels).toBeGreaterThan(100);
        writeFileSync(resolve(output, `aa-${aa}-${fps}fps-decoded.png`), Buffer.from(decoded.png, "base64"));
        const { png, ...metadata } = decoded;
        videoObservations.push({ aa, fps, ...metadata });
        console.log("[issue24] decoded video", aa, fps, decoded.width, decoded.height, decoded.duration, decoded.time);
      }
    }
    writeFileSync(resolve(output, "video-observations.json"), JSON.stringify(videoObservations, null, 2));
    await camera(page, 0, 0, 12, 17);
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="gamma"]').click();
    const gamma = page.locator('[data-effect-stack-control="gammaPower"]');
    await gamma.focus();
    await gamma.press("ArrowRight");
    await page.locator("#btn-toggle-shader-panel").click();
    await settle(page);
    const observations = [];
    for (const aa of [true, false]) {
      if ((await page.evaluate(() => window.mmdModokiE2e.exportProjectState().viewport.antialiasEnabled)) !== aa) {
        await page.getByRole("button", { name: "表示", exact: true }).click();
        await page.locator('[data-menu-command="view.toggleAntialias"]').click();
      }
      await settle(page);
      const png = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
      copyFileSync(png.path, resolve(output, `active-fg-aa-${aa ? "on" : "off"}.png`));
      const metrics = await imageMetrics(page, png.path);
      expect(metrics.bright).toBeGreaterThan(1000);
      if (aa) expect(metrics.intermediate).toBeGreaterThan(500);
      else expect(metrics.intermediate).toBeLessThan(100);
      observations.push({ aa, snapshot: await page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot()) });
    }
    writeFileSync(resolve(output, "active-fg-observations.json"), JSON.stringify({ observations, errors: launched.errors,
      validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()),
    }, null, 2));
    expect(launched.errors).toEqual([]);
  } finally { await launched.close(); }
}

test("Issue 24: collect AA viewport PNG and 30/60 fps WebM", async () => {
  const launched = await setup();
  const { page } = launched;
  const observations = [];
  try {
    await camera(page, 0, 0, 12, 17);
    await page.locator("#btn-kf-add").click();
    const size = await page.locator("#render-canvas").evaluate(canvas => ({
      width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight, dpr: devicePixelRatio,
    }));
    for (const [iteration, aa] of [true, false, true].entries()) {
      const current = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().viewport.antialiasEnabled);
      if (current !== aa) {
        await page.getByRole("button", { name: "表示", exact: true }).click();
        await page.locator('[data-menu-command="view.toggleAntialias"]').click();
      }
      await settle(page);
      const prefix = iteration === 2 ? "aa-restored" : aa ? "aa-on" : "aa-off";
      if (iteration === 2) {
        // Restore the saved project too: AA-only must survive initialization as well as menu toggles.
        await page.evaluate(async () => {
          const project = window.mmdModokiE2e.exportProjectState();
          await window.mmdModokiE2e.importProjectState(project);
        });
        await settle(page);
      }
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${prefix}-viewport.png`) });
      const png = await page.evaluate(({ dir, width, height }) => (
        window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, width, height)
      ), { dir: output, ...size });
      copyFileSync(png.path, resolve(output, `${prefix}-single.png`));
      const metrics = await imageMetrics(page, png.path);
      expect(metrics.bright).toBeGreaterThan(1000);
      if (aa) expect(metrics.intermediate).toBeGreaterThan(500);
      else expect(metrics.intermediate).toBeLessThan(100);
      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      writeFileSync(resolve(output, `${prefix}-project.json`), JSON.stringify(project, null, 2));
      rmSync(resolve(output, `${prefix}_0000.png`), { force: true });
      const pngJob = await page.evaluate(({ project, dir, prefix, width, height }) => (
        window.electronAPI.startPngSequenceExportWindow({ project, outputDirectoryPath: dir,
          startFrame: 0, endFrame: 0, step: 1, prefix, fps: 30, precision: 1,
          outputWidth: width, outputHeight: height, transparentBackground: false })
      ), { project, dir: output, prefix, ...size });
      expect(pngJob?.jobId).toBeTruthy();
      await expect.poll(() => existsSync(resolve(output, `${prefix}_0000.png`)), { timeout: 60_000 }).toBe(true);
      await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
      const sequenceMetrics = await imageMetrics(page, resolve(output, `${prefix}_0000.png`));
      // Independent render contexts need not produce identical FXAA edge samples.
      expect(Math.abs(sequenceMetrics.bright - metrics.bright) / metrics.bright).toBeLessThan(0.01);
      if (aa) expect(sequenceMetrics.intermediate).toBeGreaterThan(500);
      else expect(sequenceMetrics.intermediate).toBeLessThan(100);
      for (const fps of [30, 60]) {
        const path = resolve(output, `${prefix}-${fps}fps.webm`);
        rmSync(path, { force: true });
        const job = await page.evaluate(({ project, path, fps, width, height }) => (
          window.electronAPI.startWebmExportWindow({ project, outputFilePath: path,
            startFrame: 0, endFrame: 15, fps, outputWidth: width, outputHeight: height,
            includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface" })
        ), { project, path, fps, ...size });
        expect(job?.jobId).toBeTruthy();
        await expect.poll(() => existsSync(path) && statSync(path).size > 1000, { timeout: 60_000 }).toBe(true);
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
      }
      observations.push({ aa, size, metrics, backend: await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState()) });
    }
    writeFileSync(resolve(output, "aa-observations.json"), JSON.stringify({ observations, errors: launched.errors,
      validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()),
    }, null, 2));
    expect(launched.errors).toEqual([]);
  } finally { await launched.close(); }
});

test("Issue 24: inspect saved video frames and active FrameGraph AA", inspectSavedVideoAndActiveAa);
