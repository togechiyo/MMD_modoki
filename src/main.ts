import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, session, shell, type IpcMainEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import log from 'electron-log/main';
import started from 'electron-squirrel-startup';
import type {
  AppLogData,
  AppLogFileInfo,
  AppLogLevel,
  AppLogScope,
  PngSequenceExportLaunchResult,
  PngSequenceExportProgress,
  PngSequenceExportRequest,
  PngSequenceExportState,
  PngSaveTarget,
  WebmCaptureMode,
  WebmExportLaunchResult,
  WebmExportProgress,
  WebmExportRequest,
  WebmExportState,
  SmokeRendererFailurePayload,
  SmokeRendererReadyPayload,
} from './types';
import { parseMmdModelHeader } from './shared/mmd-model-header';
import type { VmdExportDocument, VmdSaveResult } from './export/vmd-export-document';
import { serializeVmd } from './export/vmd-serializer';
import type { VpdExportDocument, VpdSaveResult } from './export/vpd-export-document';
import { serializeVpd } from './export/vpd-serializer';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
const isSmokeMode = process.env.MMD_MODOKI_SMOKE === '1';
const isE2eMode = process.env.MMD_MODOKI_E2E === '1';
const pngSequenceEncoderMode = process.env.MMD_MODOKI_PNG_ENCODER === 'main'
  ? 'main'
  : 'renderer-worker';
const forcedRendererBackend =
  process.env.MMD_MODOKI_RENDERER === 'webgpu'
  || process.env.MMD_MODOKI_RENDERER === 'webgl2'
    ? process.env.MMD_MODOKI_RENDERER
    : undefined;
if (isSmokeMode && process.env.MMD_MODOKI_SMOKE_USER_DATA_PATH) {
  app.setPath('userData', process.env.MMD_MODOKI_SMOKE_USER_DATA_PATH);
}
if (isE2eMode && process.env.MMD_MODOKI_E2E_USER_DATA_PATH) {
  app.setPath('userData', process.env.MMD_MODOKI_E2E_USER_DATA_PATH);
}
if (isDev) {
  // Keep local file loading behavior while hiding noisy Electron dev warnings.
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

const APP_LOG_NAME = 'MMD_modoki';
const ENABLE_ELECTRON_LOG_CONSOLE = process.env.MMD_MODOKI_CONSOLE_LOG === '1';
const appLogSessionId = `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomUUID().slice(0, 4)}`;

const createLogErrorData = (err: unknown): AppLogData => {
  if (err instanceof Error) {
    return {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    };
  }
  return {
    error: {
      message: String(err),
    },
  };
};

const sanitizeLogText = (value: string): string => {
  if (value.length <= 2000) return value;
  return `${value.slice(0, 2000)}...(truncated)`;
};

const sanitizeLogValue = (value: unknown, key = '', depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/path/i.test(key)) {
      return {
        fileName: path.basename(value),
        extension: path.extname(value).toLowerCase(),
      };
    }
    return sanitizeLogText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return createLogErrorData(value).error;
  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value.slice(0, 20).map((item, index) => sanitizeLogValue(item, String(index), depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 3) return '[object]';
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    return Object.fromEntries(entries.map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogValue(entryValue, entryKey, depth + 1),
    ]));
  }
  return String(value);
};

const sanitizeLogData = (data?: AppLogData): AppLogData | undefined => {
  if (!data) return undefined;
  const sanitized = sanitizeLogValue(data);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return undefined;
  return sanitized as AppLogData;
};

const configureAppLogging = (): void => {
  log.initialize({ preload: false, spyRendererConsole: false });
  log.transports.file.setAppName(APP_LOG_NAME);
  log.transports.file.fileName = isDev ? 'main-dev.log' : 'main.log';
  log.transports.file.level = isDev ? 'debug' : 'info';
  log.transports.file.maxSize = (isDev ? 20 : 5) * 1024 * 1024;
  log.transports.file.resolvePathFn = (variables) => {
    const baseLogDir = process.platform === 'darwin'
      ? path.join(variables.home, 'Library', 'Logs', APP_LOG_NAME)
      : path.join(variables.appData, APP_LOG_NAME, 'logs');
    const logDir = isDev ? path.join(baseLogDir, 'dev') : baseLogDir;
    return path.join(logDir, log.transports.file.fileName);
  };
  log.transports.console.level = ENABLE_ELECTRON_LOG_CONSOLE ? (isDev ? 'debug' : 'info') : false;
  log.scope.defaultLabel = 'main';
};

configureAppLogging();

const writeAppLog = (
  level: AppLogLevel,
  scope: AppLogScope,
  message: string,
  data?: AppLogData,
): void => {
  const scopedLog = log.scope(scope);
  const safeMessage = sanitizeLogText(message);
  const safeData = sanitizeLogData({
    sessionId: appLogSessionId,
    ...(data ?? {}),
  });
  if (safeData) {
    scopedLog[level](safeMessage, safeData);
  } else {
    scopedLog[level](safeMessage);
  }
};

writeAppLog('info', 'main', 'app start', {
  appName: APP_LOG_NAME,
  version: app.getVersion(),
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  isDev,
  isPackaged: app.isPackaged,
});

process.on('uncaughtException', (err) => {
  writeAppLog('error', 'main', 'uncaught exception', createLogErrorData(err));
});

process.on('unhandledRejection', (reason) => {
  writeAppLog('error', 'main', 'unhandled rejection', createLogErrorData(reason));
});

const configureChromiumGpuFlags = (): void => {
  // Apply before app ready so Chromium picks them up for all packaged builds.
  // Raise V8 old-space for heavier model loading and multi-character scenes.
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('force_high_performance_gpu');
  if (process.platform === 'linux' && !isDev) {
    // Temporary workaround for packaged Linux zip builds lacking a working chrome-sandbox setup.
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
  }
};

configureChromiumGpuFlags();

const MAIN_WINDOW_ASPECT_RATIO = 16 / 9;
const MAIN_WINDOW_DEFAULT_WIDTH = 1440;
const MAIN_WINDOW_DEFAULT_HEIGHT = Math.round(MAIN_WINDOW_DEFAULT_WIDTH / MAIN_WINDOW_ASPECT_RATIO);
const MAIN_WINDOW_MIN_WIDTH = 1120;
const MAIN_WINDOW_MIN_HEIGHT = Math.round(MAIN_WINDOW_MIN_WIDTH / MAIN_WINDOW_ASPECT_RATIO);
const ALLOWED_PRODUCTION_PROTOCOLS = new Set(['file:', 'data:', 'blob:', 'devtools:']);
const SMOKE_TEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.MMD_MODOKI_SMOKE_TIMEOUT_MS ?? '20000', 10) || 20000,
);
const SMOKE_TEST_REQUIRE_WEBGPU = process.env.MMD_MODOKI_SMOKE_REQUIRE_WEBGPU !== '0';
const SMOKE_TEST_RESULT_PATH = process.env.MMD_MODOKI_SMOKE_RESULT_PATH ?? null;
const SMOKE_TEST_SCREENSHOT_PATH = process.env.MMD_MODOKI_SMOKE_SCREENSHOT_PATH ?? null;
const SMOKE_TEST_SCREENSHOT_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.MMD_MODOKI_SMOKE_SCREENSHOT_DELAY_MS ?? '500', 10) || 0,
);
const SMOKE_TEST_STABILITY_MS = Math.max(
  0,
  Number.parseInt(process.env.MMD_MODOKI_SMOKE_STABILITY_MS ?? '3000', 10) || 0,
);
const SMOKE_TEST_MODEL_PATH = process.env.MMD_MODOKI_SMOKE_MODEL_PATH ?? null;
const SMOKE_TEST_HDR_PATH = process.env.MMD_MODOKI_SMOKE_HDR_PATH ?? null;
const SMOKE_TEST_RENDER_STABILITY_DIAGNOSTICS =
  process.env.MMD_MODOKI_SMOKE_RENDER_STABILITY_DIAGNOSTICS !== '0';
const SMOKE_TEST_PBR_MMD_LIKE = process.env.MMD_MODOKI_SMOKE_PBR_MMD_LIKE === '1';

