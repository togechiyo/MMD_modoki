import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { decodeFirstVideoFrame } from "./video-first-frame.mjs";

const root = resolve(import.meta.dirname, "../..");
const modelPath = resolve(root, "test/fixtures/external-parent/tofu.pmx");

async function launchAuto() {
  const previous = process.env.MMD_MODOKI_RENDERER;
  delete process.env.MMD_MODOKI_RENDERER;
  try { return await launchMmdModoki(root); }
  finally {
    if (previous === undefined) delete process.env.MMD_MODOKI_RENDERER;
    else process.env.MMD_MODOKI_RENDERER = previous;
  }
}

// Context-wide injection also covers the PNG exporter's isolated Electron partition.
// Binding evidence is collected before application scripts, even if the hidden
// window closes before Playwright can evaluate it after export completion.
async function installFallback(context, mode, report) {
  await context.exposeBinding("__webglFallbackEvidence", (_source, evidence) => {
    report.evidence.push(evidence);
  });
  await context.addInitScript(({ mode }) => {
    const query = new URLSearchParams(location.search);
    const role = query.get("mode") ?? "editor";
    const emit = data => void window.__webglFallbackEvidence({
      role, mode, url: location.href, jobId: query.get("jobId"), ...data,
    });
    const nativeGpu = navigator.gpu;
    emit({ stage: "installed", nativeGpuAvailable: Boolean(nativeGpu), forcedBackend: query.get("rendererBackend") });
    for (const level of ["info", "warn"]) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        const message = args.map(String).join(" ");
        if (message.includes("Falling back to WebGL2")) emit({ stage: "startup", message });
        original(...args);
      };
    }
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const result = getContext.call(this, kind, ...args);
      if (this.id === "render-canvas" && kind === "webgl2" && result) {
        emit({ stage: "engine", engine: result instanceof WebGL2RenderingContext ? "WebGL2" : "unexpected" });
      }
      return result;
    };
    if (mode === "missing-gpu") {
      Object.defineProperty(navigator, "gpu", { configurable: true, get: () => undefined });
    } else if (nativeGpu) {
      const requestAdapter = nativeGpu.requestAdapter.bind(nativeGpu);
      Object.defineProperty(nativeGpu, "requestAdapter", {
        configurable: true,
        value: async (...args) => {
          const adapter = await requestAdapter(...args);
          if (adapter) Object.defineProperty(adapter, "requestDevice", {
            configurable: true,
            value: async () => {
              emit({ stage: "device-rejected" });
              throw new Error("E2E injected WebGPU device rejection");
            },
          });
          return adapter;
        },
      });
    }
  }, { mode });
}

async function exportFixture(page, directory, video) {
  const path = resolve(directory, video ? "fallback.webm" : "fallback_0000.png");
  const started = await page.evaluate(async ({ directory, path, video }) => {
    const common = {
      project: window.mmdModokiE2e.exportProjectState(),
      startFrame: 0, endFrame: video ? 2 : 0, fps: 30,
      outputWidth: 320, outputHeight: 180,
    };
    return video ? await window.electronAPI.startWebmExportWindow({
      ...common, outputFilePath: path, includeAudio: false,
      preferredVideoCodec: "vp8", captureMode: "rgba-surface",
    }) : await window.electronAPI.startPngSequenceExportWindow({
      ...common, outputDirectoryPath: directory, step: 1, precision: 1,
      prefix: "fallback", transparentBackground: false,
    });
  }, { directory, path, video });
  expect(started?.jobId).toBeTruthy();
  await expect.poll(() => existsSync(path) && statSync(path).size > 100, { timeout: 30_000 }).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
  return { path, jobId: started.jobId };
}

