import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function unpackNumbers(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  const values = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    values.push(bytes.readFloatLE(offset));
  }
  return values;
}

function centerMotion(name, x) {
  return {
    name,
    boneTracks: [],
    movableBoneTracks: [{
      name: "センター",
      frameNumbers: [0, 30],
      positions: [x, 0, 0, x, 0, 0],
      positionInterpolations: [
        20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107,
        20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107,
      ],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1],
      rotationInterpolations: [20, 107, 20, 107, 20, 107, 20, 107],
      physicsToggles: [1, 1],
    }],
    morphTracks: [],
    propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] },
  };
}

async function selectCenterBone(page) {
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks()))
    .toContainEqual({ category: "root", name: "センター", frames: [] });
  await page.locator("#timeline-label-canvas").click({ position: { x: 40, y: 47 } });
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().activeTrack))
    .toEqual({ category: "root", name: "センター" });
}

test("V022-015: ボーン数値入力を各軸へ反映してキー登録できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();
    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);

    const x = page.locator("#bone-controls input[data-control-key='tx']");
    const y = page.locator("#bone-controls input[data-control-key='ty']");
    const z = page.locator("#bone-controls input[data-control-key='tz']");
    await x.fill("11");
    await x.press("Enter");
    await y.fill("-12");
    await y.press("Enter");
    await z.fill("13");
    await z.press("Enter");

    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター")?.position ?? null,
    )).toEqual({ x: 11, y: -12, z: 13 });

    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();
    const track = await page.evaluate(() => {
      const animation = window.mmdModokiE2e.exportProjectState().keyframes.modelAnimations[0].animation;
      return animation.movableBoneTracks.find((candidate) => candidate.name === "センター") ?? null;
    });
    expect(track).not.toBeNull();
    expect(unpackNumbers(track.positions)).toEqual([11, -12, 13]);
  } finally {
    await launched.close();
  }
});

test("V022-005: 同一PMXの個体別モーションがproject再読込後も混線しない", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();

    const initial = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(initial.scene.models).toHaveLength(2);
    expect(new Set(initial.scene.models.map((model) => model.instanceId)).size).toBe(2);

    initial.keyframes.modelAnimations[0].animation = centerMotion("dancer-a", 0);
    initial.keyframes.modelAnimations[1].animation = centerMotion("dancer-b", 12);
    await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), initial);
    await page.evaluate(() => window.mmdModokiE2e.seekTo(15));

    const modelSelect = page.locator("#info-model-select");
    await modelSelect.selectOption("0");
    await page.evaluate(() => window.mmdModokiE2e.seekTo(15));
    const firstTransform = await page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター"),
    );
    await modelSelect.selectOption("1");
    await page.evaluate(() => window.mmdModokiE2e.seekTo(15));
    const secondTransform = await page.evaluate(
      () => window.mmdModokiE2e.getActiveBoneTransform("センター"),
    );

    await expect.poll(() => page.evaluate(() => [
      window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    ])).toEqual([
      expect.objectContaining({ x: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number) }),
    ]);
    const positions = await page.evaluate(() => [
      window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    ]);
    expect({ positions, firstTransform, secondTransform }).toMatchObject({
      positions: [expect.any(Object), expect.any(Object)],
      firstTransform: { position: { x: expect.any(Number) } },
      secondTransform: { position: { x: expect.any(Number) } },
    });
    expect(positions[1].x - positions[0].x, JSON.stringify({
      positions,
      firstTransform,
      secondTransform,
    })).toBeCloseTo(12, 4);

    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.keyframes.modelAnimations.map((entry) => entry.modelInstanceId))
      .toEqual(restored.scene.models.map((model) => model.instanceId));
    expect(restored.keyframes.modelAnimations.map((entry) => (
      unpackNumbers(entry.animation.movableBoneTracks[0].positions)
    ))).toEqual([[0, 0, 0, 0, 0, 0], [12, 0, 0, 12, 0, 0]]);
  } finally {
    await launched.close();
  }
});
