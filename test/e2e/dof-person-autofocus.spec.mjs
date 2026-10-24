import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("DoF個体のオートフォーカス既定値・方式・言語・project保存復元", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx"));
    const showPost = async () => {
      if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
      const tab = page.locator('[data-effect-tab="post"]'); if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
    };
    await showPost(); await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="dof"]').click();
    const row = page.locator('[data-effect-instance-row]'), mode = row.locator('[data-dof-instance-field="focusMode"]');
    await expect(mode).toHaveValue("person-auto");
    await expect(mode.locator("option")).toHaveText(["カメラ注視点", "指定対象", "オートフォーカス", "距離指定"]);
    const id = await row.getAttribute("data-effect-instance-row");
    await mode.selectOption("manual"); await expect(row.locator('[data-instance-field="focusDistance"]')).toBeEnabled();
    await expect(row.locator('[data-instance-field="focusOffset"]')).toBeDisabled();
    await expect(row.locator('[data-instance-field="focusOffset"]').locator("..").locator(".range-number-input")).toBeDisabled();
    const models = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models);
    await mode.selectOption("model-target"); await row.locator('[data-dof-instance-field="targetModelInstanceId"]').selectOption(models[0].instanceId);
    await row.locator('[data-dof-instance-field="targetBoneName"]').selectOption("センター");
    await mode.selectOption("person-auto");
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const instance = saved.effects.frameGraphInstances.instances.find(item => item.instanceId === id);
    expect(instance.settings).toMatchObject({ focusMode: "person-auto", targetModelInstanceId: models[0].instanceId, targetBoneName: "センター" });
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved); await showPost(); await expandEffectInstance(row); await expect(mode).toHaveValue("person-auto");
    for (const locale of ["en", "zh-Hant", "zh-Hans", "ko", "ja"]) {
      await page.locator("#toolbar-locale-select").selectOption(locale); await expect(mode).toHaveValue("person-auto");
      expect(await mode.locator("option").allTextContents()).toHaveLength(4);
      expect((await mode.locator("option").allTextContents()).some(text => text.startsWith("effect."))).toBe(false);
      await expect(row.locator('[data-instance-field="focusDistance"]').locator("..").locator(".range-number-input")).toBeDisabled();
    }
    const off = structuredClone(saved); off.effects.frameGraphInstances.instances[0].settings.enabled = false;
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), off); await showPost();
    await expect(row.locator('[data-instance-field="enabled"]')).not.toBeChecked();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    expect(restored.instances[0].settings).toEqual({ ...instance.settings, enabled: false });
    const diagnostics = await page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
    expect(diagnostics.resourcePlan.needsDepthRenderer).toBe(true);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toEqual({ count: 0, messages: [] });
  } finally { await launched.close(); }
});
