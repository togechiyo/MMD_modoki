import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { createBakedVmd } from "../fixtures/motion-retention/generate.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function summarize(project) {
  const animation = project.keyframes.modelAnimations[0]?.animation;
  const tracks = animation ? [
    ...animation.boneTracks.map(track => ({ ...track, kind: "bone" })),
    ...animation.movableBoneTracks.map(track => ({ ...track, kind: "movable" })),
  ] : [];
  return {
    jsonBytes: Buffer.byteLength(JSON.stringify(project, null, 2)),
    animationBytes: Buffer.byteLength(JSON.stringify(animation ?? null, null, 2)),
    tracks: tracks.map(track => ({ name: track.name, kind: track.kind, keys: track.frameNumbers.length })),
    keys: tracks.reduce((sum, track) => sum + track.frameNumbers.length, 0),
    motionImports: project.scene.models[0]?.motionImports.length ?? 0,
  };
}

async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function loadMotion(launched, page, path, expectedImports) {
  await launched.app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, path);
  const completed = page.evaluate(() => new Promise(resolve => {
    const element = document.getElementById("status-text");
    const observer = new MutationObserver(() => {
      if (element.textContent === "Motion loaded") { observer.disconnect(); resolve(); }
    });
    observer.observe(element, { childList: true, characterData: true, subtree: true });
  }));
  await menu(page, "file.openMotion");
  await completed;
  await expect.poll(() => page.evaluate(() =>
    window.mmdModokiE2e.exportProjectState().scene.models[0].motionImports.length,
  )).toBe(expectedImports);
  await expect.poll(() => page.evaluate(() =>
    window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "センター")?.frames.length,
  )).toBe(301);
}

async function deleteAllDisplayedKeys(page) {
  await page.locator("#timeline-label-canvas").dblclick({ position: { x: 40, y: 9 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys.length))
    .toBe(301);
  await page.locator("#btn-kf-delete").click();
  await expect.poll(() => page.evaluate(() =>
    window.mmdModokiE2e.getTimelineTracks().reduce((sum, track) => sum + track.frames.length, 0),
  )).toBe(0);
}

async function clearModelMotion(page) {
  await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
  await expect(page.locator('[data-menu-command="edit.clearModelMotion"]')).toBeEnabled();
  await page.locator('[data-menu-command="edit.clearModelMotion"]').click();
}

async function history(page, direction) {
  await page.locator(`.app-menu-quick-button[data-menu-command="edit.${direction}"]`).click();
}

test("full motion clear restores only its original model, including Property and external-parent keys", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
    await expect(page.locator('[data-menu-command="edit.clearModelMotion"]')).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.locator("#info-model-select").selectOption("0");
    const motion = testInfo.outputPath("baked.vmd");
    writeFileSync(motion, createBakedVmd({ extraBones: 8 }));
    await loadMotion(launched, page, motion, 1);
    await page.locator("#chk-model-visibility").uncheck();
    await page.locator("#btn-info-keyframe").click();
    // Legacy project fixture supplies parent keys; all removal/history is GUI-driven.
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      const [child, parent] = project.scene.models;
      project.keyframes.modelExternalParents = [{
        modelInstanceId: child.instanceId, modelPath: child.path, frameNumbers: [0],
        childBoneNames: ["センター"], parentModelInstanceIds: [parent.instanceId],
        parentModelPaths: [parent.path], parentBoneNames: ["センター"],
      }];
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.locator("#info-model-select").selectOption("0");
    const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(before.keyframes.modelAnimations[0].animation.propertyTrack.frameNumbers.length).toBe(1);
    await clearModelMotion(page);
    const cleared = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(summarize(cleared).keys).toBe(0);
    expect(cleared.keyframes.modelAnimations[0].animation.propertyTrack.frameNumbers.length).toBe(0);
    expect(cleared.keyframes.modelExternalParents).toEqual([]);
    expect(cleared.keyframes.modelAnimations[1]).toEqual(before.keyframes.modelAnimations[1]);
    await page.locator("#info-model-select").selectOption("1");
    await history(page, "undo");
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.keyframes.modelAnimations).toEqual(before.keyframes.modelAnimations);
    expect(restored.keyframes.modelExternalParents).toEqual(before.keyframes.modelExternalParents);
    expect(restored.scene.models[0].motionImports).toEqual(before.scene.models[0].motionImports);
    await expect(page.locator("#info-model-select")).toHaveValue("1");
    await history(page, "redo");
    const redone = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(redone.keyframes.modelAnimations).toEqual(cleared.keyframes.modelAnimations);
    expect(redone.keyframes.modelExternalParents).toEqual([]);
    await expect(page.locator("#info-model-select")).toHaveValue("1");
    await page.locator("#info-model-select").selectOption("__camera__");
    await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
    await expect(page.locator('[data-menu-command="edit.clearModelMotion"]')).toBeDisabled();
  } finally {
    await launched.close();
  }
});

