import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("viewport canvas reserves space above the playback bar", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const readLayout = () => page.evaluate(() => {
      const container = document.getElementById("viewport-container")?.getBoundingClientRect();
      const canvas = document.getElementById("render-canvas")?.getBoundingClientRect();
      const playbackBar = document.getElementById("viewport-bottom-bar")?.getBoundingClientRect();
      if (!container || !canvas || !playbackBar) return null;
      return {
        canvasBottom: canvas.bottom,
        containerBottom: container.bottom,
        playbackBarTop: playbackBar.top,
        playbackBarBottom: playbackBar.bottom,
      };
    });

    await expect.poll(async () => {
      const layout = await readLayout();
      if (!layout) return Number.POSITIVE_INFINITY;
      return layout.canvasBottom - layout.playbackBarTop;
    }).toBeLessThanOrEqual(0.5);

    const layout = await readLayout();
    expect(layout).not.toBeNull();
    expect(layout.playbackBarBottom).toBeLessThanOrEqual(layout.containerBottom + 0.5);

    await expect(page.locator(
      ".section-header > svg, #timeline-section > .panel-header > svg, #shader-panel > .panel-header > svg",
    )).toHaveCount(0);
  } finally {
    await launched.close();
  }
});
