import { expect, test } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { createRcDiffuseGiStage } from "../../scripts/generate-rc-diffuse-gi-fixture.mjs";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { launchMmdModoki } from "./electron-app.mjs";
import { aliciaDanceFiles, hasAliciaDance, loadAliciaDance } from "./helpers/rc-alicia-dance.mjs";
import { camera, difference, initialState, seek, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { decodeRcWebm, exportRcPng, exportRcPngSequence, exportRcWebm } from "./helpers/rc-file-output.mjs";

const root = resolve(import.meta.dirname, "../..");
const frames = [0, 15, 30];
const range = { startFrame: 0, endFrame: 30, fps: 30, width: 640, height: 360 };
const view = { tx: 0, ty: 10, tz: 0, rx: -3, ry: 25, rz: 0, camDistance: 52 };

function writeDanceStage(path) {
  // Workers load the PMX from disk. Bake the reference fixture's fivefold scale
  // and move its red wall beside the dancer without editing her VMD or model.
  const stage = createRcDiffuseGiStage();
  for (const vertex of stage.vertices) {
    const [x, y, z] = vertex.position;
    vertex.position = [5 * x + 5, 5 * y, 5 * z];
  }
  writeFileSync(path, writePmx(stage));
}

function characterMask(stage, dancer) {
  const { width, height, data } = dancer;
  const foreground = new Uint8Array(width * height);
  for (let pixel = 0; pixel < foreground.length; pixel++) {
    const i = pixel * 4;
    foreground[pixel] = Math.max(...[0, 1, 2].map(c => Math.abs(data[i + c] - stage.data[i + c]))) > 12 ? 1 : 0;
  }
  const interior = [];
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x;
    if (foreground[i] && [-2, -1, 1, 2].every(step => foreground[i + step] && foreground[i + step * width])) interior.push(i);
  }
  return interior;
}

