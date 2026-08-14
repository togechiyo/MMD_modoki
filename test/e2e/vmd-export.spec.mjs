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

async function openFileMenu(page) {
  await page.locator(".app-menu-trigger").filter({ hasText: /ファイル|File/ }).click();
}

test("モデルとカメラのVMDを検証後に書き出す", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await openFileMenu(page);
    await expect(page.locator('[data-menu-command="file.exportModelVmd"]')).toBeDisabled();
    await expect(page.locator('[data-menu-command="file.exportCameraVmd"]')).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath);
    await page.locator("#info-model-select").selectOption("0");
    const modelXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await modelXInput.fill("1");
    await modelXInput.press("Enter");
    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();
    await page.locator("#chk-model-visibility").uncheck();
    await expect(page.locator("#btn-info-keyframe")).toBeEnabled();
    await page.locator("#btn-info-keyframe").click();

    await openFileMenu(page);
    const modelExport = page.locator('[data-menu-command="file.exportModelVmd"]');
    await expect(modelExport).toBeEnabled();
    await modelExport.click();

    const modelVmdPath = join(launched.tempDir, "user-data", "tofu_motion.vmd");
    await expect.poll(() => existsSync(modelVmdPath)).toBe(true);
    const modelBytes = readFileSync(modelVmdPath);
    expect(modelBytes.subarray(0, 25).toString("ascii")).toBe("Vocaloid Motion Data 0002");
    const boneCount = readUint32(modelBytes, 50);
    expect(boneCount).toBe(1);
    const morphCountOffset = 54 + boneCount * 111;
    expect(readUint32(modelBytes, morphCountOffset)).toBe(0);
    expect(readUint32(modelBytes, morphCountOffset + 4)).toBe(0);
    expect(readUint32(modelBytes, morphCountOffset + 8)).toBe(0);
    expect(readUint32(modelBytes, morphCountOffset + 12)).toBe(0);
    expect(readUint32(modelBytes, morphCountOffset + 16)).toBe(1);

    await page.locator("#info-model-select").selectOption("__camera__");
    const cameraXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await cameraXInput.fill("1");
    await cameraXInput.press("Enter");
    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();

    await openFileMenu(page);
    const cameraExport = page.locator('[data-menu-command="file.exportCameraVmd"]');
    await expect(cameraExport).toBeEnabled();
    await cameraExport.click();

    const cameraVmdPath = join(launched.tempDir, "user-data", "camera_motion.vmd");
    await expect.poll(() => existsSync(cameraVmdPath)).toBe(true);
    const cameraBytes = readFileSync(cameraVmdPath);
    expect(cameraBytes.subarray(30, 42).toString("hex")).toBe("834a8381838981458fc696be");
    expect(readUint32(cameraBytes, 50)).toBe(0);
    expect(readUint32(cameraBytes, 54)).toBe(0);
    expect(readUint32(cameraBytes, 58)).toBe(1);
    expect(cameraBytes[122]).toBe(0);
  } finally {
    await launched.close();
  }
});
