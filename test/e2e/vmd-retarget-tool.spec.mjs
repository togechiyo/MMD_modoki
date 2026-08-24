import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceModelPath = resolve(repoRoot, "test/fixtures/external-parent/body-source.pmx");
const targetModelPath = resolve(repoRoot, "test/fixtures/external-parent/body-target.pmx");

function createCenterMotion() {
  const bytes = Buffer.alloc(50 + 4 + 111 + 20);
  bytes.write("Vocaloid Motion Data 0002", 0, "ascii");
  bytes.write("Source", 30, "ascii");
  bytes.writeUInt32LE(1, 50);
  const keyOffset = 54;
  Buffer.from([0x83, 0x5a, 0x83, 0x93, 0x83, 0x5e, 0x81, 0x5b]).copy(bytes, keyOffset);
  bytes.writeUInt32LE(0, keyOffset + 15);
  bytes.writeFloatLE(1, keyOffset + 19);
  bytes.writeFloatLE(2, keyOffset + 23);
  bytes.writeFloatLE(3, keyOffset + 27);
  bytes.writeFloatLE(0, keyOffset + 31);
  bytes.writeFloatLE(0.70710677, keyOffset + 35);
  bytes.writeFloatLE(0, keyOffset + 39);
  bytes.writeFloatLE(0.70710677, keyOffset + 43);
  return bytes;
}

function readFirstBonePosition(bytes) {
  const keyOffset = 54;
  return [
    bytes.readFloatLE(keyOffset + 19),
    bytes.readFloatLE(keyOffset + 23),
    bytes.readFloatLE(keyOffset + 27),
  ];
}

test("ツールメニューでPMX間のVMDを変換し、現在のプロジェクトを変更しない", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const sourceMotionPath = join(launched.tempDir, "source.vmd");
    writeFileSync(sourceMotionPath, createCenterMotion());
    await launched.app.evaluate(({ dialog }, paths) => {
      const selections = [...paths];
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selections.shift()],
      });
    }, [sourceModelPath, sourceMotionPath, targetModelPath]);

    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

    await page.locator('.app-menu-trigger[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.vmdRetarget"]').click();
    const dialog = page.locator('[data-popup-id="vmd-retarget"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#app-menu-dialog-title")).toHaveText("VMDリターゲット変換");

    for (const kind of ["sourceModel", "sourceMotion", "targetModel"]) {
      await dialog.locator(`[data-retarget-file="${kind}"]`).click();
    }
    await expect(dialog.getByText("body-source.pmx", { exact: true })).toBeVisible();
    await expect(dialog.getByText("source.vmd", { exact: true })).toBeVisible();
    await expect(dialog.getByText("body-target.pmx", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "解析", exact: true }).click();
    await expect(dialog.getByText("ボーン 1 キー", { exact: false })).toBeVisible();

    await dialog.getByRole("button", { name: "変換して保存...", exact: true }).click();
    const outputPath = join(launched.tempDir, "user-data", "source_retargeted.vmd");
    await expect.poll(() => existsSync(outputPath)).toBe(true);
    expect(readFirstBonePosition(readFileSync(outputPath))).toEqual([2, 4, 6]);
    await expect(dialog).toBeHidden();

    const after = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    delete before.savedAt;
    delete after.savedAt;
    expect(after).toEqual(before);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
