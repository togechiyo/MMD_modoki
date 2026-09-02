import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const aliciaModelPath = resolve(repoRoot, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const aliciaMotionPath = resolve(repoRoot, "local-references/model/Alicia/MMD Motion/2分ループステップ20.vmd");
const hasAliciaReference = existsSync(aliciaModelPath) && existsSync(aliciaMotionPath);

test.skip(!hasAliciaReference, "許可済みlocal referenceのAlicia PMX/VMDが配置されていません");

async function setOpenDialogPath(app, filePath) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, filePath);
}

async function invokeFileCommand(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function loadModelFromFileMenu(launched, page, filePath, expectedFormat) {
  await setOpenDialogPath(launched.app, filePath);
  await invokeFileCommand(page, "file.openModel");
  const notice = page.locator("#model-comment-notice");
  await expect(notice).toBeVisible();
  await expect(page.locator("#model-comment-notice-meta")).toContainText(expectedFormat);
  await page.locator("#model-comment-notice-ok").click();
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount()), {
    timeout: 45_000,
  }).toBe(1);
}

async function loadModelMotionFromFileMenu(launched, page, filePath, expectedType) {
  await setOpenDialogPath(launched.app, filePath);
  await invokeFileCommand(page, "file.openMotion");
  await expect.poll(async () => {
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    return project.scene.models[0]?.motionImports ?? [];
  }, { timeout: 45_000 }).toContainEqual({ type: expectedType, path: filePath });
}

async function getModelTimelineTracks(page) {
  return await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()
    .filter((track) => ["root", "semi-standard", "bone", "morph", "property"].includes(track.category))
    .map((track) => ({
      category: track.category,
      name: track.name,
      frames: track.frames,
    }))
    .sort((a, b) => `${a.category}:${a.name}`.localeCompare(`${b.category}:${b.name}`, "ja")));
}

test("アリシアでBPMX+VMDとPMX+BVMDのタイムライントラックが一致する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    await launched.app.evaluate(({ dialog }, paths) => {
      const selections = [...paths];
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selections.shift()],
      });
    }, [aliciaModelPath, aliciaMotionPath]);

    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const emptyProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

    await page.locator('.app-menu-trigger[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.mmdOptimizedFormat"]').click();
    const dialog = page.locator('[data-popup-id="mmd-optimized-format"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('[data-optimized-format-file="model"]').click();
    await expect(dialog.getByText(basename(aliciaModelPath), { exact: true })).toBeVisible();
    await dialog.locator('[data-optimized-format-convert="model"]').click();
    const bpmxPath = join(launched.tempDir, "user-data", "Alicia_solid.bpmx");
    await expect.poll(() => existsSync(bpmxPath), { timeout: 45_000 }).toBe(true);

    await dialog.locator('[data-optimized-format-file="motion"]').click();
    await expect(dialog.getByText(basename(aliciaMotionPath), { exact: true })).toBeVisible();
    await dialog.locator('[data-optimized-format-convert="motion"]').click();
    const bvmdPath = join(launched.tempDir, "user-data", "2分ループステップ20.bvmd");
    await expect.poll(() => existsSync(bvmdPath), { timeout: 45_000 }).toBe(true);
    await dialog.locator(".app-menu-dialog-close").click();

    await loadModelFromFileMenu(launched, page, bpmxPath, "BPMX ver3.0.0");
    await loadModelMotionFromFileMenu(launched, page, aliciaMotionPath, "vmd");
    const bpmxVmdTracks = await getModelTimelineTracks(page);
    expect(bpmxVmdTracks.length).toBeGreaterThan(0);
    expect(bpmxVmdTracks.some((track) => track.frames.length > 1)).toBe(true);

    const resetResult = await page.evaluate(
      (project) => window.mmdModokiE2e.importProjectState(project),
      emptyProject,
    );
    expect(resetResult.warnings).toEqual([]);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(0);

    await loadModelFromFileMenu(launched, page, aliciaModelPath, "PMX ver");
    await loadModelMotionFromFileMenu(launched, page, bvmdPath, "bvmd");
    const pmxBvmdTracks = await getModelTimelineTracks(page);

    expect(pmxBvmdTracks).toEqual(bpmxVmdTracks);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