const pngSequenceExportJobMap = new Map<string, PngSequenceExportRequest>();
const pngSequenceExportActiveCountByOwner = new Map<number, number>();
const pngSequenceExportOwnerByJobId = new Map<string, number>();
const webmExportJobMap = new Map<string, WebmExportRequest>();
const webmExportActiveCountByOwner = new Map<number, number>();
const webmExportOwnerByJobId = new Map<string, number>();
const webmExportWindowByJobId = new Map<string, BrowserWindow>();
const webmExportCleanupByJobId = new Map<string, () => void>();
const webmSaveSessionMap = new Map<string, { filePath: string; handle: fs.promises.FileHandle }>();
const ensuredDirectoryPathSet = new Set<string>();

const ensureDirectoryExists = async (directoryPath: string): Promise<void> => {
  if (ensuredDirectoryPathSet.has(directoryPath)) return;
  await fs.promises.mkdir(directoryPath, { recursive: true });
  ensuredDirectoryPathSet.add(directoryPath);
};

const sendPngSequenceExportState = (
  ownerWindow: BrowserWindow | undefined,
  state: PngSequenceExportState,
): void => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return;
  ownerWindow.webContents.send('export:pngSequenceState', state);
};

const sendPngSequenceExportProgressToOwner = (
  jobId: string,
  progress: PngSequenceExportProgress,
): void => {
  const ownerId = pngSequenceExportOwnerByJobId.get(jobId);
  if (!ownerId) return;
  const ownerContents = BrowserWindow.getAllWindows()
    .map((window) => window.webContents)
    .find((contents) => contents.id === ownerId);
  if (!ownerContents || ownerContents.isDestroyed()) return;
  ownerContents.send('export:pngSequenceProgress', progress);
};

const sendWebmExportState = (
  ownerWindow: BrowserWindow | undefined,
  state: WebmExportState,
): void => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return;
  ownerWindow.webContents.send('export:webmState', state);
};

const sendWebmExportProgressToOwner = (
  jobId: string,
  progress: WebmExportProgress,
): void => {
  const ownerId = webmExportOwnerByJobId.get(jobId);
  if (!ownerId) return;
  const ownerContents = BrowserWindow.getAllWindows()
    .map((window) => window.webContents)
    .find((contents) => contents.id === ownerId);
  if (!ownerContents || ownerContents.isDestroyed()) return;
  ownerContents.send('export:webmProgress', progress);
};

const retainPngSequenceExportOwner = (ownerWindow: BrowserWindow | undefined): (() => void) => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return () => undefined;
  const ownerId = ownerWindow.webContents.id;
  const nextCount = (pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0) + 1;
  pngSequenceExportActiveCountByOwner.set(ownerId, nextCount);
  sendPngSequenceExportState(ownerWindow, { active: true, activeCount: nextCount });

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const prevCount = pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0;
    const updatedCount = Math.max(0, prevCount - 1);
    if (updatedCount === 0) pngSequenceExportActiveCountByOwner.delete(ownerId);
    else pngSequenceExportActiveCountByOwner.set(ownerId, updatedCount);

    sendPngSequenceExportState(ownerWindow, { active: updatedCount > 0, activeCount: updatedCount });
  };
};

const retainWebmExportOwner = (ownerWindow: BrowserWindow | undefined): (() => void) => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return () => undefined;
  const ownerId = ownerWindow.webContents.id;
  const nextCount = (webmExportActiveCountByOwner.get(ownerId) ?? 0) + 1;
  webmExportActiveCountByOwner.set(ownerId, nextCount);
  sendWebmExportState(ownerWindow, { active: true, activeCount: nextCount });

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const prevCount = webmExportActiveCountByOwner.get(ownerId) ?? 0;
    const updatedCount = Math.max(0, prevCount - 1);
    if (updatedCount === 0) webmExportActiveCountByOwner.delete(ownerId);
    else webmExportActiveCountByOwner.set(ownerId, updatedCount);

    sendWebmExportState(ownerWindow, { active: updatedCount > 0, activeCount: updatedCount });
  };
};

const snapWindowContentAspect = (window: BrowserWindow, aspectRatio: number): void => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

  const [windowWidth, windowHeight] = window.getSize();
  const [contentWidth, contentHeight] = window.getContentSize();
  const frameSize = {
    width: Math.max(0, windowWidth - contentWidth),
    height: Math.max(0, windowHeight - contentHeight),
  };
  const display = screen.getDisplayMatching(window.getBounds());
  const maxContentWidth = Math.max(640, display.workArea.width - frameSize.width);
  const maxContentHeight = Math.max(360, display.workArea.height - frameSize.height);
  const minContentWidth = Math.min(MAIN_WINDOW_MIN_WIDTH, maxContentWidth);
  const minContentHeight = Math.min(MAIN_WINDOW_MIN_HEIGHT, maxContentHeight);

  window.setAspectRatio(0);

  const currentAspectRatio = contentWidth / Math.max(1, contentHeight);
  let targetContentWidth: number;
  let targetContentHeight: number;

  if (currentAspectRatio >= aspectRatio) {
    targetContentHeight = Math.min(maxContentHeight, Math.max(minContentHeight, contentHeight));
    targetContentWidth = Math.round(targetContentHeight * aspectRatio);
  } else {
    targetContentWidth = Math.min(maxContentWidth, Math.max(minContentWidth, contentWidth));
    targetContentHeight = Math.round(targetContentWidth / aspectRatio);
  }

  if (targetContentWidth > maxContentWidth) {
    targetContentWidth = maxContentWidth;
    targetContentHeight = Math.round(targetContentWidth / aspectRatio);
  }
  if (targetContentHeight > maxContentHeight) {
    targetContentHeight = maxContentHeight;
    targetContentWidth = Math.round(targetContentHeight * aspectRatio);
  }
  if (targetContentWidth < minContentWidth) {
    targetContentWidth = minContentWidth;
    targetContentHeight = Math.round(targetContentWidth / aspectRatio);
  }
  if (targetContentHeight < minContentHeight) {
    targetContentHeight = minContentHeight;
    targetContentWidth = Math.round(targetContentHeight * aspectRatio);
  }

  targetContentWidth = Math.min(maxContentWidth, Math.max(1, targetContentWidth));
  targetContentHeight = Math.min(maxContentHeight, Math.max(1, targetContentHeight));

  if (targetContentWidth !== contentWidth || targetContentHeight !== contentHeight) {
    window.setContentSize(targetContentWidth, targetContentHeight);
  }
};

const sanitizeExportExternalLut = (
  value: PngSequenceExportRequest['externalLut'] | WebmExportRequest['externalLut'],
): NonNullable<PngSequenceExportRequest['externalLut']> | null => {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.path !== 'string' || value.path.trim().length === 0) return null;
  if (typeof value.runtimeText !== 'string' || value.runtimeText.length === 0) return null;
  if (value.runtimeText.length > 16 * 1024 * 1024) return null;
  return {
    path: value.path.trim(),
    runtimeText: value.runtimeText,
    sourceFormat: value.sourceFormat === 'cube' ? 'cube' : '3dl',
  };
};

