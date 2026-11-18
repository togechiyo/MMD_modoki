import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { openPostEffects } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const playback = page => page.locator("#viewport-seek-play-toggle");

async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
  await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}

async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function savedProject(path, frame) {
  let saved;
  await expect.poll(() => {
    try { saved = JSON.parse(readFileSync(path, "utf8")); return saved.scene.currentFrame; }
    catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
  }).toBe(frame);
  return saved;
}

async function pause(page) {
  await expect(playback(page)).toHaveAccessibleName(/^(一時停止|Pause)$/);
  await playback(page).click();
  await expect(playback(page)).toHaveAccessibleName(/^(再生|Play)$/);
}

for (const scenario of ["model never loaded", "last model removed"]) {
  test(`V022-126/127: X and camera project saves and plays with ${scenario}`, async () => {
    const launched = await launchMmdModoki(root), errors = [];
    try {
      const page = await launched.app.firstWindow();
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", dialog => dialog.accept());
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      if (scenario === "last model removed") {
        expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
          resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
      }
      // Only asset delivery bypasses the OS dialog; keys and playback use GUI controls.
      expect(await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path),
        resolve(root, "test/fixtures/accessory/tofu.x"))).toBe(true);
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      await page.locator("#accessory-pos-x").fill("0");
      await page.locator("#accessory-pos-x").press("Enter");
      await page.locator("#btn-info-keyframe").click();
      await seek(page, 1200);
      await page.locator("#accessory-pos-x").fill("12");
      await page.locator("#accessory-pos-x").press("Enter");
      await page.locator("#btn-info-keyframe").click();
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames)).toEqual([0, 1200]);

      if (scenario === "last model removed") {
        await page.locator("#info-model-select").selectOption("0");
        await page.locator("#btn-model-delete").click();
      }
      expect((await project(page)).scene.models).toEqual([]);

      // Accessory-only animation must supply a clock, even before a camera motion exists.
      await seek(page, 0);
      await playback(page).click();
      await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(3);
      await pause(page);
      const pausedFrame = Number(await page.locator("#current-frame").inputValue());

      // An unkeyed Bloom color remains editable while playing and must not reset
      // the editor-only accessory clock when its effect diff is applied.
      await openPostEffects(page);
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="bloom"]').click();
      const bloomId = (await project(page)).effects.frameGraphInstances.instances.find(item => item.type === "bloom").instanceId;
      const bloom = async () => (await project(page)).effects.frameGraphInstances.instances.find(item => item.instanceId === bloomId);
      const bloomRow = page.locator(`[data-effect-instance-row="${bloomId}"]`);
      await expandEffectInstance(bloomRow);
      const bloomColor = bloomRow.locator('[data-instance-field="color"]');
      await playback(page).click();
      await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(pausedFrame + 3);
      await expect(bloomColor).toBeEnabled();
      const beforeColorFrame = Number(await page.locator("#current-frame").inputValue());
      await bloomColor.fill("#80d0ff");
      await bloomColor.dispatchEvent("change");
      await expect.poll(async () => (await bloom()).bloomColor).toEqual({ r: 128 / 255, g: 208 / 255, b: 1 });
      expect((await bloom()).animation.tracks.flatMap(track => track.keys)).toEqual([]);
      await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(beforeColorFrame + 3);
      await pause(page);

      // A shorter camera animation must not truncate the accessory's remaining keys.
      await page.locator("#info-model-select").selectOption("__camera__");
      await selectTimelineTrack(page, "camera", "Camera");
      const cameraX = page.locator('#bone-controls input[data-control-key="tx"]');
      await seek(page, 0);
      await cameraX.fill("0"); await cameraX.press("Enter");
      await page.locator("#btn-kf-add").click();
      await seek(page, 600);
      await cameraX.fill("6"); await cameraX.press("Enter");
      await page.locator("#btn-kf-add").click();
      await seek(page, 610);
      await playback(page).click();
      await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(620);
      await pause(page);
      expect((await project(page)).accessories[0].transform.position.x).toBeGreaterThan(6.1);

      // The file menu chooses a path; Ctrl+S overwrites the current project.
      await seek(page, 300);
      const firstPath = resolve(launched.tempDir, "accessory-camera.mmdproj");
      await launched.app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, firstPath);
      await fileMenu(page, "file.saveProject");
      const first = await savedProject(firstPath, 300);
      expect(first.scene.models).toEqual([]);
      expect(first.accessories).toHaveLength(1);
      expect(first.keyframes.cameraAnimation).not.toBeNull();
      expect(first.keyframes.accessoryTransformAnimations).toHaveLength(1);
      await seek(page, 333);
      await page.keyboard.press("Control+s");
      await savedProject(firstPath, 333);

      const secondPath = resolve(launched.tempDir, "accessory-camera-copy.mmdproj");
      await launched.app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, secondPath);
      await fileMenu(page, "file.saveProject");
      const saved = await savedProject(secondPath, 333);
      await fileMenu(page, "file.loadProject");
      await expect(page.locator("#status-text")).toContainText("Project loaded");
      await expect(page.locator("#current-frame")).toHaveValue("333");
      const reopened = await project(page);
      expect(reopened.scene.models).toEqual([]);
      expect(reopened.keyframes.cameraAnimation).toEqual(saved.keyframes.cameraAnimation);
      expect(reopened.keyframes.accessoryTransformAnimations).toEqual(saved.keyframes.accessoryTransformAnimations);
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      await seek(page, 300);
      await expect(page.locator("#accessory-pos-x")).toHaveValue("3.0");
      await page.locator("#info-model-select").selectOption("__camera__");
      await expect.poll(async () => Number(await cameraX.inputValue())).toBeCloseTo(3, 1);
      await seek(page, 610);
      await playback(page).click();
      await expect.poll(async () => Number(await page.locator("#current-frame").inputValue())).toBeGreaterThan(620);
      await pause(page);
      expect(errors).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
