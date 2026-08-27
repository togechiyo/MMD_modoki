import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const accessoryPath = resolve(repoRoot, "test", "fixtures", "accessory", "simple-triangle.x");

async function selectCenterBone(page) {
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
    .toContainEqual({ category: "root", name: "センター", frames: [] });
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 47 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack))
    .toEqual({ category: "root", name: "センター" });
}

async function setCurrentFrame(page, frame) {
  const input = page.locator("#viewport-seek-current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function openWebmDialog(page) {
  const fileMenu = page.locator(".app-menu-group").first();
  await fileMenu.locator(".app-menu-trigger").click();
  await fileMenu.locator('[data-menu-command="file.webmExportSettings"]').click();
  const dialog = page.locator('[data-popup-id="webm-export"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Issue 21: numeric Enter commit allows wide model translation and Ctrl+ArrowLeft seeks the previous key", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();
    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);

    const x = page.locator("#bone-controls input[data-control-key='tx']");
    await expect(x).toHaveAttribute("min", "-100000");
    await expect(x).toHaveAttribute("max", "100000");

    await x.fill("11");
    await x.press("Enter");
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position.x ?? null,
    )).toBe(11);

    await x.focus();
    await x.press("ArrowUp");
    await x.press("Enter");
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position.x ?? null,
    )).toBe(12);
    await page.locator("#btn-bone-keyframe").click();

    await setCurrentFrame(page, 10);
    await x.fill("13");
    await x.press("Enter");
    await page.locator("#btn-bone-keyframe").click();

    await setCurrentFrame(page, 20);
    await page.keyboard.press("Control+ArrowLeft");
    await expect(page.locator("#viewport-seek-current-frame")).toHaveValue("10");

    await x.fill("45");
    await x.press("Enter");
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position.x ?? null,
    )).toBe(45);
  } finally {
    await launched.close();
  }
});

test("Issue 21: a customized WebM end frame can return to following the full timeline", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();

    let dialog = await openWebmDialog(page);
    const endFrame = dialog.locator("#webm-output-end-frame");
    await endFrame.fill("120");
    await endFrame.press("Enter");
    await dialog.locator(".popup-form-actions .popup-form-button-secondary").click();

    await setCurrentFrame(page, 400);
    await expect(page.locator("#viewport-seek-total-frame")).toHaveText("400");

    dialog = await openWebmDialog(page);
    await expect(dialog.locator("#webm-output-end-frame")).toHaveValue("120");
    await dialog.locator("#webm-output-reset-frame-range").click();
    await expect(dialog.locator("#webm-output-end-frame")).toHaveValue("400");
    await dialog.locator(".popup-form-actions .popup-form-button-secondary").click();

    await setCurrentFrame(page, 500);
    dialog = await openWebmDialog(page);
    await expect(dialog.locator("#webm-output-end-frame")).toHaveValue("500");
    await dialog.locator(".popup-form-actions .popup-form-button-secondary").click();

    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);
    const x = page.locator("#bone-controls input[data-control-key='tx']");
    await x.fill("1");
    await x.press("Enter");
    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();

    await expect(page.locator("#viewport-seek-frame-stop-toggle")).toHaveCount(0);
    await setCurrentFrame(page, 499);
    await page.locator("#viewport-seek-play-toggle").click();
    await expect(page.locator("#viewport-seek-current-frame")).toHaveValue("500");
    await expect(page.locator("#viewport-seek-play-toggle")).toHaveAttribute("aria-label", "再生");

    const repeatPlayback = page.locator("#viewport-seek-loop-toggle");
    await expect(repeatPlayback).toBeVisible();
    await expect(repeatPlayback).toHaveAttribute("aria-pressed", "false");
    await expect(repeatPlayback).toHaveCSS("border-top-style", "none");
    const totalFrameBox = await page.locator("#viewport-seek-total-frame").boundingBox();
    const repeatPlaybackBox = await repeatPlayback.boundingBox();
    const muteButtonBox = await page.locator("#viewport-volume-mute").boundingBox();
    expect(totalFrameBox).not.toBeNull();
    expect(repeatPlaybackBox).not.toBeNull();
    expect(muteButtonBox).not.toBeNull();
    expect(repeatPlaybackBox.x - (totalFrameBox.x + totalFrameBox.width)).toBeGreaterThanOrEqual(8);
    expect(repeatPlaybackBox.x + repeatPlaybackBox.width).toBeLessThanOrEqual(muteButtonBox.x);
    await repeatPlayback.click();
    await expect(repeatPlayback).toHaveAttribute("aria-pressed", "true");
    await setCurrentFrame(page, 499);
    await page.locator("#viewport-seek-play-toggle").click();
    await page.waitForFunction(() => {
      const frame = Number(document.getElementById("viewport-seek-current-frame")?.value ?? Number.NaN);
      const playbackLabel = document.getElementById("viewport-seek-play-toggle")?.getAttribute("aria-label");
      return Number.isFinite(frame) && frame < 100 && playbackLabel === "一時停止";
    });
    await page.locator("#viewport-seek-play-toggle").click();

    const projectPath = resolve(launched.tempDir, "frame-stop-enabled.mmdproj");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, projectPath);
    await page.keyboard.press("Control+s");
    await expect.poll(() => existsSync(projectPath)).toBe(true);
    const saved = JSON.parse(readFileSync(projectPath, "utf8"));
    expect(saved.output.frameStopEnabled).toBe(true);
    expect(saved.output.playbackLoopEnabled).toBe(true);

    await repeatPlayback.click();
    await expect(repeatPlayback).toHaveAttribute("aria-pressed", "false");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, projectPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.loadProject"]').click();
    await expect(repeatPlayback).toHaveAttribute("aria-pressed", "true");
  } finally {
    await launched.close();
  }
});

test("Issue 21: an X accessory survives project round-trip and permits one-frame WebM export", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
      accessoryPath,
    )).toBe(true);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.accessories).toHaveLength(1);
    expect(saved.accessories[0].path).toBe(accessoryPath);

    const imported = await page.evaluate(
      (project) => window.mmdModokiE2e.importProjectState(project),
      saved,
    );
    expect(imported.warnings).toEqual([]);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.accessories).toHaveLength(1);
    expect(restored.accessories[0].path).toBe(accessoryPath);

    const webmPath = resolve(launched.tempDir, "issue_21_x_accessory.webm");
    const started = await page.evaluate(async ({ project, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project,
        outputFilePath,
        startFrame: 0,
        endFrame: 0,
        fps: 30,
        outputWidth: 320,
        outputHeight: 180,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      })
    ), { project: restored, outputFilePath: webmPath });
    expect(started?.jobId).toBeTruthy();
    await expect.poll(
      () => existsSync(webmPath) && statSync(webmPath).size > 1_000,
      { timeout: 30_000 },
    ).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