const sanitizePngSequenceExportRequest = (request: PngSequenceExportRequest): PngSequenceExportRequest | null => {
  if (!request || typeof request !== 'object') return null;
  if (!request.project || typeof request.project !== 'object') return null;
  if (request.project.format !== 'mmd_modoki_project' || request.project.version !== 1) return null;
  if (!request.outputDirectoryPath || typeof request.outputDirectoryPath !== 'string') return null;

  const startFrame = Number.isFinite(request.startFrame) ? Math.max(0, Math.floor(request.startFrame)) : 0;
  const endFrame = Number.isFinite(request.endFrame) ? Math.max(startFrame, Math.floor(request.endFrame)) : startFrame;
  const step = Number.isFinite(request.step) ? Math.max(1, Math.floor(request.step)) : 1;
  const fps = Number.isFinite(request.fps) ? Math.max(1, Math.floor(request.fps)) : 30;
  const precision = Number.isFinite(request.precision) ? Math.max(0.25, Math.min(4, request.precision)) : 1;
  const outputWidth = Number.isFinite(request.outputWidth)
    ? Math.max(320, Math.min(8192, Math.floor(request.outputWidth)))
    : 1920;
  const outputHeight = Number.isFinite(request.outputHeight)
    ? Math.max(180, Math.min(8192, Math.floor(request.outputHeight)))
    : 1080;
  const prefix = typeof request.prefix === 'string' && request.prefix.trim().length > 0
    ? request.prefix.trim()
    : 'mmd_seq';
  const exportKind = request.exportKind === 'single' ? 'single' : 'sequence';
  let singleFileName: string | undefined;
  if (exportKind === 'single') {
    const candidate = typeof request.singleFileName === 'string'
      ? path.basename(request.singleFileName.trim())
      : '';
    if (!candidate || !candidate.toLowerCase().endsWith('.png')) return null;
    singleFileName = candidate;
  }

  return {
    project: request.project,
    externalLut: sanitizeExportExternalLut(request.externalLut),
    outputDirectoryPath: request.outputDirectoryPath,
    startFrame,
    endFrame,
    step,
    prefix,
    fps,
    precision,
    outputWidth,
    outputHeight,
    transparentBackground: request.transparentBackground === true,
    exportKind,
    singleFileName,
  };
};

const sanitizeNumberArray = (value: unknown, expectedLength?: number): number[] | null => {
  if (!Array.isArray(value)) return null;
  if (expectedLength !== undefined && value.length !== expectedLength) return null;
  const result: number[] = [];
  for (const item of value) {
    if (!Number.isFinite(item)) return null;
    result.push(Number(item));
  }
  return result;
};

const sanitizeVectorTuple = (value: unknown): [number, number, number] | null => {
  const array = sanitizeNumberArray(value, 3);
  return array ? [array[0], array[1], array[2]] : null;
};

const sanitizeWebmInitialPhysicsState = (
  value: WebmExportRequest['initialPhysicsState'],
): WebmExportRequest['initialPhysicsState'] => {
  if (!value || typeof value !== 'object' || value.physicsEnabled !== true || !Array.isArray(value.models)) {
    return null;
  }

  const models: NonNullable<WebmExportRequest['initialPhysicsState']>['models'] = [];
  for (const model of value.models) {
    if (!model || typeof model !== 'object') continue;
    const modelIndex = Number.isFinite(model.modelIndex) ? Math.max(0, Math.floor(model.modelIndex)) : -1;
    if (modelIndex < 0) continue;
    const rigidBodyStates = sanitizeNumberArray(model.rigidBodyStates);
    if (!rigidBodyStates) continue;
    const rigidBodiesInput = Array.isArray(model.rigidBodies) ? model.rigidBodies : [];
    const rigidBodies: typeof model.rigidBodies = [];
    for (const body of rigidBodiesInput) {
      if (body === null) {
        rigidBodies.push(null);
        continue;
      }
      if (!body || typeof body !== 'object') {
        rigidBodies.push(null);
        continue;
      }
      const transformMatrix = sanitizeNumberArray(body.transformMatrix, 16);
      const linearVelocity = sanitizeVectorTuple(body.linearVelocity);
      const angularVelocity = sanitizeVectorTuple(body.angularVelocity);
      if (!transformMatrix || !linearVelocity || !angularVelocity) {
        rigidBodies.push(null);
        continue;
      }
      rigidBodies.push({
        transformMatrix,
        linearVelocity,
        angularVelocity,
      });
    }
    models.push({
      modelIndex,
      modelName: typeof model.modelName === 'string' ? model.modelName : '',
      rigidBodyStates: rigidBodyStates.map((state) => state ? 1 : 0),
      rigidBodies,
    });
  }

  if (models.length === 0) {
    return null;
  }
  return {
    capturedFrame: Number.isFinite(value.capturedFrame) ? Math.max(0, Math.floor(value.capturedFrame)) : 0,
    physicsEnabled: true,
    models,
  };
};

const sanitizeWebmExportRequest = (request: WebmExportRequest): WebmExportRequest | null => {
  if (!request || typeof request !== 'object') return null;
  if (!request.project || typeof request.project !== 'object') return null;
  if (request.project.format !== 'mmd_modoki_project' || request.project.version !== 1) return null;
  if (!request.outputFilePath || typeof request.outputFilePath !== 'string') return null;

  const startFrame = Number.isFinite(request.startFrame) ? Math.max(0, Math.floor(request.startFrame)) : 0;
  const endFrame = Number.isFinite(request.endFrame) ? Math.max(startFrame, Math.floor(request.endFrame)) : startFrame;
  const fps = Number.isFinite(request.fps) ? Math.max(1, Math.floor(request.fps)) : 30;
  const outputWidth = Number.isFinite(request.outputWidth) ? Math.max(320, Math.floor(request.outputWidth)) : 1920;
  const outputHeight = Number.isFinite(request.outputHeight) ? Math.max(180, Math.floor(request.outputHeight)) : 1080;
  const includeAudio = request.includeAudio === true;
  const preferredVideoCodec = request.preferredVideoCodec === 'vp8' || request.preferredVideoCodec === 'vp9'
    ? request.preferredVideoCodec
    : 'auto';
  const captureMode: WebmCaptureMode = request.captureMode === 'canvas'
    || request.captureMode === 'rgba-surface'
    || request.captureMode === 'webgpu-copy'
    || request.captureMode === 'readpixels'
    ? request.captureMode
    : 'rgba-surface';
  const diagnosticQueueLimit = isE2eMode
    && typeof request.diagnosticQueueLimit === 'number'
    && Number.isFinite(request.diagnosticQueueLimit)
    ? Math.max(1, Math.min(64, Math.floor(request.diagnosticQueueLimit)))
    : undefined;
  const audioFilePath = includeAudio && typeof request.audioFilePath === 'string' && request.audioFilePath.trim().length > 0
    ? request.audioFilePath
    : null;
  const safeOutputFilePath = request.outputFilePath.toLowerCase().endsWith('.webm')
    ? request.outputFilePath
    : `${request.outputFilePath}.webm`;

  return {
    project: request.project,
    externalLut: sanitizeExportExternalLut(request.externalLut),
    outputFilePath: safeOutputFilePath,
    startFrame,
    endFrame,
    fps,
    outputWidth,
    outputHeight,
    includeAudio,
    audioFilePath,
    preferredVideoCodec,
    captureMode,
    initialPhysicsState: sanitizeWebmInitialPhysicsState(request.initialPhysicsState),
    diagnosticQueueLimit,
  };
};

const loadEditorWindow = async (
  targetWindow: BrowserWindow,
  query?: Record<string, string>,
): Promise<void> => {
  const effectiveQuery = {
    ...(query ?? {}),
    ...(isE2eMode ? { e2e: '1' } : {}),
    ...(forcedRendererBackend ? { rendererBackend: forcedRendererBackend } : {}),
  };
  const hasQuery = Object.keys(effectiveQuery).length > 0;
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (hasQuery) {
      for (const [key, value] of Object.entries(effectiveQuery)) {
        url.searchParams.set(key, value);
      }
    }
    await targetWindow.loadURL(url.toString());
    return;
  }

  await targetWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    hasQuery ? { query: effectiveQuery } : undefined,
  );
};

const fitContentSizeToAspect = (
  targetWidth: number,
  targetHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } => {
  const ratio = targetWidth / targetHeight;
  let width = Math.min(targetWidth, maxWidth);
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  return {
    width: Math.max(640, width),
    height: Math.max(360, height),
  };
};

const isAllowedAppUrl = (targetUrl: string): boolean => {
  try {
    const parsed = new URL(targetUrl);
    if (isDev && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const devOrigin = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
      if (parsed.origin === devOrigin) return true;
    }
    return ALLOWED_PRODUCTION_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

const appendResponseHeaderValue = (
  headers: Record<string, string[]>,
  name: string,
  value: string,
): void => {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (existingKey) {
    headers[existingKey] = [value];
    return;
  }
  headers[name] = [value];
};

const configureCrossOriginIsolationHeaders = (): void => {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['*://*/*', 'file://*/*'] }, (details, callback) => {
    const responseHeaders = { ...(details.responseHeaders ?? {}) };
    appendResponseHeaderValue(responseHeaders, 'Cross-Origin-Opener-Policy', 'same-origin');
    appendResponseHeaderValue(responseHeaders, 'Cross-Origin-Embedder-Policy', 'require-corp');
    appendResponseHeaderValue(responseHeaders, 'Cross-Origin-Resource-Policy', 'cross-origin');
    callback({ responseHeaders });
  });
};

