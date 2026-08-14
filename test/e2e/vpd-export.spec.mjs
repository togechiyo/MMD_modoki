import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function openFileMenu(page) {
  await page.locator(".app-menu-trigger").filter({ hasText: /ファイル|File/ }).click();
}

test("選択ボーンの現在ポーズをShift-JIS VPDとして書き出す", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await openFileMenu(page);
    await expect(page.locator('[data-menu-command="file.exportModelVpd"]')).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath);
    await page.locator("#info-model-select").selectOption("0");
    const modelXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await modelXInput.fill("1.5");
    await modelXInput.press("Enter");

    await openFileMenu(page);
    const exportItem = page.locator('[data-menu-command="file.exportModelVpd"]');
    await expect(exportItem).toBeEnabled();
    await exportItem.click();

    const vpdPath = join(launched.tempDir, "user-data", "tofu_pose.vpd");
    await expect.poll(() => existsSync(vpdPath)).toBe(true);
    const bytes = readFileSync(vpdPath);
    const text = new TextDecoder("shift_jis").decode(bytes);
    expect(text.startsWith("Vocaloid Pose Data file\r\n")).toBe(true);
    expect(text).toContain("\r\n1; // bone pose count\r\n");
    expect(text).toMatch(/Bone0\{[^\r\n]+\r\n  1\.500000,0\.000000,0\.000000;/u);
    expect(text).toContain("0.000000,0.000000,0.000000,1.000000; // Quaternion x,y,z,w");
  } finally {
    await launched.close();
  }
});
