import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function readUint32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readBvmdTrackCounts(bytes) {
  return {
    bone: readUint32(bytes, readUint32(bytes, 12)),
    movableBone: readUint32(bytes, readUint32(bytes, 16)),
    morph: readUint32(bytes, readUint32(bytes, 20)),
    property: readUint32(bytes, readUint32(bytes, 24)),
    camera: readUint32(bytes, readUint32(bytes, 28)),
  };
}

async function openFileMenu(page) {
  await page.locator(".app-menu-trigger").filter({ hasText: /ファイル|File/ }).click();
}

async function selectCenterBone(page) {
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
    .toContainEqual({ category: "root", name: "センター", frames: [] });
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 47 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack))
    .toEqual({ category: "root", name: "センター" });
}

test("編集したモデルとカメラのモーションをBVMD 3.0で書き出す", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await openFileMenu(page);
    await expect(page.locator('[data-menu-command="file.exportModelBvmd"]')).toBeDisabled();
    await expect(page.locator('[data-menu-command="file.exportCameraBvmd"]')).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount()), {
      timeout: 45_000,
    }).toBe(1);
    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);
    const modelXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await modelXInput.fill("1");
    await modelXInput.press("Enter");
    await page.locator("#btn-bone-keyframe").click();
    await page.locator("#chk-model-visibility").uncheck();
    await page.locator("#btn-info-keyframe").click();

    await openFileMenu(page);
    const modelExport = page.locator('[data-menu-command="file.exportModelBvmd"]');
    await expect(modelExport).toBeEnabled();
    await modelExport.click();

    const modelBvmdPath = join(launched.tempDir, "user-data", "tofu_motion.bvmd");
    await expect.poll(() => existsSync(modelBvmdPath)).toBe(true);
    const modelBytes = readFileSync(modelBvmdPath);
    expect(modelBytes.subarray(0, 4).toString("ascii")).toBe("BVMD");
    expect(Array.from(modelBytes.subarray(4, 7))).toEqual([3, 0, 0]);
    const modelCounts = readBvmdTrackCounts(modelBytes);
    expect(modelCounts.bone + modelCounts.movableBone).toBe(1);
    expect(modelCounts.morph).toBe(0);
    expect(modelCounts.property).toBe(1);
    expect(modelCounts.camera).toBe(0);

    await page.locator("#info-model-select").selectOption("__camera__");
    const cameraXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await cameraXInput.fill("1");
    await cameraXInput.press("Enter");
    await page.locator("#btn-bone-keyframe").click();

    await openFileMenu(page);
    const cameraExport = page.locator('[data-menu-command="file.exportCameraBvmd"]');
    await expect(cameraExport).toBeEnabled();
    await cameraExport.click();

    const cameraBvmdPath = join(launched.tempDir, "user-data", "camera_motion.bvmd");
    await expect.poll(() => existsSync(cameraBvmdPath)).toBe(true);
    const cameraBytes = readFileSync(cameraBvmdPath);
    expect(cameraBytes.subarray(0, 4).toString("ascii")).toBe("BVMD");
    expect(Array.from(cameraBytes.subarray(4, 7))).toEqual([3, 0, 0]);
    expect(readBvmdTrackCounts(cameraBytes)).toEqual({
      bone: 0,
      movableBone: 0,
      morph: 0,
      property: 0,
      camera: 1,
    });
  } finally {
    await launched.close();
  }
});