for (const scenario of ["visible-only", "extra-bones", "track-kind-change"]) {
  test(`Issue #25 project motion retention: ${scenario}`, async ({}, testInfo) => {
    const launched = await launchMmdModoki(repoRoot);
    try {
      const page = await launched.app.firstWindow();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
      await page.locator("#info-model-select").selectOption("0");
      const motion = testInfo.outputPath("baked.vmd");
      writeFileSync(motion, createBakedVmd({ extraBones: scenario === "extra-bones" ? 8 : 0 }));
      const report = { scenario, vmdBytes: readFileSync(motion).length, stages: {} };
      const snapshot = async label => {
        const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        report.stages[label] = summarize(project);
        report.stages[label].displayedKeys = await page.evaluate(() =>
          window.mmdModokiE2e.getTimelineTracks().reduce((sum, track) => sum + track.frames.length, 0),
        );
        return project;
      };
      await snapshot("modelOnly");
      await loadMotion(launched, page, motion, 1);
      const firstProject = await snapshot("firstLoad");
      if (scenario === "track-kind-change") {
        const translated = testInfo.outputPath("translated.vmd");
        writeFileSync(translated, createBakedVmd({ movable: true }));
        await loadMotion(launched, page, translated, 2);
        await snapshot("translatedOverlay");
        expect(report.stages.translatedOverlay.keys).toBe(301);
        // Supply a legacy project fixture containing the old same-name pair.
        await page.evaluate(async boneTracks => {
          const project = window.mmdModokiE2e.exportProjectState();
          project.keyframes.modelAnimations[0].animation.boneTracks = boneTracks;
          await window.mmdModokiE2e.importProjectState(project);
        }, firstProject.keyframes.modelAnimations[0].animation.boneTracks);
        await snapshot("legacyRestored");
        expect(report.stages.legacyRestored.keys).toBe(301);
        expect(report.stages.legacyRestored.tracks.filter(track => track.kind === "bone")).toHaveLength(0);
      } else {
        await loadMotion(launched, page, motion, 1);
        await snapshot("sameMotionReloaded");
        expect(report.stages.sameMotionReloaded.keys).toBe(report.stages.firstLoad.keys);
      }
      await deleteAllDisplayedKeys(page);
      await snapshot("afterDelete");
      const expectedRetained = scenario === "extra-bones" ? 8 * 301 : 0;
      expect(report.stages.afterDelete.keys).toBe(expectedRetained);
      if (scenario === "extra-bones") {
        expect(report.stages.afterDelete.tracks.filter(track => track.keys > 0).every(track => track.name.startsWith("BakeExtra"))).toBe(true);
      }
      await history(page, "undo");
      await snapshot("undoSelectedDelete");
      expect(report.stages.undoSelectedDelete.keys).toBe(scenario === "extra-bones" ? 9 * 301 : 301);
      await history(page, "redo");
      await snapshot("redoSelectedDelete");
      expect(report.stages.redoSelectedDelete.keys).toBe(expectedRetained);
      await clearModelMotion(page);
      await snapshot("afterClear");
      expect(report.stages.afterClear.keys).toBe(0);
      expect(report.stages.afterClear.motionImports).toBe(0);
      await history(page, "undo");
      await snapshot("undoClear");
      expect(report.stages.undoClear.keys).toBe(expectedRetained);
      expect(report.stages.undoClear.motionImports).toBe(scenario === "track-kind-change" ? 2 : 1);
      await history(page, "redo");
      const deleted = await snapshot("redoClear");
      // Actual Save / Load UI, with only native file-dialog results substituted.
      const savedPath = testInfo.outputPath("after-delete.json");
      await launched.app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, savedPath);
      await menu(page, "file.saveProject");
      await expect.poll(() => existsSync(savedPath)).toBe(true);
      const saved = JSON.parse(readFileSync(savedPath, "utf8"));
      expect(summarize(saved).keys).toBe(0);
      expect(summarize(saved).motionImports).toBe(0);
      report.savedFileBytes = readFileSync(savedPath).length;
      await launched.app.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, savedPath);
      await menu(page, "file.loadProject");
      await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
      await snapshot("reopened");
      expect(report.stages.reopened.keys).toBe(0);
      expect(report.stages.reopened.tracks).toEqual(summarize(deleted).tracks);
      expect(report.stages.reopened.displayedKeys).toBe(0);
      if (scenario !== "track-kind-change") {
        for (let cycle = 1; cycle <= 2; cycle += 1) {
          await loadMotion(launched, page, motion, 1);
          await deleteAllDisplayedKeys(page);
          await clearModelMotion(page);
          await snapshot(`repeatDelete${cycle}`);
          expect(report.stages[`repeatDelete${cycle}`].keys).toBe(0);
          expect(report.stages[`repeatDelete${cycle}`].jsonBytes).toBe(report.stages.reopened.jsonBytes);
        }
      }
      page.on("dialog", dialog => dialog.accept());
      await page.locator("#btn-model-delete").click();
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models.length)).toBe(0);
      await snapshot("modelRemoved");
      writeFileSync(testInfo.outputPath("retention-report.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      expect(pageErrors).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
