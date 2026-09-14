import { expect } from "@playwright/test";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";

const cases = [
  {
    "id": "directionalLightShafts",
    "fields": [
      {
        "name": "phaseG",
        "panel": "directionalLightShaftsPhaseG",
        "min": -0.9,
        "max": 0.9,
        "step": null
      }
    ]
  },
  {
    "id": "offsetShadow",
    "fields": [
      {
        "name": "offsetX",
        "panel": "offsetShadowOffsetX",
        "min": -64,
        "max": 64,
        "step": 1
      },
      {
        "name": "offsetY",
        "panel": "offsetShadowOffsetY",
        "min": -64,
        "max": 64,
        "step": 1
      },
      {
        "name": "depthBias",
        "panel": "offsetShadowDepthBias",
        "min": 0,
        "max": 0.4,
        "step": 0.001
      },
      {
        "name": "maxDepth",
        "panel": "offsetShadowMaxDepth",
        "min": 0.001,
        "max": 4,
        "step": 0.001
      },
      {
        "name": "depthScale",
        "panel": "offsetShadowDepthScale",
        "min": 0,
        "max": 1,
        "step": null
      }
    ]
  },
  {
    "id": "offsetHighlight",
    "fields": [
      {
        "name": "offsetX",
        "panel": "offsetHighlightOffsetX",
        "min": -256,
        "max": 256,
        "step": 1
      },
      {
        "name": "offsetY",
        "panel": "offsetHighlightOffsetY",
        "min": -256,
        "max": 256,
        "step": 1
      },
      {
        "name": "depthScale",
        "panel": "offsetHighlightDepthScale",
        "min": 0,
        "max": 1,
        "step": null
      }
    ]
  }
];
const actual = (field, position) => {
  const value = field.min + position / 100 * (field.max - field.min);
  return field.step ? Number((field.min + Math.round((value - field.min) / field.step) * field.step).toFixed(10)) : value;
};

export async function verifyDepthEffectKeys(page, app, testInfo, config, selectEffect) {
  const fields = cases.find(item => item.id === config.id).fields;
  const seek = async frame => {
    await page.locator("#current-frame").fill(String(frame));
    await page.locator("#current-frame").press("Enter");
  };
  const fill = async (field, position) => {
    const input = page.locator('[data-effect-key-field="' + field + '"]');
    await input.fill(String(position)); await input.dispatchEvent("input");
  };
  const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  const track = async () => (await state()).keyframes.effectAnimations.tracks.find(track => track.effectId === config.id);
  const initial = (await state()).effects;
  for (const [frame, position] of [[0, 25], [20, 75], [40, 25]]) {
    await seek(frame);
    await page.locator("#effect-key-enabled").check(); await fill("strength", 100);
    for (const field of fields) await fill(field.name, position);
    await page.locator("#btn-kf-add").click();
  }
  await seek(10);
  const midpoint = {};
  for (const field of fields) {
    midpoint[field.name] = (actual(field, 25) + actual(field, 75)) / 2;
    await expect(page.locator('[data-effect-key-field="' + field.name + '"]')).toHaveValue("50");
  }
  await fill("strength", 50);
  for (const field of fields) expect((await track()).preview.value[field.name]).toBeCloseTo(midpoint[field.name]);
  // Every public panel slider edits the stopped key preview, including while OFF.
  await page.locator("#effect-key-enabled").uncheck();
  for (const field of fields) {
    const input = page.locator('[data-effect-stack-control="' + field.panel + '"]');
    if (!await input.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await expect(input).toBeEnabled();
    const number = input.locator("..").locator(".range-number-input");
    await expect(number).toBeEnabled();
    await number.fill("33");
    expect((await track()).preview.value[field.name]).toBeCloseTo(midpoint[field.name]);
    await number.press("Enter");
    await expect(input).toHaveValue("33");
    await expect(page.locator('[data-effect-key-field="' + field.name + '"]')).toHaveValue("33");
    expect((await track()).preview.value[field.name]).toBeCloseTo(actual(field, 33));
    expect((await track()).preview.value.enabled).toBe(false);
  }
  await page.locator("#btn-kf-add").click();
  await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
  await seek(11); await seek(10);
  const expected = await track();
  const menu = async command => {
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="' + command + '"]').click();
  };
  const projectPath = testInfo.outputPath("depth-shape-project.json");
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
  await menu("file.saveProject"); await expect.poll(() => existsSync(projectPath)).toBe(true);
  await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, projectPath);
  await menu("file.loadProject");
  await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
  await selectEffect(page, config.id);
  expect(await track()).toEqual(expected);
  const restored = (await state()).effects;
  for (const key of Object.keys(initial).filter(key => key.startsWith(config.id))) expect(restored[key]).toEqual(initial[key]);
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
  for (const frame of [0, 20, 40, 10, 0]) await seek(frame);
  expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
  // Constant intensity; authored shape changes must affect pixels and reverse deterministically.
  const frames = [];
  for (const [index, frame] of [0, 20, 0].entries()) {
    await seek(frame);
    const output = testInfo.outputPath("depth-shape-" + index); mkdirSync(output, { recursive: true });
    await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
    frames.push(PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data);
  }
  const difference = (a, b) => {
    let sum = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
    return sum / (a.length * 0.75);
  };
  const report = { changed: difference(frames[0], frames[1]), reverse: difference(frames[0], frames[2]) };
  writeFileSync(testInfo.outputPath("depth-shape-comparison.json"), JSON.stringify(report));
  expect(report.changed).toBeGreaterThan(0.001);
  expect(report.reverse).toBeLessThan(0.0001);
  for (const field of fields) {
    const input = page.locator('[data-effect-stack-control="' + field.panel + '"]');
    await expect(input).toHaveValue("25");
    await expect(input.locator("..").locator(".range-number-input")).toHaveValue("25");
  }
  for (const { id } of cases) {
    await selectEffect(page, id);
    const layout = await page.locator("#effect-key-controls").evaluate(root => {
      const right = root.getBoundingClientRect().right;
      return Array.from(root.querySelectorAll("#effect-key-parameters input, #effect-key-parameters output"))
        .every(element => element.getBoundingClientRect().right <= right + 1);
    });
    expect(layout, id + " sliders and readouts fit the panel").toBe(true);
  }
  await selectEffect(page, config.id);
  await page.screenshot({ path: testInfo.outputPath("depth-controls.png") });
}
