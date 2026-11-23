import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { changeDirection, directions, makeCourtyard, measureRegion, regions, shadow } from "./helpers/rc-moire-courtyard.mjs";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, project, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { setRcLightingEnabled } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("flat walls separate light-direction moire across ordinary shadows, RC GI and Sky Ambient", async ({}, testInfo) => {
  test.setTimeout(300000);
  const launched = await launchMmdModoki(root);
  const report = { cases: {}, changes: {}, shadowMaskOverlap: {}, referenceShadows: [], errors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", e => report.errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      Object.assign(state.lighting, { shadowEnabled: true, iblShadowsEnabled: false, characterContactShadowEnabled: false,
        rcDiffuseGi: { enabled: false, quality: "standard", rangeScale: .5, volume: null, strength: .85 } });
      await window.mmdModokiE2e.importProjectState(state);
    });
    const path = resolve(launched.tempDir, "courtyard.pmx");
    writeFileSync(path, makeCourtyard());
    expect(await page.evaluate(p => window.mmdModokiE2e.loadModel(p), path)).not.toBeNull();
    report.view = await camera(page, { tx: -1.96, ty: 89.52, tz: 100, rx: 2.4, ry: 5.5, camDistance: 98.4, camFov: 32.3 });
    const projected = Object.fromEntries(Object.entries(regions).map(([id, world]) => [id, projectPoints(report.view, world)]));
    await setRcLightingEnabled(page, "rcDiffuseGi", false);
    await setRcLightingEnabled(page, "rcSkyAmbient", false);
    const comparisons = {}, skyWithoutShadows = [];
    const pairs = async prefix => {
      const masks = [];
      for (const [i,direction] of directions.entries()) {
        await changeDirection(page, direction);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const name = `${prefix}-z${direction[2]}`;
        const png = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${name}.png`) }));
        const state = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
        const lighting = (await project(page)).lighting;
        if (prefix === "shadow-sky" && i === 0) {
          report.skyMaterials = await page.evaluate(async () => {
            // eslint-disable-next-line import/no-unresolved -- Renderer-side fixture diagnostics.
            const { inspectSkyAmbientMaterials } = await import("/test/e2e/helpers/rc-sky-ambient-probe.mjs");
            return inspectSkyAmbientMaterials().filter(item => /^White (back|side)$/.test(item.material)).map(item => {
              const anchor = item.fragment.indexOf("rcSkyAmbientBeforeLight");
              return { material: item.material, toon: item.toon, defines: item.defines.split("\n").filter(line =>
                /TOON|SHADOW|HEMILIGHT|DIRLIGHT|RC_SKY|LIGHT[0-9]/.test(line)),
              composition: anchor < 0 ? "" : item.fragment.slice(anchor, anchor + 7000) };
            });
          });
        }
        expect(state.engine).toBe("WebGPU");
        expect(state.lightSamplingEnabled).toBe(lighting.shadowEnabled);
        if (lighting.shadowEnabled) expect(state.casterCount).toBeGreaterThan(0);
        if (prefix === "no-shadow-sky") skyWithoutShadows[i] = png;
        const reference = prefix === "shadow-sky" ? skyWithoutShadows[i] : null;
        if (reference) expect([png.width, png.height]).toEqual([reference.width, reference.height]);
        const measured = Object.fromEntries(Object.entries(projected).map(([id,p]) => [id, measureRegion(png,p,reference)]));
        report.cases[name] = { size: [png.width,png.height], direction, shadows: state,
          gi: lighting.rcDiffuseGi, sky: lighting.rcSkyAmbient,
          regions: Object.fromEntries(Object.entries(measured).map(([id,m]) => [id,m.stats])) };
        masks[i] = measured;
      }
      report.changes[prefix] = Object.fromEntries(Object.keys(regions).map(id => {
        const a = masks[0][id].dark, b = masks[1][id].dark;
        const common = [...a].filter(index => b.has(index)).length;
        return [id, { both: common, onlyFirst: a.size - common, onlySecond: b.size - common }];
      }));
      comparisons[prefix] = masks;
    };
    for (const shadows of [false,true]) {
      await shadow(page, shadows);
      const name = shadows ? "shadow" : "no-shadow";
      await pairs(`${name}-base`);
      for (const [label,id] of [["gi","rcDiffuseGi"],["sky","rcSkyAmbient"]]) {
        await setRcLightingEnabled(page, id, true);
        await pairs(`${name}-${label}`);
        await setRcLightingEnabled(page, id, false);
      }
    }
    const plainReceiver = on => page.evaluate(async enabled => {
      // eslint-disable-next-line import/no-unresolved -- Imported in the local test application's renderer.
      const probe = await import("/test/e2e/helpers/rc-moire-shadow-probe.mjs");
      await probe.setPlainShadowReceiver(enabled);
    }, on);
    await plainReceiver(true);
    await shadow(page, false);
    await pairs("plain-clear");
    await shadow(page, true);
    await pairs("plain-shadow");
    await plainReceiver(false);
    for (const label of ["shadow-base", "shadow-gi", "shadow-sky"]) {
      report.shadowMaskOverlap[label] = comparisons[label].map((surfaces,i) => Object.fromEntries(Object.keys(regions).map(id => {
        const measured = surfaces[id].dark, plain = comparisons["plain-shadow"][i][id].dark;
        return [id, { common: [...measured].filter(pixel => plain.has(pixel)).length, measured: measured.size, plain: plain.size }];
      })));
    }
    for (const [i, direction] of directions.entries()) {
      const samples = Object.fromEntries(Object.entries(report.cases).filter(([id]) => id.endsWith(`-z${direction[2]}`))
        .map(([id,sample]) => [id.split("-z")[0],sample]));
      const baseline = samples["no-shadow-base"].regions, bounced = samples["no-shadow-gi"].regions;
      for (const surface of ["grayBack", "graySide"]) {
        expect(baseline[surface].mean).toBeGreaterThan(10);
        expect(bounced[surface].clipped).toBeLessThan(bounced[surface].pixels * .01);
        expect(bounced[surface].mean).toBeGreaterThan(baseline[surface].mean + 1);
        for (const phase of ["no-shadow-base", "no-shadow-gi", "shadow-base", "shadow-gi"]) {
          const { darkCount, pixels } = samples[phase].regions[surface];
          expect(darkCount / pixels, `${phase} dark dots on ${surface}`).toBeLessThan(.0005);
        }
        expect(samples["no-shadow-sky"].regions[surface].darkCount).toBeLessThan(baseline[surface].pixels * .001);
      }
      const unshadowedSky = samples["no-shadow-sky"].regions, sky = samples["shadow-sky"].regions;
      // This MMD no-Toon material bypasses the normal shadow mask in its own
      // diffuse term. Sky should still darken sheltered surfaces with shadows off.
      expect(Object.keys(regions).some(id => baseline[id].mean - unshadowedSky[id].mean > 2)).toBe(true);
      for (const surface of Object.keys(regions)) {
        const on = comparisons["shadow-sky"][i][surface].dark, off = comparisons["no-shadow-sky"][i][surface].dark;
        const newDots = [...on].filter(pixel => !off.has(pixel)).length;
        expect(newDots / sky[surface].pixels, `new shadow-map dots on ${surface}`).toBeLessThan(.0005);
        expect(sky[surface].shadowToggleRgbMae, `shadow toggle on ${surface}`).toBeLessThan(.5);
      }
      // The canopy must cast a real shadow on the diagnostic material. Record
      // any dots in the same mask so improved shadow filtering can remove them.
      const clear = comparisons["plain-clear"][i], shadowed = comparisons["plain-shadow"][i];
      const newDots = [...shadowed.whiteBack.dark].filter(pixel => !clear.whiteBack.dark.has(pixel)).length;
      const canopyDarkening = clear.whiteSide.stats.mean - shadowed.whiteSide.stats.mean;
      report.referenceShadows.push({ direction, newDotsOnBack: newDots, canopyDarkening });
      expect(canopyDarkening, `ordinary canopy shadow at Z=${direction[2]}`).toBeGreaterThan(3);
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
