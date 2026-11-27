import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

// Playwright requires a destructured fixtures argument when using testInfo.
// eslint-disable-next-line no-empty-pattern
test("V022-051: WebM progress shows rate and ETA, cancels safely, and permits retry", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    project.viewport.groundVisible = false;
    project.viewport.skydomeVisible = false;
    project.viewport.backgroundBlack = true;
    project.viewport.backgroundDisplayMode = "black";

    const canceledPath = resolve(launched.tempDir, "cancel_me.webm");
    const launch = await page.evaluate(async ({ requestProject, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project: requestProject,
        outputFilePath,
        startFrame: 0,
        endFrame: 9_000,
        fps: 30,
        outputWidth: 320,
        outputHeight: 180,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      })
    ), { requestProject: project, outputFilePath: canceledPath });
    expect(launch?.jobId).toBeTruthy();

    await expect(page.locator("#app")).toHaveClass(/ui-export-lock/);
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(false);
    await expect(page.locator("#ui-busy-progress")).toBeVisible();
    await expect(page.locator("#ui-busy-cancel")).toBeVisible();
    await expect(page.locator("#ui-busy-metrics")).toHaveText(/\d+\.\d fps .* (ETA|残り) /, { timeout: 45_000 });
    await expect.poll(async () => Number(
      await page.locator("#ui-busy-progress").getAttribute("aria-valuenow"),
    )).toBeGreaterThan(0);

    await page.locator("#ui-busy-cancel").click();
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(true);
    await expect(page.locator("#ui-busy-overlay")).toHaveClass(/hidden/);
    await expect.poll(() => existsSync(canceledPath), { timeout: 10_000 }).toBe(false);

    const interruptedPath = resolve(launched.tempDir, "interrupted.webm");
    const original = Buffer.from("previous export");
    writeFileSync(interruptedPath, original);
    const interrupted = await page.evaluate(({ project, outputFilePath }) => window.electronAPI.startWebmExportWindow({
      project, outputFilePath, startFrame: 0, endFrame: 8000, fps: 30, outputWidth: 320,
      outputHeight: 180, includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface",
    }), { project, outputFilePath: interruptedPath });
    expect(interrupted?.jobId).toBeTruthy();
    await expect.poll(async () => Number(await page.locator("#ui-busy-progress").getAttribute("aria-valuenow")), { timeout: 45_000 })
      .toBeGreaterThan(0);
    await launched.app.evaluate(({ BrowserWindow }, jobId) => {
      const exporter = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes(jobId));
      if (!exporter) throw new Error("Export window missing");
      exporter.destroy();
    }, interrupted.jobId);
    await expect(page.locator("#status-text")).toHaveText(/WebM出力に失敗|WebM export failed/i);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
    expect(readFileSync(interruptedPath)).toEqual(original);
    expect(readdirSync(launched.tempDir).filter(name => name.startsWith(".mmd-webm-"))).toEqual([]);

    const retryPath = interruptedPath;
    const retry = await page.evaluate(async ({ requestProject, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project: requestProject,
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
    ), { requestProject: project, outputFilePath: retryPath });
    expect(retry?.jobId).toBeTruthy();
    await expect.poll(
      () => existsSync(retryPath) && statSync(retryPath).size > 100,
      { timeout: 60_000 },
    ).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
  } finally {
    try {
      const page = await launched.app.firstWindow();
      const log = await page.evaluate(() => window.electronAPI.getLogFileInfo());
      await testInfo.attach("export-log", { body: readFileSync(log.path), contentType: "text/plain" });
    } finally { await launched.close(); }
  }
});
