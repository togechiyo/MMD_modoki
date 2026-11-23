import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "../test/e2e/electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const width = 1920;
const height = 1080;
const startFrame = 0;
const endFrame = 99;
const fps = 30;
const scenario = process.argv[3] ?? "empty";
const supportedScenarios = new Set(["empty", "tofu-plate-ssgi-dof"]);
if (!supportedScenarios.has(scenario)) {
  throw new Error(`Unsupported benchmark scenario: ${scenario}`);
}
const timeoutMs = scenario === "empty" ? 180_000 : 600_000;
const requestedRuns = Number.parseInt(process.argv[2] ?? "3", 10);
const warmupRuns = Number.parseInt(process.env.BENCH_WARMUP ?? "1", 10);
const runCount = Number.isFinite(requestedRuns)
  ? Math.max(1, Math.min(10, requestedRuns))
  : 3;
const previewOutputPath = process.argv[4]?.trim()
  || process.env.MMD_MODOKI_BENCHMARK_PREVIEW_PATH?.trim()
  || null;
const tofuPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const platePath = resolve(repoRoot, "test/fixtures/external-parent/plate.pmx");

const prepareScenarioProject = async (page) => {
  if (scenario === "empty") {
    return await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  }

  const loaded = await page.evaluate(async ({ tofu, plate }) => {
    const tofuModel = await window.mmdModokiE2e.loadModel(tofu);
    const plateModel = await window.mmdModokiE2e.loadModel(plate);
    return {
      tofu: tofuModel !== null,
      plate: plateModel !== null,
    };
  }, { tofu: tofuPath, plate: platePath });
  if (!loaded.tofu || !loaded.plate) {
    throw new Error(`Representative models failed to load: ${JSON.stringify(loaded)}`);
  }

  const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  project.camera.target = { x: 0, y: 1.4, z: 0 };
  project.camera.rotation = { x: -8, y: -18, z: 0 };
  project.camera.distance = 22;
  project.camera.fov = 30;
  project.viewport.groundVisible = false;
  project.effects.dofEnabled = true;
  project.effects.dofFocusDistanceMm = 22_000;
  project.effects.dofTargetModelPath = tofuPath;
  project.effects.dofTargetBoneName = null;
  project.effects.dofBlurLevel = 2;
  project.effects.dofFocusOffsetMm = 0;
  project.effects.dofNearSuppressionScale = 4;
  project.effects.ssgiStrength = 0.35;
  project.effects.ssgiSampleRadius = 64;
  project.effects.ssgiBlendMode = "softLight";
  project.effects.frameGraphPostStack = [
    { id: "ssgi", enabled: true },
    { id: "dof", enabled: true },
  ];
  return project;
};

const sumPngBytes = (directoryPath) => readdirSync(directoryPath)
  .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
  .reduce((total, fileName) => total + statSync(join(directoryPath, fileName)).size, 0);

const waitForPngSequence = async (page, request) => await page.evaluate(
  async ({ exportRequest, timeout }) => await new Promise((resolvePromise, rejectPromise) => {
    let jobId = "";
    const timeoutHandle = window.setTimeout(() => {
      unsubscribe();
      rejectPromise(new Error(`PNG benchmark timed out after ${timeout} ms`));
    }, timeout);
    const unsubscribe = window.electronAPI.onPngSequenceExportProgress((progress) => {
      if (!jobId || progress.jobId !== jobId || !progress.diagnostics) return;
      window.clearTimeout(timeoutHandle);
      unsubscribe();
      resolvePromise(progress.diagnostics);
    });
    void window.electronAPI.startPngSequenceExportWindow(exportRequest).then((launched) => {
      if (!launched?.jobId) {
        window.clearTimeout(timeoutHandle);
        unsubscribe();
        rejectPromise(new Error("Failed to launch PNG benchmark"));
        return;
      }
      jobId = launched.jobId;
    });
  }),
  { exportRequest: request, timeout: timeoutMs },
);

const launched = await launchMmdModoki(repoRoot);
const results = [];
try {
  const page = await launched.app.firstWindow();
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 240_000 });
  const project = await prepareScenarioProject(page);
  for (let runIndex = 0; runIndex < warmupRuns + runCount; runIndex += 1) {
    const dir = join(launched.tempDir, `png-run-${runIndex}`);
    mkdirSync(dir, { recursive: true });
    const d = await waitForPngSequence(page, {
      project, outputDirectoryPath: dir, startFrame, endFrame, step: 1,
      prefix: `bench_${runIndex}`, fps, precision: 1, outputWidth: width, outputHeight: height,
    });
    const r = { run: runIndex - warmupRuns + 1, warmup: runIndex < warmupRuns, outputBytes: sumPngBytes(dir), ...d };
    results.push(r);
    process.stdout.write(`PNG_RUN=${JSON.stringify({ scenario, encoder: process.env.MMD_MODOKI_PNG_ENCODER ?? "renderer-worker", workersEnv: process.env.MMD_MODOKI_PNG_WORKERS ?? "default", ...r })}\n`);
    await page.waitForTimeout(750);
  }
} finally {
  await launched.close();
}
