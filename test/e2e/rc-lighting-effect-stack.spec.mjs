import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, initialState, receiverDifference, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openPostEffects, openRcLighting, rcLightingInput, rcLightingRow,
  rcLightingStatus, registerRcLighting } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), ids = ["rcSkyOcclusion", "rcDiffuseGi"];
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const history = (page, operation) => page.locator(`.app-menu-quick-button[data-menu-command="edit.${operation}"]`).click();
const tracks = state => state.keyframes?.effectAnimations?.tracks.filter(track => ids.includes(track.effectId)) ?? [];
const rcState = state => ({ settings: Object.fromEntries(ids.map(id => [id, state.lighting[id]])), tracks: tracks(state),
  stack: state.effects.frameGraphPostStack?.filter(entry => ids.includes(entry.id)),
  order: (state.effects.frameGraphInstances?.order ?? state.effects.frameGraphPostStack?.map(entry => entry.id) ?? []).filter(id => ids.includes(id)) });
async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click();
}
async function savedProject(path) {
  let saved;
  await expect.poll(() => {
    try { saved = JSON.parse(readFileSync(path, "utf8")); return true; }
    catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return false; throw error; }
  }, { message: "Wait for a complete saved project, including the final JSON bytes" }).toBe(true);
  return saved;
}
async function verifyRows(page) {
  await openPostEffects(page);
  for (const id of ids) await expect(rcLightingRow(page, id)).toHaveCount(1);
  await page.locator("#btn-effect-add-post").click();
  for (const id of ids) await expect(page.locator(`[data-effect-add-post="${id}"]`)).toBeDisabled();
  await page.locator("#btn-effect-add-post").click();
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires its fixture argument to be destructured.
test("RC lighting cards: singleton lifecycle, keys, legacy project and backend compatibility", async ({}, testInfo) => {
  test.setTimeout(300000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], captures: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx"));
    const view = await camera(page);
    await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    const experiment = page.locator('[data-popup-id="experimental-settings"]');
    await expect(experiment.locator('[name="rcSkyOcclusionEnabled"], [name="rcDiffuseGiEnabled"]')).toHaveCount(0);
    await experiment.locator(".app-menu-dialog-close").click();
    await openPostEffects(page);
    for (const id of ids) await expect(rcLightingRow(page, id)).toHaveCount(0);
    for (const id of ids) {
      await addRcLighting(page, id); await openRcLighting(page, id);
      await expect(rcLightingInput(page, id, "Enabled")).toBeChecked();
      await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    }
    await verifyRows(page);
    // Review the ordinary card layout at the app's default panel width.
    for (const id of ids) {
      const volume = rcLightingRow(page, id).locator(`[data-rc-volume-controls="${id}"]`);
      if (await volume.getAttribute("open") !== null) await volume.locator("summary").click();
    }
    const skyHeader = rcLightingRow(page, "rcSkyOcclusion").locator('[data-effect-stack-item="rcSkyOcclusion"]');
    if (await skyHeader.getAttribute("aria-expanded") === "true") await skyHeader.click();
    for (const id of ids) {
      await expect(rcLightingInput(page, id, "Enabled")).toBeInViewport();
      await expect(rcLightingRow(page, id).locator(`[data-effect-stack-item="${id}"]`)).toBeInViewport();
      if (id === "rcDiffuseGi") await expect(rcLightingRow(page, id).locator(`[data-effect-stack-remove="${id}"]`)).toBeInViewport();
    }
    await expect(rcLightingInput(page, "rcDiffuseGi", "Strength")).toBeInViewport();
    report.panelBounds = await page.locator("#shader-panel").boundingBox();
    await page.screenshot({ path: testInfo.outputPath("rc-lighting-panel.png") });
    expect((await project(page)).lighting.rcSkyOcclusion).toEqual({ enabled: true, strength: .75, minimum: .2, volume: null });
    expect((await project(page)).lighting.rcDiffuseGi).toEqual({ enabled: true, strength: .5, volume: null });
    await openRcLighting(page, "rcDiffuseGi"); await rcLightingInput(page, "rcDiffuseGi", "Enabled").uncheck();
    await expect(rcLightingRow(page, "rcDiffuseGi")).toHaveCount(1);
    expect((await project(page)).lighting.rcSkyOcclusion.enabled).toBe(true);
    await history(page, "undo"); await expect(rcLightingInput(page, "rcDiffuseGi", "Enabled")).toBeChecked();
    await rcLightingInput(page, "rcDiffuseGi", "Strength").focus(); await rcLightingInput(page, "rcDiffuseGi", "Strength").press("End");
    expect((await project(page)).lighting.rcSkyOcclusion.strength).toBe(.75);
    expect((await project(page)).lighting.rcDiffuseGi.strength).toBe(2);
    await history(page, "undo"); expect((await project(page)).lighting.rcDiffuseGi.strength).toBe(.5);

    for (const [frame, enabled, extreme] of [[0, true, "Home"], [20, true, "End"], [40, false, null], [60, true, null]]) {
      await seek(page, frame);
      for (const id of ids) {
        await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
        if (extreme) { await rcLightingInput(page, id, "Strength").focus(); await rcLightingInput(page, id, "Strength").press(extreme); }
        await registerRcLighting(page, id);
      }
    }
    for (const id of ids) {
      const maximum = id === "rcDiffuseGi" ? 2 : 1;
      expect(tracks(await project(page)).find(track => track.effectId === id).keys).toEqual([
        { frame: 0, value: { enabled: true, strength: 0 } }, { frame: 20, value: { enabled: true, strength: maximum } },
        { frame: 40, value: { enabled: false, strength: maximum } }, { frame: 60, value: { enabled: true, strength: maximum } },
      ]);
    }
    await seek(page, 10);
    for (const id of ids) { await openRcLighting(page, id); await expect(rcLightingInput(page, id, "Strength")).toHaveValue("50"); }
    await seek(page, 20); await closeRcLighting(page);
    const both = await capture(page, testInfo, report, "both-key-20"), saved = await project(page);
    report.authored = rcState(saved);
    await openRcLighting(page, "rcDiffuseGi"); await rcLightingRow(page, "rcDiffuseGi").locator('[data-effect-stack-remove="rcDiffuseGi"]').click();
    await expect(rcLightingRow(page, "rcDiffuseGi")).toHaveCount(0);
    const deleted = await project(page);
    expect(tracks(deleted).some(track => track.effectId === "rcDiffuseGi")).toBe(false);
    expect(deleted.lighting.rcDiffuseGi.enabled).toBe(false);
    expect(deleted.lighting.rcSkyOcclusion).toEqual(saved.lighting.rcSkyOcclusion);
    expect(tracks(deleted).find(track => track.effectId === "rcSkyOcclusion")).toEqual(tracks(saved).find(track => track.effectId === "rcSkyOcclusion"));
    await closeRcLighting(page); const withoutGi = await capture(page, testInfo, report, "gi-deleted");
    report.deletedContribution = receiverDifference(withoutGi, both, view);
    expect(report.deletedContribution.redExcess).toBeGreaterThan(.3);
    await history(page, "undo"); expect(rcState(await project(page))).toEqual(report.authored);
    expect(difference(both, await capture(page, testInfo, report, "delete-undo"))).toBeLessThan(.15);
    await history(page, "redo"); expect(tracks(await project(page)).some(track => track.effectId === "rcDiffuseGi")).toBe(false);
    await history(page, "undo");
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click(); await closeRcLighting(page);
    await capture(page, testInfo, report, "master-off");
    expect(rcState(await project(page))).toEqual(report.authored);
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click(); await closeRcLighting(page);
    expect(difference(both, await capture(page, testInfo, report, "master-restored"))).toBeLessThan(.15);

    const path = testInfo.outputPath("rc-stack-project.json"), legacyPath = testInfo.outputPath("legacy-rc-lighting.json");
    const chooseFile = async filePath => launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, filePath);
    await chooseFile(path); await fileMenu(page, "file.saveProject");
    const written = await savedProject(path); expect(written.effects.rcSceneEffectsInStack).toBe(true);
    expect(rcState(written)).toEqual(report.authored);
    const legacy = structuredClone(written); delete legacy.effects.rcSceneEffectsInStack;
    legacy.effects.frameGraphPostStack = legacy.effects.frameGraphPostStack.filter(entry => !ids.includes(entry.id));
    if (legacy.effects.frameGraphInstances) legacy.effects.frameGraphInstances.order = legacy.effects.frameGraphInstances.order.filter(id => !ids.includes(id));
    writeFileSync(legacyPath, JSON.stringify(legacy)); await chooseFile(legacyPath); await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await verifyRows(page); await closeRcLighting(page);
    report.migrated = rcState(await project(page));
    expect(report.migrated.settings).toEqual(report.authored.settings); expect(report.migrated.tracks).toEqual(report.authored.tracks);
    expect(difference(both, await capture(page, testInfo, report, "legacy-restored"))).toBeLessThan(.15);
    const migratedPath = testInfo.outputPath("rc-stack-migrated.json");
    await chooseFile(migratedPath); await fileMenu(page, "file.saveProject");
    const migratedFile = await savedProject(migratedPath);
    expect(migratedFile.effects.rcSceneEffectsInStack).toBe(true); expect(rcState(migratedFile)).toEqual(report.migrated);
    await fileMenu(page, "file.loadProject"); await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await verifyRows(page);
    for (const backend of ["classic", "frameGraph"]) {
      await openPostEffects(page); await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(backend => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === backend, backend);
      expect(rcState(await project(page))).toEqual(report.migrated);
      if (backend === "classic") for (const id of ids) await expect(rcLightingRow(page, id)).toHaveCount(0);
      else await verifyRows(page);
    }
    await closeRcLighting(page); expect(difference(both, await capture(page, testInfo, report, "backend-restored"))).toBeLessThan(.15);
    // The current-format marker distinguishes an intentionally deleted OFF effect from legacy migration.
    await openRcLighting(page, "rcDiffuseGi"); await rcLightingRow(page, "rcDiffuseGi").locator('[data-effect-stack-remove="rcDiffuseGi"]').click();
    const removedPath = testInfo.outputPath("rc-stack-deleted.json"); await chooseFile(removedPath);
    await fileMenu(page, "file.saveProject"); await savedProject(removedPath);
    await fileMenu(page, "file.loadProject"); await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await openPostEffects(page); await expect(rcLightingRow(page, "rcDiffuseGi")).toHaveCount(0); await expect(rcLightingRow(page, "rcSkyOcclusion")).toHaveCount(1);
    expect(tracks(await project(page)).some(track => track.effectId === "rcDiffuseGi")).toBe(false);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2)); await launched.close();
  }
});
