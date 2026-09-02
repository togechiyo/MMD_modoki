import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const pmxPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const platePmxPath = resolve(repoRoot, "test", "fixtures", "external-parent", "plate.pmx");
const objPath = resolve(repoRoot, "test", "fixtures", "accessory", "tofu.obj");
const emptySceneScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-empty-scene.png");
const pmxScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-tofu-pmx.png");
const pmxReceiverScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-tofu-pmx-receiver.png");
const objScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-tofu-obj.png");
const freshObjScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-tofu-obj-fresh.png");
const combinedScreenshotPath = resolve(repoRoot, "test-results", "shadow-csm-tofu-pmx-obj.png");
const standardReceiverScreenshotPath = resolve(repoRoot, "test-results", "shadow-standard-tofu-pmx-receiver.png");

async function openShadowDetails(page) {
  const command = page.locator('[data-menu-command="view.lightShadowSettings"]');
  const group = page.locator(".app-menu-group", { has: command });
  await group.locator(".app-menu-trigger").click();
  await command.click();
  const dialog = page.locator('[data-popup-id="lighting-shadow-settings"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test("keeps cascaded shadows active after loading the tofu PMX and OBJ fixtures", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(() => window.mmdModokiE2e.setCameraPose(
      { x: 12, y: 12, z: -18 },
      { x: 0, y: 2, z: 0 },
    ));
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });
    await page.locator("#render-canvas").screenshot({ path: emptySceneScreenshotPath });

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      pmxPath,
    )).not.toBeNull();
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });
    await page.locator("#render-canvas").screenshot({ path: pmxScreenshotPath });

    const pmxDiagnostics = await page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    );
    expect(pmxDiagnostics.casterCount).toBe(2);
    expect(pmxDiagnostics.casterNames).toEqual(["豆腐", "正面マーカー"]);
    expect(pmxDiagnostics.models).toHaveLength(1);
    expect(pmxDiagnostics.models[0]).toMatchObject({
      renderMeshCount: 3,
      casterMeshCount: 2,
      receiverMeshCount: 3,
    });

    await page.locator("#info-model-select").selectOption("0");
    await page.locator("#chk-model-visibility").uncheck();
    await page.locator("#chk-model-shadow").uncheck();

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
      objPath,
    )).toBe(true);
    await page.locator("#accessory-pos-x").fill("3");
    await page.locator("#accessory-pos-x").press("Enter");
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });
    await page.locator("#render-canvas").screenshot({ path: objScreenshotPath });

    await page.locator("#info-model-select").selectOption("0");
    await page.locator("#chk-model-visibility").check();
    await page.locator("#chk-model-shadow").check();
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });

    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    )).toMatchObject({
      requestedMode: "cascaded",
      effectiveMode: "cascaded",
      cascadedSupported: true,
      cascadedAutoCalcDepthBounds: true,
      filter: "none",
      engine: "WebGPU",
    });

    await expect(page.locator("#info-model-select").locator('option[value="0"]')).toContainText("tofu");
    await expect(page.locator("#info-model-select").locator('option[value="__accessory__:0"]')).toContainText("tofu [OBJ]");

    await page.locator("#render-canvas").screenshot({ path: combinedScreenshotPath });
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
    )).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

test("renders the tofu OBJ as the first cascaded-shadow caster", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
      objPath,
    )).toBe(true);
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose(
      { x: 12, y: 12, z: -18 },
      { x: 0, y: 2, z: 0 },
    ));
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });

    expect(await page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    )).toMatchObject({
      requestedMode: "cascaded",
      effectiveMode: "cascaded",
      cascadedSupported: true,
      cascadedAutoCalcDepthBounds: true,
      filter: "none",
      engine: "WebGPU",
    });
    await page.locator("#render-canvas").screenshot({ path: freshObjScreenshotPath });
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
    )).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

test("keeps PMX meshes registered as cascaded-shadow casters and receivers", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(async ({ plate, tofu }) => {
      await window.mmdModokiE2e.loadModel(plate);
      await window.mmdModokiE2e.loadModel(tofu);
    }, { plate: platePmxPath, tofu: pmxPath });

    await page.locator("#info-model-select").selectOption("1");
    await selectCenterBone(page);
    const modelYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await modelYInput.fill("4");
    await modelYInput.press("Enter");
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose(
      { x: 14, y: 11, z: -17 },
      { x: 0, y: 2, z: 0 },
    ));
    await page.locator("#info-model-select").selectOption("__camera__");
    await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });

    const diagnostics = await page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    );
    expect(diagnostics).toMatchObject({
      requestedMode: "cascaded",
      effectiveMode: "cascaded",
      cascadedSupported: true,
      cascadedAutoCalcDepthBounds: true,
      filter: "none",
      enabled: true,
      lightSamplingEnabled: true,
      engine: "WebGPU",
    });
    expect(diagnostics.casterCount).toBeGreaterThan(0);
    expect(diagnostics.models).toHaveLength(2);
    for (const model of diagnostics.models) {
      expect(model.castsShadow).toBe(true);
      expect(model.casterMeshCount).toBeGreaterThan(0);
      expect(model.receiverMeshCount).toBeGreaterThan(0);
    }

    await page.locator("#render-canvas").screenshot({ path: pmxReceiverScreenshotPath });
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
    )).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

test("keeps PMX occlusion shadows after selecting standard shadows from the menu", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(async ({ plate, tofu }) => {
      await window.mmdModokiE2e.loadModel(plate);
      await window.mmdModokiE2e.loadModel(tofu);
    }, { plate: platePmxPath, tofu: pmxPath });

    await page.locator("#info-model-select").selectOption("1");
    await selectCenterBone(page);
    const modelYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await modelYInput.fill("4");
    await modelYInput.press("Enter");
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose(
      { x: 14, y: 11, z: -17 },
      { x: 0, y: 2, z: 0 },
    ));

    const dialog = await openShadowDetails(page);
    await dialog.locator("#light-shadow-mode").selectOption("standard");
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    )).toMatchObject({
      requestedMode: "standard",
      effectiveMode: "standard",
      enabled: true,
      lightSamplingEnabled: true,
      reverseDepthBuffer: true,
      customProjectionBuilder: true,
      engine: "WebGPU",
    });

    await page.keyboard.press("Escape");
    await page.locator("#info-model-select").selectOption("__camera__");
    await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });

    const diagnostics = await page.evaluate(
      () => window.mmdModokiE2e.getShadowRuntimeDiagnostics(),
    );
    expect(diagnostics.casterCount).toBeGreaterThan(0);
    expect(diagnostics.models).toHaveLength(2);
    for (const model of diagnostics.models) {
      expect(model.castsShadow).toBe(true);
      expect(model.casterMeshCount).toBeGreaterThan(0);
      expect(model.receiverMeshCount).toBeGreaterThan(0);
    }

    await page.locator("#render-canvas").screenshot({ path: standardReceiverScreenshotPath });
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
    )).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});
