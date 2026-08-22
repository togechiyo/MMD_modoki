import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const objPath = resolve(repoRoot, "test", "fixtures", "accessory", "tofu.obj");
const texturedObjPath = resolve(repoRoot, "test", "fixtures", "accessory", "tofu-uv-mtl.obj");
test("loads, edits, saves, and restores a material-free OBJ accessory", async () => {
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
      { x: 30, y: 35, z: -30 },
      { x: 0, y: 3, z: 0 },
    ));

    const targetSelect = page.locator("#info-model-select");
    await expect(targetSelect.locator('option[value="__accessory__:0"]')).toContainText("tofu [OBJ]");
    await expect(targetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator("#accessory-info-content")).toBeVisible();
    await expect(page.locator("#accessory-transform-content")).toBeVisible();
    await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
    await expect(page.locator("#chk-accessory-shadow")).toBeChecked();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    const shaderTargetSelect = page.locator("#shader-model-select");
    await expect(shaderTargetSelect.locator('option[value="__accessory__:0"]')).toContainText("tofu [OBJ]");
    await expect(shaderTargetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator('#shader-preset-select option[value="wgsl-obj-untextured"]')).toHaveText("OBJ Untextured");
    await expect(page.locator('#shader-preset-select option[value="wgsl-obj-mtl"]')).toHaveText("OBJ MTL");
    await expect(page.locator(".shader-material-item")).toHaveCount(1);
    await expect(page.locator(".shader-material-preset")).toHaveText("OBJ Untextured");
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getAccessoryMaterialDiagnostics()[0]?.toonTextureName,
    )).toBe("preset:fallback_accessory_toon");
    await page.locator(".shader-material-item").click();
    await page.locator("#shader-preset-select").selectOption("wgsl-full-light");
    await page.locator("#btn-shader-apply-selected").click();
    await expect(page.locator(".shader-material-preset")).toHaveText("full_light");
    await page.locator("#btn-toggle-shader-panel").click();

    const vertexBufferDiagnostics = await page.evaluate(
      () => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics(),
    );
    expect(vertexBufferDiagnostics).not.toEqual([]);
    expect(vertexBufferDiagnostics[0]?.bounds).toEqual({
      min: { x: -0.5, y: 0, z: -0.5 },
      max: { x: 0.5, y: 1, z: 0.5 },
    });
    expect(vertexBufferDiagnostics.every(({ buffers }) => (
      buffers.length > 0
      && buffers.every(({ byteStride, effectiveByteStride, byteOffset, effectiveByteOffset }) => (
        effectiveByteStride === byteStride && effectiveByteOffset === byteOffset
      ))
    ))).toBe(true);

    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });
    expect(pageErrors).toEqual([]);
    await page.locator("#accessory-pos-x").fill("2.5");
    await page.locator("#accessory-pos-x").press("Enter");
    await page.locator("#chk-accessory-visibility").uncheck();
    await page.locator("#chk-accessory-shadow").uncheck();

    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(savedProject.accessories).toHaveLength(1);
    expect(savedProject.accessories[0]).toMatchObject({
      path: objPath,
      visible: false,
      castsShadow: false,
      transform: {
        position: { x: 2.5, y: 0, z: 0 },
      },
      materialShaders: [{
        materialKey: expect.any(String),
        presetId: "wgsl-full-light",
      }],
    });

    const imported = await page.evaluate(
      async (project) => window.mmdModokiE2e.importProjectState(project),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);

    const restoredProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restoredProject.accessories).toHaveLength(1);
    expect(restoredProject.accessories[0]).toMatchObject({
      path: objPath,
      visible: false,
      castsShadow: false,
      transform: {
        position: { x: 2.5, y: 0, z: 0 },
      },
      materialShaders: [{
        materialKey: expect.any(String),
        presetId: "wgsl-full-light",
      }],
    });
  } finally {
    await launched.close();
  }
});

test("loads a local MTL and PNG texture without network access and restores them from a project", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    const externalRequests = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        (url.protocol === "http:" || url.protocol === "https:")
        && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ) {
        externalRequests.push(request.url());
      }
    });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
      texturedObjPath,
    )).toBe(true);

    const targetSelect = page.locator("#info-model-select");
    await expect(targetSelect.locator('option[value="__accessory__:0"]')).toContainText("tofu-uv-mtl [OBJ]");
    await expect(targetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator("#accessory-info-content")).toBeVisible();

    await expect.poll(async () => page.evaluate(
      () => window.mmdModokiE2e.getAccessoryMaterialDiagnostics()[0]?.diffuseTextureReady ?? false,
    )).toBe(true);
    const loadedMaterials = await page.evaluate(
      () => window.mmdModokiE2e.getAccessoryMaterialDiagnostics(),
    );
    expect(loadedMaterials).toHaveLength(1);
    expect(loadedMaterials[0]).toMatchObject({
      hasUvs: true,
      materialName: "TofuMaterial",
      materialClassName: "StandardMaterial",
      diffuseTextureReady: true,
      toonTextureName: "preset:fallback_accessory_toon",
      toonTextureReady: true,
    });
    expect(loadedMaterials[0]?.diffuseTextureUrl).toMatch(/^data:image\/png;base64,/);

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await expect(page.locator("#shader-model-select")).toHaveValue("__accessory__:0");
    await expect(page.locator(".shader-material-item")).toHaveCount(1);
    await expect(page.locator(".shader-material-preset")).toHaveText("OBJ MTL");
    await expect(page.locator('#shader-preset-select option[value="wgsl-obj-untextured"]')).toHaveText("OBJ Untextured");
    await expect(page.locator('#shader-preset-select option[value="wgsl-obj-mtl"]')).toHaveText("OBJ MTL");

    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const imported = await page.evaluate(
      async (project) => window.mmdModokiE2e.importProjectState(project),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);
    await expect.poll(async () => page.evaluate(
      () => window.mmdModokiE2e.getAccessoryMaterialDiagnostics()[0]?.diffuseTextureReady ?? false,
    )).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  } finally {
    await launched.close();
  }
});
