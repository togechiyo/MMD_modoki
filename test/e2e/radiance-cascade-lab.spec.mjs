import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function coloredPixels(png, channel) {
  let count = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + channel] > 45
      && [0, 1, 2].filter(value => value !== channel).every(value => png.data[index + channel] > png.data[index + value] + 15)) count++;
  }
  return count;
}

function changedPixels(first, second) {
  let count = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    if ([0, 1, 2].some(channel => Math.abs(first.data[index + channel] - second.data[index + channel]) > 5)) count++;
  }
  return count;
}

// Floor point (0, 0, 0.5) is visible from the receiver camera and lies behind the blocker from the light.
function shadowFloorBlue(png) {
  const subtract = (a, b) => a.map((value, index) => value - b[index]);
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const normalize = a => a.map(value => value / Math.hypot(...a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const eye = [-3, 1.4, -2.6];
  const forward = normalize(subtract([0.4, 0.4, 0.3], eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const delta = subtract([0, 0, 0.5], eye);
  const x = Math.round((0.5 + dot(delta, right) / dot(delta, forward) / 0.55 / (560 / 315) / 2) * png.width);
  const y = Math.round((0.5 - dot(delta, up) / dot(delta, forward) / 0.55 / 2) * png.height);
  let sum = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) sum += png.data[((y + dy) * png.width + x + dx) * 4 + 2];
  return sum / 81;
}

for (const backend of ["classic", "frameGraph"]) {
  test(`3D RC lab: offscreen emission, controls and settings (${backend})`, async ({}, testInfo) => {
    const launched = await launchMmdModoki(root);
    const errors = [];
    try {
      const page = await launched.app.firstWindow();
      page.on("pageerror", error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects);
      async function open() {
        await page.locator('.app-menu-trigger[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.radianceCascadeLab"]').click();
      }
      await open();
      const dialog = page.locator('[data-popup-id="radiance-cascade-lab"]');
      const status = dialog.locator(".radiance-lab-status");
      const canvas = dialog.locator(".radiance-lab-canvas");
      const states = {};
      async function ready() {
        await expect(status).not.toHaveAttribute("data-state", "loading", { timeout: 45000 });
        expect(await status.getAttribute("data-state"), await status.textContent()).toBe("ready");
      }
      async function capture(name) {
        await ready();
        states[name] = { status: await status.textContent(), fieldRevision: await status.getAttribute("data-field-revision") };
        const path = testInfo.outputPath(`${name}.png`);
        await canvas.screenshot({ path });
        return PNG.sync.read(readFileSync(path));
      }
      await ready();
      await dialog.screenshot({ path: testInfo.outputPath("lab-overview.png") });
      const initialField = await status.getAttribute("data-field-revision");
      const glowOn = await capture("overview-glow-on");
      await dialog.getByLabel("発光のにじみ（Glow）", { exact: true }).uncheck();
      const glowOff = await capture("overview-glow-off");
      expect(changedPixels(glowOn, glowOff)).toBeGreaterThan(80);
      await dialog.locator('select[name="camera"]').selectOption("receiver");
      const red = await capture("offscreen-red-rc-on");
      expect(await status.getAttribute("data-field-revision")).toBe(initialField);
      expect(coloredPixels(red, 0)).toBeGreaterThan(200);

      await dialog.getByLabel("周囲を照らす（RC）", { exact: true }).uncheck();
      const noRc = await capture("offscreen-rc-off");
      expect(coloredPixels(noRc, 0)).toBeLessThan(20);
      await dialog.getByLabel("周囲を照らす（RC）", { exact: true }).check();
      await ready();
      await dialog.getByLabel("AL発光面を点灯", { exact: true }).uncheck();
      const dark = await capture("offscreen-emitter-off");
      expect(coloredPixels(dark, 0)).toBeLessThan(20);
      await dialog.getByLabel("AL発光面を点灯", { exact: true }).check();
      await ready();
      // Supply the color fixture without automating the native OS color picker.
      await dialog.locator('input[name="emitterColor"]').evaluate(input => {
        input.value = "#2040ff";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const blue = await capture("offscreen-blue-rc-on");
      expect(coloredPixels(blue, 2)).toBeGreaterThan(200);
      expect(coloredPixels(blue, 0)).toBeLessThan(20);
      const blockedField = Number(await status.getAttribute("data-field-revision"));
      await dialog.getByLabel("遮蔽物", { exact: true }).uncheck();
      const unblocked = await capture("offscreen-blue-unblocked");
      expect(shadowFloorBlue(unblocked) - shadowFloorBlue(blue)).toBeGreaterThan(5);
      expect(Number(await status.getAttribute("data-field-revision"))).toBeGreaterThan(blockedField);

      const settingsPath = testInfo.outputPath("settings.json");
      await launched.app.evaluate(({ session }, path) => {
        session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path));
      }, settingsPath);
      await dialog.getByRole("button", { name: "実験設定を保存", exact: true }).click();
      await expect.poll(() => {
        if (!existsSync(settingsPath)) return null;
        try { return JSON.parse(readFileSync(settingsPath, "utf8")).settings; } catch { return null; }
      }).toEqual({ emitterColor: "#2040ff", emissionGain: 8, emitterEnabled: true,
        rcEnabled: true, glowEnabled: false, blockerEnabled: false, blockerX: -1, camera: "receiver" });
      await dialog.getByRole("button", { name: "初期値に戻す", exact: true }).click();
      await ready();
      await expect(dialog.getByLabel("発光のにじみ（Glow）", { exact: true })).toBeChecked();
      await expect(dialog.locator('select[name="camera"]')).toHaveValue("overview");
      await dialog.locator('input[type="file"]').setInputFiles(settingsPath);
      await ready();
      await expect(dialog.getByLabel("発光のにじみ（Glow）", { exact: true })).not.toBeChecked();
      await expect(dialog.getByLabel("遮蔽物", { exact: true })).not.toBeChecked();
      await expect(dialog.locator('input[name="emitterColor"]')).toHaveValue("#2040ff");
      await expect(dialog.locator('select[name="camera"]')).toHaveValue("receiver");

      // An unrelated settings file is rejected visibly without changing the working settings.
      await dialog.locator('input[type="file"]').setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
      await expect(status).toHaveAttribute("data-state", "error");
      await expect(status).toContainText("設定を読み込めません");
      await expect(dialog.locator('input[name="emitterColor"]')).toHaveValue("#2040ff");

      await dialog.locator(".app-menu-dialog-close").click();
      await expect(canvas).toHaveCount(0);
      await open();
      await ready();
      await expect(dialog.locator('input[name="emitterColor"]')).toHaveValue("#2040ff");
      await dialog.locator(".app-menu-dialog-close").click();
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects)).toEqual(before);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
      expect(errors).toEqual([]);
      writeFileSync(testInfo.outputPath("report.json"), JSON.stringify({ backend, states,
        blockedFloorBlue: shadowFloorBlue(blue), unblockedFloorBlue: shadowFloorBlue(unblocked) }, null, 2));
    } finally { await launched.close(); }
  });
}
