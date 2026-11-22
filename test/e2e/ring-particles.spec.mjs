import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function waitForExportFile(page, filePath, minimumBytes = 100) {
  await expect.poll(
    () => existsSync(filePath) && statSync(filePath).size > minimumBytes,
    { timeout: 60_000 },
  ).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
}

async function comparePngFramesWithWebm(page, startPngPath, expectedPngPath, webmPath, timeSeconds) {
  return page.evaluate(async ({ startPath, expectedPath, videoPath, targetTime }) => {
    const readBytes = async (path) => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      if (!bytes) throw new Error(`Export output unavailable: ${path}`);
      return new Uint8Array(bytes);
    };
    const loadImage = async (path) => {
      const url = URL.createObjectURL(new Blob([await readBytes(path)], { type: "image/png" }));
      const image = new Image();
      image.src = url;
      await image.decode();
      return { drawable: image, url };
    };
    const loadVideo = async (path) => {
      const url = URL.createObjectURL(new Blob([await readBytes(path)], { type: "video/webm" }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise((resolveLoaded, rejectLoaded) => {
        video.addEventListener("loadeddata", resolveLoaded, { once: true });
        video.addEventListener("error", () => rejectLoaded(new Error("WebM decode failed")), { once: true });
      });
      video.currentTime = Math.min(targetTime, Math.max(0, video.duration - 0.05));
      await new Promise((resolveSeeked, rejectSeeked) => {
        video.addEventListener("seeked", resolveSeeked, { once: true });
        video.addEventListener("error", () => rejectSeeked(new Error("WebM seek failed")), { once: true });
      });
      if (typeof video.requestVideoFrameCallback === "function") {
        const frameReady = new Promise((resolveFrame) => video.requestVideoFrameCallback(resolveFrame));
        await video.play();
        await frameReady;
        video.pause();
      }
      return { drawable: video, url, currentTime: video.currentTime };
    };
    const start = await loadImage(startPath);
    const expected = await loadImage(expectedPath);
    const video = await loadVideo(videoPath);
    try {
      const width = 320;
      const height = 180;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = (drawable) => {
        context.clearRect(0, 0, width, height);
        context.drawImage(drawable, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const startPixels = pixels(start.drawable);
      const expectedPixels = pixels(expected.drawable);
      const videoPixels = pixels(video.drawable);
      const meanDifference = (first, second) => {
        let total = 0;
        for (let index = 0; index < first.length; index += 4) {
          total += Math.abs(first[index] - second[index]);
          total += Math.abs(first[index + 1] - second[index + 1]);
          total += Math.abs(first[index + 2] - second[index + 2]);
        }
        return total / (width * height * 3);
      };
      return {
        pngStartToExpected: meanDifference(startPixels, expectedPixels),
        webmToStart: meanDifference(videoPixels, startPixels),
        webmToExpected: meanDifference(videoPixels, expectedPixels),
        videoTime: video.currentTime,
      };
    } finally {
      URL.revokeObjectURL(start.url);
      URL.revokeObjectURL(expected.url);
      URL.revokeObjectURL(video.url);
    }
  }, {
    startPath: startPngPath,
    expectedPath: expectedPngPath,
    videoPath: webmPath,
    targetTime: timeSeconds,
  });
}

test("豆腐モデル周囲の光粒をFrameGraphスタックから再現可能に描画する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    page.on("console", (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[renderer:error] ${error.message}`));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 30_000 });
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    const rows = page.locator('[data-effect-instance-type="ringParticles"]');
    const addParticles = async (name, color) => {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="ringParticles"]').click();
      const row = rows.filter({ has: page.getByText(name, { exact: true }) });
      await expect(row.locator('input[type="color"]')).toHaveCount(1);
      await expect(row.locator('input[type="color"]')).toHaveValue("#ffffff");
      await row.locator('input[type="color"]').fill(color);
      return row;
    };
    const red = await addParticles("パーティクル", "#ff0000");
    for (const [field, position] of Object.entries({ count: 50, density: 50, size: 30, speed: 10, intensity: 100 })) {
      await expect(red.locator(`[data-instance-field="${field}"]`)).toHaveValue(String(position));
    }
    const blue = await addParticles("パーティクル 2", "#0000ff");
    await expect(rows).toHaveCount(2);
    const project = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const colors = async () => {
      await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 320, 180), launched.tempDir);
      const { data } = PNG.sync.read(readFileSync(resolve(launched.tempDir, "single_rgba_surface_e2e.png")));
      let red = 0, blue = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        const [r, g, b] = data.subarray(offset, offset + 3);
        if (r > Math.max(g, b) + 24) red++;
        if (b > Math.max(r, g) + 24) blue++;
      }
      return { red, blue };
    };
    const redEnabled = red.locator('[data-instance-field="enabled"]');
    const blueEnabled = blue.locator('[data-instance-field="enabled"]');
    const both = await colors();
    await blueEnabled.uncheck();
    const redOnly = await colors();
    await redEnabled.uncheck();
    await blueEnabled.check();
    const blueOnly = await colors();
    expect(both.blue).toBeGreaterThan(redOnly.blue);
    expect(both.red).toBeGreaterThan(blueOnly.red);
    expect(redOnly.red).toBeGreaterThan(blueOnly.red);
    expect(blueOnly.blue).toBeGreaterThan(redOnly.blue);
    await redEnabled.check();
    const saved = await project();
    const projectPath = resolve(launched.tempDir, "layered-particles.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, projectPath);
    const fileMenu = async command => {
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator(`[data-menu-command="${command}"]`).click();
    };
    await fileMenu("file.saveProject");
    await expect.poll(() => existsSync(projectPath)).toBe(true);
    expect(JSON.parse(readFileSync(projectPath, "utf8")).effects.frameGraphInstances).toEqual(saved.effects.frameGraphInstances);
    await expandEffectInstance(blue);
    await blue.locator('[data-instance-action="delete"]').click();
    await expect(rows).toHaveCount(1);
    await fileMenu("file.loadProject");
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await expect(rows).toHaveCount(2);
    for (const [row, color] of [[red, "#ff0000"], [blue, "#0000ff"]]) {
      await expandEffectInstance(row);
      await expect(row.locator('input[type="color"]')).toHaveValue(color);
    }
    expect((await project()).effects.frameGraphInstances).toEqual(saved.effects.frameGraphInstances);
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const luminousInstances = state.effects.frameGraphInstances.instances.filter(instance => instance.type === "luminous");
    expect(luminousInstances).toHaveLength(1);
    const luminousInstance = luminousInstances[0];
    expect(luminousInstance.settings.enabled).toBe(true);
    expect(state.effects.frameGraphInstances.order).toContain(luminousInstance.instanceId);
    await expect(page.locator(`[data-effect-instance-row="${luminousInstance.instanceId}"] [data-instance-field="enabled"]`)).toBeChecked();
    // Independent effect instances are separate from the legacy state.stack list.
    // Verify the authored instance is connected to its emission mask and render tasks.
    await page.waitForFunction(instanceId => {
      const runtime = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      const diagnostics = window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects;
      const instance = diagnostics.controller?.instances.find(item => item.instanceId === instanceId);
      return runtime.backend === "frameGraph" && runtime.enabled && runtime.ready && runtime.resourcesAllocated
        && diagnostics.resourcePlan?.needsLuminousMask && diagnostics.resources.luminousMask
        && diagnostics.controller.connectedOrder.includes("luminous") && instance?.type === "luminous"
        && ["-extract", "-composite"].every(suffix => instance.taskNames.some(name => name.endsWith(suffix)));
    }, luminousInstance.instanceId);

    const particles = state.effects.frameGraphInstances.instances.filter(instance => instance.type === "ringParticles");
    expect(particles.map(instance => instance.fixedSettings.color)).toEqual([{ r: 1, g: 0, b: 0 }, { r: 0, g: 0, b: 1 }]);
    expect(particles[0].settings).toMatchObject({ enabled: true, count: 180, density: 32.5, size: 0.335, speed: 0.05, intensity: 4 });
    expect(state.effects.ringParticles.enabled).toBe(false);
    await page.locator("#render-canvas").screenshot({ path: resolve(repoRoot, "test-results/ring-particles-preview.png") });
    await page.evaluate(() => window.mmdModokiE2e.seekTo(120));
    const frame120 = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    await page.evaluate(() => window.mmdModokiE2e.seekTo(240));
    const frame240 = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    expect(frame240.pixelChecksum).not.toBe(frame120.pixelChecksum);

    const exportProject = structuredClone(state);
    // A short clip with visible motion is enough to compare the same output time.
    for (const item of exportProject.effects.frameGraphInstances.instances) {
      if (item.type === "ringParticles") item.settings.speed = 1.5;
    }
    const pngPrefix = "ring_particle_webm_sync";
    const pngStartPath = resolve(launched.tempDir, `${pngPrefix}_0000.png`);
    const pngExpectedPath = resolve(launched.tempDir, `${pngPrefix}_0018.png`);
    const pngLaunch = await page.evaluate(async ({ project, outputDirectoryPath, prefix }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 18,
        step: 18,
        prefix,
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), { project: exportProject, outputDirectoryPath: launched.tempDir, prefix: pngPrefix });
    expect(pngLaunch?.jobId).toBeTruthy();
    await waitForExportFile(page, pngStartPath);
    await waitForExportFile(page, pngExpectedPath);

    const webmPath = resolve(launched.tempDir, "ring_particle_webm_sync.webm");
    await page.evaluate(() => {
      const diagnostics = { progress: null, result: null };
      window.__ringParticleWebmDiagnostics = diagnostics;
      const disposeProgress = window.electronAPI.onWebmExportProgress(progress => { diagnostics.progress = progress; });
      const disposeResult = window.electronAPI.onWebmExportResult(result => { diagnostics.result = result; });
      window.__disposeRingParticleWebmDiagnostics = () => { disposeProgress(); disposeResult(); };
    });
    const webmLaunch = await page.evaluate(async ({ project, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project,
        outputFilePath,
        startFrame: 0,
        endFrame: 24,
        fps: 30,
        outputWidth: 320,
        outputHeight: 180,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      })
    ), { project: exportProject, outputFilePath: webmPath });
    expect(webmLaunch?.jobId).toBeTruthy();
    try {
      await waitForExportFile(page, webmPath, 1_000);
    } catch (error) {
      console.log("[ring-particle-webm-wait-failure]", await page.evaluate(() => window.__ringParticleWebmDiagnostics));
      throw error;
    } finally {
      await page.evaluate(() => window.__disposeRingParticleWebmDiagnostics());
    }

    const exportComparison = await comparePngFramesWithWebm(
      page,
      pngStartPath,
      pngExpectedPath,
      webmPath,
      0.6,
    );
    console.log(`[ring-particle-webm-sync] ${JSON.stringify(exportComparison)}`);
    expect(exportComparison.pngStartToExpected).toBeGreaterThan(0.5);
    expect(exportComparison.webmToExpected).toBeLessThan(exportComparison.webmToStart);

    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

