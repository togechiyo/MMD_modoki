import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { BufferSource, EncodedPacketSink, Input, WEBM } from "mediabunny";
import { launchMmdModoki } from "./electron-app.mjs";
import { decodeFirstVideoFrame } from "./video-first-frame.mjs";

const root = resolve(import.meta.dirname, "../..");

async function launchWebGl() {
  const previous = process.env.MMD_MODOKI_RENDERER;
  process.env.MMD_MODOKI_RENDERER = "webgl2";
  try { return await launchMmdModoki(root); }
  finally {
    if (previous === undefined) delete process.env.MMD_MODOKI_RENDERER;
    else process.env.MMD_MODOKI_RENDERER = previous;
  }
}

function pixelSummary(pixels, requireOpaque = true) {
  let black = 0, object = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (brightness < 8) black++;
    if (brightness > 45 && (!requireOpaque || pixels[i + 3] > 240)) object++;
  }
  return { black, object, pixels: pixels.length / 4 };
}

// Playwright requires a destructured fixtures argument when using testInfo.
// eslint-disable-next-line no-empty-pattern
test("WebGL2 retains GPU-only effect instances while exporting visible 4K PNG and WebM", async ({}, testInfo) => {
  test.setTimeout(180000);
  mkdirSync(testInfo.outputDir, { recursive: true });
  const report = { pageErrors: [], glErrors: [], consoleErrors: [] };
  let launched;
  try {
    launched = await launchWebGl();
    const watch = page => {
      page.on("pageerror", error => report.pageErrors.push(error.message));
      page.on("console", message => {
        const text = message.text();
        if (message.type() === "error") report.consoleErrors.push(text);
        if (/INVALID_OPERATION|deleted object|Program object expected|WebGL.*(?:error|invalid)|useProgram.*(?:deleted|invalid)/i.test(text)) report.glErrors.push(text);
      });
    };
    launched.app.on("window", watch);
    const page = await launched.app.firstWindow();
    watch(page);
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    report.engine = (await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).engine;
    expect(report.engine).toBe("WebGL2");
    report.webglContext = await page.evaluate(() => {
      const gl = document.getElementById("render-canvas").getContext("webgl2");
      if (!gl) throw new Error("Editor WebGL2 context unavailable");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return { renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION), shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null };
    });
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
      resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
    const authored = await page.evaluate(async () => {
      // Vite serves this module inside the renderer, not from Node's module resolver.
      // eslint-disable-next-line import/no-unresolved
      const { FrameGraphEffectInstances } = await import("/src/editor/frame-graph-effect-instances.ts");
      const store = new FrameGraphEffectInstances();
      for (const type of ["ssgi", "luminousRadiance", "directionalLightShafts"]) {
        const id = `fx-compat-${type}`;
        store.add(id, undefined, undefined, type);
        store.apply(id, 0, store.capture(id, 0));
        const key = store.capture(id, 10);
        store.apply(id, 10, { ...key, value: { ...key.value, enabled: false } });
      }
      store.setFixedSettings("fx-compat-ssgi", { blendMode: "overlay" });
      store.setFixedSettings("fx-compat-luminousRadiance", { radiance: { enabled: true, strength: 0.75, range: 2, softness: 0.2, distanceSoftness: false } });
      store.add("fx-compat-gamma", { enabled: true, gamma: 1.3 }, undefined, "gamma");
      window.mmdModokiE2e.setCameraPose({ x: 8, y: 6, z: -14 }, { x: 0, y: 1.5, z: 0 });
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundBlack: true, backgroundDisplayMode: "black" });
      project.effects.frameGraphInstances = store.serialize();
      await window.mmdModokiE2e.importProjectState(project);
      return { instances: store.serialize(), project: window.mmdModokiE2e.exportProjectState() };
    });
    expect(authored.project.effects.frameGraphInstances).toEqual(authored.instances);
    const projectPath = testInfo.outputPath("gpu-effects-project.json");
    writeFileSync(projectPath, JSON.stringify(authored.project));
    const saved = JSON.parse(readFileSync(projectPath, "utf8"));
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances)).toEqual(authored.instances);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    report.runtime = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState());
    expect(report.runtime.backend).toBe("frameGraph");

    const capture = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 3840, 2160), testInfo.outputDir);
    expect(capture.surfaceReleased).toBe(true);
    const png = PNG.sync.read(readFileSync(capture.path));
    expect([png.width, png.height]).toEqual([3840, 2160]);
    report.png = { width: png.width, height: png.height, bytes: capture.byteLength, ...pixelSummary(png.data) };
    expect(report.png.object).toBeGreaterThan(5000);
    expect(report.png.black).toBeGreaterThan(report.png.pixels * 0.2);
    expect(report.png.object).toBeLessThan(report.png.pixels * 0.85);
    await testInfo.attach("webgl-4k", { path: capture.path, contentType: "image/png" });

    const outputPath = testInfo.outputPath("webgl-compatible.webm");
    const job = await page.evaluate(async outputFilePath => {
      window.__compatWebmResult = null;
      window.__compatWebmUnsubscribe = window.electronAPI.onWebmExportResult(result => { window.__compatWebmResult = result; });
      return await window.electronAPI.startWebmExportWindow({
        project: window.mmdModokiE2e.exportProjectState(), outputFilePath,
        startFrame: 0, endFrame: 2, fps: 30, outputWidth: 640, outputHeight: 360,
        includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface",
      });
    }, outputPath);
    expect(job?.jobId).toBeTruthy();
    await expect.poll(() => page.evaluate(() => window.__compatWebmResult?.status ?? "running"), { timeout: 90000 }).not.toBe("running");
    report.webmResult = await page.evaluate(() => {
      window.__compatWebmUnsubscribe();
      return window.__compatWebmResult;
    });
    expect(report.webmResult.status).toBe("completed");
    const input = new Input({ source: new BufferSource(readFileSync(outputPath)), formats: [WEBM] });
    try {
      const track = await input.getPrimaryVideoTrack();
      expect(track).not.toBeNull();
      const timestamps = [];
      for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) timestamps.push(packet.timestamp);
      report.webm = { width: track.codedWidth, height: track.codedHeight, timestamps, duration: await input.computeDuration() };
      expect([track.codedWidth, track.codedHeight]).toEqual([640, 360]);
      expect(timestamps).toHaveLength(3);
      timestamps.sort((a, b) => a - b).forEach((time, i) => expect(Math.abs(time - i / 30)).toBeLessThan(0.002));
    } finally { input.dispose(); }
    const decoded = await decodeFirstVideoFrame(page, outputPath);
    const videoPng = PNG.sync.read(Buffer.from(decoded.png, "base64"));
    report.videoPixels = { width: decoded.width, height: decoded.height, presented: decoded.presented,
      ...pixelSummary(videoPng.data, false) };
    expect([report.videoPixels.width, report.videoPixels.height]).toEqual([640, 360]);
    expect(report.videoPixels.object).toBeGreaterThan(200);
    expect(report.videoPixels.black).toBeGreaterThan(report.videoPixels.pixels * 0.2);
    expect(report.videoPixels.object).toBeLessThan(report.videoPixels.pixels * 0.85);
    await testInfo.attach("webgl-compatible", { path: outputPath, contentType: "video/webm" });
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances)).toEqual(authored.instances);
    expect(report.pageErrors).toEqual([]);
    expect(report.glErrors).toEqual([]);
  } finally {
    const reportPath = testInfo.outputPath("compatibility-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await testInfo.attach("compatibility-report", { path: reportPath, contentType: "application/json" });
    if (launched) await launched.close();
  }
});
