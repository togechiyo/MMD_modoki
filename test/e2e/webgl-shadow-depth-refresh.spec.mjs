import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

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

test("WebGL2 retains the wall's shadow on the stage floor across a camera cut", async () => {
  const launched = await launchWebGl();
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const stage = resolve(root, "test/fixtures/shadow-stage/shadow-stage-wide.pmx");
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stage)).not.toBeNull();
    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");
    expect(await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({
      effectiveMode: "cascaded", engine: "WebGL2",
    });
    const report = await page.evaluate(async helperPath => {
      const probe = await import(helperPath);
      return { ...await probe.measureShadowAfterCameraCut(), captures: await probe.measureCsmDuringCapture() };
    }, "/test/e2e/helpers/wide-shadow-stage-travel-probe.mjs");
    await writeFile(test.info().outputPath("camera-cut.json"), JSON.stringify(report, null, 2));
    expect(report.autoBounds).toBe(true);
    expect(report.configuredRate).toBe(2);
    expect(report.stationaryFirstFrame, "skip the next reduction for a stationary view").toBe(0);
    expect(report.seekFirstFrame, "refresh the first displayed frame after a seek").toBe(1);
    for (const variant of [report.control, report.configured]) {
      expect(variant.frames[0].receiverDepth, "cut extends beyond the previous camera's depth range").toBeGreaterThan(variant.nearSplit);
      expect(variant.frames[0].ratio, "floor retains the wall shadow on the first frame after the cut").toBeLessThan(.94);
    }
    for (const [frame, control] of report.control.frames.entries()) {
      const actual = report.configured.frames[frame];
      expect(control.clear, `frame ${frame + 1}: lit floor`).toBeGreaterThan(100);
      expect(actual.clear).toBeGreaterThan(100);
      expect(actual.ratio, `frame ${frame + 1}: no additional shadow loss`).toBeLessThanOrEqual(control.ratio + .05);
    }
    expect(report.control.frames.at(-1).ratio, "settled shadow in the reference").toBeLessThan(.94);
    expect(report.configured.frames.at(-1).ratio, "settled shadow in the default configuration").toBeLessThan(.94);
    for (const capture of report.captures) {
      expect(capture.nonZeroRgbByteCount).toBeGreaterThan(100);
      expect(capture.rates).toEqual([1]);
      expect(capture.restoredRate).toBe(report.configuredRate);
    }
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
