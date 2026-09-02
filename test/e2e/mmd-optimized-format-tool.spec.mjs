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
  const bytes = Buffer.alloc(50 + 4 + 111 + 4 + 4 + 61 + 4 + 4 + 4);
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
  const morphCountOffset = keyOffset + 111;
  bytes.writeUInt32LE(0, morphCountOffset);
  bytes.writeUInt32LE(1, morphCountOffset + 4);
  const cameraOffset = morphCountOffset + 8;
  bytes.writeUInt32LE(42, cameraOffset);
  bytes.writeFloatLE(-30, cameraOffset + 4);
  bytes.writeFloatLE(0, cameraOffset + 8);
  bytes.writeFloatLE(10, cameraOffset + 12);
  bytes.writeFloatLE(0, cameraOffset + 16);
  for (let index = 0; index < 24; index += 4) {
    bytes.set([20, 107, 20, 107], cameraOffset + 32 + index);
  }
  bytes.writeUInt32LE(30, cameraOffset + 56);
  bytes.writeUInt8(0, cameraOffset + 60);
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

    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate((path) => {
      void window.mmdModokiE2e.loadModelInteractively(path);
    }, bpmxPath);
    const notice = page.locator("#model-comment-notice");
    await expect(notice).toBeVisible();
    await expect(page.locator("#model-comment-notice-meta")).toHaveText("BPMX ver3.0.0");
    await page.locator("#model-comment-notice-ok").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount()), {
      timeout: 45_000,
    }).toBe(1);

    await launched.app.evaluate(({ dialog: electronDialog }, path) => {
      electronDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, bvmdPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.openMotion"]').click();
    await expect.poll(async () => {
      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      return project.scene.models[0]?.motionImports ?? [];
    }).toContainEqual({ type: "bvmd", path: bvmdPath });

    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.openCameraMotion"]').click();
    await expect.poll(async () => {
      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      return project.assets.cameraVmdPath;
    }).toBe(bvmdPath);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
