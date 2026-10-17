import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const run = Date.now().toString();

async function probe(page, args) {
  return page.evaluate(async args => {
    const helper = await import("/test/e2e/helpers/wide-shadow-stage-travel-probe.mjs");
    return helper.travelTo(args);
  }, args);
}

function profile(png, state) {
  const pixel = (x, y) => png.data[(Math.round(y * png.height / state.height) * png.width + Math.round(x * png.width / state.width)) * 4];
  const grouped = new Map();
  for (const sample of state.samples) {
    const clear = pixel(sample.clearX, sample.clearY), shadow = pixel(sample.x, sample.y);
    if (clear < 100) continue;
    const rows = grouped.get(sample.z) ?? [];
    rows.push({ ratio: shadow / clear, y: Math.round(sample.y * png.height / state.height), depth: sample.depth });
    grouped.set(sample.z, rows);
  }
  return [...grouped].flatMap(([z, rows]) => {
    if (rows.length !== 3) return [];
    rows.sort((a, b) => a.ratio - b.ratio);
    const row = rows[1];
    const splitDistance = Math.min(...state.breaks.slice(0, -1).map(depth => Math.abs(depth - row.depth)));
    return [{ z, ratio: row.ratio, y: row.y, depth: row.depth, splitDistance }];
  });
}

for (const backend of ["classic", "frameGraph"]) for (const penumbra of [false, true]) {
  test(`inspects moving-camera cascade boundaries: ${backend} penumbra=${penumbra}`, async () => {
    const app = await launchMmdModoki(root);
    const output = resolve(root, "artifacts/e2e/wide-shadow-stage-travel", run, `${backend}-${penumbra ? "pcss" : "none"}`);
    mkdirSync(output, { recursive: true });
    try {
      const page = await app.app.firstWindow();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(backend => localStorage.setItem("mmd_modoki.postEffectBackend", backend), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(async penumbra => {
        const project = window.mmdModokiE2e.exportProjectState();
        project.lighting.shadowPenumbraEnabled = penumbra;
        await window.mmdModokiE2e.importProjectState(project);
      }, penumbra);
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/shadow-stage/shadow-stage-wide.pmx"));
      await page.locator("#btn-toolbar-mode-toggle").click();
      await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
      expect(await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({
        effectiveMode: "cascaded", engine: "WebGPU", filter: penumbra ? "pcss" : "none",
      });
      await page.evaluate(() => window.mmdModokiE2e.setLightDirection({ x: 1, y: -2, z: 0 }));
      const report = [];
      for (const route of ["track", "dolly"]) {
        await page.locator("#light-shadow-max-z").fill(route === "track" ? "1000" : "10000");
        const command = page.locator('[data-menu-command="view.lightShadowSettings"]');
        await page.locator(".app-menu-group", { has: command }).locator(".app-menu-trigger").click();
        await command.click();
        await page.locator("#light-shadow-distance-multiplier").fill(route === "track" ? "1" : "2");
        await page.keyboard.press("Escape");
        const count = route === "track" ? 41 : 33;
        const pose = t => route === "track"
          ? { position: { x: 80, y: 80, z: -100 + t * 3500 }, target: { x: -30, y: 1, z: 250 + t * 3500 } }
          : { position: { x: 80 + t * 4120, y: 80 + t * 4720, z: -100 - t * 4100 }, target: { x: -30 + t * 30, y: 1 - t, z: 250 + t * 1750 } };
        await probe(page, pose(0));
        await page.evaluate(async () => (await import("/test/e2e/helpers/wide-shadow-stage-travel-probe.mjs")).startTravelRecording());
        for (let index = 0; index < count; index++) {
          const state = await probe(page, pose(index / (count - 1)));
          expect(state.falloff).toBe(0);
          const file = `${route}-${String(index).padStart(3, "0")}.png`;
          const png = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: resolve(output, file) }));
          const rows = profile(png, state);
          report.push({ route, index, file, ...state, samples: undefined, profile: rows });
        }
        const video = await page.evaluate(async () => (await import("/test/e2e/helpers/wide-shadow-stage-travel-probe.mjs")).stopTravelRecording());
        writeFileSync(resolve(output, `${route}.webm`), Buffer.from(video));
        if (penumbra && route === "track") {
          const state = await probe(page, { ...pose(0), legacy: true });
          const png = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: resolve(output, "legacy.png") }));
          report.push({ route: "legacy", index: 0, ...state, samples: undefined, profile: profile(png, state) });
          await probe(page, pose(0));
        }
      }
      writeFileSync(resolve(output, "report.json"), JSON.stringify(report));
      const summary = report.map(({ route, index, position, breaks, profile }) => ({
        route, index, position, breaks, samples: profile.length,
        nearSplit: profile.filter(row => row.splitDistance < 40).length,
        maxRatio: profile.length ? Math.max(...profile.map(row => row.ratio)) : null,
      }));
      writeFileSync(resolve(output, "summary.json"), JSON.stringify(summary, null, 2));
      console.log(JSON.stringify({ output, frames: report.length, samples: report.reduce((sum, frame) => sum + frame.profile.length, 0) }));
      expect(report.filter(frame => frame.route !== "legacy")).toHaveLength(74);
      expect(report.reduce((sum, frame) => sum + frame.profile.length, 0)).toBeGreaterThan(1000);
      const boundaryRows = report.filter(frame => frame.route !== "legacy").flatMap(frame => frame.profile).filter(row => row.splitDistance < 40);
      expect(boundaryRows.length).toBeGreaterThan(500);
      // MMD Standard uses a non-black shadow tint. A ratio above 0.94 is an
      // almost unshadowed gap; the legacy positive control reaches 1.0.
      expect(Math.max(...boundaryRows.map(row => row.ratio))).toBeLessThan(0.94);
      if (penumbra) {
        const legacyRows = report.find(frame => frame.route === "legacy").profile.filter(row => row.splitDistance < 40);
        expect(Math.max(...legacyRows.map(row => row.ratio))).toBeGreaterThan(0.94);
      }
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
}
