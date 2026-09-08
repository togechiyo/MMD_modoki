import { test, expect } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sources = ["env", "dds"].map(ext => resolve(root, `local-references/babylonjs/environment/Studio_Softbox_2Umbrellas_cube_specular.${ext}`));
test("environment cubemaps load through GUI, survive project restore, and return to bundled HDR", async ({}, testInfo) => {
  test.skip(sources.some(path => !existsSync(path)), "Optional Babylon reference assets are not installed; see environment lighting documentation");
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const open = async () => {
      await page.locator('[data-i18n="menu.tools"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    };
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const diagnostics = () => page.evaluate(() => window.mmdModokiE2e.getEnvironmentLightingDiagnostics());
    await open();
    await dialog.getByLabel("PBRモード", { exact: true }).check();
    for (const source of sources) {
      await launched.app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async options => {
          globalThis.environmentFilters = options.filters;
          return { canceled: false, filePaths: [path] };
        };
      }, source);
      await dialog.getByRole("button", { name: "HDRI読込", exact: true }).click();
      await expect(dialog).toContainText(source.split(/[\\/]/).at(-1));
      await expect.poll(async () => (await diagnostics()).textureReady).toBe(true);
      expect((await diagnostics()).backgroundTextureReady).toBe(true);
      expect((await diagnostics()).hasSphericalPolynomial).toBe(true);
      const probe = await page.evaluate(() => window.mmdModokiE2e.runEnvironmentLightingDiagnosticProbe());
      expect(probe.passed).toBe(true);
      const filters = await launched.app.evaluate(() => globalThis.environmentFilters);
      expect(filters[0].extensions).toEqual(["hdr", "env", "dds"]);
      const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      await dialog.screenshot({ path: testInfo.outputPath(`environment-${source.endsWith("env") ? "env" : "dds"}.png`) });
      await dialog.locator(".app-menu-dialog-close").click();
      await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
      await open();
      await expect(dialog).toContainText(source.split(/[\\/]/).at(-1));
      expect((await diagnostics()).sourcePath).toBe(source.replace(/\\/g, "/"));
      expect((await diagnostics()).textureReady).toBe(true);
    }
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, resolve(root, "local-references/babylonjs/environment/missing.env"));
    await dialog.getByRole("button", { name: "HDRI読込", exact: true }).click();
    await expect(page.getByText("HDRIの読み込みに失敗しました").first()).toBeVisible();
    expect((await diagnostics()).sourcePath).toBe(sources[1].replace(/\\/g, "/"));
    const broken = testInfo.outputPath("broken.env");
    writeFileSync(broken, Buffer.from([0x86, 0x16, 0x87, 0x96, 0xf6, 0xd6, 0x96, 0x36, 123, 0]));
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, broken);
    await dialog.getByRole("button", { name: "HDRI読込", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "HDRI読込", exact: true })).toBeEnabled();
    expect((await diagnostics()).sourcePath).toBe(sources[1].replace(/\\/g, "/"));
    await dialog.getByRole("button", { name: "クリア", exact: true }).click();
    await expect.poll(async () => (await diagnostics()).source).toBe("bundled");
    expect((await diagnostics()).sourcePath).toBeNull();
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally {
    await launched.close();
  }
});
