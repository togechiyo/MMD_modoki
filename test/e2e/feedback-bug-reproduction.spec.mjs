import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { createTofuModel, writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { createMorphVmd, createSwatchBmp } from "../fixtures/feedback-reproduction/create.mjs";

// Diagnostic collection, not a regression gate: a reported bug may be observed.
test.skip(process.env.MMD_MODOKI_FEEDBACK_REPRO !== "1", "Explicit feedback reproduction run only");
const root = resolve(import.meta.dirname, "../..");
const fixture = name => resolve(root, "test/fixtures/external-parent", `${name}.pmx`);
const output = resolve(root, "artifacts/e2e/feedback-reproduction-2026-10-19");
const screenshotStyle = "#viewport-overlay, .toast { visibility: hidden !important; }";

function unpack(value) {
  if (Array.isArray(value)) return value;
  const bytes = Buffer.from(value.data, "base64");
  if (value.encoding === "u8-b64") return [...bytes];
  if (value.encoding === "f32-b64") return Array.from({ length: value.length }, (_, i) => bytes.readFloatLE(i * 4));
  throw new Error(`Unexpected encoding: ${value.encoding}`);
}
async function menu(page, command) {
  const item = page.locator(`.app-menu-item[data-menu-command="${command}"]`);
  await page.locator(".app-menu-group", { has: item }).locator(".app-menu-trigger").click();
  await item.click();
}
const input = (page, key) => page.locator(`#bone-controls input[data-control-key="${key}"]`);
async function snapshot(page) {
  return page.evaluate(() => ({ project: window.mmdModokiE2e.exportProjectState(),
    pose: window.mmdModokiE2e.getCameraKeyframePose(), position: window.mmdModokiE2e.getCameraPosition(),
    target: window.mmdModokiE2e.getCameraTarget(),
    inputs: Object.fromEntries([...document.querySelectorAll("#bone-controls input[data-control-key]")]
      .map(node => [node.dataset.controlKey, { value: node.value, min: node.min, max: node.max }])),
  }));
}
async function probe(page) {
  return page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).observe());
}
async function run(name, body, backend = "frameGraph") {
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root), report = { name, backend, errors: [], observations: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic") {
      await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    await body(page, report.observations, launched);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    report.completed = true;
  } catch (error) {
    report.failure = String(error);
    throw error;
  } finally {
    writeFileSync(resolve(output, `${name}.json`), JSON.stringify(report, null, 2));
    await launched.close();
  }
}

function cameraTrack({ distance = -30, ry = 0.3, x = 0 } = {}) {
  const curves = [12, 90, 45, 118, 25, 83, 36, 111];
  return { frameNumbers: [0, 180], positions: [0, 2, 0, x, 2.34567, 3.45678],
    rotations: [0, 0, 0, 0.1234567, ry, 0.2345678], distances: [-30, distance], fovs: [30, 40.12345],
    positionInterpolations: [...curves, ...curves, ...curves], rotationInterpolations: curves,
    distanceInterpolations: curves, fovInterpolations: curves };
}
async function importCamera(page, track) {
  await page.evaluate(async track => {
    const state = window.mmdModokiE2e.exportProjectState();
    state.physics.enabled = false; state.keyframes.cameraAnimation = track;
    await window.mmdModokiE2e.importProjectState(state);
    window.mmdModokiE2e.seekTo(180);
  }, track);
  await page.locator("#info-model-select").selectOption("__camera__");
}

test("collect camera Enter, range, interpolation and signed playback observations", async () => {
  test.setTimeout(180000);
  await run("camera", async (page, observations) => {
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("tofu"))).not.toBeNull();
    for (const scenario of [
      { name: "ry180", ry: Math.PI }, { name: "winding-and-precision", ry: Math.PI * 2.5, x: 1234.56789 },
      { name: "ordinary-curves", ry: 0.3 }, { name: "positive-source-distance", distance: 12 },
      { name: "zero-source-distance", distance: 0 },
    ]) {
      await importCamera(page, cameraTrack(scenario));
      const states = [await snapshot(page)];
      for (let i = 0; i < 3; i++) {
        await input(page, "ry").press("Enter");
        await page.locator("#btn-bone-keyframe").click();
        states.push(await snapshot(page));
      }
      observations[scenario.name] = states;
    }
    for (const distance of [-30, 0, 12]) {
      // Constant pose permits a fair seek/play comparison without clock rounding noise.
      const track = cameraTrack({ distance });
      track.positions = [1, 2, 3, 1, 2, 3]; track.rotations = [0.2, 0.4, 0, 0.2, 0.4, 0];
      track.distances = [distance, distance]; track.fovs = [35, 35];
      await importCamera(page, track);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
      const before = await snapshot(page);
      await page.locator("#viewport-seek-play-toggle").click();
      await page.waitForFunction(() => window.mmdModokiE2e.exportProjectState().scene.currentFrame >= 5);
      const playing = await snapshot(page);
      await page.locator("#viewport-seek-play-toggle").click();
      const stopped = await snapshot(page);
      await page.evaluate(() => window.mmdModokiE2e.seekTo(30));
      observations[`playback-${distance}`] = { before, playing, stopped, sought: await snapshot(page) };
    }
  });
});

