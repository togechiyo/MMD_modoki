import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const objPath = resolve(repoRoot, "test", "fixtures", "accessory", "tofu.obj");
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

    const vertexBufferDiagnostics = await page.evaluate(
      () => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics(),
    );
    expect(vertexBufferDiagnostics).not.toEqual([]);
    expect(vertexBufferDiagnostics[0]?.bounds).toEqual({
      min: { x: -5, y: 0, z: -5 },
      max: { x: 5, y: 10, z: 5 },
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
    });
  } finally {
    await launched.close();
  }
});
