/**
 * MMD modoki - Renderer Entry Point
 * Initializes Babylon.js, babylon-mmd, and all UI components.
 */

import "@babylonjs/loaders/glTF";
import { WebRequest } from "@babylonjs/core/Misc/webRequest";
import "./index.css";
import { MmdManager, type RenderEnginePreference } from "./mmd-manager";
import "./mmd-manager-x-extension";
import { Timeline } from "./timeline";
import { BottomPanel } from "./bottom-panel";
import { UIController } from "./ui-controller";
import { enhanceBottomPanelControls } from "./ui/panel-control-helpers";
import { runPngSequenceExportJob } from "./png-sequence-exporter";
import { PngEncoderWebWorkerPool } from "./output/png-encoder-web-worker-pool";
import { runWebmExportJob } from "./webm-exporter";
import { applyI18nToDom, getLocale, initializeI18n, setLocale, t } from "./i18n";
import { isDebugLogEnabled, logDebug, logError, logInfo, toLogErrorData } from "./app-logger";
import type {
  AppLogData,
  SmokeRendererReadyPayload,
  WebmExportDiagnostics,
  WebmExportPhase,
  WebmExportRequest,
} from "./types";
import { POST_EFFECT_BACKEND_STORAGE_KEY } from "./render/post-effect-backend";

let shaderRequestTraceInstalled = false;

function reportSmokeRendererReady(payload: SmokeRendererReadyPayload): void {
  try {
    window.electronAPI.reportSmokeRendererReady(payload);
  } catch {
    // Smoke reporting must not affect normal editor startup.
  }
}

function reportSmokeRendererFailure(message: string, details?: AppLogData): void {
  try {
    window.electronAPI.reportSmokeRendererFailure({ message, details });
  } catch {
    // Smoke reporting must not affect normal editor startup.
  }
}

function waitAnimationFrames(frameCount: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(0, Math.floor(frameCount));
    const step = (): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      remaining -= 1;
      window.requestAnimationFrame(step);
    };
    step();
  });
}

async function runSmokeLuminousScenario(
  mmdManager: MmdManager,
  modelPath: string,
  pbrMmdLike: boolean,
): Promise<AppLogData> {
  const beforeBackend = mmdManager.getPostEffectBackend();
  const modelInfo = await mmdManager.loadPMX(modelPath);
  if (!modelInfo) {
    throw new Error("Smoke model load returned no model info");
  }

  const shaderStates = mmdManager.getWgslModelShaderStates();
  const modelState = shaderStates.find((model) => model.modelPath === modelPath) ?? shaderStates.at(-1);
  if (!modelState) {
    throw new Error("Smoke model shader state was not found");
  }

  if (pbrMmdLike) {
    await waitAnimationFrames(12);
    if (!mmdManager.setPbrMaterialShaderPreset(
      modelState.modelIndex,
      null,
      "pbr-mmd-like",
    )) {
      throw new Error("PBR MMD Like could not be assigned to all materials");
    }
    await waitAnimationFrames(6);
    const mmdLike = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    if (mmdLike.materialCount !== 0 || mmdLike.configurationEnabled) {
      throw new Error(`PBR MMD Like no longer matches Standard: ${JSON.stringify(mmdLike)}`);
    }
    const skinMaterialKey = modelState.materials[0]?.key ?? null;
    if (!skinMaterialKey || !mmdManager.setPbrMaterialShaderPreset(
      modelState.modelIndex,
      skinMaterialKey,
      "pbr-skin",
    )) {
      throw new Error("PBR Skin could not be assigned for the translucency smoke scenario");
    }
    await waitAnimationFrames(12);
    const skin = mmdManager.getPbrMmdLikeScatteringDiagnostics();
    if (
      skin.materialCount !== 0
      || skin.configurationEnabled
    ) {
      throw new Error(`PBR Skin unexpectedly enabled screen-space scattering: ${JSON.stringify(skin)}`);
    }
    return {
      kind: "pbrSkinTranslucency",
      modelName: modelInfo.name,
      materialCount: modelState.materials.length,
      beforeBackend,
      afterBackend: mmdManager.getPostEffectBackend(),
      mmdLikeMaterialCount: mmdLike.materialCount,
      skinScatteringMaterialCount: skin.materialCount,
      ...skin,
    };
  }

  mmdManager.setWgslMaterialShaderPreset(modelState.modelIndex, null, "wgsl-autoluminous");
  mmdManager.postEffectGlowEnabled = true;
  mmdManager.postEffectGlowIntensity = 1.5;
  mmdManager.postEffectGlowThreshold = 0;
  mmdManager.postEffectGlowKernel = 64;
  mmdManager.setFrameGraphPostEffectStackIds(["luminous"]);

  await waitAnimationFrames(12);

  return {
    kind: "frameGraphLuminous",
    modelName: modelInfo.name,
    materialCount: modelState.materials.length,
    beforeBackend,
    afterBackend: mmdManager.getPostEffectBackend(),
    frameGraphExecutedFrames: mmdManager.getFrameGraphPostEffectsExecutedFrameCount(),
    luminousMaskSubMeshes: mmdManager.getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(),
    glowEnabled: mmdManager.postEffectGlowEnabled,
    glowIntensity: mmdManager.postEffectGlowIntensity,
    glowThreshold: mmdManager.postEffectGlowThreshold,
    glowKernel: mmdManager.postEffectGlowKernel,
  };
}

