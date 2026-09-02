import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_CONVERTER_MODEL_PATH
  ? resolve(process.env.MMD_MODOKI_E2E_CONVERTER_MODEL_PATH)
  : resolve(repoRoot, "test/fixtures/external-parent/body-source.pmx");
const referenceMotionPath = process.env.MMD_MODOKI_E2E_CONVERTER_MOTION_PATH
  ? resolve(process.env.MMD_MODOKI_E2E_CONVERTER_MOTION_PATH)
  : null;

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
  bytes.writeFloatLE(1, keyOffset + 43);
  return bytes;
}

function expectOptimizedHeader(filePath, signature) {
  const bytes = readFileSync(filePath);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe(signature);
  expect(Array.from(bytes.subarray(4, 7))).toEqual([3, 0, 0]);
}

test("独立ポップアップでPMXとVMDを最適化形式へ変換し、現在のプロジェクトを変更しない", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const motionPath = referenceMotionPath ?? join(launched.tempDir, "source.vmd");
    if (!referenceMotionPath) writeFileSync(motionPath, createCenterMotion());
    await launched.app.evaluate(({ dialog }, paths) => {
      const selections = [...paths];
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selections.shift()],
      });
    }, [modelPath, motionPath]);

    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

    await page.locator('.app-menu-trigger[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.mmdOptimizedFormat"]').click();
    const dialog = page.locator('[data-popup-id="mmd-optimized-format"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#app-menu-dialog-title")).toHaveText("BPMX / BVMD変換");

    await dialog.locator('[data-optimized-format-file="model"]').click();
    await expect(dialog.getByText(basename(modelPath), { exact: true })).toBeVisible();
    await dialog.locator('[data-optimized-format-convert="model"]').click();
    const bpmxName = `${basename(modelPath).replace(/\.(pmx|pmd)$/i, "")}.bpmx`;
    const bpmxPath = join(launched.tempDir, "user-data", bpmxName);
    await expect.poll(() => existsSync(bpmxPath), { timeout: 45_000 }).toBe(true);
    expectOptimizedHeader(bpmxPath, "BPMX");

    await dialog.locator('[data-optimized-format-file="motion"]').click();
    await expect(dialog.getByText(basename(motionPath), { exact: true })).toBeVisible();
    await dialog.locator('[data-optimized-format-convert="motion"]').click();
    const bvmdName = `${basename(motionPath).replace(/\.vmd$/i, "")}.bvmd`;
    const bvmdPath = join(launched.tempDir, "user-data", bvmdName);
    await expect.poll(() => existsSync(bvmdPath), { timeout: 30_000 }).toBe(true);
    expectOptimizedHeader(bvmdPath, "BVMD");

    const after = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    delete before.savedAt;
    delete after.savedAt;
    expect(after).toEqual(before);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
