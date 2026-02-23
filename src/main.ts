import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

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
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open DevTools in dev mode
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
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
