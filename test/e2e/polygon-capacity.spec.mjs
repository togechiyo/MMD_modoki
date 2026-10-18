import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, totalmem } from "node:os";
import { launchMmdModoki } from "./electron-app.mjs";
import { PNG } from "playwright-core/lib/utilsBundle";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const run = process.env.MMD_CAPACITY_RUN ?? String(Date.now());
const counts = (process.env.MMD_CAPACITY_COUNTS ?? "1000000,10000000").split(",").map(Number);
for (const triangles of counts) test(`profiles a ${triangles} triangle static PMX stage with shadows`, async () => {
  test.skip(process.env.MMD_CAPACITY_BENCHMARK !== "1", "Opt-in local GPU and large generated fixture benchmark");
  test.setTimeout(600_000);
  const stage = resolve(root, "local-references/polygon-capacity", `stage-${triangles}.pmx`);
  test.skip(!existsSync(stage), "Generate the local fixture first; never read private models");
  const output = resolve(root, "artifacts/e2e/polygon-capacity", run, String(triangles));
  mkdirSync(output, { recursive: true });
  const report = { started: new Date().toISOString(), fixture: JSON.parse(readFileSync(`${stage}.json`, "utf8")),
    hardware: { cpu: cpus()[0].model, systemMemoryBytes: totalmem() }, errors: [], memory: [], status: "starting" };
  const save = () => writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  const launched = await launchMmdModoki(root);
  let memoryTimer;
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("crash", () => { report.rendererCrashed = true; save(); });
    report.hardware.gpu = await launched.app.evaluate(async ({ app }) => app.getGPUInfo("basic"));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      project.viewport.groundVisible = false; project.viewport.skydomeVisible = false;
      project.viewport.antialiasEnabled = false; project.viewport.mirroringFloorEnabled = false;
      for (const key of Object.keys(project.effects)) if (key.endsWith("Enabled")) project.effects[key] = false;
      project.effects.frameGraphPostEnabled = false; project.effects.frameGraphPostStack = [];
      project.effects.modelEdgeWidth = 0;
      project.lighting.shadowEnabled = true; project.lighting.shadowMode = "cascaded";
      project.lighting.shadowMaxZ = 10000; project.lighting.shadowDistanceMultiplier = 1;
      project.lighting.shadowPenumbraEnabled = false;
      project.lighting.iblShadowsEnabled = false; project.lighting.characterContactShadowEnabled = false;
      project.lighting.environmentLightingEnabled = false;
      await window.mmdModokiE2e.importProjectState(project);
      window.mmdModokiE2e.setLightDirection({ x: 1, y: -0.6, z: 0.3 });
    });
    const sampleMemory = async () => {
      const metrics = await launched.app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, memory, cpu }) => ({ pid, type, memory, cpu })));
      report.memory.push({ elapsedMs: Date.now() - report.loadStartedMs, metrics }); save();
    };
    report.status = "loading"; report.loadStartedMs = Date.now(); save();
    memoryTimer = setInterval(() => { sampleMemory().catch(() => undefined); }, 2000);
    const loaded = await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stage);
    report.loadMs = Date.now() - report.loadStartedMs;
    if (loaded === null) { report.status = "load-rejected"; return; }
    report.status = "warming"; save();
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0, y: 1500, z: -2100 }, { x: 0, y: 80, z: 0 }));
    await expect(page.locator('#info-model-select option[value="0"]')).toContainText(`stage-${triangles}`);
    const probe = (method, args) => page.evaluate(async ({ method, args }) => (await import("/test/e2e/helpers/polygon-capacity-probe.mjs"))[method](args), { method, args });
    report.state = await probe("capacityState"); save();
    expect(report.state.meshes.reduce((sum, mesh) => sum + mesh.triangles, 0)).toBe(triangles);
    // The PMX loader splits material bands into meshes, duplicating their shared border rows.
    expect(report.state.meshes.reduce((sum, mesh) => sum + mesh.vertices, 0)).toBe(
      (report.fixture.rows + report.fixture.materials) * (report.fixture.columns + 1));
    expect(report.state.engine).toBe("WebGPU");
    expect(report.state.postProcesses).toEqual([]);
    report.settings = await page.evaluate(() => ({ physics: window.mmdModokiE2e.exportProjectState().physics,
      effects: window.mmdModokiE2e.getFrameGraphPostEffectsState(), shadows: window.mmdModokiE2e.getShadowRuntimeDiagnostics() }));
    expect(report.settings.physics.enabled).toBe(false);
    expect(report.settings.effects.enabled).toBe(false);
    expect(report.settings.shadows.lightSamplingEnabled).toBe(true);
    expect(report.settings.shadows.casterCount).toBeGreaterThan(0);
    await probe("profileCapacity", { seconds: 3 });
    report.status = "profiling"; save();
    report.stationary = await probe("profileCapacity", { seconds: 10 }); save();
    report.moving = await probe("profileCapacity", { seconds: 10, moving: true }); save();
    await probe("setCapacityRenderSize", { width: 1920, height: 1080 });
    await probe("profileCapacity", { seconds: 3 });
    report.moving1080p = await probe("profileCapacity", { seconds: 10, moving: true }); save();
    expect(report.moving1080p.renderSize).toEqual([1920, 1080]);
    expect(report.moving1080p.visibleStageTriangles.median).toBe(triangles);
    const on = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: resolve(output, "shadow-on.png"), timeout: 30000 }));
    // A read-only performance run, followed by a test-only shadow-off visual control.
    await probe("setCapacityShadowEnabled", false);
    await probe("profileCapacity", { seconds: 1 });
    const off = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: resolve(output, "shadow-off-control.png"), timeout: 30000 }));
    let darkerPixels = 0;
    for (let i = 0; i < on.data.length; i += 4) if (off.data[i] - on.data[i] > 10) darkerPixels++;
    report.shadowDarkerPixels = darkerPixels;
    expect(darkerPixels).toBeGreaterThan(500);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
    report.status = "rendered";
  } catch (error) {
    report.status = report.rendererCrashed ? "renderer-crashed" : "failed";
    report.failure = String(error); throw error;
  } finally {
    clearInterval(memoryTimer); save();
    console.log(JSON.stringify({ output, status: report.status, loadMs: report.loadMs,
      stationary: report.stationary?.fps, moving: report.moving?.fps, moving1080p: report.moving1080p?.fps, failure: report.failure }));
    await launched.close();
  }
});
