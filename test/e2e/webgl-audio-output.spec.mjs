import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BufferSource, EncodedPacketSink, Input, WEBM } from "mediabunny";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

function writeToneWav(path) {
  const sampleRate = 48000, sampleCount = sampleRate, dataSize = sampleCount * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < sampleCount; i++) {
    // Short ramps avoid edge clicks; the frequency check uses the middle of the tone.
    const ramp = Math.min(1, i / 240, (sampleCount - 1 - i) / 240);
    bytes.writeInt16LE(Math.round(32767 * 0.25 * ramp * Math.sin(2 * Math.PI * 440 * i / sampleRate)), 44 + i * 2);
  }
  writeFileSync(path, bytes);
}

async function launchWebGl() {
  const previous = process.env.MMD_MODOKI_RENDERER;
  process.env.MMD_MODOKI_RENDERER = "webgl2";
  try {
    return await launchMmdModoki(root);
  } finally {
    // The child process already owns its environment, including subsequent export windows.
    if (previous === undefined) delete process.env.MMD_MODOKI_RENDERER;
    else process.env.MMD_MODOKI_RENDERER = previous;
  }
}

async function inspectWebm(path) {
  const input = new Input({ source: new BufferSource(readFileSync(path)), formats: [WEBM] });
  try {
    const videos = await input.getVideoTracks(), audios = await input.getAudioTracks();
    expect(videos).toHaveLength(1);
    expect(audios).toHaveLength(1);
    const video = videos[0], audio = audios[0];
    const collect = async track => {
      const packets = [];
      for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
        packets.push({ timestamp: packet.timestamp, duration: packet.duration, bytes: packet.byteLength });
      }
      return packets;
    };
    return {
      duration: await input.computeDuration(),
      video: { codec: video.codec, width: video.codedWidth, height: video.codedHeight,
        duration: await video.computeDuration(), packets: await collect(video) },
      audio: { codec: audio.codec, sampleRate: audio.sampleRate, channels: audio.numberOfChannels,
        duration: await audio.computeDuration(), packets: await collect(audio) },
    };
  } finally {
    input.dispose();
  }
}

async function decodeMedia(page, path) {
  return page.evaluate(async filePath => {
    const bytes = new Uint8Array(await window.electronAPI.readBinaryFile(filePath));
    const context = new AudioContext();
    const video = document.createElement("video");
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    try {
      // Decode the exported WebM, not the source WAV. No playback or audio output is needed.
      const audio = await context.decodeAudioData(bytes.slice().buffer);
      const samples = audio.getChannelData(0), rate = audio.sampleRate;
      const start = Math.floor(rate * 0.1), end = Math.min(samples.length, Math.floor(rate * 0.9));
      let squareSum = 0, peak = 0;
      const crossings = [];
      for (let i = start; i < end; i++) {
        squareSum += samples[i] ** 2;
        peak = Math.max(peak, Math.abs(samples[i]));
        if (i > start && samples[i - 1] <= 0 && samples[i] > 0) {
          crossings.push(i - 1 - samples[i - 1] / (samples[i] - samples[i - 1]));
        }
      }
      const loaded = new Promise((done, fail) => {
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", () => fail(new Error(`WebM video decode failed: ${video.error?.message}`)), { once: true });
      });
      video.muted = true; video.src = url;
      await loaded;
      return {
        video: { width: video.videoWidth, height: video.videoHeight, duration: video.duration },
        audio: { sampleRate: rate, channels: audio.numberOfChannels, duration: audio.duration,
          sampleCount: samples.length, measuredSamples: end - start, peak,
          rms: Math.sqrt(squareSum / (end - start)), positiveCrossings: crossings.length,
          frequency: crossings.length > 1 ? (crossings.length - 1) * rate / (crossings.at(-1) - crossings[0]) : null },
      };
    } finally {
      video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
      await context.close();
    }
  }, path);
}