function boneMotion() {
  return { name: "Authored asymmetric mirror probe", boneTracks: [], morphTracks: [],
    movableBoneTracks: ["センター", "左足ＩＫ", "右足ＩＫ"].map((name, i) => ({ name, frameNumbers: [0, 30],
      positions: [i + 1, i + 2, i + 3, i + 4, i + 5, i + 6],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1], positionInterpolations: Array(24).fill(20),
      rotationInterpolations: Array(8).fill(20), physicsToggles: [1, 1] })),
    propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] } };
}
function normalizedTracks(project, index) {
  return project.keyframes.modelAnimations[index].animation.movableBoneTracks
    .map(track => ({ name: track.name, positions: unpack(track.positions), rotations: unpack(track.rotations),
      positionInterpolations: unpack(track.positionInterpolations), rotationInterpolations: unpack(track.rotationInterpolations) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
test("collect mirrored overwrite and copied motion export observations", async () => {
  await run("motion", async (page, observations, launched) => {
    for (let i = 0; i < 2; i++) expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("body-source"))).not.toBeNull();
    const initial = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    initial.physics.enabled = false;
    initial.keyframes.modelAnimations[0].animation = boneMotion();
    for (const deleted of [false, true]) {
      await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), initial);
      await page.locator("#info-model-select").selectOption("0");
      await menu(page, "edit.selectAllBoneKeys");
      expect(await page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys.length)).toBe(6);
      await menu(page, "edit.copyKeyframe");
      if (deleted) await page.locator("#btn-kf-delete").click();
      await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
      await menu(page, "edit.mirrorPasteKeyframe");
      observations[deleted ? "deleted-first" : "overwrite"] = normalizedTracks(await page.evaluate(() => window.mmdModokiE2e.exportProjectState()), 0);
      observations[deleted ? "deleted-rendered" : "overwrite-rendered"] = await page.evaluate(async () => {
        window.mmdModokiE2e.seekTo(15);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return Object.fromEntries(["センター", "左足ＩＫ", "右足ＩＫ"].map(name => [name, window.mmdModokiE2e.getModelBoneRenderedPosition(0, name)]));
      });
    }
    observations.mirrorResultsEqual = JSON.stringify(observations.overwrite) === JSON.stringify(observations["deleted-first"]);
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), initial);
    await page.locator("#info-model-select").selectOption("0");
    await menu(page, "edit.selectAllBoneKeys"); await menu(page, "edit.copyKeyframe");
    await page.locator("#info-model-select").selectOption("1");
    await menu(page, "edit.pasteKeyframe");
    observations.copied = normalizedTracks(await page.evaluate(() => window.mmdModokiE2e.exportProjectState()), 1);
    for (const extension of ["vmd", "bvmd"]) {
      const path = resolve(launched.tempDir, "user-data", `body-source_motion.${extension}`);
      await menu(page, extension === "vmd" ? "file.exportModelVmd" : "file.exportModelBvmd");
      await expect.poll(() => existsSync(path)).toBe(true);
      const bytes = readFileSync(path);
      observations[extension] = { byteLength: bytes.length, header: bytes.subarray(0, extension === "vmd" ? 25 : 4).toString("ascii") };
    }
  });
});

