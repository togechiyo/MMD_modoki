import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtures = [
  { kind: "X", path: resolve(repoRoot, "test", "fixtures", "accessory", "simple-triangle.x") },
  { kind: "OBJ", path: resolve(repoRoot, "test", "fixtures", "accessory", "tofu.obj") },
];

for (const fixture of fixtures) {
  test(`${fixture.kind} accessory transform keys share timeline playback and project round-trip`, async () => {
    const launched = await launchMmdModoki(repoRoot);
    try {
      const page = await launched.app.firstWindow();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

      expect(await page.evaluate((path) => window.mmdModokiE2e.loadAccessory(path), fixture.path)).toBe(true);
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
        .toEqual([{ category: "accessory", name: expect.stringContaining(`[${fixture.kind}]`), frames: [] }]);

      const positionX = page.locator("#accessory-pos-x");
      const register = page.locator("#btn-info-keyframe");
      await positionX.fill("0");
      await positionX.press("Enter");
      await register.click();
      await page.evaluate(() => window.mmdModokiE2e.seekTo(20));
      await positionX.fill("10");
      await positionX.press("Enter");
      await expect(positionX).toHaveValue("10.0");
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(10, 4);
      await register.click();
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.getAccessoryTransformKeyframe(0, 20)?.position.x ?? null,
      )).toBeCloseTo(10, 4);

      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0, 20]);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(10));
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(5, 4);

      await page.keyboard.press("Control+Z");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0]);
      await page.keyboard.press("Control+Y");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()[0]?.frames))
        .toEqual([0, 20]);

      const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), saved))
        .toMatchObject({ warnings: [] });
      await page.evaluate(() => window.mmdModokiE2e.seekTo(10));
      await expect.poll(() => page.evaluate(
        () => window.mmdModokiE2e.exportProjectState().accessories?.[0]?.transform.position.x ?? null,
      )).toBeCloseTo(5, 4);
      expect(pageErrors).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