const configureSessionSecurity = (): void => {
  if (isDev) {
    return;
  }

  const requestFilter = {
    urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'],
  };

  session.defaultSession.webRequest.onBeforeRequest(requestFilter, (details, callback) => {
    callback({ cancel: true });
  });

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
    try {
      const redirectUrl = resolveNearbyFileUrl(details.url);
      if (redirectUrl && redirectUrl !== details.url) {
        callback({ redirectURL: redirectUrl });
        return;
      }
    } catch (err) {
      writeAppLog('warn', 'ipc', 'failed to resolve file request', {
        requestUrl: details.url,
        ...createLogErrorData(err),
      });
    }
    callback({});
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    contents.on('will-navigate', (event, navigationUrl) => {
      if (isAllowedAppUrl(navigationUrl)) return;
      event.preventDefault();
    });
  });
};

const finishSmokeTest = (success: boolean, reason: string, data?: AppLogData): void => {
  writeAppLog(success ? 'info' : 'error', 'main', `smoke test ${success ? 'passed' : 'failed'}: ${reason}`, data);
  console.log(`[smoke] ${success ? 'pass' : 'fail'}: ${reason}`);
  if (SMOKE_TEST_RESULT_PATH) {
    try {
      fs.mkdirSync(path.dirname(SMOKE_TEST_RESULT_PATH), { recursive: true });
      fs.writeFileSync(
        SMOKE_TEST_RESULT_PATH,
        JSON.stringify({
          success,
          reason,
          data,
          createdAt: new Date().toISOString(),
        }, null, 2),
        'utf8',
      );
    } catch (err) {
      writeAppLog('warn', 'main', 'failed to write smoke result file', createLogErrorData(err));
    }
  }
  app.exit(success ? 0 : 1);
};

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const captureSmokeScreenshot = async (
  mainWindow: BrowserWindow,
  data: AppLogData,
): Promise<AppLogData> => {
  if (!SMOKE_TEST_SCREENSHOT_PATH) return data;

  try {
    if (SMOKE_TEST_SCREENSHOT_DELAY_MS > 0) {
      await wait(SMOKE_TEST_SCREENSHOT_DELAY_MS);
    }
    const image = await mainWindow.webContents.capturePage();
    await fs.promises.mkdir(path.dirname(SMOKE_TEST_SCREENSHOT_PATH), { recursive: true });
    await fs.promises.writeFile(SMOKE_TEST_SCREENSHOT_PATH, image.toPNG());
    return {
      ...data,
      screenshotPath: SMOKE_TEST_SCREENSHOT_PATH,
    };
  } catch (err: unknown) {
    const errorData = createLogErrorData(err);
    writeAppLog('warn', 'main', 'failed to capture smoke screenshot', errorData);
    return {
      ...data,
      screenshotError: errorData,
    };
  }
};

const setupSmokeTestLifecycle = (mainWindow: BrowserWindow, loadPromise: Promise<void>): void => {
  if (!isSmokeMode) return;

  let finished = false;
  let didFinishLoad = false;
  const webGpuValidationMessages: string[] = [];
  let removeSmokeListeners = (): void => undefined;
  const complete = (success: boolean, reason: string, data?: AppLogData): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    removeSmokeListeners();
    finishSmokeTest(success, reason, data);
  };

  const timeoutId = setTimeout(() => {
    complete(false, 'timeout waiting for renderer runtime initialization', {
      timeoutMs: SMOKE_TEST_TIMEOUT_MS,
      didFinishLoad,
      webContentsId: mainWindow.webContents.id,
    });
  }, SMOKE_TEST_TIMEOUT_MS);

  writeAppLog('info', 'main', 'smoke test enabled', {
    timeoutMs: SMOKE_TEST_TIMEOUT_MS,
    stabilityMs: SMOKE_TEST_STABILITY_MS,
    requireWebGpu: SMOKE_TEST_REQUIRE_WEBGPU,
    renderStabilityDiagnostics: SMOKE_TEST_RENDER_STABILITY_DIAGNOSTICS,
    webContentsId: mainWindow.webContents.id,
  });
  console.log(`[smoke] waiting for renderer runtime (${SMOKE_TEST_TIMEOUT_MS}ms timeout, stability=${SMOKE_TEST_STABILITY_MS}ms, requireWebGPU=${SMOKE_TEST_REQUIRE_WEBGPU})`);

  loadPromise.catch((err: unknown) => {
    complete(false, 'loadEditorWindow rejected', createLogErrorData(err));
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    complete(false, 'renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      webContentsId: mainWindow.webContents.id,
    });
  });

  mainWindow.webContents.once('render-process-gone', (_event, details) => {
    complete(false, 'renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      webContentsId: mainWindow.webContents.id,
    });
  });

  mainWindow.once('unresponsive', () => {
    complete(false, 'main window became unresponsive', {
      webContentsId: mainWindow.webContents.id,
    });
  });

  mainWindow.webContents.once('did-finish-load', () => {
    didFinishLoad = true;
    writeAppLog('info', 'main', 'smoke main window finished load', {
      webContentsId: mainWindow.webContents.id,
    });
  });

  const onConsoleMessage = (
    details: Electron.Event<Electron.WebContentsConsoleMessageEventParams>,
  ): void => {
    const message = details.message;
    if (!/(?:Invalid (?:ShaderModule|RenderPipeline|CommandBuffer)|Error while parsing WGSL)/i.test(message)) {
      return;
    }
    if (webGpuValidationMessages.length < 12) {
      webGpuValidationMessages.push(message);
    }
  };
  mainWindow.webContents.on('console-message', onConsoleMessage);

  const onRendererReady = (event: IpcMainEvent, payload: SmokeRendererReadyPayload): void => {
    if (event.sender.id !== mainWindow.webContents.id) return;
    const engine = typeof payload?.engine === 'string' ? payload.engine : 'unknown';
    const physicsBackend = typeof payload?.physicsBackend === 'string' ? payload.physicsBackend : 'unknown';
    const crossOriginIsolated = payload?.crossOriginIsolated === true;
    const sharedArrayBufferAvailable = payload?.sharedArrayBufferAvailable === true;
    if (SMOKE_TEST_REQUIRE_WEBGPU && engine !== 'WebGPU') {
      complete(false, 'renderer initialized without WebGPU', {
        engine,
        physicsBackend,
        crossOriginIsolated,
        sharedArrayBufferAvailable,
        requireWebGpu: SMOKE_TEST_REQUIRE_WEBGPU,
        webContentsId: mainWindow.webContents.id,
      });
      return;
    }
    console.log(`[smoke] renderer ready: engine=${engine} physics=${physicsBackend} isolated=${crossOriginIsolated}`);
    const successData = {
      engine,
      physicsBackend,
      crossOriginIsolated,
      sharedArrayBufferAvailable,
      stabilityMs: SMOKE_TEST_STABILITY_MS,
      environmentLightingProbe: payload?.environmentLightingProbe,
      environmentLightingDiagnostics: payload?.environmentLightingDiagnostics,
      scenario: payload?.scenario,
      webContentsId: mainWindow.webContents.id,
    };
    void (async () => {
      if (SMOKE_TEST_STABILITY_MS > 0) {
        console.log(`[smoke] renderer ready; monitoring stability for ${SMOKE_TEST_STABILITY_MS}ms`);
        await wait(SMOKE_TEST_STABILITY_MS);
      }
      if (finished) return;
      if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        complete(false, 'main window was destroyed during stability monitoring', successData);
        return;
      }
      if (webGpuValidationMessages.length > 0) {
        complete(false, 'WebGPU validation errors were logged during stability monitoring', {
          ...successData,
          webGpuValidationMessages,
        });
        return;
      }
      const data = await captureSmokeScreenshot(mainWindow, successData);
      if (finished) return;
      complete(true, 'renderer runtime initialized and remained stable', data);
    })();
  };

  const onRendererFailure = (event: IpcMainEvent, payload: SmokeRendererFailurePayload): void => {
    if (event.sender.id !== mainWindow.webContents.id) return;
    complete(false, 'renderer reported initialization failure', {
      message: typeof payload?.message === 'string' ? payload.message : 'unknown renderer failure',
      details: payload?.details,
      webContentsId: mainWindow.webContents.id,
    });
  };

  ipcMain.on('smoke:rendererReady', onRendererReady);
  ipcMain.on('smoke:rendererFailure', onRendererFailure);
  removeSmokeListeners = () => {
    ipcMain.removeListener('smoke:rendererReady', onRendererReady);
    ipcMain.removeListener('smoke:rendererFailure', onRendererFailure);
    if (!mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.removeListener('console-message', onConsoleMessage);
    }
  };
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_DEFAULT_WIDTH,
    height: MAIN_WINDOW_DEFAULT_HEIGHT,
    useContentSize: true,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    autoHideMenuBar: true,
    title: 'MMD modoki',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// protocol for local PMX/texture loading
    },
  });
  mainWindow.setMenuBarVisibility(false);
  snapWindowContentAspect(mainWindow, MAIN_WINDOW_ASPECT_RATIO);
  writeAppLog('info', 'main', 'main window created', {
    webContentsId: mainWindow.webContents.id,
    width: MAIN_WINDOW_DEFAULT_WIDTH,
    height: MAIN_WINDOW_DEFAULT_HEIGHT,
  });

  // Load the app
  const smokeQuery = isSmokeMode
    ? {
        ...(SMOKE_TEST_MODEL_PATH ? { smokeModelPath: SMOKE_TEST_MODEL_PATH } : {}),
        ...(SMOKE_TEST_HDR_PATH ? { smokeHdrPath: SMOKE_TEST_HDR_PATH } : {}),
        ...(SMOKE_TEST_RENDER_STABILITY_DIAGNOSTICS ? { smokeRenderStabilityDiagnostics: '1' } : {}),
        ...(SMOKE_TEST_PBR_MMD_LIKE ? { smokePbrMmdLike: '1' } : {}),
      }
    : undefined;
  const loadPromise = loadEditorWindow(mainWindow, smokeQuery);
  setupSmokeTestLifecycle(mainWindow, loadPromise);
  void loadPromise;

  // Open DevTools in dev mode
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !isSmokeMode && !isE2eMode) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    const ownerId = mainWindow.webContents.id;
    const activeExports =
      (pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0)
      + (webmExportActiveCountByOwner.get(ownerId) ?? 0);
    if (activeExports <= 0) return;

    event.preventDefault();
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: 'Background Export In Progress',
      message: 'A background export is running.',
      detail: 'Please wait until export finishes before closing the main window.',
      noLink: true,
    });
  });

  mainWindow.once('ready-to-show', () => {
    snapWindowContentAspect(mainWindow, MAIN_WINDOW_ASPECT_RATIO);
    writeAppLog('debug', 'main', 'main window ready to show', {
      webContentsId: mainWindow.webContents.id,
    });
  });
};

