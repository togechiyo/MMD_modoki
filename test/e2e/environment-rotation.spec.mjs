import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("environment makes a full turn and restores its orientation with the background", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const open = async () => {
      await page.locator('[data-i18n="menu.window"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    };
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const rotation = dialog.getByRole("slider", { name: "環境の水平回転", exact: true });
    const diagnostics = () => page.evaluate(() => window.mmdModokiE2e.getEnvironmentLightingDiagnostics());
    const verifyRotation = async degrees => {
      await expect(rotation).toHaveValue(String(degrees));
      await expect.poll(async () => (await diagnostics()).rotationDegrees).toBe(degrees);
      const state = await diagnostics();
      const radians = degrees * Math.PI / 180;
      for (const matrix of [state.reflectionMatrix, state.backgroundReflectionMatrix]) {
        expect(matrix).not.toBeNull();
        expect(matrix[0]).toBeCloseTo(Math.cos(radians), 5);
        expect(matrix[2]).toBeCloseTo(-Math.sin(radians), 5);
      }
      expect(state.backgroundReflectionMatrix).toEqual(state.reflectionMatrix);
    };
    await open();
    await expect(rotation).toHaveValue("0");
    await expect(rotation).toBeDisabled();
    const pbr = dialog.getByLabel("PBRモード", { exact: true });
    await pbr.check();
    await expect(rotation).toBeEnabled();
    await expect.poll(async () => (await diagnostics()).textureReady).toBe(true);
    await dialog.locator('[data-experimental-lighting] input[type="checkbox"]').nth(0).check();
    await expect.poll(async () => (await diagnostics()).backgroundTextureReady).toBe(true);
    // Keyboard slider operations exercise native input events and both endpoints.
    await rotation.focus();
    await rotation.press("Home");
    for (const degrees of [90, 180, 270, 360]) {
      for (let step = 0; step < 90; step++) await rotation.press("ArrowRight");
      await verifyRotation(degrees);
      if (degrees === 90 || degrees === 360) {
        await dialog.locator(".app-menu-dialog-close").click();
        await page.screenshot({ path: testInfo.outputPath(`environment-background-${degrees}.png`) });
        await open();
        await rotation.focus();
      }
    }
    await rotation.press("Home");
    await verifyRotation(0);
    await rotation.press("End");
    for (let step = 0; step < 90; step++) await rotation.press("ArrowLeft");
    await verifyRotation(270);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.lighting.environmentLightingRotationDegrees).toBe(270);
    await pbr.uncheck();
    await expect(rotation).toBeDisabled();
    await pbr.check();
    await verifyRotation(270);
    await dialog.screenshot({ path: testInfo.outputPath("environment-rotation.png") });
    await rotation.focus();
    await rotation.press("Home");
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await open();
    await verifyRotation(270);
    for (const backend of ["classic", "frameGraph"]) {
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await expect.poll(async () => (await diagnostics()).backgroundTextureReady).toBe(true);
      await open();
      await verifyRotation(270);
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
    }
    await dialog.locator(".app-menu-dialog-close").click();
    delete saved.lighting.environmentLightingRotationDegrees;
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await open();
    await verifyRotation(0);
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
