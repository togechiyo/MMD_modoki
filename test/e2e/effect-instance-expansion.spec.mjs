import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance, selectEffectInstance, dragEffectStackRow } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const requestedGroup = process.env.MMD_INSTANCE_EFFECT_GROUP;
const groups = requestedGroup ? [requestedGroup] : ["screen", "depth", "remaining"];
const difference = (a, b) => a.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : Math.abs(value - b[i])), 0) / (a.length * 0.75);
const seek = async (page, frame) => { const input = page.locator("#current-frame"); await input.fill(String(frame)); await input.press("Enter"); await expect(input).toHaveValue(String(frame)); };
async function menu(page, command) { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); }

for (const group of groups) test(`${group === "depth" ? "LUT and depth effects" : group === "remaining" ? "remaining effects" : "screen effects"}: independent instances, keys, color, lifecycle, project and output`, async ({}, testInfo) => {
  const depthGroup = group === "depth", remainingGroup = group === "remaining";
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root), report = { errors: [], effects: [] };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") (report.consoleErrors ??= []).push(message.text()); });
    page.on("dialog", async dialog => { (report.dialogs ??= []).push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
    launched.app.process().stderr.on("data", data => { report.stderrTail = `${report.stderrTail ?? ""}${data}`.slice(-12000); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false; project.lighting.shadowEnabled = false; project.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    if (remainingGroup) {
      await page.locator('[data-effect-tab="materials"]').click(); await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
      await page.evaluate(async () => (await import("/test/e2e/helpers/remaining-effect-probe.mjs")).createRemainingEffectProbe());
    }
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const input = page.locator(`#bone-controls input[data-control-key='${key}']`); await input.fill(String(value)); await input.press("Enter");
    }
    const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const add = async type => { await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click(); };
    const number = async (id, position, value) => { await expandEffectInstance(row(id)); const input = row(id).locator(".range-number-input").nth(position); await input.fill(String(value)); await input.press("Enter"); };
    const select = async id => { await selectEffectInstance(row(id)); await expect(row(id).locator(".effect-layer-details")).toBeVisible(); await expect(page.locator("#effect-key-controls")).toHaveCount(0); };
    const capture = async name => {
      const dir = testInfo.outputPath(name); mkdirSync(dir, { recursive: true });
      await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 640, 360), dir);
      return PNG.sync.read(readFileSync(resolve(dir, "single_rgba_surface_e2e.png"))).data;
    };
    const active = [];
    for (const type of remainingGroup ? ["luminous", "ssao", "ssgi", "ssr", "motionBlur"] : depthGroup ? ["lut", "aerialPerspective", "directionalLightShafts", "offsetShadow", "offsetHighlight"] : ["grain", "sharpen", "chromatic", "vignette", "edgeBlur", "distortion", "bloom"]) {
      await add(type); await add(type);
      const entries = (await state()).instances.filter(item => item.type === type), [a, b] = entries.map(item => item.instanceId);
      active.push(a);
      expect(entries).toHaveLength(2); expect(entries[0].settings.enabled).toBe(true);
      if (type === "luminous") expect(entries[0].settings).toEqual({ enabled: true, intensity: 1, threshold: 0.15, radius: 48 });
      await number(b, 0, 14); await row(b).locator('[data-instance-field="enabled"]').uncheck();
      const bSettings = (await state()).instances.find(item => item.instanceId === b).settings;
      await number(a, 0, 10); await row(a).locator('[data-instance-field="enabled"]').uncheck();
      if (type === "bloom") {
        await number(a, 1, 10); await number(a, 2, 30);
        for (const [id, color] of [[a, "#ff8080"], [b, "#8080ff"]]) {
          await expandEffectInstance(row(id));
          const input = row(id).locator('[data-instance-field="color"]'); await input.fill(color); await input.dispatchEvent("change");
        }
        await expandEffectInstance(row(a));
      }
      if (type === "luminous") { await number(a, 1, 0); await number(a, 2, 40); }
      if (type === "ssao") {
        await expect(row(a).locator('[data-instance-field="color"], [data-instance-fixed="toonInfluence"]')).toHaveCount(0);
      }
      if (type === "ssgi") await expect(row(a).locator('[data-instance-field="blendMode"]')).toHaveCount(0);
      if (type === "motionBlur") { const samples = row(a).locator('[data-instance-fixed="samples"]'); await samples.fill("71"); await samples.dispatchEvent("input"); await samples.dispatchEvent("change"); }
      if (type === "lut") {
        await row(a).locator('select[data-instance-field="lutPreset"]').selectOption("monotone");
        await expandEffectInstance(row(b));
        await row(b).locator('select[data-instance-field="lutPreset"]').selectOption("sepia");
        await expandEffectInstance(row(a));
        await launched.app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, resolve(root, "test/fixtures/lut/synthetic-channel-swap.cube"));
        await row(a).locator('[data-instance-action="lutFile"]').click();
        await expect(row(a).locator('select[data-instance-field="lutPreset"]')).toHaveValue("external");
        expect((await state()).instances.find(item => item.instanceId === a).fixedSettings.lut.runtimeText).toContain("4095");
      }
      if (type === "aerialPerspective") { await number(a, 1, 0); await number(a, 2, 3); }
      if (type === "offsetShadow") {
        await number(a, 1, 70); await number(a, 2, 30); await number(a, 3, 0); await number(a, 4, 100); await number(a, 5, 100);
        await expect(row(a).locator('[data-instance-fixed="softness"], [data-instance-fixed="thickness"]')).toHaveCount(0);
      }
      if (type === "offsetHighlight") { await number(a, 1, 70); await number(a, 2, 30); await number(a, 3, 100); }
      if (depthGroup && type !== "lut") {
        const color = row(a).locator('[data-instance-field="color"]'); await color.fill(type === "offsetShadow" ? "#402010" : "#80d0ff"); await color.dispatchEvent("change");
      }
      await select(a); await seek(page, 0); await page.locator("#btn-kf-add").click();
      await seek(page, 20); await number(a, 0, 90); await row(a).locator('[data-instance-field="enabled"]').check(); await page.locator("#btn-kf-add").click();
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
      await seek(page, 10); await expect(row(a).locator(".range-number-input").first()).toHaveValue("50");
      await expect(row(a).locator('[data-instance-field="enabled"]')).not.toBeChecked();
      await seek(page, 20); await expect(row(a).locator('[data-instance-field="enabled"]')).toBeChecked();
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
      expect((await state()).instances.find(item => item.instanceId === b).settings).toEqual(bSettings);
      await seek(page, 0); const off = await capture(`${type}-off`);
      await seek(page, 20); const on = await capture(`${type}-on`);
      const diff = difference(off, on);
      // Object velocity is zero in stopped PNG captures. Its animated path has a separate scenario.
      if (type !== "motionBlur") expect(diff).toBeGreaterThan(0.001);
      report.effects.push({ type, difference: diff });
      await select(a); await page.locator("#btn-kf-copy").click(); await select(b); await seek(page, 40); await page.locator("#btn-kf-paste").click();
      expect((await state()).instances.find(item => item.instanceId === b).animation.tracks[0].keys.map(key => key.frame)).toEqual([40]);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      await expandEffectInstance(row(a)); await row(a).locator('[data-instance-action="duplicate"]').click();
      const c = (await state()).instances.find(item => item.type === type && ![a, b].includes(item.instanceId)).instanceId;
      const source = (await state()).instances.find(item => item.instanceId === a), copy = (await state()).instances.find(item => item.instanceId === c);
      expect(copy.animation).toEqual(source.animation); expect(copy.bloomColor).toEqual(source.bloomColor);
      expect(copy.fixedSettings).toEqual(source.fixedSettings);
      await row(c).locator('[data-instance-action="delete"]').click(); await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      expect((await state()).instances.some(item => item.instanceId === c)).toBe(true);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
      await expandEffectInstance(row(a));
      await row(a).locator('[data-instance-action="suspend"]').click();
    }
    for (const id of active) { await expandEffectInstance(row(id)); await row(id).locator('[data-instance-action="resume"]').click(); }
    if (remainingGroup) {
      // Synthetic geometry is only a fixture for the individual shader comparisons.
      // Output/backend tests use the saved PMX scene, which survives runtime recreation.
      await page.evaluate(async () => (await import("/test/e2e/helpers/remaining-effect-probe.mjs")).removeRemainingEffectProbe());
    }
    await seek(page, 0); const combined0 = await capture("combined-0");
    if (depthGroup || remainingGroup) {
      const diagnostics = await page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
      expect(diagnostics.resourcePlan.requirementKeys).toContain("viewDepth");
      expect(diagnostics.resourcePlan.needsDepthRenderer).toBe(false);
      expect(diagnostics.controller.taskNames).toContain("geometryRenderer");
      for (const type of ["aerialPerspective", "directionalLightShafts", "offsetShadow", "offsetHighlight"]) {
        expect(diagnostics.resourcePlan.activeEffects).not.toContain(type);
        expect(diagnostics.controller.taskNames).not.toContain(type);
      }
      report.preparedResources = diagnostics.resourcePlan;
      if (remainingGroup) {
        expect(diagnostics.resourcePlan.requirementKeys).toEqual(expect.arrayContaining(["viewNormal", "reflectivity", "velocity", "luminousMask"]));
        for (const type of ["luminous", "ssao", "ssgi", "ssr", "motionBlur"]) { expect(diagnostics.resourcePlan.activeEffects).not.toContain(type); expect(diagnostics.controller.taskNames).not.toContain(type); }
        expect(diagnostics.controller.instances).toHaveLength(10);
      }
    }
    await seek(page, 20); const combined20 = await capture("combined-20");
    expect(difference(combined0, combined20)).toBeGreaterThan(0.1);
    if (depthGroup || remainingGroup) {
      const before = await state();
      await page.locator("#btn-effect-toggle-framegraph").click();
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
      expect(await state()).toEqual(before);
      await page.locator("#btn-effect-toggle-framegraph").click();
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      report.masterRestoreDifference = difference(combined20, await capture("master-restored"));
      expect(report.masterRestoreDifference).toBeLessThan(0.15);
    }
    const beforeOrder = (await state()).order;
    await dragEffectStackRow(row(active[0]), row(active[1]), "before");
    expect((await state()).order).not.toEqual(beforeOrder);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); expect((await state()).order).toEqual(beforeOrder);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState()), file = testInfo.outputPath("screen-effects.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, file);
    await menu(page, "file.saveProject"); await expect.poll(() => existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).effects.frameGraphInstances).toEqual(saved.effects.frameGraphInstances);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(backend => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === backend, backend);
      await expect.poll(state).toEqual(saved.effects.frameGraphInstances);
      if (remainingGroup) await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
    }
    await seek(page, 20); expect(difference(combined20, await capture("restored"))).toBeLessThan(0.15);
    const webm = testInfo.outputPath("screen-effects.webm");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, webm);
    await menu(page, "file.webmExportSettings"); await page.locator("#webm-output-use-playback-range").uncheck();
    for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 20]]) {
      await page.locator(`#webm-output-${id}`).fill(String(value)); await page.locator(`#webm-output-${id}`).press("Enter");
    }
    await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck();
    await page.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(() => existsSync(webm) && statSync(webm).size > 1000, { timeout: 60000 }).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    const frames = await page.evaluate(async path => {
      const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video"), canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 360; const context = canvas.getContext("2d", { willReadFrequently: true });
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      try {
        const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error("Video decode failed")); }); video.src = url; await ready;
        const frames = [];
        for (const frame of [0, 20]) {
          const sought = new Promise(resolve => { video.onseeked = resolve; }); video.currentTime = (frame + 0.1) / 30; await sought;
          context.drawImage(video, 0, 0); frames.push(Array.from(context.getImageData(0, 0, 640, 360).data));
        }
        return frames;
      } finally { URL.revokeObjectURL(url); }
    }, webm);
    report.video = frames.map((frame, i) => ({ matching: difference(frame, i ? combined20 : combined0), opposite: difference(frame, i ? combined0 : combined20) }));
    for (const result of report.video) expect(result.matching).toBeLessThan(result.opposite);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
    expect(report.dialogs ?? []).toEqual([]);
    expect(report.consoleErrors ?? []).toEqual([]);
    if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
    await select(active.at(-1)); await page.screenshot({ path: testInfo.outputPath("final-ui.png") });
  } finally { writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2)); await launched.close(); }
});