app.on('ready', () => {
  writeAppLog('info', 'main', 'app ready', {
    logFilePath: log.transports.file.getFile().path,
  });
  if (isDev) {
    configureCrossOriginIsolationHeaders();
  }
  configureSessionSecurity();
  createWindow();
});

// IPC Handlers
ipcMain.on(
  'log:write',
  (_event, level: AppLogLevel, scope: AppLogScope, message: string, data?: AppLogData) => {
    if (!['debug', 'info', 'warn', 'error'].includes(level)) return;
    if (typeof scope !== 'string' || typeof message !== 'string') return;
    writeAppLog(level, scope, message, data);
  },
);

ipcMain.handle('log:getFileInfo', async (): Promise<AppLogFileInfo> => {
  const logFile = log.transports.file.getFile();
  return {
    path: logFile.path,
    directoryPath: path.dirname(logFile.path),
    fileName: path.basename(logFile.path),
    level: log.transports.file.level as AppLogFileInfo['level'],
    sessionId: appLogSessionId,
    appName: APP_LOG_NAME,
    isDev,
    maxSizeBytes: log.transports.file.maxSize,
  };
});

ipcMain.handle('log:openFolder', async (): Promise<boolean> => {
  try {
    const logFile = log.transports.file.getFile();
    await fs.promises.mkdir(path.dirname(logFile.path), { recursive: true });
    const result = await shell.openPath(path.dirname(logFile.path));
    if (result) {
      writeAppLog('warn', 'ipc', 'failed to open log folder', { message: result });
      return false;
    }
    writeAppLog('info', 'ipc', 'opened log folder');
    return true;
  } catch (err: unknown) {
    writeAppLog('error', 'ipc', 'failed to open log folder', createLogErrorData(err));
    return false;
  }
});

ipcMain.handle('dialog:openFile', async (_event, filters: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:savePngTarget', async (_event, defaultFileName?: string): Promise<PngSaveTarget | null> => {
  try {
    const requestedName = defaultFileName?.trim() || 'mmd_capture.png';
    const baseName = path.basename(requestedName);
    const safeName = baseName.toLowerCase().endsWith('.png')
      ? baseName
      : `${baseName}.png`;
    if (isE2eMode) {
      return {
        directoryPath: app.getPath('userData'),
        fileName: safeName,
      };
    }

    const result = await dialog.showSaveDialog({
      title: 'Save PNG Image',
      defaultPath: path.join(app.getPath('pictures'), safeName),
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const selectedPath = result.filePath.toLowerCase().endsWith('.png')
      ? result.filePath
      : `${result.filePath}.png`;
    return {
      directoryPath: path.dirname(selectedPath),
      fileName: path.basename(selectedPath),
    };
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to choose PNG save path', createLogErrorData(err));
    return null;
  }
});

ipcMain.handle('dialog:saveWebm', async (_event, defaultFileName?: string) => {
  try {
    const safeName = (defaultFileName && defaultFileName.toLowerCase().endsWith('.webm'))
      ? defaultFileName
      : `${defaultFileName ?? 'mmd_capture'}.webm`;
    writeAppLog('info', 'webm', 'save dialog opened', {
      defaultFileName: safeName,
    });
    const result = await dialog.showSaveDialog({
      title: 'Save WebM',
      defaultPath: path.join(app.getPath('videos'), safeName),
      filters: [{ name: 'WebM Video', extensions: ['webm'] }],
    });
    if (result.canceled || !result.filePath) {
      writeAppLog('info', 'webm', 'save dialog canceled');
      return null;
    }
    writeAppLog('info', 'webm', 'save path selected', {
      outputFilePath: result.filePath,
    });
    return result.filePath.toLowerCase().endsWith('.webm')
      ? result.filePath
      : `${result.filePath}.webm`;
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to choose WebM save path', createLogErrorData(err));
    return null;
  }
});

ipcMain.handle('window:snapMainWindowContentAspect', async (event, aspectRatio: number) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    return false;
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return false;
  }

  snapWindowContentAspect(ownerWindow, aspectRatio);
  return true;
});

ipcMain.handle('window:setZoomFactor', async (event, zoomFactor: number) => {
  const allowedZoomFactors = [0.75, 1, 1.25, 1.5] as const;
  const safeZoomFactor = allowedZoomFactors.find((candidate) => (
    Math.abs(candidate - zoomFactor) < 0.001
  )) ?? 1;
  event.sender.setZoomFactor(safeZoomFactor);
  return event.sender.getZoomFactor();
});

