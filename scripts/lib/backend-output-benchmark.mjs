import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect } from "@playwright/test";
import { BufferSource, EncodedPacketSink, Input, WEBM } from "mediabunny";
import { PNG } from "playwright-core/lib/utilsBundle";

const timeoutMs = 600_000;

function exportJob(page) {
  try {
    const url = new URL(page.url());
    return ["exporter", "webm-exporter"].includes(url.searchParams.get("mode"))
      ? url.searchParams.get("jobId") : null;
  } catch { return null; }
}

async function waitUntilIdle(page) {
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
  await expect.poll(() => page.context().pages().filter(candidate => exportJob(candidate)).length,
    { timeout: 30_000, message: "Exporter windows must close before the next measurement" }).toBe(0);
}

async function measureJob(page, kind, request) {
  const token = randomUUID();
  const closedJobs = new Set();
  const watched = new Map();
  const watch = candidate => {
    if (watched.has(candidate)) return;
    const onClose = () => {
      const jobId = exportJob(candidate);
      if (jobId) closedJobs.add(jobId);
    };
    watched.set(candidate, onClose);
    candidate.on("close", onClose);
  };
  page.context().pages().forEach(watch);
  page.context().on("page", watch);
  let snapshot;
  try {
    await page.evaluate(({ token, kind, request }) => {
      const api = window.electronAPI;
      const state = { jobId: null, error: null, diagnostics: null, firstProgress: null,
        requestWallMs: null, terminal: null };
      const pending = [];
      const unsubscribers = [];
      const registry = window.__backendOutputBenchmarks ??= {};
      registry[token] = { state, cleanup: () => unsubscribers.forEach(unsubscribe => unsubscribe()) };
      let startedAt;
      const consume = (event, terminal, observedAt = performance.now()) => {
        if (!state.jobId) { pending.push([event, terminal, observedAt]); return; }
        if (event.jobId !== state.jobId) return;
        if (terminal) {
          state.terminal = event;
          if (event.status !== "completed") state.error = `${kind} ${event.status}: ${event.errorCode ?? event.failure?.message ?? "export did not complete"}`;
          return;
        }
        if (event.phase === "failed" || event.phase === "canceled") {
          state.error = `${kind} ${event.phase}: ${event.message ?? "export did not complete"}`;
          return;
        }
        const completedFrames = kind === "png" ? event.saved : event.encoded;
        if (!state.firstProgress && completedFrames > 0) {
          state.firstProgress = { completedFrames, elapsedMs: observedAt - startedAt };
        }
        if (event.diagnostics && (kind === "png" || event.phase === "completed")) {
          state.diagnostics = event.diagnostics;
          state.requestWallMs = observedAt - startedAt;
        }
      };
      if (kind === "png") {
        unsubscribers.push(api.onPngSequenceExportProgress(event => consume(event, false)),
          api.onPngSequenceExportResult(event => consume(event, true)));
      } else {
        unsubscribers.push(api.onWebmExportProgress(event => consume(event, false)),
          api.onWebmExportResult(event => consume(event, true)));
      }
      // Request-to-final-diagnostics includes window startup and pipeline drain, not verification/teardown.
      startedAt = performance.now();
      const launched = kind === "png" ? api.startPngSequenceExportWindow(request) : api.startWebmExportWindow(request);
      void launched.then(result => {
        if (!result?.jobId) { state.error = `${kind} launch failed: ${result?.errorCode ?? "no job ID"}`; return; }
        state.jobId = result.jobId;
        pending.splice(0).forEach(([event, terminal, observedAt]) => consume(event, terminal, observedAt));
      }, error => { state.error = `${kind} launch failed: ${String(error)}`; });
    }, { token, kind, request });

    await expect.poll(async () => {
      snapshot = await page.evaluate(token => window.__backendOutputBenchmarks[token].state, token);
      if (snapshot.error) throw new Error(snapshot.error);
      // Ordinary PNG jobs have no terminal-result IPC. A closed exporter without final diagnostics is a failure.
      if (snapshot.jobId && closedJobs.has(snapshot.jobId) && !snapshot.diagnostics) {
        throw new Error(`${kind} exporter closed before completing job ${snapshot.jobId}`);
      }
      return Boolean(snapshot.diagnostics && (kind === "png" || snapshot.terminal?.status === "completed"));
    }, { timeout: timeoutMs, message: `${kind} benchmark must finish with diagnostics` }).toBe(true);
    await waitUntilIdle(page);
    // Inspect terminal errors once more after teardown, including PNG automation failures if supplied by the app.
    snapshot = await page.evaluate(token => window.__backendOutputBenchmarks[token].state, token);
    if (snapshot.error) throw new Error(snapshot.error);
    const first = snapshot.firstProgress;
    const remaining = snapshot.diagnostics.frameCount - (first?.completedFrames ?? 0);
    const continuationMs = snapshot.requestWallMs - (first?.elapsedMs ?? 0);
    return { jobId: snapshot.jobId, diagnostics: snapshot.diagnostics, requestWallMs: snapshot.requestWallMs,
      firstProgress: first, continuedFps: first && remaining > 0 && continuationMs > 0 ? remaining * 1000 / continuationMs : null };
  } finally {
    page.context().off("page", watch);
    for (const [candidate, onClose] of watched) candidate.off("close", onClose);
    if (!page.isClosed()) await page.evaluate(token => {
      window.__backendOutputBenchmarks?.[token]?.cleanup();
      delete window.__backendOutputBenchmarks?.[token];
    }, token);
  }
}

