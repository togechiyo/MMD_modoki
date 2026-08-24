import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

function unpackNumbers(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  if (value.encoding === "u8-b64") return [...bytes];
  if (value.encoding === "f32-b64") {
    return Array.from({ length: value.length }, (_, index) => bytes.readFloatLE(index * 4));
  }
  throw new Error(`Unsupported packed array encoding: ${value.encoding}`);
}

function expectNumbersClose(actual, expected) {
  const values = unpackNumbers(actual);
  expect(values).toHaveLength(expected.length);
  values.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 5));
}

const cameraAnimation = {
  frameNumbers: [0, 30],
  positions: [1, 2, 3, 4, 5, 6],
  positionInterpolations: [
    20, 20, 20, 20,
    20, 20, 20, 20,
  ],
  rotations: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
  rotationInterpolations: [
    20, 20, 20, 20,
    20, 20, 20, 20,
  ],
  distances: [-30, -45],
  distanceInterpolations: [
    20, 20, 20, 20,
    20, 20, 20, 20,
  ],
  fovs: [30, 45],
  fovInterpolations: [
    20, 20, 20, 20,
    20, 20, 20, 20,
  ],
};

test("編集メニューからカメラキーを全選択し、位置と回転を補正してUndoできる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();

    await page.evaluate(async (fixture) => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.keyframes = {
        ...(project.keyframes ?? {}),
        modelAnimations: project.keyframes?.modelAnimations ?? [],
        cameraAnimation: fixture,
      };
      await window.mmdModokiE2e.importProjectState(project);
    }, cameraAnimation);

    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner"))
      .toHaveAttribute("data-bottom-panel-mode", "camera");

    const editMenu = page.locator('.app-menu-trigger[data-i18n="menu.edit"]');
    const selectAllCamera = page.locator('[data-menu-command="edit.selectAllCameraKeys"]');
    await editMenu.click();
    await expect(selectAllCamera).toBeEnabled();
    await selectAllCamera.click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys))
      .toEqual([
        { trackCategory: "camera", trackName: "Camera", frame: 0 },
        { trackCategory: "camera", trackName: "Camera", frame: 30 },
      ]);
    const beforeCorrection = await page.evaluate(() => (
      window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation
    ));

    const correctCamera = page.locator('[data-menu-command="edit.correctCamera"]');
    await editMenu.click();
    await expect(correctCamera).toBeEnabled();
    await correctCamera.click();

    const dialog = page.locator('[data-popup-id="keyframe-correction-camera"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#app-menu-dialog-title")).toHaveText("選択カメラキー補正");
    await expect(dialog.getByText("元値 × 倍率 + 加算", { exact: false })).toBeVisible();

    await dialog.locator('[data-correction-channel="center-x"][data-correction-operation="multiply"]').fill("2");
    await dialog.locator('[data-correction-channel="center-x"][data-correction-operation="add"]').fill("1");
    await dialog.locator('[data-correction-channel="rotation-z"][data-correction-operation="add"]').fill("15");
    await expect(dialog.getByText("対象 2 キー / 変更 2 キー", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "適用" }).click();
    await expect(dialog).toBeHidden();

    const corrected = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation);
    expectNumbersClose(corrected.positions, [3, 2, 3, 9, 5, 6]);
    const expectedRotations = unpackNumbers(beforeCorrection.rotations);
    expectedRotations[2] += 15 * Math.PI / 180;
    expectedRotations[5] += 15 * Math.PI / 180;
    expectNumbersClose(corrected.rotations, expectedRotations);
    expect(unpackNumbers(corrected.positionInterpolations))
      .toEqual(unpackNumbers(beforeCorrection.positionInterpolations));

    await editMenu.click();
    await page.locator('.app-menu-item[data-menu-command="edit.undo"]').click();
    const reverted = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation);
    expectNumbersClose(reverted.positions, unpackNumbers(beforeCorrection.positions));
    expectNumbersClose(reverted.rotations, unpackNumbers(beforeCorrection.rotations));
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