function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0, sum = 0;
  // Exclude transient editor toasts and the empty-scene message.
  for (let i = Math.floor(a.height * 0.22) * a.width * 4; i < Math.floor(a.height * 0.85) * a.width * 4; i += 4) {
    const delta = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c])));
    if (delta > 8) changed++;
    sum += delta;
  }
  return { changedPixels: changed, meanMaxRgbDifference: sum / (a.width * a.height) };
}
for (const backend of ["classic", "frameGraph"]) test(`collect visibility, shadow and top-view observations (${backend})`, async () => {
  test.setTimeout(180000);
  await run(`visibility-${backend}`, async (page, observations) => {
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    state.physics.enabled = false; state.viewport.skydomeVisible = false;
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("tofu"))).not.toBeNull();
    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);
    await input(page, "ty").fill("4"); await input(page, "ty").press("Enter");
    await page.evaluate(() => window.mmdModokiE2e.setLightDirection({ x: -0.6, y: -1, z: 0.4 }));
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 12, y: 12, z: -18 }, { x: 0, y: 1, z: 0 }));
    async function capture(name) {
      // Observe the render without selection gizmos changing over the comparison.
      await page.locator("#info-model-select").selectOption("__camera__");
      observations[name] = await probe(page);
      observations[name].shadows = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
      const path = resolve(output, `${backend}-${name}.png`);
      await page.locator("#render-canvas").screenshot({ path, style: screenshotStyle });
      if (await page.locator('#info-model-select option[value="0"]').count()) await page.locator("#info-model-select").selectOption("0");
      return PNG.sync.read(readFileSync(path));
    }
    const visible = await capture("visible");
    await page.locator("#chk-model-shadow").uncheck();
    const visibleNoShadow = await capture("visible-shadow-off");
    observations.obliqueShadowDifference = difference(visible, visibleNoShadow);
    await page.locator("#chk-model-shadow").check();
    await page.locator("#chk-model-visibility").uncheck();
    const hidden = await capture("hidden");
    await page.locator("#chk-model-shadow").uncheck();
    const noShadow = await capture("hidden-shadow-off");
    observations.hiddenShadowDifference = difference(hidden, noShadow);
    await page.locator("#chk-model-visibility").check();
    await page.locator("#chk-model-shadow").check();
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0, y: 25, z: 0 }, { x: 0, y: 0, z: 0 }));
    const topShadow = await capture("top-shadow-on");
    await page.locator("#chk-model-shadow").uncheck();
    const topNoShadow = await capture("top-shadow-off");
    observations.topShadowDifference = difference(topShadow, topNoShadow);
    const mirror = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    mirror.viewport.mirroringFloorEnabled = true; mirror.viewport.mirroringFloorReflectance = 0.9;
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), mirror);
    await page.locator("#info-model-select").selectOption("0");
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 12, y: 8, z: -18 }, { x: 0, y: 0, z: 0 }));
    await capture("mirror-visible");
    await page.locator("#chk-model-visibility").uncheck();
    const mirrorHidden = await capture("mirror-hidden");
    const empty = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    empty.scene.models = []; empty.keyframes.modelAnimations = [];
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), empty);
    const mirrorEmpty = await capture("mirror-empty");
    observations.mirrorHiddenDifference = difference(mirrorHidden, mirrorEmpty);
  }, backend);
});

