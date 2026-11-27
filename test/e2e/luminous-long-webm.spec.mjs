import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BufferSource, EncodedPacketSink, Input, WEBM } from "mediabunny";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

test("V022-132: save all 8000 Luminous frames to WebM", async () => {
  test.skip(process.env.MMD_LONG_LUMINOUS_WEBM !== "1", "Opt-in long video export");
  test.setTimeout(60 * 60_000);
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
      resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-all").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const path = resolve(launched.tempDir, "luminous-8000.webm");
    const job = await page.evaluate(outputFilePath => {
      window.electronAPI.onWebmExportResult(result => { window.longExportResult = result; });
      window.electronAPI.onWebmExportProgress(progress => { window.longExportProgress = progress; });
      return window.electronAPI.startWebmExportWindow({
        project: window.mmdModokiE2e.exportProjectState(), outputFilePath,
        startFrame: 0, endFrame: 7999, fps: 30, outputWidth: 640, outputHeight: 360,
        includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface",
      });
    }, path);
    expect(job?.jobId).toBeTruthy();
    let encoded = -1;
    while (true) {
      const next = await page.waitForFunction(({ id, previous }) => {
        if (window.longExportResult?.jobId === id) return { finished: true };
        const progress = window.longExportProgress;
        if (progress?.jobId === id && progress.encoded > previous) return { encoded: progress.encoded };
        return false;
      }, { id: job.jobId, previous: encoded }, { polling: 1000, timeout: 3 * 60_000 });
      const progress = await next.jsonValue();
      await next.dispose();
      if (progress.finished) break;
      if (Math.floor(progress.encoded / 1000) > Math.floor(encoded / 1000)) {
        console.info(`Luminous WebM: ${progress.encoded}/8000`);
      }
      encoded = progress.encoded;
    }
    expect(await page.evaluate(() => window.longExportResult)).toMatchObject({ status: "completed", filePath: path });
    const input = new Input({ source: new BufferSource(readFileSync(path)), formats: [WEBM] });
    try {
      const track = await input.getPrimaryVideoTrack();
      expect(track.codec).toBe("vp8");
      let count = 0;
      for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
        expect(packet.byteLength).toBeGreaterThan(0);
        expect(Math.abs(packet.timestamp - count / 30)).toBeLessThan(0.002);
        count++;
      }
      expect(count).toBe(8000);
    } finally { input.dispose(); }
  } finally { await launched.close(); }
});