// Playwright requires destructuring its fixture argument, even when only testInfo is needed.
// eslint-disable-next-line no-empty-pattern
test("WebGL2 GUI WebM export preserves video timing and a 440 Hz audio track", async ({}, testInfo) => {
  test.setTimeout(180000);
  mkdirSync(testInfo.outputDir, { recursive: true });
  const audioPath = testInfo.outputPath("tone-440hz.wav"), outputPath = testInfo.outputPath("webgl-audio.webm");
  writeToneWav(audioPath);
  const report = { expected: { engine: "WebGL2", width: 640, height: 360, frames: 30, fps: 30, toneHz: 440 }, pageErrors: [], graphicsErrors: [] };
  let launched;
  try {
    launched = await launchWebGl();
    launched.app.context().on("console", message => {
      if (/GL_INVALID|INVALID_OPERATION|deleted object|Error compiling effect/i.test(message.text())) {
        report.graphicsErrors.push(message.text());
      }
    });
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    report.engine = (await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).engine;
    expect(report.engine).toBe("WebGL2");
    report.gpu = await launched.app.evaluate(async ({ app }) => {
      try { return { available: true, info: await app.getGPUInfo("basic") }; }
      catch (error) { return { available: false, reason: String(error) }; }
    });
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      const curves = Array(3).fill([20, 107, 20, 107]).flat();
      project.keyframes.cameraAnimation = {
        frameNumbers: [0, 10, 60], positions: [0, 2, 0, 1, 2, 0, 2, 2, 0], rotations: Array(9).fill(0),
        distances: [-30, -30, -30], fovs: [30, 30, 30],
        positionInterpolations: [...curves, ...curves, ...curves],
        rotationInterpolations: curves, distanceInterpolations: curves, fovInterpolations: curves,
      };
      await window.mmdModokiE2e.importProjectState(project);
    });
    expect(await page.evaluate(filePath => window.mmdModokiE2e.loadModel(filePath),
      resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();

    // Only the native file chooser results are supplied; both actions use the real menus.
    await launched.app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.audioPath] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.outputPath });
    }, { audioPath, outputPath });
    const menu = async command => {
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator(`[data-menu-command="${command}"]`).click();
    };
    await menu("file.openAudio");
    await expect(page.locator("#status-text")).toHaveAttribute("data-i18n", "status.audioLoaded");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().assets.audioPath)).toBe(audioPath);
    await page.locator("#info-model-select").selectOption("__camera__");
    const frameInput = page.locator("#current-frame");
    await frameInput.fill("60");
    await frameInput.press("Enter");
    await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
    await page.locator('[data-menu-command="edit.deleteFrameColumn"]').click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()
      .find(track => track.category === "camera")?.frames)).toEqual([0, 10]);
    await frameInput.fill("0");
    await frameInput.press("Enter");
    const play = page.locator("#viewport-seek-play-toggle");
    await play.click();
    await expect(play).toHaveAccessibleName(/一時停止|Pause/);
    await expect(page.locator("#current-frame")).toHaveValue("30");
    await expect(play).toHaveAccessibleName(/^(再生|Play)$/);
    await menu("file.webmExportSettings");
    const dialog = page.locator('[data-popup-id="webm-export"]');
    await expect(dialog).toBeVisible();
    await dialog.locator("#webm-output-use-playback-range").uncheck();
    for (const [field, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 29]]) {
      const control = dialog.locator(`#webm-output-${field}`);
      await control.fill(String(value)); await control.press("Enter");
      await expect(control).toHaveValue(String(value));
    }
    await dialog.locator("#webm-output-fps").selectOption("30");
    await dialog.locator("#webm-output-include-audio").check();
    await page.evaluate(() => {
      window.__webglAudioExport = { result: null, progress: null };
      window.electronAPI.onWebmExportResult(result => { window.__webglAudioExport.result = result; });
      window.electronAPI.onWebmExportProgress(progress => { window.__webglAudioExport.progress = progress; });
    });
    await dialog.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__webglAudioExport.result?.status ?? "running"),
      { timeout: 90000 }).not.toBe("running");
    report.export = await page.evaluate(() => window.__webglAudioExport);
    expect(report.export.result.status, JSON.stringify(report.export)).toBe("completed");
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
    await testInfo.attach("webgl-audio", { path: outputPath, contentType: "video/webm" });

    report.container = await inspectWebm(outputPath);
    const { video, audio } = report.container;
    expect(video).toMatchObject({ width: 640, height: 360 });
    expect(["vp8", "vp9"]).toContain(video.codec);
    expect(video.packets).toHaveLength(30);
    const timestamps = video.packets.map(packet => packet.timestamp).sort((a, b) => a - b);
    // WebM stores these timestamps on a millisecond timebase.
    timestamps.forEach((timestamp, index) => expect(Math.abs(timestamp - index / 30)).toBeLessThan(0.002));
    expect(Math.abs(video.duration - 1)).toBeLessThan(0.003);
    expect(video.packets.every(packet => packet.bytes > 0)).toBe(true);
    expect(["opus", "vorbis"]).toContain(audio.codec);
    expect(audio.channels).toBe(1);
    expect(audio.sampleRate).toBeGreaterThan(0);
    expect(audio.packets.length).toBeGreaterThan(0);
    expect(audio.packets.every(packet => packet.bytes > 0 && Number.isFinite(packet.timestamp))).toBe(true);

    report.decoded = await decodeMedia(page, outputPath);
    expect(report.decoded.video).toMatchObject({ width: 640, height: 360 });
    expect(report.decoded.audio.channels).toBe(1);
    expect(report.decoded.audio.duration).toBeGreaterThan(0.95);
    expect(report.decoded.audio.duration).toBeLessThan(1.1);
    expect(report.decoded.audio.rms).toBeGreaterThan(0.05);
    expect(report.decoded.audio.rms).toBeLessThan(0.3);
    expect(report.decoded.audio.frequency).toBeGreaterThan(430);
    expect(report.decoded.audio.frequency).toBeLessThan(450);
    expect(report.pageErrors).toEqual([]);
    expect(report.graphicsErrors).toEqual([]);
  } catch (error) {
    report.failure = String(error);
    throw error;
  } finally {
    try {
      if (launched) {
        const page = await launched.app.firstWindow();
        const log = await page.evaluate(() => window.electronAPI.getLogFileInfo()).catch(() => null);
        if (log?.path) await testInfo.attach("main-log", { body: readFileSync(log.path), contentType: "text/plain" });
      }
      const reportPath = testInfo.outputPath("webgl-audio-report.json");
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      await testInfo.attach("webgl-audio-report", { path: reportPath, contentType: "application/json" });
    } finally {
      await launched?.close();
    }
  }
});
