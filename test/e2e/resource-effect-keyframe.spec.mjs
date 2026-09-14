import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAerialShapeKeys } from "./aerial-shape-checks.mjs";
import { verifyEffectShapeKeys } from "./effect-shape-checks.mjs";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function selectEffect(page, id) {
  // Camera mode has one spacer row after Camera.
  const index = await page.evaluate(id => window.mmdModokiE2e.getTimelineTracks().findIndex(track => track.category === "effect" && track.name === id), id);
  expect(index).toBeGreaterThan(0);
  const y = 20 + (index + 1) * 18 + 9;
  const scroll = await page.locator("#timeline-labels").evaluate((element, y) => {
    element.scrollTop = Math.max(0, y - element.clientHeight + 30);
    return element.scrollTop;
  }, y);
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: y - scroll } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack)).toEqual({ name: id, category: "effect" });
}



const cases = [
  { id: "aerialPerspective", field: "strength", panel: "aerialPerspectiveStrength", max: 0.6, position: 100, static: "aerialPerspectiveStrength", defaults: { start: 0, range: 20 } },
  { id: "lut", field: "intensity", panel: "lutIntensity", max: 1, position: 100, static: "lutIntensity" },
  { id: "luminous", field: "intensity", panel: "luminousIntensity", max: 4, position: 400, static: "glowIntensity" },
];
for (const backend of ["frameGraph", "classic"]) {
for (const config of cases) {
if (config.id === "aerialPerspective" && backend === "classic") continue; // Existing effect renders only in Frame Graph.
test("resource " + config.id + " keys: " + backend + " GUI, roundtrip and output", async ({}, testInfo) => {
  const effectId = config.id;
  const shapeDefaults = config.defaults ?? (effectId === "luminous" ? { threshold: 0.5, radius: 20 } : {});
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("dialog", dialog => {
      if (dialog.type() !== "beforeunload") errors.push(dialog.message());
      void dialog.dismiss().catch(() => undefined);
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic" && effectId !== "lut") {
      await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.locator("#btn-toggle-shader-panel").click();
    if (effectId === "luminous") {
      await page.locator('[data-effect-tab="materials"]').click();
      await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
      await page.locator("#btn-shader-apply-all").click();
    }
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-toolbar-mode-toggle").click();
    // Enlarge the fixture so LUT and luminous differences are visible in exports.
    const fov = page.locator("#bone-controls input[data-control-key='camFov']");
    await fov.fill("30"); await fov.press("Enter");
    for (const [key, value] of [["ty", 1.5], ["camDistance", 14]]) {
      const input = page.locator("#bone-controls input[data-control-key='" + key + "']");
      await input.fill(String(value)); await input.press("Enter");
    }
    await selectEffect(page, effectId);
    if (effectId === "aerialPerspective") {
      for (const field of ["start", "range"]) {
        const input = page.locator('[data-effect-key-field="' + field + '"]');
        await input.fill("0"); await input.dispatchEvent("input");
      }
    }
    const enabled = page.locator("#effect-key-enabled");
    const slider = page.locator("#effect-key-value");
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const savedKeys = async () => (await state()).keyframes.effectAnimations.tracks.find(track => track.effectId === effectId);
    // The first prepared state is OFF: future ON must not allocate resources mid-playback.
    await enabled.uncheck();
    await slider.fill(String(config.position)); await slider.dispatchEvent("input");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    if (effectId === "aerialPerspective") {
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().stack)).toContain("aerialPerspective");
    }
    if (effectId === "luminous" && backend === "frameGraph") {
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().stack)).toContain("luminous");
    }
    if (effectId === "lut") {
      // A colored preset gives a strong output signal on the bundled minimal model.
      await enabled.check();
      await page.locator('[data-effect-stack-control="lutPreset"]').selectOption("sepia");
      await enabled.uncheck();
      if (backend === "classic") {
        // Static LUT selection lives in the FrameGraph panel. Switch with the
        // project intact, then exercise Classic key editing and output.
        await page.locator('select[data-postfx-select="backend"]').selectOption("classic", { force: true });
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        await selectEffect(page, effectId);
        await expect(enabled).not.toBeChecked();
      }
    }
    const initial = await state();
    const add = async (frame, on, position) => {
      await seek(page, frame);
      await enabled.setChecked(on);
      await slider.fill(String(position)); await slider.dispatchEvent("input");
      await page.locator("#btn-kf-add").click();
    };
    await add(0, true, config.position);
    await add(20, false, config.position / 2);
    await add(40, true, 0);
    const expectedKeys = [
      { frame: 0, value: { ...shapeDefaults, enabled: true, [config.field]: config.max } },
      { frame: 20, value: { ...shapeDefaults, enabled: false, [config.field]: config.max / 2 } },
      { frame: 40, value: { ...shapeDefaults, enabled: true, [config.field]: 0 } },
    ];
    expect((await savedKeys()).keys).toEqual(expectedKeys);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await savedKeys()).keys.map(key => key.frame)).toEqual([0, 20]);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect((await savedKeys()).keys).toEqual(expectedKeys);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(page, 10);
    await expect(slider).toHaveValue(String(config.position * 0.75));
    await expect(enabled).toBeChecked();
    await seek(page, 20);
    await expect(enabled).not.toBeChecked();
    await seek(page, 30);
    await expect(slider).toHaveValue(String(config.position / 4));
    await seek(page, 0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    // Saving at an evaluated frame must retain the initial static parameter.
    expect((await state()).effects[config.static]).toBe(initial.effects[config.static]);

    if (backend === "frameGraph") {
      const control = page.locator('[data-effect-stack-control="' + config.panel + '"]');
      if (!await control.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await seek(page, 20);
      await expect(control).toHaveValue("50");
      await control.fill("25"); await control.dispatchEvent("input");
      await expect(enabled).not.toBeChecked();
      await expect(slider).toHaveValue(String(config.position / 4));
      expect((await savedKeys()).preview.value).toEqual({ ...shapeDefaults, enabled: false, [config.field]: config.max / 4 });
      await seek(page, 0);
    }

    const projectPath = testInfo.outputPath("scalar-project.json");
    await seek(page, 10);
    await slider.fill("17"); await slider.dispatchEvent("input");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
    await menu(page, "file.saveProject");
    await expect.poll(() => existsSync(projectPath)).toBe(true);
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, projectPath);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await selectEffect(page, effectId);
    await expect(slider).toHaveValue("17");
    expect((await state()).effects.lutPreset).toBe(initial.effects.lutPreset);
    expect((await savedKeys()).keys).toEqual(expectedKeys);
    const capture = async name => {
      const output = testInfo.outputPath(name);
      mkdirSync(output, { recursive: true });
      await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
      return PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data;
    };
    const previewCapture = await capture("preview");
    await expect(slider).toHaveValue("17");
    await seek(page, 11); await seek(page, 10);
    expect((await capture("authored")).equals(previewCapture)).toBe(true);
    await seek(page, 0);
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeDisabled();
    await expect(enabled).toBeDisabled();
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeEnabled();

    if (backend === "frameGraph") {
      await seek(page, 20);
      const remove = page.locator('[data-effect-stack-remove="' + effectId + '"]');
      if (!await remove.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await remove.click();
      await expect(page.locator("[data-effect-key-state]")).toHaveText("スタックから外れています");
      expect((await savedKeys()).keys).toEqual(expectedKeys);
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="' + effectId + '"]').click();
      await expect(page.locator("[data-effect-key-state]")).toHaveText("");
      await expect(enabled).not.toBeChecked();
      await page.locator("#btn-effect-toggle-framegraph").click();
      await expect(page.locator("#btn-effect-toggle-framegraph")).toHaveAttribute("aria-pressed", "false");
      await page.locator("#btn-effect-toggle-framegraph").click();
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      for (const nextBackend of ["classic", "frameGraph"]) {
        await page.locator('select[data-postfx-select="backend"]').selectOption(nextBackend, { force: true });
        await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, nextBackend);
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        await selectEffect(page, effectId); await seek(page, 20);
        await expect(enabled).not.toBeChecked();
        await expect(slider).toHaveValue(String(config.position / 2));
        expect((await savedKeys()).keys).toEqual(expectedKeys);
        expect((await state()).effects[config.static]).toBe(initial.effects[config.static]);
      }
    }

    const pngs = [];
    for (const frame of [0, 20, 40]) { await seek(page, frame); pngs.push(await capture("png-" + frame)); }
    const difference = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
      return sum / (a.length * 0.75);
    };
    const pngReport = { onOff: difference(pngs[0], pngs[1]), offNeutral: difference(pngs[1], pngs[2]) };
    writeFileSync(testInfo.outputPath("scalar-png-comparison.json"), JSON.stringify(pngReport));
    expect(pngReport.onOff).toBeGreaterThan(0.05);
    expect(pngReport.offNeutral).toBeLessThan(0.05);
    await page.screenshot({ path: testInfo.outputPath("scalar-ui.png") });
    const webmPath = testInfo.outputPath("scalar.webm");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, webmPath);
    await menu(page, "file.webmExportSettings");
    await page.locator("#webm-output-use-playback-range").uncheck();
    for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 40]]) {
      await page.locator(`#webm-output-${id}`).fill(String(value));
      await page.locator(`#webm-output-${id}`).press("Enter");
    }
    await page.locator("#webm-output-fps").selectOption("30");
    await page.locator("#webm-output-include-audio").uncheck();
    await page.getByRole("button", { name: "WebM出力", exact: true }).click();
    await expect.poll(async () => {
      if (existsSync(webmPath) && statSync(webmPath).size > 1000) return "written";
      return await page.locator("#status-text").textContent();
    }, { timeout: 60000 }).toBe("written");
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
    const videoFrames = await page.evaluate(async path => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      try {
        const loaded = new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () => reject(new Error("Effect WebM decode failed"));
        });
        video.src = url;
        await loaded;
        const frames = [];
        for (const frame of [0, 20, 40]) {
          const time = (frame + 0.1) / 30;
          const seeked = new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }));
          video.currentTime = time;
          await seeked;
          context.drawImage(video, 0, 0, 640, 360);
          frames.push(Array.from(context.getImageData(0, 0, 640, 360).data));
        }
        return frames;
      } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
      }
    }, webmPath);
    const report = videoFrames.map((frame, index) => ({ frame: [0, 20, 40][index], matchingPngDifference: difference(frame, pngs[index]), oppositePngDifference: difference(frame, pngs[index === 0 ? 1 : 0]) }));
    writeFileSync(testInfo.outputPath("scalar-output-comparison.json"), JSON.stringify(report, null, 2));
    for (let index = 0; index < videoFrames.length; index++) {
      writeFileSync(testInfo.outputPath("video-" + [0, 20, 40][index] + ".png"),
        PNG.sync.write({ width: 640, height: 360, data: Buffer.from(videoFrames[index]) }));
    }
    for (const item of report) expect(item.matchingPngDifference).toBeLessThan(item.oppositePngDifference);
    if (effectId === "aerialPerspective") await verifyAerialShapeKeys(page, launched.app, testInfo, selectEffect);
    if (effectId === "luminous") await verifyEffectShapeKeys(page, launched.app, testInfo, effectId, selectEffect);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});
}
}
