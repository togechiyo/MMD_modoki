import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stage = resolve(root, "test/fixtures/luminous-stage/luminous-stage-fixture.pmx");

test("reloading a PMX project releases previous resources and preserves surviving textures", async () => {
  const editor = await launchMmdModoki(root);
  try {
    const page = await editor.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const counts = () => page.evaluate(async probePath => (await import(probePath)).modelResourceCounts(),
      "/test/e2e/helpers/backend-performance-probe.mjs");
    const load = () => page.evaluate(path => window.mmdModokiE2e.loadModel(path), stage);
    const snapshot = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const restore = project => page.evaluate(value => window.mmdModokiE2e.importProjectState(value), project);
    const emptyProject = await snapshot();
    expect(await load()).not.toBeNull();
    const sceneWithOne = await snapshot();
    const one = await counts();
    if (process.env.MMD_MODOKI_RENDERER) expect(one.engine).toBe(process.env.MMD_MODOKI_RENDERER);
    expect(one).toMatchObject({ panels: 64, panelsReady: true });
    expect(one.panelTextures).toBeGreaterThanOrEqual(16);
    expect(await load()).not.toBeNull();
    await page.locator("#info-model-select").selectOption("0");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#btn-model-delete").click();
    await expect(page.locator("#info-model-select option[value='1']")).toHaveCount(0);
    const afterRemoval = await counts();
    const reloads = [];
    for (let i = 0; i < 2; i++) {
      expect((await restore(sceneWithOne)).warnings).toEqual([]);
      reloads.push(await counts());
    }
    expect((await restore(emptyProject)).warnings).toEqual([]);
    const empty = await counts();
    console.log("PMX resource counts", { one, afterRemoval, reloads, empty });
    expect(afterRemoval).toEqual(one);
    expect(reloads).toEqual([one, one]);
    expect(empty).toMatchObject({ panels: 0, panelTextures: 0, skeletons: 0 });
  } finally {
    await editor.close();
  }
});