async function compareExports(page, png, webm) {
  const decoded = await decodeFirstVideoFrame(page, webm);
  const a = PNG.sync.read(readFileSync(png)), b = PNG.sync.read(Buffer.from(decoded.png, "base64"));
  let brightPng = 0, brightWebm = 0, difference = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if ((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 > 24) brightPng++;
    if ((b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 > 24) brightWebm++;
    for (let c = 0; c < 3; c++) difference += Math.abs(a.data[i + c] - b.data[i + c]);
  }
  return { pngSize: [a.width, a.height], webmSize: [b.width, b.height], brightPng, brightWebm,
    presented: decoded.presented, meanAbsoluteDifference: difference / (a.width * a.height * 3) };
}

for (const mode of ["missing-gpu", "device-rejected"]) {
  // Playwright requires a destructured fixtures argument when using testInfo.
  // eslint-disable-next-line no-empty-pattern
  test(`automatic WebGL2 fallback and PNG/WebM output (${mode})`, async ({}, testInfo) => {
    const launched = await launchAuto();
    const report = { mode, evidence: [], console: [], errors: [] };
    let page;
    try {
      const context = launched.app.context();
      context.on("console", message => report.console.push({ type: message.type(), text: message.text(), url: message.page()?.url() }));
      context.on("weberror", error => report.errors.push(error.error().message));
      report.gpu = await launched.app.evaluate(async ({ app }) => ({
        features: app.getGPUFeatureStatus(), info: await app.getGPUInfo("basic"),
      }));
      page = await launched.app.firstWindow();
      await installFallback(context, mode, report);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e), undefined, { timeout: 30_000 });
      report.runtime = await page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot());
      expect(report.runtime.engine).toBe("WebGL2");
      if (mode === "device-rejected") {
        expect(report.evidence.some(item => item.role === "editor" && item.stage === "device-rejected"),
          "The device failure path must run; absent GPU/adapter is a different fallback").toBe(true);
      }
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
      const imported = await page.evaluate(async () => {
        const project = window.mmdModokiE2e.exportProjectState();
        project.viewport.groundVisible = false;
        project.viewport.skydomeVisible = false;
        project.viewport.backgroundBlack = true;
        project.viewport.backgroundDisplayMode = "black";
        project.lighting.shadowEnabled = false;
        return await window.mmdModokiE2e.importProjectState(project);
      });
      expect(imported.loadedModels).toBe(1);
      expect(imported.warnings).toEqual([]);
      const png = await exportFixture(page, launched.tempDir, false);
      const webm = await exportFixture(page, launched.tempDir, true);
      report.outputs = { png, webm };
      report.pixels = await compareExports(page, png.path, webm.path);
      expect(report.pixels.pngSize).toEqual([320, 180]);
      expect(report.pixels.webmSize).toEqual([320, 180]);
      expect(report.pixels.brightPng).toBeGreaterThan(100);
      expect(report.pixels.brightWebm).toBeGreaterThan(100);
      expect(report.pixels.meanAbsoluteDifference).toBeLessThan(24);
      for (const [role, jobId] of [["editor", null], ["exporter", png.jobId], ["webm-exporter", webm.jobId]]) {
        const evidence = report.evidence.filter(item => item.role === role && item.jobId === jobId);
        expect(evidence.some(item => item.stage === "installed" && item.forcedBackend === null), `${role}: auto injection`).toBe(true);
        expect(evidence.some(item => item.stage === "engine" && item.engine === "WebGL2"), `${role}: actual context`).toBe(true);
        const reason = mode === "missing-gpu" ? "WebGPU unavailable" : "WebGPU initialization failed";
        expect(evidence.some(item => item.stage === "startup" && item.message.includes(reason)), `${role}: fallback reason`).toBe(true);
        if (mode === "device-rejected") expect(evidence.some(item => item.stage === "device-rejected"), `${role}: device rejection`).toBe(true);
      }
      expect(report.errors).toEqual([]);
    } finally {
      try {
        if (page && !page.isClosed()) {
          const log = await page.evaluate(() => window.electronAPI.getLogFileInfo()).catch(() => null);
          if (log?.path && existsSync(log.path)) await testInfo.attach("main-log", { body: readFileSync(log.path), contentType: "text/plain" });
        }
        for (const [name, contentType] of [["fallback_0000.png", "image/png"], ["fallback.webm", "video/webm"]]) {
          const path = resolve(launched.tempDir, name);
          if (existsSync(path)) await testInfo.attach(name, { path, contentType });
        }
        const reportPath = testInfo.outputPath("fallback-report.json");
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
        await testInfo.attach("fallback-report", { path: reportPath, contentType: "application/json" });
      } finally { await launched.close(); }
    }
  });
}
