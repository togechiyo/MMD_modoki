import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { copyFile, unlink } from "node:fs/promises";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
test("material mode round trips preserve runtime, unregistered edits, history and saved banks", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/material-switch.pmx"));
    const row = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().findIndex(track => track.name === "External Parent Root"));
    expect(row).toBeGreaterThanOrEqual(0);
    await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 20 + row * 18 + 9 } });
    const initialX = page.locator("#bone-controls input[data-control-key='tx']");
    await initialX.fill("1"); await initialX.press("Enter");
    await page.locator("#btn-bone-keyframe").click();
    for (const [key, value] of [["tx", "3"], ["ry", "20"]]) {
      const input = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await input.fill(value); await input.press("Enter");
    }
    const morph = page.locator("#morph-controls .morph-slider").first();
    await morph.fill("0.5"); await morph.dispatchEvent("input");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().models[0].morphs[0])).toBeCloseTo(0.5);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().models[0].materials[0].alpha)).toBeCloseTo(0.8);
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-full-light");
    await page.locator("#btn-shader-apply-all").click();
    const pose = await page.evaluate(() => window.mmdModokiE2e.getActiveBoneTransform("External Parent Root"));
    const history = await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState());
    expect(history.undoCount).toBeGreaterThan(0);
    const keys = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes);
    const toggle = async enabled => {
      await page.locator('[data-i18n="menu.tools"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
      const dialog = page.locator('[data-popup-id="experimental-settings"]');
      const checkbox = dialog.getByLabel("PBRモード", { exact: true });
      await checkbox.setChecked(enabled);
      await expect(checkbox).toBeEnabled();
      await expect(checkbox).toBeChecked({ checked: enabled });
      await dialog.locator(".app-menu-dialog-close").click();
    };
    // Freeze only the observation clock. The mode switch itself is operated in GUI.
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    const before = await page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState());
    expect(before.models[0].physics).not.toBeNull();
    await toggle(true);
    const after = await page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState());
    const shared = state => ({ ...state, models: state.models.map(({ materials, ...model }) => model) });
    expect(shared(after)).toEqual(shared(before));
    expect(await page.evaluate(() => window.mmdModokiE2e.getActiveBoneTransform("External Parent Root"))).toEqual(pose);
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState())).toEqual(history);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().models[0].materials[0].alpha)).toBeCloseTo(0.8);
    await page.locator("#shader-preset-select").selectOption("pbr-skin");
    await page.locator("#btn-shader-apply-all").click();
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.scene.materialMode).toBe("pbr-standard");
    expect(saved.scene.models[0].materialSettingsByMode["mmd-standard"].materials.every(item => item.presetId === "wgsl-full-light")).toBe(true);
    expect(saved.scene.models[0].materialSettingsByMode["pbr-standard"].materials.every(item => item.presetId === "pbr-skin")).toBe(true);
    await toggle(false);
    await expect(morph).toHaveValue("0.5");
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes)).toEqual(keys);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialShaders.every(item => item.presetId === "wgsl-full-light")).toBe(true);
    await morph.fill("0"); await morph.dispatchEvent("input");
    await toggle(true);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().models[0].materials[0].alpha)).toBeCloseTo(1);
    await page.locator("#shader-preset-select").selectOption("pbr-base");
    await page.locator("#btn-shader-apply-all").click();
    await toggle(false); await toggle(true);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialShaders).toEqual([]);
    await page.keyboard.press("Control+z");
    expect((await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState())).redoCount).toBeGreaterThan(0);
    await page.keyboard.press("Control+y");
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes)).toEqual(keys);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await toggle(false);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialShaders.every(item => item.presetId === "wgsl-full-light")).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("material-mode-restored.png") });
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});

test("missing second source leaves both live models and physics intact", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const second = testInfo.outputPath("second.pmx");
    const fixture = resolve(root, "test/fixtures/external-parent/material-switch.pmx");
    await copyFile(fixture, second);
    for (const path of [fixture, second]) await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      for (const item of project.keyframes.modelAnimations) item.animation = {
        name: "generated-motion", boneTracks: [], morphTracks: [],
        movableBoneTracks: [{ name: "External Parent Root", frameNumbers: [0, 120],
          positions: [0, 0, 0, 8, 0, 0], rotations: [0, 0, 0, 1, 0, 0, 0, 1],
          positionInterpolations: Array.from({ length: 24 }, (_, i) => [20, 107, 20, 107][i % 4]),
          rotationInterpolations: [20, 107, 20, 107, 20, 107, 20, 107], physicsToggles: [1, 1] }],
        propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] },
      };
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.locator("#viewport-seek-play-toggle").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().playing)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().frame)).toBeGreaterThan(0);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    const before = await page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState());
    await unlink(second);
    await page.locator('[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const pbr = dialog.getByLabel("PBRモード", { exact: true });
    await pbr.check();
    await expect(pbr).toBeEnabled();
    await expect(pbr).not.toBeChecked();
    expect(await page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState())).toEqual(before);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.materialMode).toBe("mmd-standard");
    // Restore the generated source and retry through the same GUI.
    await copyFile(fixture, second);
    await pbr.check();
    await expect(pbr).toBeEnabled();
    await expect(pbr).toBeChecked();
    const after = await page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState());
    expect(after.playing).toBe(true);
    expect(after.models.map(({ materials, ...state }) => state)).toEqual(before.models.map(({ materials, ...state }) => state));
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.scene.models.map(model => model.materialPipeline)).toEqual(["pbr-standard", "pbr-standard"]);
    expect(new Set(project.scene.models.map(model => model.instanceId)).size).toBe(2);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getMaterialModeRuntimeState().frame)).toBeGreaterThan(after.frame);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});