ipcMain.handle('file:readBinary', async (_event, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to read binary file', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:readMmdModelHeader', async (_event, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return parseMmdModelHeader(buffer);
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to read MMD model header', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:getInfo', async (_event, filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      extension: path.extname(filePath).toLowerCase(),
    };
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to get file info', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
});

function findNearbyFileSync(baseDirectoryPath: string, targetPath: string, maxDepth = 2): string | null {
  const safeBaseDirectoryPath = path.resolve(baseDirectoryPath);
  if (!fs.existsSync(safeBaseDirectoryPath) || !fs.statSync(safeBaseDirectoryPath).isDirectory()) {
    return null;
  }

  const normalizedTargetPath = targetPath.replace(/[\\/]+/g, path.sep).trim();
  if (!normalizedTargetPath) {
    return null;
  }

  const exactCandidate = path.resolve(safeBaseDirectoryPath, normalizedTargetPath);
  if (fs.existsSync(exactCandidate) && fs.statSync(exactCandidate).isFile()) {
    return exactCandidate;
  }

  const targetBaseName = path.basename(normalizedTargetPath).toLowerCase();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: safeBaseDirectoryPath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const currentDir = path.resolve(current.dir);
    if (visited.has(currentDir)) continue;
    visited.add(currentDir);

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === targetBaseName) {
        return fullPath;
      }
      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function resolveNearbyFileUrl(requestUrl: string, maxAncestorDepth = 4, maxSearchDepth = 2): string | null {
  let requestPath: string;

  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol !== 'file:') {
      return null;
    }
    requestPath = fileURLToPath(parsed);
  } catch {
    return null;
  }

  if (fs.existsSync(requestPath)) {
    return null;
  }

  const targetBaseName = path.basename(requestPath);
  let searchDir = path.dirname(requestPath);

  for (let ancestorDepth = 0; ancestorDepth <= maxAncestorDepth; ancestorDepth += 1) {
    const found = findNearbyFileSync(searchDir, targetBaseName, maxSearchDepth);
    if (found) {
      return pathToFileURL(found).toString();
    }

    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) {
      break;
    }
    searchDir = parentDir;
  }

  return null;
}

