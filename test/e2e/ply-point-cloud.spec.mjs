import { test, expect } from "@playwright/test";
import { PNG } from "playwright-core/lib/utilsBundle";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const filePath = resolve(root, "test/fixtures/accessory/color-point-cloud.ply");
async function settle(page) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 5; frame += 1) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
  });
}
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
}
async function assertPointMode(page) {
  await expect(page.locator("#info-accessory-kind")).toHaveText("PLY (点群)");
  await expect(page.locator("#chk-accessory-shadow")).toBeDisabled();
  await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
  const materials = await page.evaluate(() => window.mmdModokiE2e.getAccessoryMaterialDiagnostics());
  expect(materials).toHaveLength(1);
  expect(materials[0]).toMatchObject({ materialClassName: "StandardMaterial", pointsCloud: true, disableLighting: true, receiveShadows: false, toonTextureName: null });
}

for (const backend of ["classic", "frameGraph"]) {
  test(`colored PLY points render, edit and restore in ${backend}`, async ({}, testInfo) => {
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
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
      // Supply only the OS file dialog result; the real Open menu handles classification.
      await launched.app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, filePath);
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator('[data-menu-command="file.openFile"]').click();
      const selector = page.locator("#info-model-select");
      await expect(selector).toHaveValue("__accessory__:0");
      await assertPointMode(page);
      const buffers = await page.evaluate(() => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics());
      expect(buffers).toHaveLength(1);
      expect(buffers[0].bounds).toEqual({ min: { x: -10, y: 2, z: -2 }, max: { x: 10, y: 22, z: 2 } });
      expect(buffers[0].buffers.map(buffer => buffer.kind).sort()).toEqual(["color", "position"]);
      expect(buffers[0].buffers.every(buffer => buffer.effectiveByteStride === buffer.byteStride)).toBe(true);
      await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0, y: 12, z: 45 }, { x: 0, y: 12, z: 0 }));
      await settle(page);
      const screenshot = await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`points-${backend}.png`) });
      const pixels = PNG.sync.read(screenshot).data;
      // Compare visible/hidden points so MSAA and the background cannot masquerade as point colors.
      await page.locator("#chk-accessory-visibility").uncheck();
      await settle(page);
      const background = PNG.sync.read(await page.locator("#render-canvas").screenshot()).data;
      await page.locator("#chk-accessory-visibility").check();
      let changed = 0;
      let colored = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(pixels[offset + channel] - background[offset + channel])));
        if (delta > 5) {
          changed += 1;
          if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) - Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 5) colored += 1;
        }
      }
      expect(changed).toBeGreaterThan(150);
      expect(colored).toBeGreaterThan(100);
      await page.locator("#accessory-pos-x").fill("0");
      await page.locator("#accessory-pos-x").press("Enter");
      await page.locator("#btn-info-keyframe").click();
      await seek(page, 20);
      await page.locator("#accessory-pos-x").fill("8");
      await page.locator("#accessory-pos-x").press("Enter");
      await page.locator("#accessory-scale").fill("1.2");
      await page.locator("#accessory-scale").press("Enter");
      await page.locator("#chk-accessory-visibility").uncheck();
      await page.locator("#btn-info-keyframe").click();
      const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(saved.accessories).toHaveLength(1);
      expect(saved.accessories[0]).toMatchObject({ path: filePath, visible: false, castsShadow: false, transform: { position: { x: 8, y: 0, z: 0 }, scale: 1.2 } });
      expect(saved.accessories[0].materialShaders).toBeUndefined();
      expect(await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved)).toMatchObject({ warnings: [] });
      await selector.selectOption("__camera__");
      await selector.selectOption("__accessory__:0");
      await seek(page, 20);
      await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
      await assertPointMode(page);
      await seek(page, 10);
      await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
      await expect(page.locator("#accessory-pos-x")).toHaveValue("4.0");
      await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="materials"]').click();
      await expect(page.locator("#shader-panel-note")).toContainText("点群は頂点色");
      await expect(page.locator("#btn-shader-apply-all")).toBeDisabled();
      await expect(page.locator("#btn-shader-reset")).toBeDisabled();
      if (backend === "classic") {
        // The existing backend control rebuilds the runtime and restores the project.
        await selector.selectOption("__camera__");
        await page.locator('[data-effect-tab="post"]').click();
        await page.locator('select[data-postfx-select="backend"]').selectOption("frameGraph", { force: true });
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
        await selector.selectOption("__accessory__:0");
        await assertPointMode(page);
        await expect(page.locator("#accessory-pos-x")).toHaveValue("4.0");
      }
      await settle(page);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
      page.once("dialog", dialog => dialog.accept());
      await page.locator("#btn-accessory-delete").click();
      await expect(selector.locator('option[value^="__accessory__:"]')).toHaveCount(0);
      expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).accessories).toHaveLength(0);
    } finally { await launched.close(); }
  });
}