test("WebGL2 keeps legacy particle colors alongside a new layer using camera FXAA", async () => {
  const previous = process.env.MMD_MODOKI_RENDERER;
  process.env.MMD_MODOKI_RENDERER = "webgl2";
  let launched;
  try { launched = await launchMmdModoki(repoRoot); }
  finally {
    if (previous === undefined) delete process.env.MMD_MODOKI_RENDERER;
    else process.env.MMD_MODOKI_RENDERER = previous;
  }
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().engine)).toBe("WebGL2");
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    Object.assign(project.viewport, { antialiasEnabled: true, groundVisible: false, skydomeVisible: false, backgroundBlack: true, backgroundDisplayMode: "black" });
    project.effects.frameGraphPostStack = [{ id: "ringParticles", enabled: true }];
    const fixture = resolve(launched.tempDir, "legacy-particles.json");
    const { writeFile } = await import("node:fs/promises");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, fixture);
    const red = { r: 1, g: 0, b: 0 }, green = { r: 0, g: 1, b: 0 }, blue = { r: 0, g: 0, b: 1 };
    const legacy = page.locator('[data-effect-stack-row="ringParticles"]');
    for (const [palette, expected] of [[{ colorA: red, colorB: green }, "#ff0000"], [{ colorA: green, colorB: red, colorC: blue }, "#00ff00"]]) {
      project.effects.ringParticles = { enabled: true, count: 180, density: 32.5, size: 0.335, speed: 0.05, intensity: 4, ...palette };
      await writeFile(fixture, JSON.stringify(project));
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator('[data-menu-command="file.loadProject"]').click();
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ringParticles.color)).toEqual(palette.colorA);
      if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="post"]').click();
      const header = legacy.locator('[data-effect-stack-item="ringParticles"]');
      if (await header.getAttribute("aria-expanded") !== "true") await header.click();
      await expect(legacy.locator('input[type="color"]')).toHaveCount(1);
      await expect(legacy.locator('input[type="color"]')).toHaveValue(expected);
    }
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ringParticles"]').click();
    const added = page.locator('[data-effect-instance-type="ringParticles"]');
    await added.locator('input[type="color"]').fill("#0000ff");
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects);
    expect(saved.ringParticles).toEqual({ enabled: true, count: 180, density: 32.5, size: 0.335, speed: 0.05, intensity: 4, color: green });
    expect(saved.frameGraphInstances.instances).toHaveLength(1);
    expect(saved.frameGraphInstances.instances[0]).toMatchObject({ type: "ringParticles", fixedSettings: { color: blue } });
    const master = page.locator("#btn-effect-toggle-framegraph");
    const frames = [];
    for (const enabled of [true, false, true]) {
      if (await master.getAttribute("aria-pressed") !== String(enabled)) await master.click();
      await expect(master).toHaveAttribute("aria-pressed", String(enabled));
      await expect(legacy.locator('[data-effect-stack-toggle="ringParticles"]')).toBeChecked();
      await expect(added.locator('[data-instance-field="enabled"]')).toBeChecked();
      await expect.poll(() => page.evaluate(async probePath => {
        const before = window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount;
        const { camera, effects } = await (await import(probePath)).observe();
        return { fxaa: camera.postProcesses.filter(pass => pass === "FxaaPostProcess").length,
          allocated: effects.resourcesAllocated, drewGraph: effects.executedFrameCount > before, backend: effects.backend };
      }, "/test/e2e/helpers/feedback-reproduction-probe.mjs")).toEqual({
        fxaa: enabled ? 1 : 0, allocated: false, drewGraph: false, backend: "frameGraph",
      });
      const capture = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 320, 180), launched.tempDir);
      const { data } = PNG.sync.read(readFileSync(capture.path));
      const pixels = { green: 0, blue: 0 };
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 1] > Math.max(data[i], data[i + 2]) + 24) pixels.green++;
        if (data[i + 2] > Math.max(data[i], data[i + 1]) + 24) pixels.blue++;
      }
      frames.push(pixels);
    }
    for (const channel of ["green", "blue"]) {
      expect(frames[0][channel]).toBeGreaterThan(frames[1][channel]);
      expect(frames[2][channel]).toBeGreaterThan(frames[1][channel]);
    }
  } finally { await launched.close(); }
});
