import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

test("keeps key selection while seeking or moving keys and clears it at a target boundary", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    )).not.toBeNull();
    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");

    await setRange(page, "#light-color-r", 255);
    await page.locator("#btn-light-keyframe").click();
    await seek(page, 30);
    await setRange(page, "#light-color-r", 0);
    await page.locator("#btn-light-keyframe").click();
    await seek(page, 0);

    const keyPosition = await page.evaluate(() => {
      const labels = document.getElementById("timeline-labels");
      const tracks = document.getElementById("timeline-tracks-scroll");
      if (!labels || !tracks) throw new Error("timeline layout unavailable");
      const playheadX = Math.max(12, Math.round((tracks.clientWidth - labels.clientWidth) / 2));
      return {
        x: playheadX + 192,
        // Camera is the active 36px row, followed by the 18px MMD spacer and the Light row.
        y: 36 + 18 + 9,
      };
    });
    await page.locator("#timeline-canvas").click({ position: keyPosition });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        activeTrack: { category: "light", name: "Light" },
        activeFrame: 0,
        selectedKeys: [{ trackCategory: "light", trackName: "Light", frame: 0 }],
      });

    await page.locator("#timeline-canvas").click({
      position: { x: keyPosition.x + 30 * 6, y: keyPosition.y },
      modifiers: ["Control"],
    });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys))
      .toEqual([
        { trackCategory: "light", trackName: "Light", frame: 0 },
        { trackCategory: "light", trackName: "Light", frame: 30 },
      ]);

    await page.evaluate(() => window.mmdModokiE2e.nudgeTimelineSelection(1));
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        activeTrack: { category: "light", name: "Light" },
        activeFrame: 1,
        selectedKeys: [
          { trackCategory: "light", trackName: "Light", frame: 1 },
          { trackCategory: "light", trackName: "Light", frame: 31 },
        ],
      });

    await seek(page, 15);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        activeTrack: { category: "light", name: "Light" },
        activeFrame: 1,
        selectedKeys: [
          { trackCategory: "light", trackName: "Light", frame: 1 },
          { trackCategory: "light", trackName: "Light", frame: 31 },
        ],
      });

    await page.locator("#info-model-select").selectOption("0");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys))
      .toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
