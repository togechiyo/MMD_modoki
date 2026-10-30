import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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

export async function launchMmdModoki(repoRoot, { effectTimeline = false, radianceLightingLab = false } = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), "mmd-modoki-e2e-"));
  const devServers = [];
  const generator = new ViteConfigGenerator(pluginConfig, repoRoot, false);

  try {
    for (const config of await generator.getRendererConfig()) {
      const server = await vite.createServer({ configFile: false, ...config,
        // A running editor can use the same Vite dependencies. Allow GPU suites to
        // isolate their optimizer cache instead of invalidating each other's URLs.
        cacheDir: process.env.MMD_E2E_VITE_CACHE_DIR ?? config.cacheDir,
        optimizeDeps: { ...config.optimizeDeps, include: [...(config.optimizeDeps?.include ?? []),
          // Keep RC fixture imports stable across ordinary/lab runs and discover them before Electron
          // opens, so a cold cache or feature-flag switch cannot trigger a mid-setup Vite reload.
          "@babylonjs/core/Materials/Textures/rawTexture", "@babylonjs/core/Materials/Textures/renderTargetTexture",
          "@babylonjs/core/Materials/Textures/texture", "@babylonjs/core/Materials/standardMaterial",
          "@babylonjs/core/Meshes/Builders/boxBuilder", "@babylonjs/core/Meshes/Builders/groundBuilder",
          "@babylonjs/core/Meshes/Builders/sphereBuilder", "@babylonjs/core/FrameGraph/frameGraph",
          "@babylonjs/core/Buffers/buffer", "@babylonjs/core/Bones/skeleton", "@babylonjs/core/Bones/bone",
          "@babylonjs/core/Morph/morphTarget", "@babylonjs/core/Morph/morphTargetManager", "@babylonjs/core/Maths/math.vector",
          "@babylonjs/core/Instrumentation/engineInstrumentation", "@babylonjs/core/Engines/WebGPU/webgpuPerfCounter",
        ] },
        define: { ...config.define,
          "import.meta.env.VITE_MMD_EFFECT_TIMELINE": JSON.stringify(effectTimeline ? "1" : "0"),
          "import.meta.env.VITE_MMD_RADIANCE_LIGHTING_LAB": JSON.stringify(radianceLightingLab ? "1" : "0"),
        },
      });
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

    // Chromium writes DevToolsActivePort before renderer startup. Recovery tests reconnect after a renderer crash.
    mkdirSync(env.MMD_MODOKI_E2E_USER_DATA_PATH, { recursive: true });
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

  const rowTop = await page.evaluate(
    ({ targetCategory, targetName }) => {
      const tracks = window.mmdModokiE2e.getTimelineTracks();
      const index = tracks.findIndex(track => track.category === targetCategory && track.name === targetName);
      // The camera is followed by one blank row; it is not an authored track.
      return index < 0 ? -1 : tracks.slice(0, index).reduce((top, track) => top + 18 + (track.category === "camera" ? 18 : 0), 0);
    },
    { targetCategory: category, targetName: name },
  );
  expect(rowTop).toBeGreaterThanOrEqual(0);

  await page.locator("#timeline-labels").evaluate((element, top) => {
    element.scrollTop = Math.max(0, top - 36);
  }, rowTop);
  const scrollTop = await page.locator("#timeline-labels").evaluate((element) => element.scrollTop);
  const y = 20 + rowTop + 9 - scrollTop;
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y } });
  await expect.poll(() => page.evaluate(
    () => window.mmdModokiE2e.getTimelineSelection().activeTrack,
  )).toEqual({ category, name });
}

export async function selectCenterBone(page) {
  await selectTimelineTrack(page, "root", "センター");
}
