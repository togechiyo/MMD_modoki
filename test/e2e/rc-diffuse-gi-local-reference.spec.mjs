import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, closeGi, giInput, giSection, giSlider, openGi, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const references = [
  { id: "lighthouse", kind: "pmx", path: resolve(root, "local-references/stage/灯台ステージ/灯台ステージ.pmx"), close: { center: [0, 40, 0], size: 200, distance: 450 } },
  { id: "powerplant", kind: "obj", path: resolve(root, "local-references/babylonjs/powerplant/powerplant.obj"), close: { center: [0, 8, 0], size: 80, distance: 160 } },
];
// eslint-disable-next-line import/no-unresolved -- Browser module served by the E2E Vite server.
const probe = (page, name) => page.evaluate(async name => (await import("/test/e2e/helpers/rc-diffuse-gi-reference-probe.mjs"))[name](), name);
// eslint-disable-next-line import/no-unresolved -- Browser module served by the E2E Vite server.
const perf = (page, name, value) => page.evaluate(async ({ name, value }) => (await import("/test/e2e/helpers/rc-diffuse-gi-performance-probe.mjs"))[name](value), { name, value });

function compare(off, on) {
  let all = 0, foreground = 0, sum = 0, maximum = 0, changed = 0, aboveTwo = 0, aboveEight = 0;
  const channel = [0, 0, 0], values = [];
  for (let i = 0; i < off.data.length; i += 4) {
    const delta = [0, 1, 2].map(c => Math.abs(on.data[i + c] - off.data[i + c]));
    all += (delta[0] + delta[1] + delta[2]) / 3;
    // The diagnostic background is black. Keep visible geometry out of whole-image dilution.
    if (Math.max(...off.data.subarray(i, i + 3)) <= 3 && Math.max(...on.data.subarray(i, i + 3)) <= 3) continue;
    foreground++; const mean = (delta[0] + delta[1] + delta[2]) / 3, peak = Math.max(...delta);
    sum += mean; maximum = Math.max(maximum, peak); values.push(mean);
    if (peak > 0) changed++; if (peak > 2) aboveTwo++; if (peak > 8) aboveEight++;
    for (let c = 0; c < 3; c++) channel[c] += on.data[i + c] - off.data[i + c];
  }
  values.sort((a, b) => a - b);
  return { foregroundPixels: foreground, wholeImageMae: all / (off.width * off.height),
    foregroundMae: sum / Math.max(1, foreground), rgbSigned: channel.map(x => x / Math.max(1, foreground)),
    maximum, changedFraction: changed / Math.max(1, foreground), aboveTwoFraction: aboveTwo / Math.max(1, foreground),
    aboveEightFraction: aboveEight / Math.max(1, foreground), p95: values[Math.floor(values.length * .95)] ?? 0 };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixture argument to be destructured.
for (const reference of references) test(`RC GI local reference: ${reference.id}`, async ({}, testInfo) => {
  test.skip(process.env.MMD_RC_GI_LOCAL_REFERENCE !== "1" || !existsSync(reference.path), "Optional authorized local reference audit");
  test.skip(Boolean(process.env.MMD_RC_GI_REFERENCE) && process.env.MMD_RC_GI_REFERENCE !== reference.id, "Another reference selected");
  test.setTimeout(360000);
  const launched = await launchMmdModoki(root), report = { reference: reference.id, errors: [], consoleErrors: [], captures: {}, cases: {},
    interpretation: "Local reference audit, not a fixture-only quality test. Same-process OFF/ON timings are diagnostic, not a hardware speedup benchmark. No reference assets are published." };
  let page;
  try {
    page = await launched.app.firstWindow();
    await page.addInitScript(() => { const Adapter = window.GPUAdapter; if (!Adapter) return; const request = Adapter.prototype.requestDevice;
      Adapter.prototype.requestDevice = function (descriptor = {}) { const features = new Set(descriptor.requiredFeatures ?? []);
        if (this.features.has("timestamp-query")) features.add("timestamp-query"); return request.call(this, { ...descriptor, requiredFeatures: [...features] }); }; });
    await page.reload();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await probe(page, "readReferenceState").catch(() => null);
    await perf(page, "giPerformanceState").catch(() => null);
    await page.evaluate(async () => { const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      state.lighting.rcDiffuseGi = { enabled: false, strength: .5, volume: null };
      await window.mmdModokiE2e.importProjectState(state); });
    const loaded = await page.evaluate(async ({ path, kind }) => kind === "pmx"
      ? window.mmdModokiE2e.loadModel(path) : window.mmdModokiE2e.loadAccessory(path), reference);
    expect(loaded).not.toBe(false);
    await openGi(page); await closeGi(page);
    report.scene = await probe(page, "inspectReferenceScene");
    const { center, size } = report.scene.framing;
    report.camera = await camera(page, { tx: center[0], ty: center[1], tz: center[2], rx: -20, ry: -25, camDistance: size * 1.7 });
    report.lighting = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    await perf(page, "prepareGiPerformance", { width: 1280, height: 720 });
    report.offPerformance = await perf(page, "measureGiPerformance", { warmFrames: 8, frames: 24, completionFrames: 4 });
    const off = await capture(page, testInfo, report, "off");
    await setGi(page, true);
    const automatic = await capture(page, testInfo, report, "auto-25");
    report.cases.auto25 = compare(off, automatic);
    report.autoField = await probe(page, "inspectReferenceField");
    await perf(page, "prepareGiPerformance", { width: 1280, height: 720 });
    report.onPerformance = await perf(page, "measureGiPerformance", { warmFrames: 8, frames: 24, completionFrames: 4 });
    await openGi(page); await giSlider(page, 100); await closeGi(page);
    const strong = await capture(page, testInfo, report, "auto-100"); report.cases.auto100 = compare(off, strong);
    // Same geometry/camera/light; isolate loss from fitting the entire scene into one cube.
    const fixVolume = async (center, size) => {
      const round = value => Math.round(value * 10) / 10;
      const volume = { min: center.map(value => round(value - size / 2)), size: round(size) };
      await openGi(page); await giSlider(page, 25);
      for (const [field, value] of [["MinX", volume.min[0]], ["MinY", volume.min[1]], ["MinZ", volume.min[2]], ["Size", volume.size]]) await giInput(page, field).fill(String(value));
      await giInput(page, "Size").press("Enter"); await closeGi(page);
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.rcDiffuseGi.volume)).toEqual(volume);
      return volume;
    };
    report.framedVolume = await fixVolume(center, size);
    const local = await capture(page, testInfo, report, "framed-25"); report.cases.framed25 = compare(off, local);
    report.framedField = await probe(page, "inspectReferenceField");
    await setGi(page, false);
    const restored = await capture(page, testInfo, report, "off-restored"); report.offRestored = compare(off, restored);
    expect(report.offRestored.foregroundMae).toBeLessThan(.1);

    const close = reference.close;
    report.closeCamera = await camera(page, { tx: close.center[0], ty: close.center[1], tz: close.center[2], rx: -15, ry: -25, camDistance: close.distance });
    const closeOff = await capture(page, testInfo, report, "close-off");
    await openGi(page); await giInput(page, "Enabled").check();
    await giSection(page).getByRole("button", { name: /^(自動範囲|Automatic volume)$/ }).click();
    await closeGi(page);
    const closeAuto = await capture(page, testInfo, report, "close-auto-25"); report.cases.closeAuto25 = compare(closeOff, closeAuto);
    report.closeVolume = await fixVolume(close.center, close.size);
    const closeLocal = await capture(page, testInfo, report, "close-local-25"); report.cases.closeLocal25 = compare(closeOff, closeLocal);
    report.closeField = await probe(page, "inspectReferenceField");
    // Preserve an amplified difference solely as a labelled diagnostic artifact.
    const diff = new PNG({ width: off.width, height: off.height });
    for (let i = 0; i < diff.data.length; i += 4) { for (let c = 0; c < 3; c++) diff.data[i + c] = Math.min(255, Math.abs(automatic.data[i + c] - off.data[i + c]) * 16); diff.data[i + 3] = 255; }
    writeFileSync(testInfo.outputPath("auto-25-difference-x16.png"), PNG.sync.write(diff));
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
    for (const item of Object.values(report.cases)) expect(item.foregroundPixels).toBeGreaterThan(1000);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
