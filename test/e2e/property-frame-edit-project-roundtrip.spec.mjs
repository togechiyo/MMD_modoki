import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/body-target.pmx");

function writeSilentWav(filePath) {
  const sampleRate = 8_000;
  const sampleCount = 800;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  writeFileSync(filePath, buffer);
}

function writeEmptyVmd(filePath) {
  const buffer = Buffer.alloc(74);
  buffer.write("Vocaloid Motion Data 0002", 0, "ascii");
  buffer.write("MMD_modoki E2E", 30, "ascii");
  writeFileSync(filePath, buffer);
}

function unpackBytes(value) {
  if (Array.isArray(value)) return value;
  return [...Buffer.from(value.data, "base64")];
}

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

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function chooseEditCommand(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
  await page.locator(`.app-menu-item[data-menu-command="${command}"]`).click();
}

async function clickHistoryCommand(page, command) {
  await page.locator(`.app-menu-quick-button[data-menu-command="edit.${command}"]`).click();
}

async function readPropertyTrack(page) {
  return page.evaluate(() => {
    const project = window.mmdModokiE2e.exportProjectState();
    return project.keyframes.modelAnimations[0].animation.propertyTrack;
  });
}

test("Propertyキー、フレーム列編集、主要プロジェクト状態をまとめて往復できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const audioPath = resolve(launched.tempDir, "roundtrip-audio.wav");
    const vmdPath = resolve(launched.tempDir, "roundtrip-motion.vmd");
    writeSilentWav(audioPath);
    writeEmptyVmd(vmdPath);
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();

    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
      .toContainEqual({ category: "property", name: "Property", frames: [] });

    const visibility = page.locator("#chk-model-visibility");
    const ik = page.locator("#info-model-ik-list input").first();
    await page.locator("#info-model-ik-details summary").click();
    await expect(ik).toBeVisible();
    const ikBoneName = await ik.getAttribute("data-ik-bone-name");
    expect(ikBoneName).toBeTruthy();

    await visibility.uncheck();
    await ik.uncheck();
    await page.locator("#btn-info-keyframe").click();
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount)).toBe(1);
    let property = await readPropertyTrack(page);
    expect(unpackFrames(property.frameNumbers)).toEqual([0]);
    expect(unpackBytes(property.visibles)).toEqual([0]);
    expect(property.ikBoneNames).toContain(ikBoneName);
    const ikIndex = property.ikBoneNames.indexOf(ikBoneName);
    expect(unpackBytes(property.ikStates[ikIndex])).toEqual([0]);

    await seek(page, 10);
    await visibility.check();
    await ik.check();
    await page.locator("#btn-info-keyframe").click();
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount)).toBe(2);
    property = await readPropertyTrack(page);
    expect(unpackFrames(property.frameNumbers)).toEqual([0, 10]);
    expect(unpackBytes(property.visibles)).toEqual([0, 1]);
    expect(unpackBytes(property.ikStates[ikIndex])).toEqual([0, 1]);

    let dialogCount = 0;
    page.on("dialog", async (dialog) => {
      dialogCount += 1;
      await dialog.accept();
    });
    await page.locator("#btn-info-keyframe").click();
    expect(dialogCount).toBe(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount)).toBe(2);
    await visibility.uncheck();
    await page.locator("#btn-info-keyframe").click();
    expect(dialogCount).toBe(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState().undoCount)).toBe(3);
    expect(unpackBytes((await readPropertyTrack(page)).visibles)).toEqual([0, 0]);
    await clickHistoryCommand(page, "undo");
    expect(unpackBytes((await readPropertyTrack(page)).visibles)).toEqual([0, 1]);
    await clickHistoryCommand(page, "undo");
    expect(await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState()))
      .toEqual({ undoCount: 1, redoCount: 2 });
    expect(unpackFrames((await readPropertyTrack(page)).frameNumbers)).toEqual([0]);
    await clickHistoryCommand(page, "redo");

    await seek(page, 5);
    await expect(visibility).not.toBeChecked();
    await expect(ik).not.toBeChecked();
    await seek(page, 15);
    await expect(visibility).toBeChecked();
    await expect(ik).toBeChecked();

    await seek(page, 10);
    await chooseEditCommand(page, "edit.insertEmptyFrame");
    expect(unpackFrames((await readPropertyTrack(page)).frameNumbers)).toEqual([0, 11]);
    await clickHistoryCommand(page, "undo");
    expect(unpackFrames((await readPropertyTrack(page)).frameNumbers)).toEqual([0, 10]);
    await chooseEditCommand(page, "edit.deleteFrameColumn");
    expect(unpackFrames((await readPropertyTrack(page)).frameNumbers)).toEqual([0]);
    await clickHistoryCommand(page, "undo");

    await page.evaluate(async ({ audioPath: projectAudioPath, vmdPath: projectVmdPath }) => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.scene.models[0].motionImports = [{ type: "vmd", path: projectVmdPath }];
      project.assets.cameraVmdPath = projectVmdPath;
      project.assets.audioPath = projectAudioPath;
      project.keyframes.cameraAnimation = {
        frameNumbers: [0, 30],
        positions: [1, 2, 3, 4, 5, 6],
        positionInterpolations: Array(8).fill(20),
        rotations: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        rotationInterpolations: Array(8).fill(20),
        distances: [-30, -45],
        distanceInterpolations: Array(8).fill(20),
        fovs: [30, 45],
        fovInterpolations: Array(8).fill(20),
      };
      project.keyframes.lightAnimation = {
        baseColor: { r: 1, g: 1, b: 1 },
        baseDirection: { x: 0, y: -1, z: 0 },
        frameNumbers: [0, 30],
        colors: [2, 1, 1, 1, 2, 1],
        directions: [0, -1, 0, 1, 0, 0],
      };
      project.keyframes.gravityAnimation = {
        baseAcceleration: 98,
        baseDirection: { x: 0, y: -100, z: 0 },
        frameNumbers: [0, 30],
        accelerations: [98, 50],
        directions: [0, -100, 0, 100, 0, 20],
      };
      project.effects.gamma = 1.25;
      project.effects.exposure = 1.5;
      project.effects.bloomEnabled = true;
      project.effects.bloomWeight = 0.6;
      await window.mmdModokiE2e.importProjectState(project);
    }, { audioPath, vmdPath });

    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await page.evaluate(async (project) => window.mmdModokiE2e.importProjectState(project), saved);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

    expect(restored.scene.models.map((model) => model.path)).toEqual([modelPath]);
    expect(restored.scene.models[0].motionImports).toEqual(saved.scene.models[0].motionImports);
    expect(restored.assets).toMatchObject({ audioPath, cameraVmdPath: vmdPath });
    expect(restored.keyframes.modelAnimations[0].animation.propertyTrack)
      .toEqual(saved.keyframes.modelAnimations[0].animation.propertyTrack);
    expect(restored.keyframes.cameraAnimation).toEqual(saved.keyframes.cameraAnimation);
    expect(restored.keyframes.lightAnimation).toEqual(saved.keyframes.lightAnimation);
    expect(restored.keyframes.gravityAnimation).toEqual(saved.keyframes.gravityAnimation);
    expect(restored.effects).toMatchObject({
      gamma: saved.effects.gamma,
      exposure: 1.5,
      bloomEnabled: true,
      bloomWeight: 0.6,
    });

    await chooseEditCommand(page, "edit.autoKeyScope.bone");
    await page.locator('.app-menu-trigger[data-i18n="menu.edit"]').click();
    await expect(page.locator('[data-menu-command="edit.autoKeyScope.bone"]'))
      .toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});
