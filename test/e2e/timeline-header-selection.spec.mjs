import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const sceneTrackOrder = ["Camera", "Light", "Shadow", "Gravity"];

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

async function frameHeaderPosition(page, frame) {
  return page.evaluate((targetFrame) => {
    const labels = document.getElementById("timeline-labels");
    const tracks = document.getElementById("timeline-tracks-scroll");
    const frameInput = document.getElementById("current-frame");
    if (!labels || !tracks || !(frameInput instanceof HTMLInputElement)) {
      throw new Error("timeline layout unavailable");
    }
    const playheadX = Math.max(12, Math.round((tracks.clientWidth - labels.clientWidth) / 2));
    const currentFrame = Number.parseInt(frameInput.value, 10) || 0;
    return { x: playheadX + (targetFrame - currentFrame) * 6, y: 10 };
  }, frame);
}

async function rowHeaderPosition(page, trackName) {
  let top = 20;
  for (const name of sceneTrackOrder) {
    const height = 18;
    if (name === trackName) return { x: 40, y: top + height / 2 };
    top += height;
    if (name === "Camera") top += 18;
  }
  throw new Error(`unknown scene track: ${trackName}`);
}

test("selects row or frame headers and converts them to key selection on double click", async () => {
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

    const labels = page.locator("#timeline-label-canvas");
    await labels.click({ position: await rowHeaderPosition(page, "Light") });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().headerSelection))
      .toEqual({
        axis: "row",
        rows: [{ trackCategory: "light", trackName: "Light" }],
        frames: [],
      });

    const panStart = await page.evaluate(() => {
      const scroll = document.getElementById("timeline-tracks-scroll");
      const canvas = document.getElementById("timeline-canvas");
      const labelCanvas = document.getElementById("timeline-label-canvas");
      if (!scroll || !(canvas instanceof HTMLCanvasElement) || !(labelCanvas instanceof HTMLCanvasElement)) {
        throw new Error("timeline scroll area unavailable");
      }
      const canvasMinHeight = canvas.style.minHeight;
      const labelCanvasMinHeight = labelCanvas.style.minHeight;
      canvas.style.minHeight = `${scroll.clientHeight + 120}px`;
      labelCanvas.style.minHeight = `${scroll.clientHeight + 140}px`;
      const rect = scroll.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(48, rect.height / 2),
        scrollTop: scroll.scrollTop,
        canvasMinHeight,
        labelCanvasMinHeight,
      };
    });
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(panStart.x + 60, panStart.y + 72, { steps: 4 });
    await page.mouse.up({ button: "middle" });
    await expect(page.locator("#current-frame")).toHaveValue("10");
    const panEnd = await page.evaluate(() => {
      const scroll = document.getElementById("timeline-tracks-scroll");
      const labels = document.getElementById("timeline-labels");
      return {
        trackTop: scroll?.scrollTop ?? 0,
        trackMax: scroll ? scroll.scrollHeight - scroll.clientHeight : 0,
        labelTop: labels?.scrollTop ?? 0,
        labelMax: labels ? labels.scrollHeight - labels.clientHeight : 0,
      };
    });
    expect(panEnd.trackMax).toBeGreaterThan(0);
    expect(panEnd.labelMax).toBeGreaterThan(0);
    expect(panEnd.trackTop, JSON.stringify(panEnd)).toBeGreaterThan(panStart.scrollTop);
    const labelCorner = await page.evaluate(() => {
      const labelsViewport = document.getElementById("timeline-labels");
      const container = document.getElementById("timeline-container");
      if (!labelsViewport || !container) throw new Error("timeline label viewport unavailable");
      const rect = labelsViewport.getBoundingClientRect();
      const maskStyle = getComputedStyle(container, "::after");
      return {
        x: rect.left + Math.min(40, rect.width / 2),
        y: rect.top + 10,
        maskHeight: maskStyle.height,
        maskBackground: maskStyle.backgroundColor,
      };
    });
    expect(labelCorner.maskHeight).toBe("20px");
    expect(labelCorner.maskBackground).toBe("rgb(14, 14, 26)");
    await page.mouse.click(labelCorner.x, labelCorner.y);
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().headerSelection))
      .toEqual({ axis: null, rows: [], frames: [] });
    await seek(page, 0);
    await page.evaluate(({ canvasMinHeight, labelCanvasMinHeight }) => {
      const scroll = document.getElementById("timeline-tracks-scroll");
      if (scroll) scroll.scrollTop = 0;
      const canvas = document.getElementById("timeline-canvas");
      if (canvas instanceof HTMLCanvasElement) canvas.style.minHeight = canvasMinHeight;
      const labelCanvas = document.getElementById("timeline-label-canvas");
      if (labelCanvas instanceof HTMLCanvasElement) labelCanvas.style.minHeight = labelCanvasMinHeight;
    }, panStart);

    await setRange(page, "#light-color-r", 255);
    await page.locator("#btn-light-keyframe").click();
    await seek(page, 20);
    await setRange(page, "#light-color-r", 0);
    await page.locator("#btn-light-keyframe").click();
    await seek(page, 10);
    await setRange(page, "#light-shadow-color-r", 96);
    await page.locator("#btn-shadow-keyframe").click();

    const ruler = page.locator("#timeline-overlay-canvas");
    await ruler.click({ position: await frameHeaderPosition(page, 0) });
    await expect(page.locator("#current-frame")).toHaveValue("0");
    await ruler.click({
      position: await frameHeaderPosition(page, 10),
      modifiers: ["Control"],
    });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        selectedKeys: [],
        headerSelection: { axis: "column", rows: [], frames: [0, 10] },
      });

    await ruler.dblclick({ position: await frameHeaderPosition(page, 10) });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        headerSelection: { axis: null, rows: [], frames: [] },
        selectedKeys: [
          { trackCategory: "light", trackName: "Light", frame: 0 },
          { trackCategory: "shadow", trackName: "Shadow", frame: 10 },
        ],
      });

    await labels.click({ position: await rowHeaderPosition(page, "Light") });
    await labels.click({
      position: await rowHeaderPosition(page, "Shadow"),
      modifiers: ["Control"],
    });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        selectedKeys: [],
        headerSelection: {
          axis: "row",
          rows: [
            { trackCategory: "light", trackName: "Light" },
            { trackCategory: "shadow", trackName: "Shadow" },
          ],
          frames: [],
        },
      });

    await ruler.click({ position: await frameHeaderPosition(page, 0) });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().headerSelection))
      .toEqual({ axis: "column", rows: [], frames: [0] });

    await labels.click({ position: await rowHeaderPosition(page, "Light") });
    await labels.click({
      position: await rowHeaderPosition(page, "Shadow"),
      modifiers: ["Control"],
    });

    await labels.dblclick({ position: await rowHeaderPosition(page, "Shadow") });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys))
      .toEqual([
        { trackCategory: "light", trackName: "Light", frame: 0 },
        { trackCategory: "light", trackName: "Light", frame: 20 },
        { trackCategory: "shadow", trackName: "Shadow", frame: 10 },
      ]);

    await labels.click({ position: { x: 40, y: 10 } });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        selectedKeys: [],
        headerSelection: { axis: null, rows: [], frames: [] },
      });

    await labels.click({ position: await rowHeaderPosition(page, "Light") });
    await page.keyboard.down("Shift");
    await labels.click({ position: await rowHeaderPosition(page, "Gravity") });
    await page.keyboard.up("Shift");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().headerSelection))
      .toEqual({
        axis: "row",
        rows: [
          { trackCategory: "light", trackName: "Light" },
          { trackCategory: "shadow", trackName: "Shadow" },
          { trackCategory: "gravity", trackName: "Gravity" },
        ],
        frames: [],
      });

    await labels.click({ position: { x: 40, y: 10 } });
    await labels.click({ position: await rowHeaderPosition(page, "Light") });
    await labels.dblclick({
      position: await rowHeaderPosition(page, "Gravity"),
      modifiers: ["Shift"],
    });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        selectedKeys: [],
        headerSelection: {
          axis: "row",
          rows: [
            { trackCategory: "light", trackName: "Light" },
            { trackCategory: "shadow", trackName: "Shadow" },
            { trackCategory: "gravity", trackName: "Gravity" },
          ],
          frames: [],
        },
      });

    await labels.click({ position: { x: 40, y: 10 } });

    await ruler.click({ position: await frameHeaderPosition(page, 0) });
    await page.keyboard.down("Shift");
    await ruler.click({ position: await frameHeaderPosition(page, 3) });
    await page.keyboard.up("Shift");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().headerSelection))
      .toEqual({ axis: "column", rows: [], frames: [0, 1, 2, 3] });

    await labels.click({ position: { x: 40, y: 10 } });
    await ruler.click({ position: await frameHeaderPosition(page, 0) });
    await ruler.dblclick({
      position: await frameHeaderPosition(page, 3),
      modifiers: ["Shift"],
    });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection()))
      .toMatchObject({
        selectedKeys: [],
        headerSelection: { axis: "column", rows: [], frames: [0, 1, 2, 3] },
      });

    await labels.dblclick({ position: { x: 40, y: 10 } });
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys))
      .toHaveLength(3);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
