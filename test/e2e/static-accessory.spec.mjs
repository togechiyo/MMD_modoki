import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

for (const kind of ["ply", "stl"]) {
  for (const backend of ["classic", "frameGraph"]) {
    test(`${kind} accessory loads through Open, edits keys and restores in ${backend}`, async ({}, testInfo) => {
      const launched = await launchMmdModoki(root);
      try {
        const page = await launched.app.firstWindow();
        const errors = [];
        const externalRequests = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => {
          const url = new URL(request.url());
          if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) externalRequests.push(request.url());
        });
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const filePath = resolve(root, `test/fixtures/accessory/static-triangle.${kind}`);
        // Replace only the OS file dialog result; dispatch and final UI are real.
        await launched.app.evaluate(({ dialog }, path) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
        }, filePath);
        await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.openFile"]').click();
        const selector = page.locator("#info-model-select");
        await expect(selector).toHaveValue("__accessory__:0");
        await expect(selector.locator('option[value="__accessory__:0"]')).toContainText(`static-triangle [${kind.toUpperCase()}]`);
        await expect(page.locator("#info-accessory-kind")).toHaveText(kind.toUpperCase());
        await expect(page.locator("#chk-accessory-shadow")).toBeChecked();
        await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
        const buffers = await page.evaluate(() => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics());
        expect(buffers).toHaveLength(1);
        expect(buffers[0].bounds).toEqual({ min: { x: -4, y: 0, z: 0 }, max: { x: 4, y: 8, z: 0 } });
        expect(buffers[0].buffers.every(b => b.byteStride === b.effectiveByteStride && b.byteOffset === b.effectiveByteOffset)).toBe(true);
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0, y: 4, z: 30 }, { x: 0, y: 4, z: 0 }));
        await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${kind}-${backend}.png`) });
        // Section registration becomes available after an explicit edit/commit.
        await page.locator("#accessory-pos-x").fill("0");
        await page.locator("#accessory-pos-x").press("Enter");
        await page.locator("#btn-info-keyframe").click();
        await page.locator("#current-frame").fill("20");
        await page.locator("#current-frame").press("Enter");
        for (const [id, value] of [["accessory-pos-x", "10"], ["accessory-rot-y", "30"], ["accessory-scale", "1.5"]]) {
          await page.locator(`#${id}`).fill(value);
          await page.locator(`#${id}`).press("Enter");
        }
        await page.locator("#chk-accessory-visibility").uncheck();
        await page.locator("#chk-accessory-shadow").uncheck();
        await page.locator("#btn-info-keyframe").click();
        await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames)).toEqual([0, 20]);
        const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        expect(saved.accessories[0]).toMatchObject({ path: filePath, visible: false, castsShadow: false,
          transform: { position: { x: 10, y: 0, z: 0 }, scale: 1.5 } });
        expect(saved.accessories[0].transform.rotationDeg.y).toBeCloseTo(30, 5);
        expect(await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved)).toMatchObject({ warnings: [] });
        await selector.selectOption("__camera__");
        await selector.selectOption("__accessory__:0");
        await page.locator("#current-frame").fill("20");
        await page.locator("#current-frame").press("Enter");
        await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
        await expect(page.locator("#accessory-pos-x")).toHaveValue("10.0");
        await page.locator("#current-frame").fill("10");
        await page.locator("#current-frame").press("Enter");
        await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
        await expect(page.locator("#accessory-pos-x")).toHaveValue("5.0");
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        await expect(page.locator("#shader-model-select")).toHaveValue("__accessory__:0");
        await expect(page.locator(".shader-material-item")).toHaveCount(1);
        expect(errors).toEqual([]);
        expect(externalRequests).toEqual([]);
      } finally {
        await launched.close();
      }
    });
  }
}
