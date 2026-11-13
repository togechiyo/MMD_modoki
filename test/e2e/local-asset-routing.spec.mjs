import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

test("local asset delivery preserves MPR, encoded paths, media ranges and GUI model loading", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const report = { pageErrors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    report.runtime = await page.evaluate(() => ({
      isolated: crossOriginIsolated, sharedMemory: typeof SharedArrayBuffer,
      physics: window.mmdModokiE2e.getPhysicsRuntimeState(),
      engine: window.mmdModokiE2e.getShadowRuntimeDiagnostics().engine,
    }));
    expect(report.runtime).toMatchObject({ isolated: true, sharedMemory: "function", engine: "WebGPU" });
    expect(report.runtime.physics.active).toContain("MPR");
    report.main = await launched.app.evaluate(({ BrowserWindow }) => ({
      electron: process.versions.electron, chromium: process.versions.chrome,
      webSecurity: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().webSecurity,
    }));
    expect(report.main.webSecurity).toBe(true);

    const file = join(launched.tempDir, "asset 試験 #%.bin");
    await writeFile(file, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    report.resource = await page.evaluate(async canonical => {
      const { toLocalAssetUrl } = await import("/src/shared/local-asset-url.ts");
      const url = toLocalAssetUrl(canonical);
      const full = await fetch(url);
      const range = await fetch(url, { headers: { Range: "bytes=2-5" } });
      const suffix = await fetch(url, { headers: { Range: "bytes=-2" } });
      const open = await fetch(url, { headers: { Range: "bytes=6-" } });
      const beyond = await fetch(url, { headers: { Range: "bytes=8-" } });
      const head = await fetch(url, { method: "HEAD", headers: { Range: "bytes=2-5" } });
      return {
        url, full: { status: full.status, bytes: [...new Uint8Array(await full.arrayBuffer())] },
        range: { status: range.status, contentRange: range.headers.get("content-range"), bytes: [...new Uint8Array(await range.arrayBuffer())] },
        suffix: { status: suffix.status, contentRange: suffix.headers.get("content-range"), bytes: [...new Uint8Array(await suffix.arrayBuffer())] },
        open: { status: open.status, contentRange: open.headers.get("content-range"), bytes: [...new Uint8Array(await open.arrayBuffer())] },
        beyond: { status: beyond.status, contentRange: beyond.headers.get("content-range") },
        head: { status: head.status, length: head.headers.get("content-length"), bytes: (await head.arrayBuffer()).byteLength },
      };
    }, pathToFileURL(file).href);
    expect(report.resource.full).toEqual({ status: 200, bytes: [0, 1, 2, 3, 4, 5, 6, 7] });
    expect(report.resource.range).toEqual({ status: 206, contentRange: "bytes 2-5/8", bytes: [2, 3, 4, 5] });
    expect(report.resource.suffix).toEqual({ status: 206, contentRange: "bytes 6-7/8", bytes: [6, 7] });
    expect(report.resource.open).toEqual({ status: 206, contentRange: "bytes 6-7/8", bytes: [6, 7] });
    expect(report.resource.beyond).toEqual({ status: 416, contentRange: "bytes */8" });
    expect(report.resource.head).toEqual({ status: 200, length: "8", bytes: 0 });
    // Exercise the renderer boundary; main-process net.fetch is privileged and
    // can set request metadata that a web page is forbidden to impersonate.
    report.untrustedRenderer = await launched.app.evaluate(async ({ BrowserWindow }, { url, origin }) => {
      const foreign = new BrowserWindow({ show: false, webPreferences: {
        webSecurity: true, contextIsolation: true, nodeIntegration: false,
      } });
      try {
        await foreign.loadURL("data:text/html,<title>foreign origin</title>");
        return await foreign.webContents.executeJavaScript(`fetch(${JSON.stringify(url + "?foreign=1")}, {
          headers: { Origin: ${JSON.stringify(origin)} }
        }).then(async response => ({ status: response.status, body: await response.text() }), error => ({ error: error.name }))`);
      } finally { foreign.destroy(); }
    }, { url: report.resource.url, origin: new URL(page.url()).origin });
    expect(report.untrustedRenderer).toEqual({ status: 403, body: "Forbidden" });

    // Supply only the OS dialog result; initiate the load and confirm its final state in GUI.
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, resolve(root, "test/fixtures/external-parent/material-switch.pmx"));
    await page.locator("#btn-model-load").click();
    await expect(page.locator("#model-comment-notice")).toBeVisible();
    await page.locator("#model-comment-notice-ok").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);
    await expect(page.locator(".viewport-empty-state")).not.toBeVisible();
    await expect(page.locator('#info-model-select option[value="0"]')).toHaveText("1: material-switch");
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].path).toBe(resolve(root, "test/fixtures/external-parent/material-switch.pmx"));
    await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath("loaded.png") });
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.pageErrors).toEqual([]);
  } finally {
    await writeFile(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
