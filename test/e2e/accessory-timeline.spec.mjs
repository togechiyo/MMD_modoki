import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { loadAccessoryFixture } from "./accessory-fixtures.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtures = [
  { kind: "X", path: resolve(repoRoot, "test", "fixtures", "accessory", "simple-triangle.x") },
  { kind: "OBJ", path: resolve(repoRoot, "test", "fixtures", "accessory", "tofu.obj") },
  { kind: "GLB" },
];

for (const fixture of fixtures) {
  test(`${fixture.kind} accessory transform keys share timeline playback and project round-trip`, async () => {
    const launched = await launchMmdModoki(repoRoot);
    try {
      const page = await launched.app.firstWindow();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      if (fixture.kind === "GLB") await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
        resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx"));

      expect(await loadAccessoryFixture(page, fixture.kind.toLowerCase(), repoRoot, launched.tempDir)).toBe(true);
      await page.locator("#info-model-select").selectOption("__camera__");
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
        .toEqual([{ category: "accessory", name: expect.stringContaining(`[${fixture.kind}]`), frames: [] }]);

      const positionX = page.locator("#accessory-pos-x");
      const register = page.locator("#btn-info-keyframe");
      const visibility = page.locator("#chk-accessory-visibility");
      await positionX.fill("0");
      await positionX.press("Enter");
      await register.click();
      await expect(visibility).toBeChecked();
      await page.evaluate(() => window.mmdModokiE2e.seekTo(20));
      await positionX.fill("10");
      await positionX.press("Enter");
      await expect(positionX).toHaveValue("10.0");
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(10, 4);
      await visibility.uncheck();
      await register.click();
      await expect.poll(() => page.evaluate(() =>
        window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 20)?.visible)).toBe(false);
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 20)?.position.x ?? null,
      )).toBeCloseTo(10, 4);

      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0, 20]);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(10));
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(5, 4);
      await expect(visibility).toBeChecked();

      await page.keyboard.press("Control+Z");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0]);
      await page.keyboard.press("Control+Y");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0, 20]);

      await page.evaluate(() => window.mmdModokiE2e.seekTo(20));
      await expect(visibility).not.toBeChecked();
      // Visibility-only overwrite must not be treated as an unchanged transform.
      await visibility.check();
      await register.click();
      await expect.poll(() => page.evaluate(() =>
        window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 20)?.visible)).toBe(true);
      await page.keyboard.press("Control+Z");
      await expect(visibility).not.toBeChecked();
      await page.keyboard.press("Control+Y");
      await expect(visibility).toBeChecked();
      await page.keyboard.press("Control+Z");
      await expect(visibility).not.toBeChecked();

      await page.locator("#timeline-label-canvas").click({ position: { x: 35, y: 29 } });
      await page.locator("#btn-kf-copy").click();
      await page.locator("#current-frame").fill("40");
      await page.locator("#current-frame").press("Enter");
      await page.locator("#btn-kf-paste").click();
      await expect.poll(() => page.evaluate(() =>
        window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 40)?.visible)).toBe(false);
      await page.keyboard.press("Control+Z");
      await expect.poll(() => page.evaluate(() =>
        window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 40))).toBeNull();
      await page.evaluate(() => window.mmdModokiE2e.seekTo(20));

      const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), saved))
        .toMatchObject({ warnings: [] });
      await page.locator("#info-model-select").selectOption("__camera__");
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      await page.evaluate(() => window.mmdModokiE2e.seekTo(20));
      await expect(visibility).not.toBeChecked();
      await page.evaluate(() => window.mmdModokiE2e.seekTo(10));
      await expect(visibility).toBeChecked();
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(5, 4);
      expect(pageErrors).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
