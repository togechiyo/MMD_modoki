import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tofuPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const platePath = resolve(repoRoot, "test/fixtures/external-parent/plate.pmx");
const dynamicFollowerPath = resolve(repoRoot, "test/fixtures/external-parent/dynamic-follower.pmx");

test("豆腐モデルの外部親をフレーム単位で登録・解除できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(async ({ tofu, plate }) => {
      await window.mmdModokiE2e.loadModel(tofu);
      await window.mmdModokiE2e.loadModel(plate);
    }, { tofu: tofuPath, plate: platePath });

    const modelSelect = page.locator("#info-model-select");
    await expect(modelSelect.locator("option")).toHaveCount(3);

    await modelSelect.selectOption("0");
    const childXInput = page.locator("#bone-controls input[data-control-key='tx']");
    const childYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await childXInput.fill("2");
    await childXInput.press("Enter");
    await childYInput.fill("1");
    await childYInput.press("Enter");

    const parentModelSelect = page.locator("#info-external-parent-select");
    const parentBoneSelect = page.locator("#info-parent-bone-select");
    await expect(parentModelSelect).toBeVisible();
    await parentModelSelect.selectOption("1");
    await expect(parentBoneSelect).toHaveValue("センター");
    await page.locator("[data-testid='model-external-parent-register']").click();

    const registered = await page.evaluate(() => window.mmdModokiE2e.getModelExternalParent(0));
    expect(registered).toMatchObject({
        childBoneName: "センター",
        parentBoneName: "センター",
        parentModelIndex: 1,
    });
    await expect(childXInput).toHaveValue("0.00");
    await expect(childYInput).toHaveValue("0.00");

    await modelSelect.selectOption("1");
    const parentYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await parentYInput.fill("5");
    await parentYInput.press("Enter");
    await page.waitForFunction(() => {
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
      const parent = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター");
      return child && parent && Math.abs(parent.y - 5) < 0.1 && Math.abs(child.y - parent.y) < 0.1;
    });

    const positions = await page.evaluate(() => ({
      activeModelIndex: window.mmdModokiE2e.getActiveModelIndex(),
      activeTransform: window.mmdModokiE2e.getActiveBoneTransform("センター"),
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      parent: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    }));
    expect(positions.activeModelIndex).toBe(1);
    expect(positions.activeTransform?.position.y).toBeCloseTo(5, 2);
    expect(positions.parent?.y, JSON.stringify(positions)).toBeGreaterThan(4.9);
    expect(positions.child?.y).toBeCloseTo(positions.parent.y, 2);

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 25, y: 40, z: 0 }, true)
    ))).toBe(true);
    await page.waitForFunction(() => {
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
      const parent = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター");
      return child && parent && Math.abs(child.y - parent.y) < 0.1;
    });
    const duringParentRotationDrag = await page.evaluate(() => ({
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      parent: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    }));
    expect(duringParentRotationDrag.child?.y).toBeCloseTo(duringParentRotationDrag.parent.y, 2);
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 25, y: 40, z: 0 }, false)
    ))).toBe(true);

    await modelSelect.selectOption("0");
    await page.waitForFunction(() => {
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
      const gizmo = window.mmdModokiE2e.getBoneGizmoPosition();
      return child
        && gizmo
        && Math.abs(gizmo.x - child.x) < 0.1
        && Math.abs(gizmo.y - child.y) < 0.1
        && Math.abs(gizmo.z - child.z) < 0.1;
    });
    const gizmoState = await page.evaluate(() => ({
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      gizmo: window.mmdModokiE2e.getBoneGizmoPosition(),
    }));
    expect(gizmoState.gizmo).not.toBeNull();
    expect(gizmoState.gizmo?.x).toBeCloseTo(gizmoState.child.x, 2);
    expect(gizmoState.gizmo?.y).toBeCloseTo(gizmoState.child.y, 2);
    expect(gizmoState.gizmo?.z).toBeCloseTo(gizmoState.child.z, 2);

    const currentFrameInput = page.locator("#current-frame");
    await currentFrameInput.fill("30");
    await currentFrameInput.press("Enter");
    await expect(currentFrameInput).toHaveValue("30");
    await parentModelSelect.selectOption("");
    await page.locator("[data-testid='model-external-parent-register']").click();
    await page.waitForFunction(() => {
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
      return window.mmdModokiE2e.getModelExternalParent(0) === null
        && child
        && Math.abs(child.y) < 0.1;
    });

    const detachedChild = await page.evaluate(() => window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"));
    expect(detachedChild?.y).toBeCloseTo(0, 2);

    await currentFrameInput.fill("29");
    await currentFrameInput.press("Enter");
    await page.waitForFunction(() => {
      const relation = window.mmdModokiE2e.getModelExternalParent(0);
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
      const parent = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター");
      return relation?.parentModelIndex === 1
        && child
        && parent
        && Math.abs(child.y - parent.y) < 0.1;
    });

    await currentFrameInput.fill("30");
    await currentFrameInput.press("Enter");
    await page.waitForFunction(() => window.mmdModokiE2e.getModelExternalParent(0) === null);

    await page.locator("[data-menu-command='edit.undo']").first().click();
    await page.waitForFunction(() => window.mmdModokiE2e.getModelExternalParent(0)?.parentModelIndex === 1);
    await page.locator("[data-menu-command='edit.redo']").first().click();
    await page.waitForFunction(() => window.mmdModokiE2e.getModelExternalParent(0) === null);
  } finally {
    await launched.close();
  }
});

