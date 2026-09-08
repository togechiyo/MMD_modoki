import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("light color boost follows the loaded material mode across project restore", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toolbar-mode-toggle").click();
    const readLight = () => page.evaluate(async () => (await import("/test/e2e/helpers/light-color-probe.mjs")).lightColorProbe());
    const before = await readLight();
    const red = page.locator("#light-color-r");
    await red.fill("255");
    await red.dispatchEvent("input");
    await expect(red).toHaveValue("255");
    expect(await readLight()).toEqual(before);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.lighting.lightColor.r).toBe(2);
    for (const mode of ["pbr-standard", "mmd-standard"]) {
      const project = structuredClone(saved);
      project.scene.models[0].materialPipeline = mode;
      await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), project);
      const color = await readLight();
      expect(color[0]).toBeCloseTo(before[0] * (mode === "pbr-standard" ? 2 : 1));
      expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).lighting.lightColor.r).toBe(2);
      await expect(page.locator("#render-canvas")).toBeVisible();
    }
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});