ipcMain.handle('file:findNearby', async (_event, baseDirectoryPath: string, targetPath: string) => {
  try {
    return findNearbyFileSync(baseDirectoryPath, targetPath);
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to find nearby file', {
      baseDirectoryPath,
      targetPath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:readText', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to read text file', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:listBundledWgslFiles', async (): Promise<{ name: string; path: string }[]> => {
  try {
    const candidateDirs: string[] = [];
    const seenDirs = new Set<string>();
    const baseDirs = [process.cwd(), app.getAppPath(), __dirname];

    for (const base of baseDirs) {
      let current = path.resolve(base);
      for (let depth = 0; depth < 8; depth += 1) {
        const wgslDir = path.join(current, 'wgsl');
        if (!seenDirs.has(wgslDir)) {
          seenDirs.add(wgslDir);
          candidateDirs.push(wgslDir);
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }

    const uniqueByPath = new Map<string, { name: string; path: string }>();

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (path.extname(entry.name).toLowerCase() !== '.wgsl') continue;
        const filePath = path.join(dir, entry.name);
        if (uniqueByPath.has(filePath)) continue;
        uniqueByPath.set(filePath, { name: entry.name, path: filePath });
      }
    }

    return Array.from(uniqueByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to list bundled WGSL files', createLogErrorData(err));
    return [];
  }
});

ipcMain.handle(
  'file:saveText',
  async (
    _event,
    content: string,
    defaultFileName?: string,
    filters?: { name: string; extensions: string[] }[],
  ) => {
    try {
      const safeName = defaultFileName?.trim() ? defaultFileName : 'project.modoki.json';
      const result = await dialog.showSaveDialog({
        title: 'Save Project',
        defaultPath: path.join(app.getPath('documents'), safeName),
        filters: filters && filters.length > 0
          ? filters
          : [
            { name: 'MMD Modoki Project', extensions: ['mmdproj', 'json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      fs.writeFileSync(result.filePath, content, 'utf-8');
      return result.filePath;
    } catch (err) {
      writeAppLog('error', 'ipc', 'failed to save text file', createLogErrorData(err));
      return null;
    }
  },
);

ipcMain.handle('file:writeTextToPath', async (_event, filePath: string, content: string): Promise<boolean> => {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    const targetDir = path.dirname(filePath);
    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    writeAppLog('error', 'ipc', 'failed to write text file to path', {
      filePath,
      ...createLogErrorData(err),
    });
    return false;
  }
});

function encodeRgbaToPngBytes(rgbaData: Uint8Array, width: number, height: number): Buffer | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  const pngWidth = Math.max(1, Math.floor(width));
  const pngHeight = Math.max(1, Math.floor(height));
  const expectedByteLength = pngWidth * pngHeight * 4;
  if (!(rgbaData instanceof Uint8Array) || rgbaData.byteLength !== expectedByteLength) {
    return null;
  }

  const bgraData = Buffer.from(rgbaData);
  for (let i = 0; i < bgraData.length; i += 4) {
    const r = bgraData[i];
    bgraData[i] = bgraData[i + 2];
    bgraData[i + 2] = r;
  }
  const image = nativeImage.createFromBitmap(bgraData, {
    width: pngWidth,
    height: pngHeight,
  });
  return image.toPNG();
}

ipcMain.handle(
  'file:savePngRgbaToPath',
  async (
    _event,
    rgbaData: Uint8Array,
    width: number,
    height: number,
    directoryPath: string,
    fileName: string,
  ) => {
    try {
      if (!directoryPath || !fileName) return null;
      const safeFileName = path.basename(fileName);
      if (!safeFileName.toLowerCase().endsWith('.png')) return null;
      const encodeStartedAt = performance.now();
      const pngBytes = encodeRgbaToPngBytes(rgbaData, width, height);
      if (!pngBytes) return null;
      const encodeMs = performance.now() - encodeStartedAt;

      const saveStartedAt = performance.now();
      await ensureDirectoryExists(directoryPath);
      const filePath = path.join(directoryPath, safeFileName);
      await fs.promises.writeFile(filePath, pngBytes);
      return {
        path: filePath,
        byteLength: pngBytes.byteLength,
        encodeMs,
        saveMs: performance.now() - saveStartedAt,
      };
    } catch (err) {
      writeAppLog('error', 'ipc', 'failed to save RGBA PNG to path', {
        directoryPath,
        fileName,
        width,
        height,
        ...createLogErrorData(err),
      });
      return null;
    }
  },
);

ipcMain.handle(
  'file:saveVmd',
  async (
    _event,
    document: VmdExportDocument,
    defaultFileName: string,
  ): Promise<VmdSaveResult> => {
    try {
      const serialized = serializeVmd(document);
      if ("errors" in serialized) {
        writeAppLog('warn', 'vmd-export', 'VMD export validation failed', {
          kind: document && typeof document === 'object' && 'kind' in document ? document.kind : 'unknown',
          errorCount: serialized.errors.length,
          warningCount: serialized.warnings.length,
          errors: serialized.errors.slice(0, 5),
        });
        return { status: 'invalid', errors: serialized.errors, warnings: serialized.warnings };
      }

      const requestedName = typeof defaultFileName === 'string' ? path.basename(defaultFileName.trim()) : '';
      const sanitizedName = (requestedName || 'motion.vmd')
        .replace(/[<>:"/\\|?*]/g, '_')
        .split('')
        .map((character) => character.charCodeAt(0) < 0x20 ? '_' : character)
        .join('');
      const safeName = sanitizedName.toLowerCase().endsWith('.vmd') ? sanitizedName : `${sanitizedName}.vmd`;
      let filePath: string;
      if (isE2eMode) {
        filePath = path.join(app.getPath('userData'), safeName);
      } else {
        const result = await dialog.showSaveDialog({
          title: 'Save VMD Motion',
          defaultPath: path.join(app.getPath('documents'), safeName),
          filters: [
            { name: 'Vocaloid Motion Data', extensions: ['vmd'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePath) return { status: 'cancelled' };
        filePath = result.filePath.toLowerCase().endsWith('.vmd') ? result.filePath : `${result.filePath}.vmd`;
      }

      await fs.promises.writeFile(filePath, serialized.bytes);
      const keyCounts = document.kind === 'model'
        ? {
            boneKeyCount: document.boneKeys.length,
            morphKeyCount: document.morphKeys.length,
            cameraKeyCount: 0,
            propertyKeyCount: document.propertyKeys.length,
          }
        : {
            boneKeyCount: 0,
            morphKeyCount: 0,
            cameraKeyCount: document.cameraKeys.length,
            propertyKeyCount: 0,
          };
      writeAppLog('info', 'vmd-export', 'VMD export saved', {
        kind: document.kind,
        filePath,
        byteLength: serialized.bytes.byteLength,
        ...keyCounts,
        warningCodes: serialized.warnings.map((warning) => warning.code),
      });
      return {
        status: 'saved',
        filePath,
        byteLength: serialized.bytes.byteLength,
        warnings: serialized.warnings,
      };
    } catch (err) {
      writeAppLog('error', 'vmd-export', 'VMD export failed', createLogErrorData(err));
      return { status: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
  },
);

ipcMain.handle(
  'file:saveVpd',
  async (
    _event,
    document: VpdExportDocument,
    defaultFileName: string,
  ): Promise<VpdSaveResult> => {
    try {
      const serialized = serializeVpd(document);
      if ('errors' in serialized) {
        writeAppLog('warn', 'vpd-export', 'VPD export validation failed', {
          errorCount: serialized.errors.length,
          warningCount: serialized.warnings.length,
          errors: serialized.errors.slice(0, 5),
        });
        return { status: 'invalid', errors: serialized.errors, warnings: serialized.warnings };
      }

      const requestedName = typeof defaultFileName === 'string' ? path.basename(defaultFileName.trim()) : '';
      const sanitizedName = (requestedName || 'pose.vpd')
        .replace(/[<>:"/\\|?*]/g, '_')
        .split('')
        .map((character) => character.charCodeAt(0) < 0x20 ? '_' : character)
        .join('');
      const safeName = sanitizedName.toLowerCase().endsWith('.vpd') ? sanitizedName : `${sanitizedName}.vpd`;
      let filePath: string;
      if (isE2eMode) {
        filePath = path.join(app.getPath('userData'), safeName);
      } else {
        const result = await dialog.showSaveDialog({
          title: 'Save VPD Pose',
          defaultPath: path.join(app.getPath('documents'), safeName),
          filters: [
            { name: 'Vocaloid Pose Data', extensions: ['vpd'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePath) return { status: 'cancelled' };
        filePath = result.filePath.toLowerCase().endsWith('.vpd') ? result.filePath : `${result.filePath}.vpd`;
      }

      await fs.promises.writeFile(filePath, serialized.bytes);
      writeAppLog('info', 'vpd-export', 'VPD export saved', {
        filePath,
        byteLength: serialized.bytes.byteLength,
        boneCount: document.bones.length,
        warningCodes: serialized.warnings.map((warning) => warning.code),
      });
      return {
        status: 'saved',
        filePath,
        byteLength: serialized.bytes.byteLength,
        warnings: serialized.warnings,
      };
    } catch (err) {
      writeAppLog('error', 'vpd-export', 'VPD export failed', createLogErrorData(err));
      return { status: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
  },
);

const hasPngSignature = (bytes: Uint8Array): boolean => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.byteLength >= signature.length
    && signature.every((value, index) => bytes[index] === value);
};

ipcMain.handle(
  'file:savePngBytes',
  async (
    _event,
    pngBytes: Uint8Array,
    defaultFileName?: string,
  ) => {
    try {
      if (!(pngBytes instanceof Uint8Array) || !hasPngSignature(pngBytes)) return null;
      const requestedName = defaultFileName?.trim() || 'mmd_capture.png';
      const baseName = path.basename(requestedName);
      const safeName = baseName.toLowerCase().endsWith('.png')
        ? baseName
        : `${baseName}.png`;
      if (isE2eMode) {
        const e2eFilePath = path.join(app.getPath('userData'), safeName);
        await ensureDirectoryExists(path.dirname(e2eFilePath));
        await fs.promises.writeFile(e2eFilePath, pngBytes);
        return e2eFilePath;
      }
      const result = await dialog.showSaveDialog({
        title: 'Save PNG Image',
        defaultPath: path.join(app.getPath('pictures'), safeName),
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });

      if (result.canceled || !result.filePath) return null;
      await fs.promises.writeFile(result.filePath, pngBytes);
      return result.filePath;
    } catch (err) {
      writeAppLog('error', 'ipc', 'failed to save encoded PNG', {
        defaultFileName,
        ...createLogErrorData(err),
      });
      return null;
    }
  },
);

ipcMain.handle(
  'file:savePngBytesToPath',
  async (
    _event,
    pngBytes: Uint8Array,
    directoryPath: string,
    fileName: string,
  ) => {
    try {
      if (!directoryPath || !fileName) return null;
      if (!(pngBytes instanceof Uint8Array) || !hasPngSignature(pngBytes)) return null;
      const safeFileName = path.basename(fileName);
      if (!safeFileName.toLowerCase().endsWith('.png')) return null;

      const saveStartedAt = performance.now();
      await ensureDirectoryExists(directoryPath);
      const filePath = path.join(directoryPath, safeFileName);
      await fs.promises.writeFile(filePath, pngBytes);
      return {
        path: filePath,
        byteLength: pngBytes.byteLength,
        saveMs: performance.now() - saveStartedAt,
      };
    } catch (err) {
      writeAppLog('error', 'ipc', 'failed to save encoded PNG to path', {
        directoryPath,
        fileName,
        ...createLogErrorData(err),
      });
      return null;
    }
  },
);

ipcMain.handle('file:saveWebmToPath', async (_event, bytes: Uint8Array, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') return null;
    const safeFilePath = filePath.toLowerCase().endsWith('.webm') ? filePath : `${filePath}.webm`;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null;
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true });
    await fs.promises.writeFile(safeFilePath, Buffer.from(bytes));
    return safeFilePath;
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to save WebM to path', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:beginWebmStreamSave', async (_event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') return null;
    const safeFilePath = filePath.toLowerCase().endsWith('.webm') ? filePath : `${filePath}.webm`;
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true });
    const handle = await fs.promises.open(safeFilePath, 'w');
    const saveId = randomUUID();
    webmSaveSessionMap.set(saveId, { filePath: safeFilePath, handle });
    return { saveId, filePath: safeFilePath };
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to begin streamed WebM save', {
      filePath,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:writeWebmStreamChunk', async (_event, saveId: string, bytes: Uint8Array, position: number) => {
  try {
    if (!saveId || typeof saveId !== 'string') return false;
    const session = webmSaveSessionMap.get(saveId);
    if (!session) return false;
    if (!(bytes instanceof Uint8Array)) return false;
    const writePosition = Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0;
    if (bytes.byteLength > 0) {
      await session.handle.write(bytes, 0, bytes.byteLength, writePosition);
    }
    return true;
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to write streamed WebM chunk', {
      saveId,
      position,
      byteLength: bytes?.byteLength ?? null,
      ...createLogErrorData(err),
    });
    return false;
  }
});

ipcMain.handle('file:finishWebmStreamSave', async (_event, saveId: string) => {
  try {
    if (!saveId || typeof saveId !== 'string') return null;
    const session = webmSaveSessionMap.get(saveId);
    if (!session) return null;
    webmSaveSessionMap.delete(saveId);
    await session.handle.close();
    return session.filePath;
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to finish streamed WebM save', {
      saveId,
      ...createLogErrorData(err),
    });
    return null;
  }
});

ipcMain.handle('file:cancelWebmStreamSave', async (_event, saveId: string) => {
  try {
    if (!saveId || typeof saveId !== 'string') return false;
    const session = webmSaveSessionMap.get(saveId);
    if (!session) return false;
    webmSaveSessionMap.delete(saveId);
    await session.handle.close();
    await fs.promises.unlink(session.filePath).catch(() => undefined);
    return true;
  } catch (err) {
    writeAppLog('error', 'webm', 'failed to cancel streamed WebM save', {
      saveId,
      ...createLogErrorData(err),
    });
    return false;
  }
});

ipcMain.handle(
  'export:startPngSequenceWindow',
  async (event, request: PngSequenceExportRequest): Promise<PngSequenceExportLaunchResult | null> => {
    let exportWindow: BrowserWindow | undefined;
    let releaseOwnerExport = () => undefined;
    let jobId: string | null = null;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (jobId) {
        pngSequenceExportJobMap.delete(jobId);
        pngSequenceExportOwnerByJobId.delete(jobId);
      }
      releaseOwnerExport();
    };

    try {
      const sanitized = sanitizePngSequenceExportRequest(request);
      if (!sanitized) return null;

      const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      releaseOwnerExport = retainPngSequenceExportOwner(ownerWindow);
      jobId = randomUUID();
      pngSequenceExportJobMap.set(jobId, sanitized);
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        pngSequenceExportOwnerByJobId.set(jobId, ownerWindow.webContents.id);
      }

      const fallbackBounds = { x: 0, y: 0, width: sanitized.outputWidth, height: sanitized.outputHeight };
      const display = screen.getDisplayMatching(ownerWindow?.getBounds() ?? fallbackBounds);
      const maxContentWidth = Math.max(960, Math.floor(display.workAreaSize.width * 0.9));
      const maxContentHeight = Math.max(540, Math.floor(display.workAreaSize.height * 0.9));
      const initialContentSize = fitContentSizeToAspect(
        sanitized.outputWidth,
        sanitized.outputHeight,
        maxContentWidth,
        maxContentHeight,
      );

      exportWindow = new BrowserWindow({
        width: initialContentSize.width,
        height: initialContentSize.height,
        useContentSize: true,
        minWidth: 960,
        minHeight: 540,
        show: false,
        paintWhenInitiallyHidden: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        title: `PNG Sequence Export - ${jobId.slice(0, 8)}`,
        backgroundColor: '#0a0a0f',
        parent: ownerWindow,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          partition: 'persist:mmd-modoki-png-exporter',
          zoomFactor: 1,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false,
          backgroundThrottling: false,
        },
      });
      exportWindow.setAspectRatio(sanitized.outputWidth / sanitized.outputHeight);
      exportWindow.setMenuBarVisibility(false);
      exportWindow.setContentSize(initialContentSize.width, initialContentSize.height);

      exportWindow.on('closed', () => {
        cleanup();
      });

      await loadEditorWindow(exportWindow, {
        mode: 'exporter',
        jobId,
        pngEncoder: pngSequenceEncoderMode,
      });

      return { jobId };
    } catch (err) {
      cleanup();
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.close();
      }
      writeAppLog('error', 'ipc', 'failed to start PNG sequence export window', createLogErrorData(err));
      return null;
    }
  },
);

ipcMain.handle('export:takePngSequenceJob', async (_event, jobId: string): Promise<PngSequenceExportRequest | null> => {
  if (!jobId || typeof jobId !== 'string') return null;
  const job = pngSequenceExportJobMap.get(jobId);
  if (!job) return null;
  pngSequenceExportJobMap.delete(jobId);
  return job;
});

const acceptPngSequenceExportProgress = (progress: PngSequenceExportProgress): boolean => {
  if (!progress || typeof progress !== 'object') return false;
  if (typeof progress.jobId !== 'string' || progress.jobId.length === 0) return false;
  if (progress.diagnostics) {
    writeAppLog('info', 'performance', 'png sequence exporter completed', {
      jobId: progress.jobId,
      exportedFrames: progress.saved,
      totalFrames: progress.total,
      diagnostics: progress.diagnostics,
    });
  }
  if (!pngSequenceExportOwnerByJobId.has(progress.jobId)) return false;
  sendPngSequenceExportProgressToOwner(progress.jobId, progress);
  return true;
};

ipcMain.on('export:pngSequenceProgress', (_event, progress: PngSequenceExportProgress) => {
  acceptPngSequenceExportProgress(progress);
});

ipcMain.handle('export:pngSequenceCompleted', async (_event, progress: PngSequenceExportProgress) => (
  acceptPngSequenceExportProgress(progress)
));

ipcMain.handle(
  'export:startWebmWindow',
  async (event, request: WebmExportRequest): Promise<WebmExportLaunchResult | null> => {
    let exportWindow: BrowserWindow | undefined;
    let releaseOwnerExport = () => undefined;
    let jobId: string | null = null;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (jobId) {
        webmExportJobMap.delete(jobId);
        webmExportOwnerByJobId.delete(jobId);
        webmExportWindowByJobId.delete(jobId);
        webmExportCleanupByJobId.delete(jobId);
      }
      releaseOwnerExport();
    };

    try {
      const sanitized = sanitizeWebmExportRequest(request);
      if (!sanitized) {
        writeAppLog('warn', 'webm', 'invalid WebM export request');
        return null;
      }

      const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      releaseOwnerExport = retainWebmExportOwner(ownerWindow);
      jobId = randomUUID();
      webmExportJobMap.set(jobId, sanitized);
      webmExportCleanupByJobId.set(jobId, cleanup);
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        webmExportOwnerByJobId.set(jobId, ownerWindow.webContents.id);
      }
      writeAppLog('info', 'webm', 'starting WebM export window', {
        jobId,
        outputFilePath: sanitized.outputFilePath,
        startFrame: sanitized.startFrame,
        endFrame: sanitized.endFrame,
        fps: sanitized.fps,
        outputWidth: sanitized.outputWidth,
        outputHeight: sanitized.outputHeight,
        includeAudio: sanitized.includeAudio,
        audioFilePath: sanitized.audioFilePath,
        preferredVideoCodec: sanitized.preferredVideoCodec,
        ownerWebContentsId: ownerWindow?.webContents.id,
      });

      exportWindow = new BrowserWindow({
        width: sanitized.outputWidth,
        height: sanitized.outputHeight,
        useContentSize: true,
        minWidth: 640,
        minHeight: 360,
        show: false,
        paintWhenInitiallyHidden: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        title: `WebM Export - ${jobId.slice(0, 8)}`,
        backgroundColor: '#0a0a0f',
        parent: ownerWindow,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false,
          backgroundThrottling: false,
        },
      });
      webmExportWindowByJobId.set(jobId, exportWindow);
      exportWindow.setAspectRatio(sanitized.outputWidth / sanitized.outputHeight);
      exportWindow.setMenuBarVisibility(false);
      exportWindow.setContentSize(sanitized.outputWidth, sanitized.outputHeight);

      exportWindow.on('closed', () => {
        cleanup();
      });

      await loadEditorWindow(exportWindow, { mode: 'webm-exporter', jobId });
      writeAppLog('debug', 'webm', 'WebM export window loaded', { jobId });

      return { jobId };
    } catch (err) {
      cleanup();
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.close();
      }
      writeAppLog('error', 'webm', 'failed to start WebM export window', createLogErrorData(err));
      return null;
    }
  },
);

ipcMain.handle('export:takeWebmJob', async (_event, jobId: string): Promise<WebmExportRequest | null> => {
  if (!jobId || typeof jobId !== 'string') return null;
  const job = webmExportJobMap.get(jobId);
  if (!job) return null;
  webmExportJobMap.delete(jobId);
  return job;
});

ipcMain.handle('export:cancelWebmJob', async (event, jobId: string): Promise<boolean> => {
  if (!jobId || typeof jobId !== 'string') return false;
  const ownerId = webmExportOwnerByJobId.get(jobId);
  if (ownerId !== event.sender.id) return false;
  const exporterWindow = webmExportWindowByJobId.get(jobId);
  if (!exporterWindow || exporterWindow.isDestroyed()) return false;
  exporterWindow.webContents.send('export:webmCancelRequested', jobId);
  writeAppLog('info', 'webm', 'WebM export cancellation requested', { jobId, ownerWebContentsId: ownerId });
  return true;
});

ipcMain.handle('export:finishWebmJob', async (event, jobId: string): Promise<boolean> => {
  if (!jobId || typeof jobId !== 'string') return false;
  const cleanup = webmExportCleanupByJobId.get(jobId);
  if (!cleanup) return false;
  cleanup();
  writeAppLog('info', 'webm', 'finished WebM export job', { jobId });
  const exporterWindow = BrowserWindow.fromWebContents(event.sender);
  if (exporterWindow && !exporterWindow.isDestroyed()) {
    exporterWindow.close();
  }
  return true;
});

ipcMain.on('export:webmProgress', (_event, progress: WebmExportProgress) => {
  if (!progress || typeof progress !== 'object') return;
  if (typeof progress.jobId !== 'string' || progress.jobId.length === 0) return;
  if (!webmExportOwnerByJobId.has(progress.jobId)) return;
  sendWebmExportProgressToOwner(progress.jobId, progress);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
