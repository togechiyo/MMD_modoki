import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function expectRotationClose(actual, expected) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.z).toBeCloseTo(expected.z, 5);
}

function expectVectorClose(actual, expected, precision = 4) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

test("camera external parent follows parent rotation once and stores zoom in center Z", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath);

    await page.locator("#info-model-select").selectOption("__camera__");
    const parentModelSelect = page.locator("#camera-external-parent-select");
    const parentBoneSelect = page.locator("#camera-parent-bone-select");
    const registerButton = page.locator("[data-testid='camera-external-parent-register']");
    await expect(parentModelSelect).toBeVisible();

    const cameraXInput = page.locator("#bone-controls input[data-control-key='tx']");
    const cameraRxInput = page.locator("#bone-controls input[data-control-key='rx']");
    await cameraXInput.fill("12");
    await cameraXInput.press("Enter");
    await cameraRxInput.fill("15");
    await cameraRxInput.press("Enter");
    await parentModelSelect.selectOption("0");
    const selectedBoneName = await parentBoneSelect.inputValue();
    expect(selectedBoneName.length).toBeGreaterThan(0);
    await registerButton.click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent()?.modelIndex === 0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getCameraExternalParent())).toEqual({
      modelIndex: 0,
      boneName: selectedBoneName,
    });

    const registeredPose = await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
    expect(registeredPose.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(registeredPose.position).toEqual({ x: 0, y: 0, z: 0 });
    expectRotationClose(registeredPose.rotation, { x: 0, y: 0, z: 0 });
    expect(registeredPose.distance).toBe(0);
    const cameraDistanceInput = page.locator("#bone-controls input[data-control-key='camDistance']");
    await expect(cameraDistanceInput).toBeDisabled();
    expect(Number(await cameraDistanceInput.inputValue())).toBe(0);

    const cameraPositionBeforeTranslation = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const parentPositionBeforeTranslation = await page.evaluate(
      ({ boneName }) => window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
      { boneName: selectedBoneName },
    );
    await page.locator("#info-model-select").selectOption("0");
    await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 47 } });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack))
      .toEqual({ category: "root", name: "センター" });
    const parentYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await parentYInput.fill("5");
    await parentYInput.press("Enter");
    await page.waitForFunction(({ boneName, before }) => {
      const current = window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName);
      return current && before && Math.abs(current.y - before.y) > 0.1;
    }, { boneName: selectedBoneName, before: parentPositionBeforeTranslation });

    const parentPositionAfterTranslation = await page.evaluate(
      ({ boneName }) => window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
      { boneName: selectedBoneName },
    );
    const cameraPositionBeforeRotation = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const cameraTargetBeforeRotation = await page.evaluate(() => window.mmdModokiE2e.getCameraTarget());
    expect(parentPositionBeforeTranslation).not.toBeNull();
    expect(parentPositionAfterTranslation).not.toBeNull();
    expect(cameraPositionBeforeRotation.y - cameraPositionBeforeTranslation.y).toBeCloseTo(
      parentPositionAfterTranslation.y - parentPositionBeforeTranslation.y,
      1,
    );

    const cameraRotationBeforeParentRotation = (
      await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose())
    ).rotation;
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 0, y: 90, z: 0 }, true)
    ))).toBe(true);
    await page.waitForFunction((before) => {
      const current = window.mmdModokiE2e.getCameraTarget();
      return Math.hypot(
        current.x - before.x,
        current.y - before.y,
        current.z - before.z,
      ) > 0.5;
    }, cameraTargetBeforeRotation);
    const cameraPositionAfterParentRotation = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const parentPositionAfterRotation = await page.evaluate(
      ({ boneName }) => window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
      { boneName: selectedBoneName },
    );
    expect(parentPositionAfterRotation).not.toBeNull();
    expect(cameraPositionAfterParentRotation.x - cameraPositionBeforeRotation.x).toBeCloseTo(
      parentPositionAfterRotation.x - parentPositionAfterTranslation.x,
      1,
    );
    expect(cameraPositionAfterParentRotation.y - cameraPositionBeforeRotation.y).toBeCloseTo(
      parentPositionAfterRotation.y - parentPositionAfterTranslation.y,
      1,
    );
    expect(cameraPositionAfterParentRotation.z - cameraPositionBeforeRotation.z).toBeCloseTo(
      parentPositionAfterRotation.z - parentPositionAfterTranslation.z,
      1,
    );
    expectRotationClose(
      (await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose())).rotation,
      cameraRotationBeforeParentRotation,
    );
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 0, y: 90, z: 0 }, false)
    ))).toBe(true);
    await page.locator("#info-model-select").selectOption("__camera__");

    const poseBeforeWheel = await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
    await page.locator("#render-canvas").dispatchEvent("wheel", { deltaY: 100, deltaMode: 0 });
    await page.waitForFunction((before) => (
      Math.abs(window.mmdModokiE2e.getCameraKeyframePose().target.z - before) > 0.01
    ), poseBeforeWheel.target.z);
    const poseAfterWheel = await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
    expect(poseAfterWheel.target.z).toBeLessThan(poseBeforeWheel.target.z);
    expect(poseAfterWheel.distance).toBe(0);
    expectRotationClose(poseAfterWheel.rotation, cameraRotationBeforeParentRotation);

    const parentPivotBeforeCameraRotation = await page.evaluate(
      ({ boneName }) => window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
      { boneName: selectedBoneName },
    );
    expect(parentPivotBeforeCameraRotation).not.toBeNull();
    const cameraPositionBeforeLocalRotation = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const cameraRyInput = page.locator("#bone-controls input[data-control-key='ry']");
    await cameraRyInput.fill("45");
    await cameraRyInput.press("Enter");
    await page.waitForFunction((before) => {
      const current = window.mmdModokiE2e.getCameraPosition();
      return Math.hypot(
        current.x - before.x,
        current.y - before.y,
        current.z - before.z,
      ) > 0.05;
    }, cameraPositionBeforeLocalRotation);
    const cameraPositionAfterLocalRotation = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    expect(Math.hypot(
      cameraPositionAfterLocalRotation.x - parentPivotBeforeCameraRotation.x,
      cameraPositionAfterLocalRotation.y - parentPivotBeforeCameraRotation.y,
      cameraPositionAfterLocalRotation.z - parentPivotBeforeCameraRotation.z,
    )).toBeCloseTo(Math.hypot(
      cameraPositionBeforeLocalRotation.x - parentPivotBeforeCameraRotation.x,
      cameraPositionBeforeLocalRotation.y - parentPivotBeforeCameraRotation.y,
      cameraPositionBeforeLocalRotation.z - parentPivotBeforeCameraRotation.z,
    ), 2);
    expect((await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose())).rotation.y).toBeCloseTo(45, 4);

    const cameraPoseBeforePan = await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
    const cameraPositionBeforePan = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const cameraTargetBeforePan = await page.evaluate(() => window.mmdModokiE2e.getCameraTarget());
    const renderCanvas = page.locator("#render-canvas");
    await renderCanvas.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "mouse",
      button: 1,
      buttons: 4,
      clientX: 700,
      clientY: 400,
    });
    await renderCanvas.dispatchEvent("pointermove", {
      pointerId: 7,
      pointerType: "mouse",
      button: -1,
      buttons: 4,
      clientX: 760,
      clientY: 400,
    });
    await renderCanvas.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "mouse",
      button: 1,
      buttons: 0,
      clientX: 760,
      clientY: 400,
    });
    await page.waitForFunction((before) => {
      const current = window.mmdModokiE2e.getCameraPosition();
      return Math.hypot(
        current.x - before.x,
        current.y - before.y,
        current.z - before.z,
      ) > 0.01;
    }, cameraPositionBeforePan);
    const cameraPositionAfterPan = await page.evaluate(() => window.mmdModokiE2e.getCameraPosition());
    const cameraTargetAfterPan = await page.evaluate(() => window.mmdModokiE2e.getCameraTarget());
    const panDirectionAlignment = (() => {
      const forward = {
        x: cameraTargetBeforePan.x - cameraPositionBeforePan.x,
        y: cameraTargetBeforePan.y - cameraPositionBeforePan.y,
        z: cameraTargetBeforePan.z - cameraPositionBeforePan.z,
      };
      const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
      const right = {
        x: -forward.z / forwardLength,
        y: 0,
        z: forward.x / forwardLength,
      };
      const move = {
        x: cameraPositionAfterPan.x - cameraPositionBeforePan.x,
        y: cameraPositionAfterPan.y - cameraPositionBeforePan.y,
        z: cameraPositionAfterPan.z - cameraPositionBeforePan.z,
      };
      const moveLength = Math.hypot(move.x, move.y, move.z);
      return (move.x * right.x + move.y * right.y + move.z * right.z) / moveLength;
    })();
    expect(panDirectionAlignment).toBeGreaterThan(0.98);
    const cameraPositionPanDelta = {
      x: cameraPositionAfterPan.x - cameraPositionBeforePan.x,
      y: cameraPositionAfterPan.y - cameraPositionBeforePan.y,
      z: cameraPositionAfterPan.z - cameraPositionBeforePan.z,
    };
    const cameraTargetPanDelta = {
      x: cameraTargetAfterPan.x - cameraTargetBeforePan.x,
      y: cameraTargetAfterPan.y - cameraTargetBeforePan.y,
      z: cameraTargetAfterPan.z - cameraTargetBeforePan.z,
    };
    expectVectorClose(cameraTargetPanDelta, cameraPositionPanDelta);
    expectVectorClose({
      x: cameraTargetAfterPan.x - cameraPositionAfterPan.x,
      y: cameraTargetAfterPan.y - cameraPositionAfterPan.y,
      z: cameraTargetAfterPan.z - cameraPositionAfterPan.z,
    }, {
      x: cameraTargetBeforePan.x - cameraPositionBeforePan.x,
      y: cameraTargetBeforePan.y - cameraPositionBeforePan.y,
      z: cameraTargetBeforePan.z - cameraPositionBeforePan.z,
    });
    expectRotationClose(
      (await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose())).rotation,
      cameraPoseBeforePan.rotation,
    );

    const currentFrameInput = page.locator("#current-frame");
    await currentFrameInput.fill("30");
    await currentFrameInput.press("Enter");
    await parentModelSelect.selectOption("");
    await registerButton.click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent() === null);

    await currentFrameInput.fill("29");
    await currentFrameInput.press("Enter");
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent()?.modelIndex === 0);

    await currentFrameInput.fill("30");
    await currentFrameInput.press("Enter");
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent() === null);

    await page.locator("[data-menu-command='edit.undo']").first().click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent()?.modelIndex === 0);
    await page.locator("[data-menu-command='edit.redo']").first().click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent() === null);
  } finally {
    await launched.close();
  }
});
