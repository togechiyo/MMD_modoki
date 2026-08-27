import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function unpackFrames(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  const frames = [];
  let previous = 0;
  let offset = 0;
  for (let index = 0; index < value.length; index += 1) {
    let delta = 0;
    let shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      delta |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    const frame = index === 0 ? delta : previous + delta;
    frames.push(frame);
    previous = frame;
  }
  return frames;
}

function unpackFloat32(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  return Array.from({ length: value.length }, (_, index) => bytes.readFloatLE(index * 4));
}

test("camera number inputs commit one pose and overwrite keys without confirmation", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath);
    await page.locator("#info-model-select").selectOption("__camera__");

    const input = (key) => page.locator(`#bone-controls input[data-control-key='${key}']`);
    const commit = async (key, value) => {
      await input(key).fill(String(value));
      await input(key).press("Enter");
    };
    const readPose = () => page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());

    await commit("tx", 12.34);
    await expect.poll(async () => (await readPose()).target.x).toBeCloseTo(12.34, 4);
    await commit("ty", 5.67);
    await expect.poll(async () => (await readPose()).target.y).toBeCloseTo(5.67, 4);
    await commit("tz", -8.9);
    await expect.poll(async () => (await readPose()).target.z).toBeCloseTo(-8.9, 4);
    await commit("rx", 15);
    await expect.poll(async () => (await readPose()).rotation.x).toBeCloseTo(15, 4);
    await commit("ry", 25);
    await expect.poll(async () => (await readPose()).rotation.y).toBeCloseTo(25, 4);
    await commit("rz", 35);
    await expect.poll(async () => (await readPose()).rotation.z).toBeCloseTo(35, 4);
    await commit("camDistance", 60);
    await expect.poll(async () => (await readPose()).distance).toBeCloseTo(60, 4);
    await commit("camFov", 45);
    await expect.poll(async () => (await readPose()).fov).toBeCloseTo(45, 4);

    await input("tx").fill("77.77");
    await page.locator("#render-canvas").click({ position: { x: 20, y: 20 } });
    await expect(input("tx")).toHaveValue("12.34");
    expect((await readPose()).target.x).toBeCloseTo(12.34, 4);

    await page.evaluate(() => window.mmdModokiE2e.seekTo(10));
    await page.locator("#btn-auto-key").click();
    await commit("camFov", 50);
    await expect.poll(async () => {
      const tracks = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks());
      return tracks.find((track) => track.category === "camera")?.frames ?? [];
    }).toContain(10);
    await page.locator("#btn-auto-key").click();

    let dialogCount = 0;
    page.on("dialog", async (dialog) => {
      dialogCount += 1;
      await dialog.accept();
    });
    await commit("camFov", 55);
    const beforeOverwrite = await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount);
    await page.locator("#btn-bone-keyframe").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount))
      .toBe(beforeOverwrite + 1);
    expect(dialogCount).toBe(0);
    const animation = await page.evaluate(() => (
      window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation
    ));
    const index = unpackFrames(animation.frameNumbers).indexOf(10);
    const storedFov = index >= 0 ? unpackFloat32(animation.fovs)[index] : null;
    expect(storedFov).toBe(55);
  } finally {
    await launched.close();
  }
});
