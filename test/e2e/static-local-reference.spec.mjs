import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const referenceRoot = resolve(root, "local-references/babylonjs/static-formats");

async function openLocalFile(app, page, filePath) {
  // Supply only the OS dialog result; the Open menu and final UI remain real.
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, filePath);
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator('[data-menu-command="file.openFile"]').click();
}

function observeErrorsAndRequests(page) {
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) externalRequests.push(request.url());
  });
  return { errors, externalRequests };
}

for (const reference of [
  { file: "Channel9.stl", kind: "STL", label: "Channel9 [STL]" },
  { file: "Channel9.le.ply", kind: "PLY", label: "Channel9.le [PLY]" },
  { file: "Channel9.points.ply", kind: "PLY", label: "Channel9.points [PLY]", pointCloud: true },
]) {
  for (const backend of ["classic", "frameGraph"]) {
    test(`local ${reference.file} renders and restores in ${backend}`, async ({}, testInfo) => {
      const filePath = resolve(referenceRoot, reference.file);
      test.skip(!existsSync(filePath), "Optional Babylon reference missing; run scripts/fetch-babylon-static-reference-assets.mjs");
      const launched = await launchMmdModoki(root);
      try {
        const page = await launched.app.firstWindow();
        const diagnostics = observeErrorsAndRequests(page);
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await openLocalFile(launched.app, page, filePath);
        const selector = page.locator("#info-model-select");
        await expect(selector).toHaveValue("__accessory__:0");
        await expect(selector.locator('option[value="__accessory__:0"]')).toContainText(reference.label);
        await expect(page.locator("#info-accessory-kind")).toHaveText(reference.pointCloud ? `${reference.kind} (点群)` : reference.kind);
        const shadow = page.locator("#chk-accessory-shadow");
        if (reference.pointCloud) {
          await expect(shadow).toBeDisabled();
          await expect(shadow).not.toBeChecked();
          const materials = await page.evaluate(() => window.mmdModokiE2e.getAccessoryMaterialDiagnostics());
          expect(materials).toHaveLength(1);
          expect(materials[0]).toMatchObject({ pointsCloud: true, disableLighting: true, receiveShadows: false });
        } else {
          await expect(shadow).toBeChecked();
        }
        await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
        const buffers = await page.evaluate(() => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics());
        expect(buffers).toHaveLength(1);
        expect(buffers[0].bounds.max.z).toBeCloseTo(120.544174, 4);
        expect(buffers[0].buffers.every(buffer => buffer.byteStride === buffer.effectiveByteStride && buffer.byteOffset === buffer.effectiveByteOffset)).toBe(true);
        await page.evaluate(async () => {
          window.mmdModokiE2e.setCameraPose({ x: 170, y: 110, z: 180 }, { x: 0, y: 0, z: 60 });
          for (let frame = 0; frame < 5; frame += 1) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
        });
        await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${reference.kind.toLowerCase()}-${backend}.png`) });
        await page.locator("#accessory-pos-x").fill("2");
        await page.locator("#accessory-pos-x").press("Enter");
        await page.locator("#chk-accessory-visibility").uncheck();
        if (!reference.pointCloud) await shadow.uncheck();
        const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        expect(saved.accessories).toHaveLength(1);
        expect(saved.accessories[0]).toMatchObject({ path: filePath, visible: false, castsShadow: false, transform: { position: { x: 2, y: 0, z: 0 }, scale: 1 } });
        expect(await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved)).toMatchObject({ warnings: [] });
        await selector.selectOption("__camera__");
        await selector.selectOption("__accessory__:0");
        await expect(page.locator("#accessory-pos-x")).toHaveValue("2.0");
        await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
        await page.locator("#chk-accessory-visibility").check();
        if (!reference.pointCloud) await shadow.check();
        await page.evaluate(async () => {
          for (let frame = 0; frame < 5; frame += 1) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
        });
        expect(diagnostics.errors).toEqual([]);
        expect(diagnostics.externalRequests).toEqual([]);
      } finally { await launched.close(); }
    });
  }
}

test("unsupported Gaussian PLY encoding fails through Open without leaving an accessory", async () => {
  const filePath = resolve(root, "test/fixtures/accessory/gaussian-ascii.ply");
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const diagnostics = observeErrorsAndRequests(page);
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await openLocalFile(launched.app, page, filePath);
    await expect(page.locator(".toast.error")).toContainText("Gaussian PLY currently requires binary little endian");
    await expect(page.locator('#info-model-select option[value^="__accessory__:"]')).toHaveCount(0);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).accessories).toHaveLength(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics())).toHaveLength(0);
    expect(diagnostics.errors).toEqual([]);
    expect(diagnostics.externalRequests).toEqual([]);
  } finally { await launched.close(); }
});