function compareRegion(before, after, pixels) {
  const signed = [0, 0, 0];
  let absolute = 0;
  for (const pixel of pixels) for (let c = 0; c < 3; c++) {
    const delta = after.data[pixel * 4 + c] - before.data[pixel * 4 + c];
    signed[c] += delta;
    absolute += Math.abs(delta);
  }
  return { rgb: signed.map(total => total / pixels.length), mae: absolute / (pixels.length * 3) };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture parameter.
test("GI reaches the moving Alicia character in saved stills, image sequences and WebM", async ({}, testInfo) => {
  const files = aliciaDanceFiles(root);
  test.skip(process.env.MMD_RC_GI_CHARACTER_OUTPUT !== "1" || !hasAliciaDance(files), "Optional Alicia model and bundled dance");
  test.setTimeout(360000);
  const launched = await launchMmdModoki(root);
  const report = { frames, range, comparisons: [], centers: [], motion: {}, webm: {}, errors: [], consoleErrors: [] };
  const saveReport = () => writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
  const preserveLog = name => {
    const log = resolve(launched.tempDir, "user-data/logs/dev/main-dev.log");
    if (existsSync(log)) copyFileSync(log, testInfo.outputPath(name));
  };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", entry => { if (entry.type() === "error") report.consoleErrors.push(entry.text()); });
    await initialState(page, { fixed: false });
    const stagePath = resolve(launched.tempDir, "rc-alicia-red-stage.pmx");
    writeDanceStage(stagePath);
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stagePath)).not.toBeNull();
    await camera(page, view);
    await setGi(page, false);
    const stageOnly = await exportRcPng(launched, page, testInfo.outputPath("stage-only.png"), range);
    await loadAliciaDance(launched, page, files);
    report.view = await camera(page, view);
    const images = {};
    for (const enabled of [false, true]) {
      const state = enabled ? "on" : "off";
      await seek(page, 0);
      await setGi(page, enabled);
      const snapshot = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(snapshot.lighting.rcDiffuseGi).toMatchObject({ enabled, volume: null });
      const stills = [];
      for (const frame of frames) {
        await seek(page, frame);
        stills.push(await exportRcPng(launched, page, testInfo.outputPath(`alicia-${state}-${frame}.png`), range));
        if (!enabled) report.centers.push(await page.evaluate(() => window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター")));
      }
      await seek(page, 0);
      const sequence = await exportRcPngSequence(launched, page, testInfo.outputPath(`sequence-${state}`), range);
      expect(sequence).toHaveLength(range.endFrame - range.startFrame + 1);
      images[state] = { single: stills, sequence: frames.map(frame => sequence[frame].image) };
    }
    // Removing the silhouette edges keeps antialiasing and codec bleed out of the color test.
    const masks = images.off.single.map(image => characterMask(stageOnly, image));
    report.comparisons = frames.map((frame, i) => ({ frame, characterPixels: masks[i].length, formats: {} }));
    for (const pixels of masks) expect(pixels.length).toBeGreaterThan(500);
    const motion = outputs => Math.max(...outputs.slice(1).map(image => difference(outputs[0], image)));
    const compareFormat = format => {
      for (const [i, row] of report.comparisons.entries()) {
        const { frame } = row, pixels = masks[i];
        const off = images.off[format][i], on = images.on[format][i];
        const bounce = compareRegion(off, on, pixels);
        row.formats[format] = bounce;
        expect.soft(bounce.rgb[0], `frame ${frame} ${format}: mean red light gained on character`).toBeGreaterThan(0.5);
        expect.soft(bounce.mae).toBeGreaterThan(1);
        if (format !== "single") {
          // Compare ON and OFF inside each encoded format as well as against
          // the matching still. WebM's lossy YUV conversion can shift RGB.
          for (const [state, output, other] of [["off", off, on], ["on", on, off]]) {
            const matching = compareRegion(images[state].single[i], output, pixels).mae;
            const opposite = compareRegion(images[state].single[i], other, pixels).mae;
            bounce[state] = { matching, opposite };
            expect.soft(matching, `frame ${frame} ${format} ${state} must match the same GI setting`).toBeLessThan(opposite);
          }
        }
      }
      report.motion[format] = motion(images.off[format]);
      expect.soft(report.motion[format]).toBeGreaterThan(.2);
    };
    compareFormat("single");
    compareFormat("sequence");
    expect(report.centers.every(Boolean)).toBe(true);
    const first = report.centers[0];
    report.centerDisplacement = Math.max(...report.centers.map(p => Math.hypot(p.x - first.x, p.y - first.y, p.z - first.z)));
    expect.soft(report.centerDisplacement).toBeGreaterThan(.01);
    saveReport();
    // Each video is an independent GUI job. Keep the completed PNG measurements and
    // compare a successful video with both sets of stills even if its partner fails.
    for (const state of ["on", "off"]) {
      const other = state === "on" ? "off" : "on";
      const file = testInfo.outputPath(`alicia-${state}.webm`);
      const job = report.webm[state] = { path: file };
      try {
        await seek(page, 0);
        await setGi(page, state === "on");
        const snapshot = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        expect(snapshot.lighting.rcDiffuseGi).toMatchObject({ enabled: state === "on", volume: null });
        await exportRcWebm(launched, page, file, range);
        const decoded = await decodeRcWebm(page, file, { ...range, frames });
        images[state].webm = decoded;
        job.motion = motion(decoded);
        expect.soft(job.motion).toBeGreaterThan(.2);
        job.references = decoded.map((image, i) => {
          writeFileSync(testInfo.outputPath(`decoded-${state}-${frames[i]}.png`), PNG.sync.write(image));
          const matching = compareRegion(images[state].single[i], image, masks[i]).mae;
          const opposite = compareRegion(images[other].single[i], image, masks[i]).mae;
          expect.soft(matching, `frame ${frames[i]}: decoded GI ${state} vs both reference stills`).toBeLessThan(opposite);
          return { frame: frames[i], matching, opposite };
        });
        job.status = "decoded";
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        preserveLog(`editor-export-${state}.log`);
      }
      saveReport();
    }
    if (images.on.webm && images.off.webm) compareFormat("webm");
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.consoleErrors).toEqual([]);
    expect(Object.values(report.webm).filter(job => job.status !== "decoded")).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    preserveLog("editor-export.log");
    saveReport();
    await launched.close();
  }
});
