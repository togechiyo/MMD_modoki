import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const vite = require("vite");
const ViteConfigGenerator = require("@electron-forge/plugin-vite/dist/ViteConfig").default;

const pluginConfig = {
  build: [
    { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
    { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
  ],
  renderer: [
    { name: "main_window", config: "vite.renderer.config.ts" },
  ],
};

export async function launchMmdModoki(repoRoot) {
  const tempDir = mkdtempSync(join(tmpdir(), "mmd-modoki-e2e-"));
  const devServers = [];
  const generator = new ViteConfigGenerator(pluginConfig, repoRoot, false);

  try {
    for (const config of await generator.getRendererConfig()) {
      const server = await vite.createServer({ configFile: false, ...config });
      await server.listen();
      devServers.push(server);
    }

    for (const config of await generator.getBuildConfigs()) {
      await vite.build({
        ...config,
        build: { ...config.build, watch: null },
      });
    }

    const env = {
      ...process.env,
      MMD_MODOKI_E2E: "1",
      MMD_MODOKI_E2E_USER_DATA_PATH: join(tempDir, "user-data"),
    };
    for (const key of Object.keys(env)) {
      if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") delete env[key];
    }

    const app = await electron.launch({ args: ["."], cwd: repoRoot, env });
    const close = async () => {
      await app.close().catch(() => undefined);
      await Promise.all(devServers.map((server) => server.close().catch(() => undefined)));
      rmSync(tempDir, { recursive: true, force: true });
    };
    return { app, close, tempDir };
  } catch (error) {
    await Promise.all(devServers.map((server) => server.close().catch(() => undefined)));
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function selectTimelineTrack(page, category, name) {
  await expect.poll(() => page.evaluate(
    ({ targetCategory, targetName }) => window.mmdModokiE2e.getTimelineTracks().some(
      (track) => track.category === targetCategory && track.name === targetName,
    ),
    { targetCategory: category, targetName: name },
  )).toBe(true);

  const rowIndex = await page.evaluate(
    ({ targetCategory, targetName }) => window.mmdModokiE2e.getTimelineTracks().findIndex(
      (track) => track.category === targetCategory && track.name === targetName,
    ),
    { targetCategory: category, targetName: name },
  );
  expect(rowIndex).toBeGreaterThanOrEqual(0);

  await page.locator("#timeline-labels").evaluate((element, index) => {
    element.scrollTop = Math.max(0, index * 18 - 36);
  }, rowIndex);
  const scrollTop = await page.locator("#timeline-labels").evaluate((element) => element.scrollTop);
  const y = 20 + rowIndex * 18 + 9 - scrollTop;
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y } });
  await expect.poll(() => page.evaluate(
    () => window.mmdModokiE2e.getTimelineSelection().activeTrack,
  )).toEqual({ category, name });
}

export async function selectCenterBone(page) {
  await selectTimelineTrack(page, "root", "センター");
}