function isLikelyShaderRequestUrl(url: string): boolean {
  return /\.((vertex|fragment)\.fx|fx)(\?|$)/i.test(url)
    || /\/Shaders(WGSL)?\//i.test(url)
    || /shader/i.test(url);
}

function installShaderRequestTrace(): void {
  if (shaderRequestTraceInstalled) return;
  shaderRequestTraceInstalled = true;

  const originalOpen = WebRequest.prototype.open;
  const originalSend = WebRequest.prototype.send;

  WebRequest.prototype.open = function(method: string, url: string): void {
    if (isLikelyShaderRequestUrl(url)) {
      logDebug("shader", "shader request started", { method, url });
    }
    originalOpen.call(this, method, url);
  };

  WebRequest.prototype.send = function(body?: XMLHttpRequestBodyInit | Document | null): void {
    const request = this as WebRequest & { __mmdShaderTraceAttached?: boolean };
    if (!request.__mmdShaderTraceAttached && isLikelyShaderRequestUrl(this.requestURL)) {
      request.__mmdShaderTraceAttached = true;
      this.addEventListener("load", () => {
        const contentType = this.getResponseHeader("content-type") || "";
        const responseText = typeof this.responseText === "string" ? this.responseText.trimStart() : "";
        const preview = responseText.slice(0, 120);
        const looksLikeHtml = preview.startsWith("<!doctype html") || preview.startsWith("<html");
        if (this.status >= 400 || looksLikeHtml || /text\/html/i.test(contentType)) {
          logError("shader", "suspicious shader response", {
            url: this.requestURL,
            status: this.status,
            statusText: this.statusText,
            contentType,
            preview,
          });
        } else {
          logDebug("shader", "shader response received", {
            url: this.requestURL,
            status: this.status,
            contentType,
          });
        }
      });
      this.addEventListener("error", () => {
        logError("shader", "shader request network error", {
          url: this.requestURL,
          status: this.status,
          statusText: this.statusText,
        });
      });
    }
    originalSend.call(this, body);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  if (isDebugLogEnabled("shaderTrace")) {
    installShaderRequestTrace();
  }
  initializeI18n(document);
  window.addEventListener("error", (event) => {
    logError("renderer", "uncaught renderer error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      ...toLogErrorData(event.error),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("renderer", "unhandled renderer rejection", toLogErrorData(event.reason));
  });
  window.mmdI18n = {
    getLocale: () => getLocale(),
    setLocale: (locale) => {
      setLocale(locale);
    },
    apply: () => {
      applyI18nToDom(document);
    },
  };
  void initializeApp();
});

async function initializeApp(): Promise<void> {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode");
  const rendererBackendParam = searchParams.get("rendererBackend");
  const rendererBackend: RenderEnginePreference =
    rendererBackendParam === "webgpu" || rendererBackendParam === "webgl2"
      ? rendererBackendParam
      : "auto";
  const smokeModelPath = searchParams.get("smokeModelPath");
  const smokeHdrPath = searchParams.get("smokeHdrPath");
  const smokePbrMmdLike = searchParams.get("smokePbrMmdLike") === "1";
  const smokeRenderStabilityDiagnostics =
    searchParams.get("smokeRenderStabilityDiagnostics") === "1";
  logInfo("renderer", "initialize app", {
    mode: mode ?? "editor",
    rendererBackend,
  });
  if (mode === "exporter") {
    await initializePngSequenceExporter(searchParams);
    return;
  }
  if (mode === "webm-exporter") {
    await initializeWebmExporter(searchParams);
    return;
  }
  enhanceBottomPanelControls(document);
  if (smokeRenderStabilityDiagnostics) {
    try {
      localStorage.setItem("mmd_modoki.debug.renderStability", "1");
    } catch {
      // Smoke can continue and report renderer health if storage is unavailable.
    }
  }
  if (smokeModelPath) {
    try {
      localStorage.setItem(POST_EFFECT_BACKEND_STORAGE_KEY, "frameGraph");
    } catch {
      // Smoke should still report the actual backend if storage is unavailable.
    }
  }

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
  if (!canvas) {
    logError("renderer", "render canvas is missing");
    reportSmokeRendererFailure("Canvas not found");
    return;
  }

  try {
    const mmdManager = await MmdManager.create(canvas, rendererBackend);
    if (smokeHdrPath) {
      const loaded = await mmdManager.setEnvironmentLightingSourcePath(smokeHdrPath);
      if (!loaded) {
        throw new Error(`Smoke HDR load failed: ${smokeHdrPath}`);
      }
    }
    if (smokePbrMmdLike) {
      mmdManager.setMmdMaterialPipelinePreset("pbr-standard");
    }
    let smokeWebGpuFailureReported = false;
    if (smokeRenderStabilityDiagnostics) {
      const reportWebGpuFailure = (message: string): void => {
        if (smokeWebGpuFailureReported) return;
        smokeWebGpuFailureReported = true;
        reportSmokeRendererFailure("WebGPU validation error", { message });
      };
      mmdManager.onWebGpuValidationError = reportWebGpuFailure;
      const existingDiagnostics = mmdManager.getWebGpuValidationDiagnostics();
      if (existingDiagnostics.count > 0) {
        reportWebGpuFailure(existingDiagnostics.messages[0] ?? "Unknown WebGPU validation error");
        return;
      }
    }
    await mmdManager.waitForPhysicsInitialization();
    window.mmdModokiDiagnostics = {
      dumpPerformanceSnapshot: () => mmdManager.dumpPerformanceSnapshot(),
    };
    window.mmdModokiDebug = {
      enableAlphaTextureView: () => mmdManager.enableAlphaTextureDebugView(),
      disableAlphaTextureView: () => mmdManager.disableAlphaTextureDebugView(),
    };
    const engine = mmdManager.getEngineType();
    const physicsBackend = mmdManager.getPhysicsBackendLabel();
    const physicsEvaluationType = mmdManager.getPhysicsEvaluationTypeLabel();
    logInfo("renderer", "MmdManager initialized", {
      engine,
      physicsBackend,
      physicsEvaluationType,
    });
    const timeline = new Timeline(
      "timeline-canvas",
      "timeline-tracks-scroll",
      "timeline-label-canvas",
      "timeline-labels"
    );
    const bottomPanel = new BottomPanel();
    bottomPanel.setMmdManager(mmdManager);

    const uiController = new UIController(mmdManager, timeline, bottomPanel);
    if (new URLSearchParams(window.location.search).get("e2e") === "1") {
      window.mmdModokiE2e = {
        exportProjectState: () => mmdManager.exportProjectState(),
        importProjectState: (project) => mmdManager.importProjectState(project),
        loadModel: (filePath) => mmdManager.loadPMX(filePath),
        loadModelInteractively: (filePath) => uiController.loadModelInteractively(filePath),
        loadAccessory: (filePath) => uiController.loadAccessoryFromPath(filePath),
        getTimelineSelection: () => {
          const activeTrack = timeline.getSelectedTrack();
          return {
            activeTrack: activeTrack
              ? { category: activeTrack.category, name: activeTrack.name }
              : null,
            activeFrame: timeline.getSelectedFrame(),
            selectedKeys: timeline.getSelectedKeys(),
            headerSelection: timeline.getHeaderSelection(),
          };
        },
        getTimelineTracks: () => timeline.getKeyframeTracks().map((track) => ({
          category: track.category,
          name: track.name,
          frames: Array.from(track.frames),
        })),
        getCommandHistoryState: () => uiController.getCommandHistoryStateForE2e(),
        nudgeTimelineSelection: (deltaFrames) => uiController.nudgeTimelineSelectionForE2e(deltaFrames),
        getShadowRuntimeDiagnostics: () => ({
          ...mmdManager.getShadowRuntimeDiagnostics(),
          engine: mmdManager.getEngineType(),
        }),
        getAccessoryMaterialDiagnostics: () => mmdManager.getAccessoryMeshes().map((mesh) => {
          const material = mesh.material as unknown as {
            name?: string;
            getClassName?: () => string;
            diffuseTexture?: {
              url?: string;
              isReady?: () => boolean;
            } | null;
            toonTexture?: {
              name?: string;
              isReady?: () => boolean;
            } | null;
          } | null;
          const texture = material?.diffuseTexture ?? null;
          return {
            mesh: mesh.name,
            hasUvs: mesh.isVerticesDataPresent("uv"),
            materialName: material?.name ?? null,
            materialClassName: material?.getClassName?.() ?? null,
            diffuseTextureUrl: texture?.url ?? null,
            diffuseTextureReady: texture?.isReady?.() ?? false,
            toonTextureName: material?.toonTexture?.name ?? null,
            toonTextureReady: material?.toonTexture?.isReady?.() ?? false,
          };
        }),
        getAccessoryVertexBufferDiagnostics: () => mmdManager.getAccessoryMeshes().map((mesh) => ({
          mesh: mesh.name,
          bounds: (() => {
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            return {
              min: { x: box.minimumWorld.x, y: box.minimumWorld.y, z: box.minimumWorld.z },
              max: { x: box.maximumWorld.x, y: box.maximumWorld.y, z: box.maximumWorld.z },
            };
          })(),
          buffers: Object.entries(mesh.geometry?.getVertexBuffers() ?? {}).map(([kind, buffer]) => ({
            kind,
            byteStride: buffer.byteStride,
            effectiveByteStride: buffer.effectiveByteStride,
            byteOffset: buffer.byteOffset,
            effectiveByteOffset: buffer.effectiveByteOffset,
            size: buffer.getSize(),
          })),
        })),
        getLoadedModelCount: () => mmdManager.getLoadedModels().length,
        getModelBoneRenderedPosition: (modelIndex, boneName) => (
          mmdManager.getModelBoneRenderedPosition(modelIndex, boneName)
        ),
        getBoneGizmoPosition: () => mmdManager.getBoneGizmoPosition(),
        getActiveModelIndex: () => (
          mmdManager.getLoadedModels().find((model) => model.active)?.index ?? null
        ),
        getActiveBoneTransform: (boneName) => mmdManager.getBoneTransform(boneName),
        setBoneGizmoRotationDrag: (rotation, dragging) => (
          mmdManager.setBoneGizmoRotationDragForE2e(rotation, dragging)
        ),
        getModelExternalParent: (modelIndex) => mmdManager.getModelExternalParent(modelIndex),
        getCameraExternalParent: () => mmdManager.getCameraExternalParent(),
        getCameraTarget: () => mmdManager.getCameraTarget(),
        getCameraPosition: () => mmdManager.getCameraPosition(),
        setFullyDampedPhysicsCompatibilityCorrection: (enabled, gravityAmount) => {
          mmdManager.setFullyDampedRigidBodyGravityCorrectionAmount(gravityAmount);
          return mmdManager.setFullyDampedRigidBodyCorrectionEnabled(enabled);
        },
        setCameraPose: (position, target) => {
          mmdManager.setCameraPosition(position.x, position.y, position.z);
          mmdManager.setCameraTarget(target.x, target.y, target.z);
        },
        setLightDirection: (direction) => {
          mmdManager.setLightDirection(direction.x, direction.y, direction.z);
        },
        setRingParticleSettings: (settings) => mmdManager.setRingParticleSettings(settings),
        getRingParticleSettings: () => mmdManager.getRingParticleSettings(),
        seekTo: (frame) => mmdManager.seekTo(frame),
        getCameraKeyframePose: () => mmdManager.getCameraKeyframePose(),
        getFrameGraphPostEffectsState: () => ({
          backend: mmdManager.getPostEffectBackend(),
          ready: mmdManager.isPostEffectBackendReadyForCapture(),
          executedFrameCount: mmdManager.getFrameGraphPostEffectsExecutedFrameCount(),
          oceanWaveFieldReady: mmdManager.isFrameGraphOceanWaveFieldReady(),
          oceanVolumeReady: mmdManager.isFrameGraphOceanVolumeReady(),
          oceanSurfaceReady: mmdManager.isFrameGraphOceanSurfaceReady(),
          stack: [...mmdManager.getFrameGraphPostEffectRuntimeOrder()],
        }),
        getWebGpuValidationDiagnostics: () => (
          mmdManager.getWebGpuValidationDiagnostics()
        ),
        captureExportSurfaceProbe: async (width, height) => {
          mmdManager.setAutoRenderEnabled(false);
          mmdManager.postEffectExposure = 1.05;
          const surface = mmdManager.prepareExportRenderSurface(width, height);
          const ready = await mmdManager.waitForPostEffectBackendReadyForCapture();
          mmdManager.renderOnceForCapture(0);
          const frame = await mmdManager.readExportRenderFrameAsync();
          let nonZeroByteCount = 0;
          let nonZeroRgbByteCount = 0;
          let pixelChecksum = 2166136261;
          for (let index = 0; index < frame.pixels.length; index += 1) {
            pixelChecksum = Math.imul(pixelChecksum ^ frame.pixels[index], 16777619);
            if (frame.pixels[index] !== 0) {
              nonZeroByteCount += 1;
              if (index % 4 !== 3) nonZeroRgbByteCount += 1;
            }
          }
          return {
            backend: mmdManager.getPostEffectBackend(),
            ready,
            width: frame.width,
            height: frame.height,
            byteLength: frame.pixels.byteLength,
            nonZeroByteCount,
            nonZeroRgbByteCount,
            pixelChecksum: pixelChecksum >>> 0,
            format: frame.format,
            rowOrder: frame.rowOrder,
            surfaceFormat: surface.format,
            readbackCount: mmdManager.getExportRenderSurfaceDiagnostics()?.readbackCount ?? 0,
          };
        },
        captureSinglePngSurfaceToPath: async (outputDirectoryPath, width, height) => {
          const frame = await mmdManager.capturePngRgbaData({ width, height });
          if (!frame) {
            throw new Error("Single PNG RGBA surface capture failed");
          }
          const encoderPool = new PngEncoderWebWorkerPool({ size: 1 });
          try {
            const encoded = await encoderPool.encode(frame.rgbaData, frame.width, frame.height);
            const saved = await window.electronAPI.savePngBytesFileToPath(
              encoded.pngBuffer,
              outputDirectoryPath,
              "single_rgba_surface_e2e.png",
            );
            if (!saved) {
              throw new Error("Single PNG RGBA surface save failed");
            }
            return {
              path: saved.path,
              byteLength: saved.byteLength,
              width: frame.width,
              height: frame.height,
              surfaceReleased: mmdManager.getExportRenderSurfaceDiagnostics() === null,
            };
          } finally {
            encoderPool.terminate();
          }
        },
      };
    }
    let environmentLightingProbe: Awaited<ReturnType<typeof mmdManager.runEnvironmentLightingDiagnosticProbe>> | undefined;
    let environmentLightingDiagnostics: ReturnType<typeof mmdManager.getEnvironmentLightingDiagnostics> | undefined;
    if (smokeRenderStabilityDiagnostics) {
      const diagnostics = mmdManager.getWebGpuValidationDiagnostics();
      if (diagnostics.count > 0) {
        if (!smokeWebGpuFailureReported) {
          smokeWebGpuFailureReported = true;
          reportSmokeRendererFailure("WebGPU validation error", {
            count: diagnostics.count,
            messages: diagnostics.messages,
          });
        }
        return;
      }
      const environmentLightingWasEnabled = mmdManager.isEnvironmentLightingEnabled();
      mmdManager.setEnvironmentLightingEnabled(true);
      const environmentDiagnostics = mmdManager.getEnvironmentLightingDiagnostics();
      environmentLightingDiagnostics = environmentDiagnostics;
      mmdManager.setEnvironmentLightingEnabled(environmentLightingWasEnabled);
      if (
        !environmentDiagnostics.textureReady
        || !environmentDiagnostics.hasSphericalPolynomial
      ) {
        reportSmokeRendererFailure("Environment lighting is not PBR-ready", {
          environmentDiagnostics,
        });
        return;
      }
      if (smokeHdrPath && (
        !environmentDiagnostics.backgroundVisible
        || !environmentDiagnostics.backgroundTextureReady
        || !environmentDiagnostics.backgroundMeshEnabled
        || environmentDiagnostics.environmentTextureSize.width < 1024
        || environmentDiagnostics.backgroundTextureSize.width < 1024
      )) {
        reportSmokeRendererFailure("External HDR background is not ready", {
          environmentDiagnostics,
        });
        return;
      }
      mmdManager.setEnvironmentLightingEnabled(true);
      environmentLightingProbe = await mmdManager.runEnvironmentLightingDiagnosticProbe();
      mmdManager.setEnvironmentLightingEnabled(environmentLightingWasEnabled);
      if (!environmentLightingProbe.passed) {
        reportSmokeRendererFailure("Environment lighting did not affect synthetic PBR output", {
          environmentDiagnostics,
          environmentLightingProbe,
        });
        return;
      }
    }
    const scenario = smokeModelPath
      ? await runSmokeLuminousScenario(mmdManager, smokeModelPath, smokePbrMmdLike)
      : undefined;
    reportSmokeRendererReady({
      engine,
      physicsBackend,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
      environmentLightingProbe,
      environmentLightingDiagnostics,
      scenario,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("renderer", "failed to initialize MMD_modoki", toLogErrorData(err));
    reportSmokeRendererFailure(message, toLogErrorData(err));

    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = t("error.initializationFailed");
    }

    const overlay = document.getElementById("viewport-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const title = overlay.querySelector("p");
      const hint = overlay.querySelector(".hint-text");
      if (title) title.textContent = t("error.initializationFailed");
      if (hint) hint.textContent = t("error.details", { message });
    }
  }
}

async function initializePngSequenceExporter(searchParams: URLSearchParams): Promise<void> {
  document.body.classList.add("exporter-mode");

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const busyOverlay = document.getElementById("ui-busy-overlay");
  const busyText = document.getElementById("ui-busy-text");
  const viewportOverlay = document.getElementById("viewport-overlay");
  const statusText = document.getElementById("status-text");

  let documentTitlePrefix = "PNG Export";
  const setStatus = (message: string): void => {
    if (statusText) statusText.textContent = message;
    if (busyText) busyText.textContent = message;
    document.title = `${documentTitlePrefix} - ${message}`;
  };

  const closeExporterWindowSoon = (): void => {
    window.setTimeout(() => {
      window.close();
    }, 300);
  };

  if (!canvas) {
    logError("render", "PNG sequence exporter canvas is missing");
    setStatus("Canvas not found");
    closeExporterWindowSoon();
    return;
  }

  if (viewportOverlay) {
    viewportOverlay.classList.add("hidden");
  }
  if (busyOverlay) {
    busyOverlay.classList.remove("hidden");
    busyOverlay.setAttribute("aria-hidden", "false");
  }

  const jobId = searchParams.get("jobId");
  if (!jobId) {
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  try {
    const request = await window.electronAPI.takePngSequenceExportJob(jobId);
    if (!request) {
      setStatus("Export job is unavailable");
      closeExporterWindowSoon();
      return;
    }
    documentTitlePrefix = request.exportKind === "single" ? "PNG Export" : "PNG Sequence Export";

    let lastProgressReportAt = 0;
    const rendererBackendParam = searchParams.get("rendererBackend");
    const rendererBackend: RenderEnginePreference =
      rendererBackendParam === "webgpu" || rendererBackendParam === "webgl2"
        ? rendererBackendParam
        : "auto";
    const result = await runPngSequenceExportJob(canvas, request, {
      onStatus: (message) => {
        setStatus(message);
      },
      onProgress: (saved, total, frame, captured) => {
        setStatus(`Exporting... ${saved}/${total} (frame ${frame})`);
        const now = performance.now();
        if (saved === total || now - lastProgressReportAt >= 200) {
          lastProgressReportAt = now;
          window.electronAPI.reportPngSequenceExportProgress({
            jobId,
            saved,
            captured,
            total,
            frame,
            startFrame: request.startFrame,
            endFrame: request.endFrame,
            exportKind: request.exportKind ?? "sequence",
          });
        }
      },
      onCompleted: async (completed) => {
        await window.electronAPI.completePngSequenceExport({
          jobId,
          saved: completed.exportedFrames,
          captured: completed.diagnostics.frameCount,
          total: completed.totalFrames,
          frame: request.endFrame,
          startFrame: request.startFrame,
          endFrame: request.endFrame,
          exportKind: request.exportKind ?? "sequence",
          diagnostics: completed.diagnostics,
        });
      },
    }, rendererBackend, {
      encoderMode: searchParams.get("pngEncoder") === "main" ? "main" : "renderer-worker",
    });

    setStatus(`Done: ${result.exportedFrames} frame(s)`);
    closeExporterWindowSoon();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("render", "PNG sequence export failed", {
      jobId,
      ...toLogErrorData(err),
    });
    setStatus(`Export failed: ${message}`);
    closeExporterWindowSoon();
  }
}

async function initializeWebmExporter(searchParams: URLSearchParams): Promise<void> {
  document.body.classList.add("exporter-mode");

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const busyOverlay = document.getElementById("ui-busy-overlay");
  const busyText = document.getElementById("ui-busy-text");
  const viewportOverlay = document.getElementById("viewport-overlay");
  const statusText = document.getElementById("status-text");

  const setStatus = (message: string): void => {
    if (statusText) statusText.textContent = message;
    if (busyText) busyText.textContent = message;
    document.title = `WebM Export - ${message}`;
  };

  const closeExporterWindowSoon = (): void => {
    window.setTimeout(() => {
      window.close();
    }, 300);
  };

  if (!canvas) {
    logError("webm", "exporter canvas is missing");
    setStatus("Canvas not found");
    closeExporterWindowSoon();
    return;
  }

  if (viewportOverlay) {
    viewportOverlay.classList.add("hidden");
  }
  if (busyOverlay) {
    busyOverlay.classList.remove("hidden");
    busyOverlay.setAttribute("aria-hidden", "false");
  }

  const jobId = searchParams.get("jobId");
  if (!jobId) {
    logError("webm", "export job id is missing");
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  let request: WebmExportRequest | null = null;

  try {
    request = await window.electronAPI.takeWebmExportJob(jobId);
    if (!request) {
      logError("webm", "export job is unavailable", { jobId });
      setStatus("Export job is unavailable");
      closeExporterWindowSoon();
      return;
    }

    canvas.style.width = `${request.outputWidth}px`;
    canvas.style.height = `${request.outputHeight}px`;
    canvas.width = request.outputWidth;
    canvas.height = request.outputHeight;

    let lastProgressReportAt = 0;
    let lastPhase = "initializing";
    let lastMessage = "";
    let encodedFrames = 0;
    let capturedFrames = 0;
    let currentFrame = request.startFrame;
    const totalOutputFrames = Math.max(1, Math.round(((request.endFrame - request.startFrame + 1) / 30) * Math.max(1, request.fps || 30)));
    logInfo("webm", "exporter job accepted", {
      jobId,
      startFrame: request.startFrame,
      endFrame: request.endFrame,
      fps: request.fps,
      outputWidth: request.outputWidth,
      outputHeight: request.outputHeight,
      includeAudio: request.includeAudio === true,
      preferredVideoCodec: request.preferredVideoCodec,
      queueLimit: request.diagnosticQueueLimit ?? 16,
    });
    const emitWebmProgress = (
      phase: string,
      message: string,
      force = false,
      diagnostics?: WebmExportDiagnostics,
    ): void => {
      const now = performance.now();
      const shouldReport = force || now - lastProgressReportAt >= 1000;
      if (!shouldReport) return;
      lastProgressReportAt = now;
      window.electronAPI.reportWebmExportProgress({
        jobId,
        phase: phase as WebmExportPhase,
        encoded: encodedFrames,
        total: totalOutputFrames,
        frame: currentFrame,
        startFrame: request.startFrame,
        endFrame: request.endFrame,
        captured: capturedFrames,
        message,
        timestampMs: Date.now(),
        diagnostics,
      });
    };

    const rendererBackendParam = searchParams.get("rendererBackend");
    const rendererBackend: RenderEnginePreference =
      rendererBackendParam === "webgpu" || rendererBackendParam === "webgl2"
        ? rendererBackendParam
        : "auto";
    const result = await runWebmExportJob(canvas, request, {
      onStatus: (message, phase) => {
        setStatus(message);
        if (phase !== lastPhase || message !== lastMessage) {
          lastPhase = phase;
          lastMessage = message;
          emitWebmProgress(phase, message, true);
        }
      },
      onProgress: (encoded, total, frame, captured) => {
        encodedFrames = encoded;
        capturedFrames = captured;
        currentFrame = frame;
        const progressMessage = lastPhase === "encoding" && lastMessage
          ? lastMessage
          : `Encoding... ${encoded}/${total} (frame ${frame})`;
        setStatus(progressMessage);
        emitWebmProgress("encoding", progressMessage, encoded === total);
      },
    }, rendererBackend);

    setStatus(`Done: ${result.encodedFrames} frame(s) ${result.codec}`);
    logInfo("webm", "exporter job completed", {
      jobId,
      encodedFrames: result.encodedFrames,
      codec: result.codec,
      diagnostics: result.diagnostics,
    });
    encodedFrames = result.encodedFrames;
    currentFrame = request.endFrame;
    emitWebmProgress(
      "completed",
      `Done: ${result.encodedFrames} frame(s) ${result.codec}`,
      true,
      result.diagnostics,
    );
    setStatus("Completing WebM export job...");
    emitWebmProgress("finishing-job", "Completing WebM export job...", true);
    const finished = await window.electronAPI.finishWebmExportJob(jobId);
    if (!finished) {
      closeExporterWindowSoon();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError("webm", "exporter job failed", {
      jobId,
      ...toLogErrorData(err),
    });
    setStatus(`Export failed: ${message}`);
    window.electronAPI.reportWebmExportProgress({
      jobId,
      phase: "failed",
      encoded: 0,
      total: 0,
      frame: 0,
      startFrame: request?.startFrame ?? 0,
      endFrame: request?.endFrame ?? 0,
      captured: 0,
      message,
      timestampMs: Date.now(),
    });
    const finished = await window.electronAPI.finishWebmExportJob(jobId);
    if (!finished) {
      closeExporterWindowSoon();
    }
  }
}