for (const backend of ["classic", "frameGraph"]) test(`collect AA checker observations (${backend})`, async () => {
  await run(`aa-${backend}`, async (page, observations) => {
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
    state.viewport.backgroundDisplayMode = "checker";
    state.effects.glowEnabled = false;
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("tofu"));
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: 0, ry: 0, rz: 17, camDistance: 12 })) {
      await input(page, key).fill(String(value)); await input(page, key).press("Enter");
    }
    for (const enabled of [false, true]) {
      const current = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      current.viewport.antialiasEnabled = enabled;
      await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), current);
      observations[String(enabled)] = { runtime: await probe(page), project: await page.evaluate(() => window.mmdModokiE2e.exportProjectState()) };
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${backend}-checker-aa-${enabled}.png`), style: screenshotStyle });
      const directory = resolve(output, `${backend}-aa-${enabled}`); mkdirSync(directory, { recursive: true });
      observations[String(enabled)].png = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360), directory);
    }
  }, backend);
});

async function drop(page, path) {
  await page.evaluate(() => {
    const node = document.createElement("input"); node.type = "file"; node.id = "repro-drop"; node.hidden = true;
    document.body.append(node);
  });
  await page.locator("#repro-drop").setInputFiles(path);
  const transfer = await page.evaluateHandle(() => {
    const node = document.getElementById("repro-drop"), transfer = new DataTransfer();
    transfer.items.add(node.files[0]); node.remove(); return transfer;
  });
  await page.locator("#render-canvas").dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
}
test("collect morph-only drop, locale and accessory numeric observations", async () => {
  test.setTimeout(180000);
  await run("ui", async (page, observations, launched) => {
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("expression-test"));
    for (const camera of [false, true]) {
      const path = resolve(launched.tempDir, camera ? "camera-expression.vmd" : "expression.vmd");
      writeFileSync(path, createMorphVmd());
      await page.locator("#info-model-select").selectOption(camera ? "__camera__" : "0");
      await drop(page, path);
      await expect.poll(() => page.locator(".toast").allTextContents()).toContainEqual(expect.stringMatching(/motion|VMD|camera|表情|モーション/i));
      // Await completion through the loaded track, not just the initial loading toast.
      if (!camera) await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().some(track => track.category === "morph" && track.frames.includes(30)))).toBe(true);
      observations[camera ? "camera-named-morph-drop" : "model-morph-drop"] = {
        toasts: await page.locator(".toast").allTextContents(), state: await page.evaluate(() => window.mmdModokiE2e.exportProjectState()),
      };
    }
    await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), resolve(root, "test/fixtures/accessory/tofu.x"));
    const accessoryX = page.locator("#accessory-pos-x");
    await accessoryX.fill("1234.56789"); await accessoryX.press("Enter");
    observations.accessory = { input: await accessoryX.inputValue(), range: await accessoryX.evaluate(node => ({ min: node.min, max: node.max })),
      transform: await page.evaluate(() => window.mmdModokiE2e.getAccessoryTransform(0)) };
    await page.locator("#btn-toggle-shader-panel").click();
    for (const locale of ["en", "zh-Hant", "zh-Hans", "ko"]) {
      await page.locator("#toolbar-locale-select").selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      observations[locale] = await page.locator("#shader-panel").innerText();
      await page.screenshot({ path: resolve(output, `locale-${locale}.png`) });
    }
  });
});

test("collect same-path toon texture reload observations", async () => {
  const directory = resolve(output, "texture-fixture"); mkdirSync(directory, { recursive: true });
  const path = resolve(directory, "texture-reload.pmx"), texture = resolve(directory, "reload-color.bmp");
  await run("texture", async (page, observations) => {
    const model = createTofuModel(); model.toonTexture = "reload-color.bmp";
    writeFileSync(path, writePmx(model)); writeFileSync(texture, createSwatchBmp([255, 0, 0]));
    const blank = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
    observations.before = await page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).textures());
    writeFileSync(texture, createSwatchBmp([0, 0, 255]));
    observations.diskBgrAfter = [...readFileSync(texture).subarray(54, 57)];
    await page.evaluate(blank => window.mmdModokiE2e.importProjectState(blank), blank);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
    observations.after = await page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).textures());
  });
  await run("texture-fresh-process", async (page, observations) => {
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
    observations.fresh = await page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).textures());
  });
});

for (const backend of ["classic", "frameGraph"]) test(`collect hidden Luminous observations (${backend})`, async () => {
  test.setTimeout(180000);
  await run(`luminous-${backend}`, async (page, observations) => {
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
    state.viewport.backgroundDisplayMode = "black";
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture("tofu"));
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: 12 })) {
      await input(page, key).fill(String(value)); await input(page, key).press("Enter");
    }
    await page.locator("#info-model-select").selectOption("0");
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-all").click();
    await page.locator('[data-effect-tab="post"]').click();
    if (backend === "classic") {
      // The GUI post-stack editor is FrameGraph-only. Restore the supported Classic setting.
      await page.evaluate(async () => {
        const state = window.mmdModokiE2e.exportProjectState(); state.effects.glowEnabled = true;
        await window.mmdModokiE2e.importProjectState(state);
      });
    } else if (!await page.locator('[data-effect-stack-row="luminous"]').count()) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="luminous"]').click();
    }
    await page.locator("#info-model-select").selectOption("0");
    async function capture(name) {
      observations[name] = await probe(page);
      const path = resolve(output, `${backend}-luminous-${name}.png`);
      await page.locator("#render-canvas").screenshot({ path, style: screenshotStyle });
      return PNG.sync.read(readFileSync(path));
    }
    const visible = await capture("visible");
    await page.locator("#chk-model-visibility").uncheck();
    const hidden = await capture("hidden");
    if (backend === "classic") {
      await page.evaluate(async () => {
        const state = window.mmdModokiE2e.exportProjectState(); state.effects.glowEnabled = false;
        await window.mmdModokiE2e.importProjectState(state);
      });
    } else await page.locator('[data-effect-stack-toggle="luminous"]').uncheck();
    const disabled = await capture("hidden-effect-off");
    observations.visibleControl = difference(visible, hidden);
    observations.hiddenEffectDifference = difference(hidden, disabled);
  }, backend);
});
