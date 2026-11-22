import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, initialState, project, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { twoBounceRelayPmx } from "../fixtures/rc-diffuse-gi-stage/two-bounce-relay.mjs";

const root = resolve(import.meta.dirname, "../..");
const red = [1, 0, 0], white = [0.9, 0.9, 0.9], black = [0, 0, 0];

// Both camera targets are inside a single solid-colored face. Restrict measurement to its center.
function centerDifference(off, on) {
  const sum = [0, 0, 0];
  let pixels = 0;
  for (let y = 150; y < 210; y++) {
    for (let x = 275; x < 365; x++) {
      const i = (y * off.width + x) * 4;
      for (let c = 0; c < 3; c++) sum[c] += on.data[i + c] - off.data[i + c];
      pixels++;
    }
  }
  const rgb = sum.map(value => value / pixels);
  return { rgb, redExcess: rgb[0] - (rgb[1] + rgb[2]) / 2 };
}

for (const mode of ["manual", "origin"]) test(`RC diffuse GI two-bounce relay: ${mode}`, async ({}, testInfo) => {
  test.setTimeout(240000);
  // Match the number of grid cells across each plane in the 16-unit manual and 128-unit origin volume.
  const scale = mode === "origin" ? 8 : 1;
  const launched = await launchMmdModoki(root);
  const report = { mode, scale, captures: {}, samples: {}, errors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await initialState(page, { fixed: mode === "manual" });
    const empty = await project(page);
    // Direct light reaches the source from the upper left, clear of the overhead relay.
    Object.assign(empty.lighting, { x: 1, y: -1, z: 0 });
    const sample = async name => {
      await setGi(page, false);
      const off = await capture(page, testInfo, report, name + "-off");
      await setGi(page, true);
      const on = await capture(page, testInfo, report, name + "-on");
      report.samples[name] = centerDifference(off, on);
    };
    for (const [name, source, relay] of [["white-relay", red, white], ["black-relay", red, black], ["no-source", black, white]]) {
      const path = resolve(launched.tempDir, name + ".pmx");
      writeFileSync(path, twoBounceRelayPmx(source, relay, scale));
      await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), empty);
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
      if (name === "white-relay") {
        // Camera beneath the white ceiling, looking up at the first reflecting surface.
        await camera(page, { tx: -2.3 * scale, ty: 4 * scale, tz: 0, rx: 80, ry: 0, camDistance: 2.4 * scale });
        await sample("first-bounce-on-relay");
      }
      // From beneath the ceiling look down at the same neutral target in all three variants.
      await camera(page, { tx: 0.2 * scale, ty: 0, tz: 0, rx: -80, ry: 0, camDistance: 2.4 * scale });
      await sample(name);
      if (name === "white-relay") {
        await camera(page, { tx: -2 * scale, ty: 1.5 * scale, tz: 0, rx: -9, ry: -18, camDistance: 22 * scale });
        await capture(page, testInfo, report, "scene-overview");
      }
    }
    expect(report.samples["first-bounce-on-relay"].redExcess).toBeGreaterThan(1);
    expect(report.samples["white-relay"].redExcess)
      .toBeGreaterThan(report.samples["black-relay"].redExcess + 3);
    expect(report.samples["white-relay"].redExcess)
      .toBeGreaterThan(report.samples["no-source"].redExcess + 3);
    // The neutral receiver can still illuminate the white relay. Compare its hue,
    // allowing one 8-bit rounding step in each of the ON and OFF images.
    const neutral = report.samples["no-source"].rgb;
    expect(Math.max(...neutral) - Math.min(...neutral)).toBeLessThanOrEqual(2);
    expect(report.errors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
