import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const caster = "TofuCube";

async function activeMeshes(page) {
  return page.evaluate(async () => {
    const { cameraActiveMeshNames } = await import("/test/e2e/helpers/polygon-capacity-probe.mjs");
    return cameraActiveMeshNames();
  });
}

async function centerBrightness(page, path) {
  await page.evaluate(async () => {
    const { waitForShadowFrames } = await import("/test/e2e/helpers/csm-boundary-probe.mjs");
    await waitForShadowFrames();
  });
  const image = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path }));
  let sum = 0;
  const cx = Math.floor(image.width / 2), cy = Math.floor(image.height / 2);
  for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
    const i = (y * image.width + x) * 4;
    sum += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
  }
  return sum / 121;
}

test("culls a static X accessory outside the camera while keeping its shadow on screen", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const backend of ["classic", "frameGraph"]) await test.step(backend, async () => {
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(async () => {
        const api = window.mmdModokiE2e;
        const project = api.exportProjectState();
        Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false });
        Object.assign(project.lighting, { shadowEnabled: true, characterContactShadowEnabled: false, iblShadowsEnabled: false });
        await api.importProjectState(project);
        api.setAutoRenderEnabled(true);
      });
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/plate.pmx"))).not.toBeNull();
      await launched.app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, resolve(root, "test/fixtures/accessory/tofu.x"));
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator('[data-menu-command="file.openFile"]').click();
      await expect(page.locator("#info-model-select")).toHaveValue("__accessory__:0");
      for (const [axis, value] of [["x", "-5.5"], ["y", "5"]]) {
        const field = page.locator(`#accessory-pos-${axis}`);
        await field.fill(value);
        await field.press("Enter");
      }

      // The 1-unit cube centered at (-5.5,5.5,0) casts onto the plate centered at the origin.
      const aimAtCaster = () => page.evaluate(() => window.mmdModokiE2e.setCameraPose(
        { x: -5.5, y: 7, z: -4 }, { x: -5.5, y: 5.5, z: 0 }));
      await page.evaluate(() => window.mmdModokiE2e.setLightDirection({ x: 1, y: -1, z: 0 }));
      await aimAtCaster();
      await expect.poll(() => activeMeshes(page)).toContain(caster);
      await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0, y: 7, z: -3 }, { x: 0, y: 0, z: 0 }));
      await expect.poll(() => activeMeshes(page)).not.toContain(caster);
      const casterNames = () => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().casterNames);
      await expect.poll(casterNames).toContain(caster);
      const shadow = await centerBrightness(page, testInfo.outputPath(backend + "-offscreen-shadow.png"));
      await page.locator("#chk-accessory-shadow").uncheck();
      await expect.poll(casterNames).not.toContain(caster);
      const lit = await centerBrightness(page, testInfo.outputPath(backend + "-caster-disabled.png"));
      expect(lit - shadow, `plate center brightness with/without caster: ${shadow.toFixed(1)} / ${lit.toFixed(1)}`).toBeGreaterThan(8);
      await aimAtCaster();
      await expect.poll(() => activeMeshes(page)).toContain(caster);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    });
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
