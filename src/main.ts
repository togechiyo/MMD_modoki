import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import started from 'electron-squirrel-startup';
import type { PngSequenceExportProgress, PngSequenceExportRequest, PngSequenceExportState } from './types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
if (isDev) {
  // Keep local file loading behavior while hiding noisy Electron dev warnings.
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

type PngSequenceExportLaunchResult = {
  jobId: string;
};

const pngSequenceExportJobMap = new Map<string, PngSequenceExportRequest>();
const pngSequenceExportActiveCountByOwner = new Map<number, number>();
const pngSequenceExportOwnerByJobId = new Map<string, number>();
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
  const outputWidth = Number.isFinite(request.outputWidth) ? Math.max(320, Math.floor(request.outputWidth)) : 1920;
  const outputHeight = Number.isFinite(request.outputHeight) ? Math.max(180, Math.floor(request.outputHeight)) : 1080;
  const prefix = typeof request.prefix === 'string' && request.prefix.trim().length > 0
    ? request.prefix.trim()
    : 'mmd_seq';

  return {
    project: request.project,
    outputDirectoryPath: request.outputDirectoryPath,
    startFrame,
    endFrame,
    step,
    prefix,
    fps,
    precision,
    outputWidth,
    outputHeight,
  };
};

const loadEditorWindow = async (
  targetWindow: BrowserWindow,
  query?: Record<string, string>,
): Promise<void> => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    await targetWindow.loadURL(url.toString());
    return;
  }

  await targetWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    query ? { query } : undefined,
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

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'MMD Motion Editor',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// protocol for local PMX/texture loading
    },
  });

  // Load the app
  void loadEditorWindow(mainWindow);

  // Open DevTools in dev mode
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    const ownerId = mainWindow.webContents.id;
    const activeExports = pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0;
    if (activeExports <= 0) return;

    event.preventDefault();
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: 'Export In Progress',
      message: 'PNG sequence export is running in the background.',
      detail: 'Please wait until export finishes before closing the main window.',
      noLink: true,
    });
  });
};

// IPC Handlers
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

ipcMain.handle('file:readBinary', async (_event, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (err) {
    console.error('Failed to read file:', err);
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
    console.error('Failed to get file info:', err);
    return null;
  }
});

ipcMain.handle('file:readText', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to read text file:', err);
    return null;
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
      const safeName = defaultFileName?.trim() ? defaultFileName : 'mmd_project.mmdproj.json';
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
      console.error('Failed to save text file:', err);
      return null;
    }
  },
);

ipcMain.handle('file:savePng', async (_event, dataUrl: string, defaultFileName?: string) => {
  try {
    const safeName = (defaultFileName && defaultFileName.toLowerCase().endsWith('.png'))
      ? defaultFileName
      : `${defaultFileName ?? 'mmd_capture'}.png`;

    const result = await dialog.showSaveDialog({
      title: 'PNG画像を保存',
      defaultPath: path.join(app.getPath('pictures'), safeName),
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const prefix = 'data:image/png;base64,';
    const base64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
    fs.writeFileSync(result.filePath, base64, 'base64');
    return result.filePath;
  } catch (err) {
    console.error('Failed to save PNG:', err);
    return null;
  }
});

ipcMain.handle('file:savePngToPath', async (_event, dataUrl: string, directoryPath: string, fileName: string) => {
  try {
    if (!directoryPath || !fileName) return null;
    const safeFileName = path.basename(fileName);
    if (!safeFileName.toLowerCase().endsWith('.png')) return null;

    await ensureDirectoryExists(directoryPath);
    const filePath = path.join(directoryPath, safeFileName);

    const prefix = 'data:image/png;base64,';
    const base64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
    await fs.promises.writeFile(filePath, base64, 'base64');
    return filePath;
  } catch (err) {
    console.error('Failed to save PNG to path:', err);
    return null;
  }
});

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
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

      const pngWidth = Math.max(1, Math.floor(width));
      const pngHeight = Math.max(1, Math.floor(height));
      const expectedByteLength = pngWidth * pngHeight * 4;
      if (!(rgbaData instanceof Uint8Array) || rgbaData.byteLength !== expectedByteLength) {
        return null;
      }

      await ensureDirectoryExists(directoryPath);
      const filePath = path.join(directoryPath, safeFileName);
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
      const pngBytes = image.toPNG();
      await fs.promises.writeFile(filePath, pngBytes);
      return filePath;
    } catch (err) {
      console.error('Failed to save RGBA PNG to path:', err);
      return null;
    }
  },
);

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

      await loadEditorWindow(exportWindow, { mode: 'exporter', jobId });

      return { jobId };
    } catch (err) {
      cleanup();
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.close();
      }
      console.error('Failed to start PNG sequence export window:', err);
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

ipcMain.on('export:pngSequenceProgress', (_event, progress: PngSequenceExportProgress) => {
  if (!progress || typeof progress !== 'object') return;
  if (typeof progress.jobId !== 'string' || progress.jobId.length === 0) return;
  if (!pngSequenceExportOwnerByJobId.has(progress.jobId)) return;
  sendPngSequenceExportProgressToOwner(progress.jobId, progress);
});

app.on('ready', createWindow);

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