test("camera follows a bone on a model that has its own external parent", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(async ({ tofu, plate }) => {
      await window.mmdModokiE2e.loadModel(tofu);
      await window.mmdModokiE2e.loadModel(plate);
    }, { tofu: tofuPath, plate: platePath });

    const modelSelect = page.locator("#info-model-select");
    await modelSelect.selectOption("0");
    const modelParentSelect = page.locator("#info-external-parent-select");
    await modelParentSelect.selectOption("1");
    await page.locator("[data-testid='model-external-parent-register']").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getModelExternalParent(0)?.parentModelIndex === 1);

    await modelSelect.selectOption("__camera__");
    const cameraParentModelSelect = page.locator("#camera-external-parent-select");
    const cameraParentBoneSelect = page.locator("#camera-parent-bone-select");
    await cameraParentModelSelect.selectOption("0");
    const cameraParentBoneName = await cameraParentBoneSelect.inputValue();
    expect(cameraParentBoneName.length).toBeGreaterThan(0);
    await page.locator("[data-testid='camera-external-parent-register']").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent()?.modelIndex === 0);

    const before = await page.evaluate((boneName) => ({
      camera: window.mmdModokiE2e.getCameraPosition(),
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
    }), cameraParentBoneName);
    expect(before.child).not.toBeNull();

    await modelSelect.selectOption("1");
    const parentYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await parentYInput.fill("6");
    await parentYInput.press("Enter");
    await page.waitForFunction(({ boneName, beforeY }) => {
      const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName);
      return child && Math.abs(child.y - beforeY) > 1;
    }, { boneName: cameraParentBoneName, beforeY: before.child.y });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    const after = await page.evaluate((boneName) => ({
      camera: window.mmdModokiE2e.getCameraPosition(),
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, boneName),
    }), cameraParentBoneName);
    expect(after.child).not.toBeNull();
    expect(after.camera.y - before.camera.y).toBeCloseTo(after.child.y - before.child.y, 1);
  } finally {
    await launched.close();
  }
});

test("camera follows the delayed dynamic bone after model external parent input", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async ({ plate, dynamicFollower }) => {
      await window.mmdModokiE2e.loadModel(plate);
      await window.mmdModokiE2e.loadModel(dynamicFollower);
    }, { plate: platePath, dynamicFollower: dynamicFollowerPath });

    const modelSelect = page.locator("#info-model-select");
    await modelSelect.selectOption("1");
    await page.locator("#info-external-parent-select").selectOption("0");
    await expect(page.locator("#info-parent-bone-select")).toHaveValue("センター");
    await page.locator("[data-testid='model-external-parent-register']").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getModelExternalParent(1)?.parentModelIndex === 0);

    await modelSelect.selectOption("__camera__");
    await page.locator("#camera-external-parent-select").selectOption("1");
    await page.locator("#camera-parent-bone-select").selectOption("Camera Output");
    await page.locator("[data-testid='camera-external-parent-register']").click();
    await page.waitForFunction(() => window.mmdModokiE2e.getCameraExternalParent()?.boneName === "Camera Output");

    const before = await page.evaluate(() => ({
      camera: window.mmdModokiE2e.getCameraPosition(),
      input: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Physics Input"),
      output: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Camera Output"),
    }));
    expect(before.input).not.toBeNull();
    expect(before.output).not.toBeNull();

    const settledWithoutCorrection = await page.evaluate(async () => {
      for (let index = 0; index < 90; index += 1) {
        await new Promise((resolveAnimationFrame) => requestAnimationFrame(resolveAnimationFrame));
      }
      return window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Camera Output");
    });
    expect(settledWithoutCorrection?.y).toBeLessThan(-0.15);

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setFullyDampedPhysicsCompatibilityCorrection(true, 1)
    ))).toBe(true);
    await page.waitForFunction(() => {
      const output = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Camera Output");
      return output && Math.abs(output.y) < 0.05;
    });

    await modelSelect.selectOption("0");
    const parentXInput = page.locator("#bone-controls input[data-control-key='tx']");
    await parentXInput.fill("10");
    await parentXInput.press("Enter");

    const samples = await page.evaluate(async () => {
      const result = [];
      for (let index = 0; index < 60; index += 1) {
        await new Promise((resolveAnimationFrame) => requestAnimationFrame(resolveAnimationFrame));
        result.push({
          camera: window.mmdModokiE2e.getCameraPosition(),
          input: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Physics Input"),
          output: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Camera Output"),
        });
      }
      return result;
    });
    const delayed = samples.find((sample) => (
      sample.input
      && sample.output
      && sample.input.x > 9.5
      && sample.output.x > 0.1
      && sample.output.x < 9.5
    ));
    expect(delayed, JSON.stringify(samples)).toBeTruthy();
    expect(delayed.input.x).toBeGreaterThan(9.5);
    expect(delayed.output.x).toBeGreaterThan(0.1);
    expect(delayed.output.x).toBeLessThan(9.5);
    expect(delayed.camera.x - before.camera.x).toBeCloseTo(delayed.output.x - before.output.x, 1);

    await page.waitForFunction((previousX) => {
      const output = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "Camera Output");
      return output && output.x > previousX + 0.1;
    }, delayed.output.x);

  } finally {
    await launched.close();
  }
});