function verifyPng(directory, width, height, frames) {
  const names = readdirSync(directory).filter(name => name.toLowerCase().endsWith(".png")).sort();
  const pad = Math.max(4, String(frames - 1).length);
  const expected = Array.from({ length: frames }, (_, frame) => `benchmark_${String(frame).padStart(pad, "0")}.png`);
  assert.deepEqual(names, expected, "PNG sequence must contain every requested frame exactly once");
  const indices = [0, Math.floor((frames - 1) / 2), frames - 1];
  const samples = indices.map(frame => {
    const path = join(directory, expected[frame]);
    const png = PNG.sync.read(readFileSync(path));
    assert.deepEqual([png.width, png.height], [width, height], `PNG dimensions: frame ${frame}`);
    let nonzeroRgbPixels = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (png.data[i] || png.data[i + 1] || png.data[i + 2]) nonzeroRgbPixels++;
    }
    assert.ok(nonzeroRgbPixels > 0, `PNG frame ${frame} must contain nonempty RGB`);
    return { frame, path, width: png.width, height: png.height, nonzeroRgbPixels, pixels: png.data };
  });
  let firstLastDifferentPixels = 0;
  for (let i = 0; i < samples[0].pixels.length; i += 4) {
    if (samples[0].pixels[i] !== samples[2].pixels[i] || samples[0].pixels[i + 1] !== samples[2].pixels[i + 1]
      || samples[0].pixels[i + 2] !== samples[2].pixels[i + 2]) firstLastDifferentPixels++;
  }
  return {
    files: { count: names.length, first: samples[0].path, middle: samples[1].path, last: samples[2].path },
    outputBytes: names.reduce((sum, name) => sum + statSync(join(directory, name)).size, 0),
    verification: { samples: samples.map(({ frame, path, width, height, nonzeroRgbPixels }) =>
      ({ frame, path, width, height, nonzeroRgbPixels })), firstLastDifferentPixels },
  };
}

async function verifyWebm(path, width, height, frames, fps) {
  const bytes = readFileSync(path);
  assert.ok(bytes.byteLength > 0, "WebM must not be empty");
  const input = new Input({ source: new BufferSource(bytes), formats: [WEBM] });
  try {
    const track = await input.getPrimaryVideoTrack();
    assert.ok(track, "WebM video track is required");
    assert.equal(track.codec, "vp8", "Benchmark must use VP8 on both backends");
    assert.deepEqual([track.codedWidth, track.codedHeight], [width, height]);
    assert.equal(await input.getPrimaryAudioTrack(), null, "Benchmark must not include audio");
    let packetCount = 0;
    let firstTimestamp = null, lastTimestamp = null;
    for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
      firstTimestamp ??= packet.timestamp;
      lastTimestamp = packet.timestamp;
      packetCount++;
    }
    const expectedPackets = Math.max(1, Math.round(frames * fps / 30));
    assert.equal(packetCount, expectedPackets, "WebM must contain every output frame");
    return { files: { count: 1, path }, outputBytes: bytes.byteLength,
      verification: { codec: track.codec, width: track.codedWidth, height: track.codedHeight,
        packetCount, expectedPackets, firstTimestamp, lastTimestamp, duration: await input.computeDuration() } };
  } finally { input.dispose(); }
}

/**
 * Each output uses a fresh exporter and the same project. `frames` counts 30 Hz timeline frames.
 * firstProgress records the observed batch size; continuedFps includes encode/write pipeline drain.
 * File parsing and window teardown are outside requestWallMs. Pixel animation is reported, not required.
 * The caller controls backend/process isolation and records the editor/exporter actual engines.
 */
export async function benchmarkOutputs(page, directory, project,
  { width = 1920, height = 1080, frames = 100, fps = 30, order = ["png", "webm"] } = {}) {
  for (const [name, value] of Object.entries({ width, height, frames, fps })) {
    assert.ok(Number.isInteger(value) && value > 0, `${name} must be a positive integer`);
  }
  assert.ok(order.length > 0 && order.every(kind => ["png", "webm"].includes(kind))
    && new Set(order).size === order.length, "order must contain unique png/webm entries");
  const outputDirectory = resolve(directory);
  mkdirSync(outputDirectory, { recursive: true });
  const rows = {};
  await waitUntilIdle(page);
  for (const kind of order) {
    const common = { project, startFrame: 0, endFrame: frames - 1, fps, outputWidth: width, outputHeight: height };
    if (kind === "png") {
      const outputDirectoryPath = join(outputDirectory, "png");
      mkdirSync(outputDirectoryPath, { recursive: true });
      assert.equal(readdirSync(outputDirectoryPath).length, 0, "Use a fresh benchmark output directory; existing files are preserved");
      const timing = await measureJob(page, kind, { ...common, outputDirectoryPath, step: 1, prefix: "benchmark", precision: 1 });
      assert.equal(timing.diagnostics.encoderMode, "renderer-worker", "PNG benchmark requires the default renderer-worker encoder");
      assert.equal(timing.diagnostics.frameCount, frames);
      rows.png = { ...timing, ...verifyPng(outputDirectoryPath, width, height, frames) };
    } else {
      const outputFilePath = join(outputDirectory, "output.webm");
      assert.equal(existsSync(outputFilePath), false, "Existing WebM output is preserved; use a fresh benchmark output directory");
      const timing = await measureJob(page, kind, { ...common, outputFilePath, includeAudio: false,
        preferredVideoCodec: "vp8", captureMode: "rgba-surface", diagnosticQueueLimit: 16 });
      assert.equal(timing.diagnostics.queueLimit, 16);
      assert.equal(timing.diagnostics.frameCount, Math.max(1, Math.round(frames * fps / 30)));
      rows.webm = { ...timing, ...await verifyWebm(outputFilePath, width, height, frames, fps) };
    }
  }
  return rows;
}
