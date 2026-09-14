import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  await page.locator("#timeline-labels").evaluate(element => { element.scrollTop = 0; });
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 20 + (index + 1) * 18 + 9 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack)).toEqual({ name: id, category: "effect" });
}

for (const backend of ["frameGraph", "classic"]) {
for (const effectId of ["gamma", "grain", "bloom"]) {
test(`camera ${effectId} keys: ${backend} registration, playback, save and output`, async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("dialog", dialog => {
      if (dialog.type() !== "beforeunload") errors.push(`Unexpected dialog: ${dialog.message()}`);
      void dialog.dismiss().catch(() => undefined);
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic") {
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.locator("#btn-toolbar-mode-toggle").click();
    await selectEffect(page, effectId);
    await expect(page.locator("#effect-key-controls")).toBeVisible();
    await expect(page.locator("[data-effect-key-label]")).toHaveText(effectId === "gamma" ? "ガンマ" : effectId === "grain" ? "グレイン" : "ブルーム");
    const enabled = page.locator("#effect-key-enabled");
    const slider = page.locator("#effect-key-value");
    const initialPosition = effectId === "bloom" ? 200 : 100;
    const threshold = page.locator("#effect-key-value-threshold");
    const savedKeys = () => page.evaluate(id => window.mmdModokiE2e.exportProjectState().keyframes.effectAnimations.tracks.find(track => track.effectId === id), effectId);
    const add = async (frame, on, offset) => {
      await seek(page, frame);
      await enabled.setChecked(on);
      await slider.fill(String(offset));
      await slider.dispatchEvent("input");
      if (effectId === "bloom") { await threshold.fill(String(frame * 5)); await threshold.dispatchEvent("input"); }
      await page.locator("#btn-kf-add").click();
    };
    await add(0, true, initialPosition);
    await add(20, false, effectId === "gamma" ? -100 : 100);
    await add(40, true, 0);
    expect(await savedKeys()).toMatchObject({ effectId, valueVersion: 1, keys: effectId === "gamma" ? [{ frame: 0, value: { enabled: true, gamma: 0.5 } }, { frame: 20, value: { enabled: false, gamma: 2 } }, { frame: 40, value: { enabled: true, gamma: 1 } }] : effectId === "bloom" ? [{ frame: 0, value: { enabled: true, weight: 2, threshold: 0 } }, { frame: 20, value: { enabled: false, weight: 1, threshold: 1 } }, { frame: 40, value: { enabled: true, weight: 0, threshold: 2 } }] : [{ frame: 0, value: { enabled: true, intensity: 100 } }, { frame: 20, value: { enabled: false, intensity: 100 } }, { frame: 40, value: { enabled: true, intensity: 0 } }] });
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await savedKeys()).keys.map(key => key.frame)).toEqual([0, 20]);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect((await savedKeys()).keys.map(key => key.frame)).toEqual([0, 20, 40]);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(page, 10);
    await expect(slider).toHaveValue(effectId === "gamma" ? "0" : effectId === "bloom" ? "150" : "100");
    if (effectId === "bloom") await expect(threshold).toHaveValue("50");
    await expect(enabled).toBeChecked();
    await seek(page, 19);
    await expect(enabled).toBeChecked();
    await seek(page, 20);
    await expect(enabled).not.toBeChecked();
    await expect(slider).toHaveValue(effectId === "gamma" ? "-100" : "100");
    await seek(page, 30);
    await expect(slider).toHaveValue(effectId === "gamma" ? "-50" : "50");
    await expect(enabled).not.toBeChecked();
    await seek(page, 40);
    await expect(enabled).toBeChecked();
    await seek(page, 0);
    await expect(slider).toHaveValue(String(initialPosition));
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await page.screenshot({ path: testInfo.outputPath("effect-key-ui.png") });

    if (effectId === "bloom" && backend === "frameGraph") {
      const weightControl = page.locator('[data-effect-stack-control="bloomWeight"]');
      if (!await weightControl.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await seek(page, 10);
      await expect(weightControl).toHaveValue("75");
      await expect(page.locator('[data-effect-stack-control="bloomThreshold"]')).toHaveValue("25");
      await weightControl.fill("60"); await weightControl.dispatchEvent("input");
      await expect(slider).toHaveValue("120");
      await expect(threshold).toHaveValue("50");
      const cutoffControl = page.locator('[data-effect-stack-control="bloomThreshold"]');
      await cutoffControl.fill("40"); await cutoffControl.dispatchEvent("input");
      await expect(slider).toHaveValue("120");
      await expect(threshold).toHaveValue("80");
      await page.locator("#btn-kf-add").click();
      expect((await savedKeys()).keys.find(key => key.frame === 10).value).toEqual({ enabled: true, weight: 1.2, threshold: 0.8, kernel: 100 });
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      expect((await savedKeys()).keys.map(key => key.frame)).toEqual([0, 20, 40]);
      await seek(page, 0);
    }

    // Copy/paste and delete share normal command history.
    await page.locator("#btn-kf-copy").click();
    await seek(page, 60);
    await page.locator("#btn-kf-paste").click();
    expect((await savedKeys()).keys.map(key => key.frame)).toContain(60);
    await page.locator("#btn-kf-delete").click();
    expect((await savedKeys()).keys.map(key => key.frame)).not.toContain(60);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect((await savedKeys()).keys.map(key => key.frame)).toContain(60);

    if (effectId === "bloom") {
      const untouchedThreshold = ((await savedKeys()).keys.find(key => key.frame === 60).value.threshold + 0.37) / 2;
      await seek(page, 80);
      await enabled.check();
      await slider.fill("113"); await slider.dispatchEvent("input");
      await threshold.fill("37"); await threshold.dispatchEvent("input");
      await page.locator("#btn-kf-add").click();
      await seek(page, 70);
      await slider.fill("130"); await slider.dispatchEvent("input");
      expect((await savedKeys()).preview.value.threshold).toBeCloseTo(untouchedThreshold, 12);
      await enabled.uncheck();
      expect((await savedKeys()).preview.value).toEqual({ enabled: false, weight: 1.3, threshold: untouchedThreshold, kernel: 100 });
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      expect((await savedKeys()).keys.map(key => key.frame)).toEqual([0, 20, 40, 60]);
    }

    const path = testInfo.outputPath("gamma-project.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
    await menu(page, "file.saveProject");
    await expect.poll(() => existsSync(path)).toBe(true);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.keyframes.effectAnimations.tracks.find(track => track.effectId === effectId).keys.map(key => key.frame)).toContain(60);
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, path);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await selectEffect(page, effectId);
    await seek(page, 20);
    await expect(enabled).not.toBeChecked();
    await expect(slider).toHaveValue(effectId === "gamma" ? "-100" : "100");
    expect(await savedKeys()).toEqual(saved.keyframes.effectAnimations.tracks.find(track => track.effectId === effectId));

    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeDisabled();
    await expect(enabled).toBeDisabled();
    await expect(page.locator("#btn-kf-add")).toBeDisabled();
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(slider).toBeEnabled();
    for (const [locale, label] of Object.entries(Object.fromEntries(["en", "zh-Hant", "zh-Hans", "ko", "ja"].map(locale => [locale, JSON.parse(readFileSync(resolve(repoRoot, `language/${locale}.json`), "utf8").replace(/^\uFEFF/, ""))[`effect.frameGraphPost.effects.${effectId}`]])))) {
      await page.locator("#toolbar-locale-select").selectOption(locale);
      await expect(page.locator("[data-effect-key-label]")).toHaveText(label);
    }

    // A stopped preview is saved separately and must not replace the authored keys.
    await seek(page, 10);
    await slider.fill("17");
    await slider.dispatchEvent("input");
    const previewState = await savedKeys();
    expect(previewState.preview.frame).toBe(10);
    expect(previewState.keys).toEqual(saved.keyframes.effectAnimations.tracks.find(track => track.effectId === effectId).keys);
    await menu(page, "file.saveProject");
    await expect.poll(() => JSON.parse(readFileSync(path, "utf8")).keyframes.effectAnimations.tracks.find(track => track.effectId === effectId).preview?.frame).toBe(10);
    await menu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await selectEffect(page, effectId);
    await expect(slider).toHaveValue("17");
    if (effectId !== "grain") {
      const capture = async name => {
        const output = testInfo.outputPath(name);
        mkdirSync(output, { recursive: true });
        await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
        return PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data;
      };
      const withPreview = await capture("preview-export");
      await expect(slider).toHaveValue("17");
      await seek(page, 11);
      await seek(page, 10);
      const authored = await capture("authored-export");
      expect(withPreview.equals(authored)).toBe(true);
    }
    await seek(page, 20);
    await expect(slider).toHaveValue(effectId === "gamma" ? "-100" : "100");
    expect((await savedKeys()).preview).toBeUndefined();

    if (backend === "frameGraph") {
      const remove = page.locator(`[data-effect-stack-remove="${effectId}"]`);
      if (!await remove.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await remove.click();
      await expect(page.locator("[data-effect-key-state]")).toHaveText("スタックから外れています");
      expect((await savedKeys()).keys).toEqual(previewState.keys);
      await page.locator("#btn-effect-add-post").click();
      await page.locator(`[data-effect-add-post="${effectId}"]`).click();
      await expect(page.locator("[data-effect-key-state]")).toHaveText("");
      await expect(slider).toHaveValue(effectId === "gamma" ? "-100" : "100");
      await page.locator("#btn-effect-toggle-framegraph").click();
      await expect(page.locator("#btn-effect-toggle-framegraph")).toHaveAttribute("aria-pressed", "false");
      await page.locator("#btn-effect-toggle-framegraph").click();
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    }

    if (backend === "frameGraph" && effectId !== "grain") {
      for (const nextBackend of ["classic", "frameGraph"]) {
        const select = page.locator('select[data-postfx-select="backend"]');
        await select.selectOption(nextBackend, { force: true });
        await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, nextBackend);
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        await expect.poll(savedKeys).toMatchObject({ keys: previewState.keys });
        await selectEffect(page, effectId);
        await seek(page, 20);
        await expect(enabled).not.toBeChecked();
        await expect(slider).toHaveValue(effectId === "gamma" ? "-100" : "100");
        await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      }
    }

    const pngPaths = [];
    for (const frame of [0, 20, 40]) {
      await seek(page, frame);
      const output = testInfo.outputPath(`png-${frame}`);
      mkdirSync(output, { recursive: true });
      await page.evaluate(({ output, width, height }) => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, width, height), { output, width: 640, height: 360 });
      pngPaths.push(resolve(output, "single_rgba_surface_e2e.png"));
    }
    const pngs = pngPaths.map(path => PNG.sync.read(readFileSync(path)).data);
    const difference = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
      return sum / (a.length * 0.75);
    };
    expect(difference(pngs[0], pngs[1])).toBeGreaterThan(1);
    expect(difference(pngs[1], pngs[2])).toBeLessThan(0.05);

    if (effectId === "bloom") {
      // Hold one parameter fixed while changing the other, to catch missing bindings.
      const extraPngs = [];
      for (const [frame, weight, cutoff] of [[80, 200, 200], [100, 0, 0]]) {
        await seek(page, frame);
        await enabled.check();
        await slider.fill(String(weight)); await slider.dispatchEvent("input");
        await threshold.fill(String(cutoff)); await threshold.dispatchEvent("input");
        await page.locator("#btn-kf-add").click();
        const output = testInfo.outputPath(`bloom-parameter-${frame}`);
        mkdirSync(output, { recursive: true });
        await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
        extraPngs.push(PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data);
      }
      expect(difference(pngs[0], extraPngs[0])).toBeGreaterThan(1);
      expect(difference(pngs[1], extraPngs[1])).toBeLessThan(0.05);
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
      expect((await savedKeys()).keys).toEqual(previewState.keys);
    }

    const webmPath = testInfo.outputPath("gamma.webm");
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
          video.onerror = () => reject(new Error("Gamma WebM decode failed"));
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
    writeFileSync(testInfo.outputPath("gamma-output-comparison.json"), JSON.stringify(report, null, 2));
    if (effectId !== "grain") {
      for (const item of report) expect(item.matchingPngDifference).toBeLessThan(item.oppositePngDifference);
    } else {
      // Animated grain uses a fresh random seed. Compare noise against the clean image,
      // rather than requiring independently rendered noise samples to match.
      expect(difference(videoFrames[0], pngs[1])).toBeGreaterThan(2);
      expect(difference(videoFrames[0], pngs[1])).toBeGreaterThan(difference(videoFrames[1], pngs[1]) * 3);
      for (const index of [1, 2]) expect(report[index].matchingPngDifference).toBeLessThan(report[index].oppositePngDifference);
    }
    if (effectId === "bloom") await verifyEffectShapeKeys(page, launched.app, testInfo, effectId, selectEffect);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
}
}
