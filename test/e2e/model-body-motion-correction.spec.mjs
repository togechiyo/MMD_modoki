import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = resolve(repoRoot, "test/fixtures/external-parent/body-source.pmx");
const targetPath = resolve(repoRoot, "test/fixtures/external-parent/body-target.pmx");

function unpackNumbers(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  if (value.encoding === "u8-b64") return [...bytes];
  if (value.encoding === "f32-b64") {
    return Array.from({ length: value.length }, (_, index) => bytes.readFloatLE(index * 4));
  }
  throw new Error(`Unsupported packed array encoding: ${value.encoding}`);
}

function getTargetAnimation(project) {
  return project.keyframes.modelAnimations.find((entry) => entry.modelPath === targetPath).animation;
}

test("編集メニューからPMX体格比でセンターと足IKを補正してUndoできる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), sourcePath))
      .not.toBeNull();
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), targetPath))
      .not.toBeNull();

    await page.evaluate(async ({ targetModelPath }) => {
      const project = window.mmdModokiE2e.exportProjectState();
      const targetEntry = project.keyframes.modelAnimations.find((entry) => entry.modelPath === targetModelPath);
      targetEntry.animation = {
        name: "Body correction E2E motion",
        boneTracks: [],
        movableBoneTracks: [
          {
            name: "センター",
            frameNumbers: [0],
            positions: [1, 2, 3],
            positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [20, 107, 20, 107],
            physicsToggles: [1],
          },
          {
            name: "左足ＩＫ",
            frameNumbers: [0],
            positions: [2, 4, 6],
            positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [20, 107, 20, 107],
            physicsToggles: [1],
          },
        ],
        morphTracks: [],
        propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] },
      };
      await window.mmdModokiE2e.importProjectState(project);
    }, { targetModelPath: targetPath });

    const editMenu = page.locator('.app-menu-trigger[data-i18n="menu.edit"]');
    const correctionItem = page.locator('[data-menu-command="edit.correctMotionForBody"]');
    await editMenu.click();
    await expect(correctionItem).toBeEnabled();
    await correctionItem.click();

    const dialog = page.locator('[data-popup-id="model-body-motion-correction"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#app-menu-dialog-title"))
      .toHaveText("モデル体格に合わせてモーション補正");
    await expect(dialog.getByText("全体 2.000x", { exact: false })).toBeVisible();
    await expect(dialog.getByText("2 キーを変更", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "適用" }).click();

    const corrected = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const correctedTracks = getTargetAnimation(corrected).movableBoneTracks;
    expect(unpackNumbers(correctedTracks.find((track) => track.name === "センター").positions))
      .toEqual([2, 4, 6]);
    expect(unpackNumbers(correctedTracks.find((track) => track.name === "左足ＩＫ").positions))
      .toEqual([4, 8, 12]);
    expect(unpackNumbers(correctedTracks[0].rotations)).toEqual([0, 0, 0, 1]);

    await editMenu.click();
    await page.locator('.app-menu-item[data-menu-command="edit.undo"]').click();
    const reverted = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const revertedTracks = getTargetAnimation(reverted).movableBoneTracks;
    expect(unpackNumbers(revertedTracks.find((track) => track.name === "センター").positions))
      .toEqual([1, 2, 3]);
    expect(unpackNumbers(revertedTracks.find((track) => track.name === "左足ＩＫ").positions))
      .toEqual([2, 4, 6]);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
