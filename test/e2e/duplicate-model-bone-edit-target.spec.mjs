import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const aliciaModelPath = resolve(
  repoRoot,
  "local-references/model/Alicia/MMD/Alicia_solid.pmx",
);

function unpackNumbers(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  const values = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    values.push(bytes.readFloatLE(offset));
  }
  return values;
}

async function loadDuplicateAlicia(page) {
  for (let index = 0; index < 2; index += 1) {
    expect(await page.evaluate(
      (filePath) => window.mmdModokiE2e.loadModel(filePath),
      aliciaModelPath,
    )).not.toBeNull();
  }
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount()), {
    timeout: 60_000,
  }).toBe(2);
}

async function selectCenterBone(page) {
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
    .toContainEqual({ category: "root", name: "センター", frames: [] });
  const rowIndex = await page.evaluate(() => (
    window.mmdModokiE2e.getTimelineTracks().findIndex(
      (track) => track.category === "root" && track.name === "センター",
    )
  ));
  expect(rowIndex).toBeGreaterThanOrEqual(0);
  await page.locator("#timeline-labels").evaluate((element, index) => {
    element.scrollTop = Math.max(0, index * 18 - 36);
  }, rowIndex);
  const scrollTop = await page.locator("#timeline-labels").evaluate((element) => element.scrollTop);
  const y = 20 + rowIndex * 18 + 9 - scrollTop;
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack))
    .toEqual({ category: "root", name: "センター" });
}

async function setCenterX(page, value) {
  const input = page.locator("#bone-controls input[data-control-key='tx']");
  await input.fill(String(value));
  await input.press("Enter");
  await expect.poll(() => page.evaluate(
    () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position.x ?? null,
  )).toBeCloseTo(value, 4);
}

async function centerTransforms(page) {
  const modelSelect = page.locator("#info-model-select");
  const transforms = [];
  for (const index of [0, 1]) {
    await modelSelect.selectOption(String(index));
    transforms.push(await page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター"),
    ));
  }
  return transforms;
}

test("同一Aliciaモデルの別個体へ保留中ボーン姿勢を流用しない", async () => {
  test.skip(!existsSync(aliciaModelPath), "local Alicia reference model is not installed");
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await loadDuplicateAlicia(page);

    const modelSelect = page.locator("#info-model-select");
    await modelSelect.selectOption("0");
    await selectCenterBone(page);
    await setCenterX(page, 7);

    await modelSelect.selectOption("1");
    await selectCenterBone(page);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position.x ?? null,
    )).toBeCloseTo(0, 4);

    const boneKeyframeButton = page.locator("#btn-bone-keyframe");
    await expect(boneKeyframeButton).toBeDisabled();
    await setCenterX(page, -3);
    await expect(boneKeyframeButton).toBeEnabled();
    await boneKeyframeButton.click();
    const registeredPositions = await page.evaluate(() => {
      const project = window.mmdModokiE2e.exportProjectState();
      const animation = project.keyframes.modelAnimations[1].animation;
      return animation.movableBoneTracks.find((track) => track.name === "センター")?.positions ?? null;
    });
    expect(registeredPositions).not.toBeNull();
    expect(
      unpackNumbers(registeredPositions).slice(0, 3),
      JSON.stringify({ registeredPositions: unpackNumbers(registeredPositions) }),
    ).toEqual([-3, 0, 0]);
  } finally {
    await launched.close();
  }
});

test("同一Aliciaモデルのボーンundoを編集元インスタンスへ適用する", async () => {
  test.skip(!existsSync(aliciaModelPath), "local Alicia reference model is not installed");
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await loadDuplicateAlicia(page);

    const modelSelect = page.locator("#info-model-select");
    await modelSelect.selectOption("0");
    await selectCenterBone(page);
    await setCenterX(page, 7);
    await modelSelect.selectOption("1");
    await selectCenterBone(page);
    await setCenterX(page, -5);

    const afterEdits = await centerTransforms(page);
    expect(afterEdits.map((transform) => transform.position.x)).toEqual([7, -5]);
    await modelSelect.selectOption("0");
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();

    const afterUndo = await centerTransforms(page);
    expect(afterUndo.map((transform) => transform.position.x), JSON.stringify({
      afterEdits,
      afterUndo,
      history: await page.evaluate(() => window.mmdModokiE2e.getCommandHistoryState()),
    })).toEqual([7, 0]);
  } finally {
    await launched.close();
  }
});
