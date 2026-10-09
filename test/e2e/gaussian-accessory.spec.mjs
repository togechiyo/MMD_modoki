import { test, expect } from "@playwright/test";
import { PNG } from "playwright-core/lib/utilsBundle";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const references = [
  ...["ply", "splat", "spz"].map(kind => ({ kind, path: resolve(root, `test/fixtures/accessory/gaussian-color.${kind}`), count: 4 })),
  { kind: "ply", path: resolve(root, "local-references/babylonjs/static-formats/combined_SPZv3.ply"), count: 1566, optional: true },
];
async function settle(page) {
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame)); });
}
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
}
async function assertGaussian(page, reference) {
  await expect(page.locator("#info-accessory-kind")).toHaveText(`${reference.kind.toUpperCase()} (Gaussian Splat)`);
  await expect(page.locator("#chk-accessory-shadow")).toBeDisabled();
  await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
  await page.waitForFunction(() => window.mmdModokiE2e.getAccessoryMaterialDiagnostics().some(mesh => mesh.ready));
  const materials = await page.evaluate(() => window.mmdModokiE2e.getAccessoryMaterialDiagnostics());
  expect(materials).toHaveLength(1);
  expect(materials[0]).toMatchObject({ meshClassName: "GaussianSplattingMesh", materialClassName: "GaussianSplattingMaterial", vertexCount: reference.count, receiveShadows: false, toonTextureName: null });
}
async function assertVisiblePixels(page, testInfo, name) {
  await settle(page);
  const pixels = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(name) })).data;
  await page.locator("#chk-accessory-visibility").uncheck();
  await settle(page);
  const background = PNG.sync.read(await page.locator("#render-canvas").screenshot()).data;
  await page.locator("#chk-accessory-visibility").check();
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(pixels[i + channel] - background[i + channel])));
    if (delta > 20 && Math.max(...pixels.subarray(i, i + 3)) - Math.min(...pixels.subarray(i, i + 3)) > 20) colored++;
  }
  expect(colored).toBeGreaterThan(500);
}

for (const backend of ["classic", "frameGraph"]) for (const reference of references) {
  test(`Gaussian ${reference.optional ? "Babylon PLY" : reference.kind} renders, edits and restores in ${backend}`, async ({}, testInfo) => {
    test.skip(reference.optional && !existsSync(reference.path), "Optional Babylon Gaussian reference is not installed");
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
      await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, reference.path);
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator('[data-menu-command="file.openFile"]').click();
      const selector = page.locator("#info-model-select");
      await expect(selector).toHaveValue("__accessory__:0");
      await assertGaussian(page, reference);
      await page.evaluate(official => window.mmdModokiE2e.setCameraPose(official ? { x: 650, y: 400, z: 600 } : { x: 0, y: 8, z: 45 }, official ? { x: 50, y: -50, z: 50 } : { x: 0, y: 8, z: 0 }), Boolean(reference.optional));
      await assertVisiblePixels(page, testInfo, `gaussian-${reference.optional ? "babylon" : reference.kind}-${backend}.png`);
      await page.locator("#btn-info-keyframe").click();
      await seek(page, 20);
      for (const [id, value] of [["accessory-pos-x", "8"], ["accessory-rot-y", "20"], ["accessory-scale", "1.2"]]) {
        await page.locator(`#${id}`).fill(value);
        await page.locator(`#${id}`).press("Enter");
      }
      await page.locator("#chk-accessory-visibility").uncheck();
      await page.locator("#btn-info-keyframe").click();
      const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(saved.accessories[0]).toMatchObject({ path: reference.path, visible: false, castsShadow: false, transform: { position: { x: 8, y: 0, z: 0 }, scale: 1.2 } });
      expect(saved.accessories[0].materialShaders).toBeUndefined();
      expect(await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved)).toMatchObject({ warnings: [] });
      await selector.selectOption("__camera__");
      await selector.selectOption("__accessory__:0");
      await seek(page, 20);
      await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
      await seek(page, 10);
      await expect(page.locator("#accessory-pos-x")).toHaveValue("4.0");
      await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
      await assertGaussian(page, reference);
      await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="materials"]').click();
      await expect(page.locator("#shader-panel-note")).toContainText("Gaussian Splatは専用材質");
      await expect(page.locator("#btn-shader-apply-all")).toBeDisabled();
      if (backend === "classic" && reference.kind === "ply" && !reference.optional) {
        await selector.selectOption("__camera__");
        await page.locator('[data-effect-tab="post"]').click();
        await page.locator('select[data-postfx-select="backend"]').selectOption("frameGraph", { force: true });
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
        await selector.selectOption("__accessory__:0");
        await assertGaussian(page, reference);
        await assertVisiblePixels(page, testInfo, "gaussian-runtime-restore.png");
      }
      await settle(page);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
      page.once("dialog", dialog => dialog.accept());
      await page.locator("#btn-accessory-delete").click();
      await expect(selector.locator('option[value^="__accessory__:"]')).toHaveCount(0);
      expect(await page.evaluate(() => window.mmdModokiE2e.getAccessoryMaterialDiagnostics())).toHaveLength(0);
    } finally { await launched.close(); }
  });
}
