import { test, expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, difference, giVolume, initialState, numberControl, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { setRcLightingEnabled } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const alicia = process.env.MMD_RC_PLAYBACK_ALICIA === "1";
const character = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const motion = resolve(root, "local-references/model/Alicia/MMD Motion/2分ループステップ20.vmd");
const probeUrl = "/test/e2e/helpers/rc-combined-performance-probe.mjs";
const invoke = (page, method, value) => page.evaluate(async ({ method, value, probeUrl }) => {
  const probe = await import(probeUrl);
  return probe[method](value);
}, { method, value, probeUrl });
const output = process.env.MMD_RC_PLAYBACK_OUTPUT, baseline = process.env.MMD_RC_PLAYBACK_BASELINE;
async function loadAliciaDance(app, page) {
  await page.evaluate(path => window.mmdModokiE2e.loadModel(path), character);
  await page.locator("#info-model-select").selectOption("1");
  await app.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, motion);
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator('[data-menu-command="file.openMotion"]').click();
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models[1]?.motionImports), { timeout: 45000 })
    .toContainEqual({ type: "vmd", path: motion });
}
function visibleMotion(first, second) {
  let pixels = 0, maximum = 0;
  for (let i = 0; i < first.data.length; i += 4) {
    const delta = Math.max(Math.abs(first.data[i] - second.data[i]),
      Math.abs(first.data[i + 1] - second.data[i + 1]), Math.abs(first.data[i + 2] - second.data[i + 2]));
    if (delta >= 8) pixels++;
    maximum = Math.max(maximum, delta);
  }
  return { pixels, maximum };
}
const cases = [{ id: "gi-sky-off", gi: false, sky: false }, { id: "gi-sky-on", gi: true, sky: true }];
if (process.env.MMD_RC_PLAYBACK_SINGLE_EFFECTS === "1") {
  cases.push({ id: "gi-only", gi: true, sky: false }, { id: "sky-only", gi: false, sky: true });
}
for (const setting of cases) {
  const { gi, sky } = setting, id = alicia ? `alicia-${setting.id}` : setting.id;
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
  test(`RC normal playback: ${id}`, async ({}, testInfo) => {
    test.skip(alicia && (!existsSync(character) || !existsSync(motion)), "Optional Alicia PMX and bundled motion are not installed");
    test.setTimeout(240000);
    const app = await launchMmdModoki(root);
    const report = { id, errors: [], consoleErrors: [], captures: {} };
    const directory = output ? resolve(output) : testInfo.outputDir;
    mkdirSync(directory, { recursive: true });
    try {
      const page = await app.app.firstWindow();
      await page.addInitScript(() => {
        const proto = window.GPUAdapter?.prototype;
        if (!proto) return;
        const request = proto.requestDevice;
        proto.requestDevice = function (descriptor = {}) {
          const features = new Set(descriptor.requiredFeatures);
          if (this.features.has("timestamp-query")) features.add("timestamp-query");
          return request.call(this, { ...descriptor, requiredFeatures: [...features] });
        };
      });
      await page.reload();
      page.on("pageerror", error => report.errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(url => import(url).then(() => true), probeUrl);
      await initialState(page);
      await page.evaluate(async volume => {
        const state = window.mmdModokiE2e.exportProjectState();
        state.lighting.rcDiffuseGi.volume = volume;
        state.lighting.rcSkyOcclusion = { enabled: false, strength: .75, minimum: .2, volume };
        await window.mmdModokiE2e.importProjectState(state);
      }, alicia ? { min: [-16, -4, -16], size: 32 } : giVolume);
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
      if (alicia) {
        await loadAliciaDance(app, page);
      } else {
        await page.locator("#info-model-select").selectOption("0");
        const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "光遮蔽板")?.category);
        expect(category).toBeTruthy();
        for (const [frame, x] of [[0, 0], [60, -20], [300, 0]]) {
          await seek(page, frame); await selectTimelineTrack(page, category, "光遮蔽板");
          await numberControl(page, "tx", x); await page.locator("#btn-bone-keyframe").click();
        }
      }
      await seek(page, 0); report.camera = await camera(page, alicia ? { tx: 0, ty: 9, rx: -4, ry: 10, camDistance: 44 } : {});
      await setRcLightingEnabled(page, "rcDiffuseGi", gi);
      await setRcLightingEnabled(page, "rcSkyOcclusion", sky);
      report.fixture = await invoke(page, alicia ? "prepareAliciaPlaybackStage" : "createRcPlaybackFixture");
      report.prepared = await invoke(page, "prepareCombinedPerformance", { width: 1280, height: 720 });
      expect(report.prepared.size).toEqual([1280, 720]);
      const play = page.locator("#viewport-seek-play-toggle");
      await play.click();
      report.measurement = await invoke(page, "measureCombinedPerformance", { warmFrames: 12, frames: 80, completionFrames: 0 });
      const { realtime } = report.measurement;
      expect(realtime.frames).toBe(80);
      expect(realtime.state.size).toEqual([1280, 720]);
      expect(new Set(realtime.samples.map(row => row.frame)).size).toBeGreaterThan(10);
      expect(realtime.samples.at(-1).frame).toBeGreaterThan(realtime.samples[0].frame);
      if (realtime.state.deviceTimestampQuery) expect(realtime.gpu.completeFrames).toBe(80);
      for (const [effect, active] of [["gi", gi], ["sky", sky]]) {
        expect(realtime.state[effect].status).toBe(active ? "ready" : "off");
        if (active) expect(realtime.state[effect].triangleCount).toBeGreaterThan(alicia ? report.fixture.staticTriangles + 36 : 50000);
      }
      if (gi || sky) {
        expect(realtime.counts.sourceUpdates).toBeGreaterThan(0);
        expect(realtime.counts.computeDispatches).toBeGreaterThan(0);
      } else {
        expect(realtime.counts.sourceUpdates ?? 0).toBe(0);
        expect(realtime.counts.computeDispatches ?? 0).toBe(0);
      }
      await play.click();
      const images = [];
      for (const [index, frame] of [0, 60, 0].entries()) {
        await invoke(page, "setCombinedReferencePose", frame);
        const path = testInfo.outputPath(`seek-${index}`); mkdirSync(path, { recursive: true });
        const capture = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1280, 720), path);
        const image = PNG.sync.read(readFileSync(capture.path));
        expect(capture.surfaceReleased).toBe(true);
        const name = `${id}-${index}-frame${frame}.png`; copyFileSync(capture.path, resolve(directory, name));
        const entry = { name, frame };
        if (alicia) for (const [effect, active] of [["gi", gi], ["sky", sky]]) {
          if (!active) continue;
          const atlas = Buffer.from(await invoke(page, "readPlaybackNearestAtlas", effect));
          const name = `${id}-${index}-frame${frame}-${effect}.rgba32f`;
          writeFileSync(resolve(directory, name), atlas);
          if (baseline) expect(atlas.equals(readFileSync(resolve(baseline, name))), name).toBe(true);
        }
        if (baseline) {
          const reference = PNG.sync.read(readFileSync(resolve(baseline, name)));
          entry.baselineMae = difference(reference, image);
          expect(image.data.equals(reference.data), name).toBe(true);
        }
        report.captures[index] = entry; images.push(image);
      }
      report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
      report.motionMae = difference(images[0], images[1]); report.returnMae = difference(images[0], images[2]);
      report.motion = visibleMotion(images[0], images[1]);
      expect(report.motion.pixels).toBeGreaterThan(100); expect(report.motion.maximum).toBeGreaterThan(16);
      expect(report.returnMae).toBe(0);
      expect(images[0].data.equals(images[2].data)).toBe(true);
      const timing = realtime.gpu;
      console.log(id, { intervalMedianMs: realtime.intervalMs.median, intervalP95Ms: realtime.intervalMs.p95,
        cpuMedianMs: realtime.cpuMs.engineFrame.median, gpuMedianMs: timing.passSumMs?.median,
        sourceMedianMs: realtime.cpuMs.source?.median, dispatches: realtime.counts.computeDispatches ?? 0 });
    } finally {
      writeFileSync(resolve(directory, `${id}.json`), JSON.stringify(report, null, 2));
      await app.close();
    }
  });
}
