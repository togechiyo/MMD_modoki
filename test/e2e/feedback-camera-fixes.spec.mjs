import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { createMorphVmd } from "../fixtures/feedback-reproduction/create.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = name => resolve(root, "test/fixtures/external-parent", `${name}.pmx`);
const input = (page, key) => page.locator(`#bone-controls input[data-control-key="${key}"]`);
async function menu(page, command) {
  const item = page.locator(`.app-menu-item[data-menu-command="${command}"]`);
  await page.locator(".app-menu-group", { has: item }).locator(".app-menu-trigger").click(); await item.click();
}
const unpack = value => Array.isArray(value) ? value : value.encoding === "u8-b64" ? [...Buffer.from(value.data, "base64")] : Array.from({ length: value.length }, (_, i) => Buffer.from(value.data, "base64").readFloatLE(i * 4));
const read = page => page.evaluate(() => ({
  project: window.mmdModokiE2e.exportProjectState(), pose: window.mmdModokiE2e.getCameraKeyframePose(),
  position: window.mmdModokiE2e.getCameraPosition(), target: window.mmdModokiE2e.getCameraTarget(),
}));
async function importTrack(page, track) {
  await page.evaluate(async track => {
    const state = window.mmdModokiE2e.exportProjectState();
    state.physics.enabled = false; state.keyframes.cameraAnimation = track;
    await window.mmdModokiE2e.importProjectState(state);
    window.mmdModokiE2e.seekTo(180);
  }, track);
  await page.locator("#info-model-select").selectOption("__camera__");
}
function track(distance, ry = Math.PI * 2.5) {
  const curve = [12, 90, 45, 118, 25, 83, 36, 111];
  return { frameNumbers: [0, 180], positions: [1, 2, 3, 1234.56789, 2.34567, 3.45678],
    rotations: [0.2, 0.4, 0, 0.1234567, ry, 0.2345678], distances: [-30, distance], fovs: [35, 40.12345],
    positionInterpolations: [...curve, ...curve, ...curve], rotationInterpolations: curve,
    distanceInterpolations: curve, fovInterpolations: curve };
}
function expectPoseEqual(a, b) {
  for (const key of ["position", "rotation", "target"]) for (const axis of ["x", "y", "z"]) {
    expect(a[key][axis]).toBeCloseTo(b[key][axis], 5);
  }
  expect(a.distance).toBeCloseTo(b.distance, 5); expect(a.fov).toBeCloseTo(b.fov, 5);
}

test("camera no-op registration preserves winding, precision, signed distance and playback view", async () => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("tofu"));
    for (const [distance, ry] of [[-30, Math.PI], [-30, Math.PI * 2.5], [0, 0.4], [12, 0.4]]) {
      await importTrack(page, track(distance, ry));
      const before = await read(page);
      for (let i = 0; i < 3; i++) {
        await input(page, "ry").press("Enter"); await page.locator("#btn-bone-keyframe").click();
        const after = await read(page);
        expectPoseEqual(after.pose, before.pose);
        for (const key of ["positions", "rotations", "distances", "fovs", "positionInterpolations", "rotationInterpolations", "distanceInterpolations", "fovInterpolations"]) {
          expect(unpack(after.project.keyframes.cameraAnimation[key])).toEqual(unpack(before.project.keyframes.cameraAnimation[key]));
        }
      }
      await input(page, "ty").fill("8.7654321"); await input(page, "ty").press("Enter");
      const preview = await read(page);
      await menu(page, "edit.undo"); expectPoseEqual((await read(page)).pose, before.pose);
      await menu(page, "edit.redo"); expectPoseEqual((await read(page)).pose, preview.pose);
      await page.locator("#btn-bone-keyframe").click();
      const edited = await read(page);
      expect(edited.pose.target.y).toBeCloseTo(8.7654321, 6);
      expect(edited.pose.target.x).toBe(before.pose.target.x);
      expect(edited.pose.rotation).toEqual(before.pose.rotation);
      expect(edited.pose.distance).toBe(before.pose.distance);
      await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), edited.project);
      expectPoseEqual((await read(page)).pose, edited.pose);
    }
    for (const distance of [-30, -0.01, 0, 0.01, 12]) {
      const constant = track(distance, 0.4);
      constant.positions = [1, 2, 3, 1, 2, 3]; constant.rotations = [0.2, 0.4, 0, 0.2, 0.4, 0];
      constant.distances = [distance, distance]; constant.fovs = [35, 35];
      await importTrack(page, constant);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
      const before = await read(page);
      await page.locator("#viewport-seek-play-toggle").click();
      await page.waitForFunction(() => window.mmdModokiE2e.exportProjectState().scene.currentFrame >= 5);
      const playing = await read(page);
      await page.locator("#viewport-seek-play-toggle").click();
      const stopped = await read(page);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(30));
      for (const state of [playing, stopped, await read(page)]) {
        expectPoseEqual(state.pose, before.pose);
        for (const key of ["position", "target"]) for (const axis of ["x", "y", "z"]) expect(state[key][axis]).toBeCloseTo(before[key][axis], 5);
      }
    }
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});

test("accessory numeric edits retain precision and accept wide stage coordinates", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), resolve(root, "test/fixtures/accessory/tofu.x"));
    const readTransform = () => page.evaluate(() => window.mmdModokiE2e.getAccessoryTransform(0));
    for (const [id, value] of [["accessory-pos-x", "1234.56789"], ["accessory-pos-y", "-4567.89123"], ["accessory-rot-y", "450.12345"]]) {
      await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).press("Enter");
    }
    const before = await readTransform();
    expect(before.position.x).toBeCloseTo(1234.56789, 6); expect(before.position.y).toBeCloseTo(-4567.89123, 6);
    expect(before.rotationDeg.y).toBeCloseTo(450.12345, 6);
    for (let i = 0; i < 3; i++) await page.locator("#accessory-pos-x").press("Enter");
    expect(await readTransform()).toEqual(before);
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    expect(await readTransform()).toEqual(before);
  } finally { await launched.close(); }
});

test("a camera-named morph VMD falls back without a false camera error", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("expression-test"));
    await page.locator("#info-model-select").selectOption("__camera__");
    const path = resolve(launched.tempDir, "camera-expression.vmd"); writeFileSync(path, createMorphVmd());
    const picker = page.locator('input[data-test-vmd-drop]');
    await page.evaluate(() => { const input = document.createElement("input"); input.type = "file"; input.dataset.testVmdDrop = "1"; document.body.append(input); });
    await picker.setInputFiles(path);
    const transfer = await picker.evaluateHandle(node => { const transfer = new DataTransfer(); transfer.items.add(node.files[0]); node.remove(); return transfer; });
    const errors = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.locator("#render-canvas").dispatchEvent("drop", { dataTransfer: transfer }); await transfer.dispose();
    await expect.poll(() => page.locator(".toast").allTextContents()).toContainEqual(expect.stringMatching(/Loaded motion: camera-expression/i));
    expect((await page.locator(".toast").allTextContents()).join(" ")).not.toMatch(/no camera track/i);
    expect(errors).toEqual([]);
    await page.locator("#info-model-select").selectOption("0");
    expect(await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().some(track => track.category === "morph" && track.frames.includes(30)))).toBe(true);
  } finally { await launched.close(); }
});
