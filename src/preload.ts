import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
    ElectronAPI,
    PngSequenceExportProgress,
    PngSequenceExportRequest,
    PngSequenceExportState
} from './types';

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:openFile', filters),
    openDirectoryDialog: () =>
        ipcRenderer.invoke('dialog:openDirectory'),
    getPathForDroppedFile: (file: File) => {
        try {
            const filePath = webUtils.getPathForFile(file);
            return filePath || null;
        } catch {
            return null;
        }
    },
    readBinaryFile: (filePath: string) =>
        ipcRenderer.invoke('file:readBinary', filePath),
    readTextFile: (filePath: string) =>
        ipcRenderer.invoke('file:readText', filePath),
    getFileInfo: (filePath: string) =>
        ipcRenderer.invoke('file:getInfo', filePath),
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) =>
        ipcRenderer.invoke('file:saveText', content, defaultFileName, filters),
    savePngFile: (dataUrl: string, defaultFileName?: string) =>
        ipcRenderer.invoke('file:savePng', dataUrl, defaultFileName),
    savePngFileToPath: (dataUrl: string, directoryPath: string, fileName: string) =>
        ipcRenderer.invoke('file:savePngToPath', dataUrl, directoryPath, fileName),
    savePngRgbaFileToPath: (
        rgbaData: Uint8Array,
        width: number,
        height: number,
        directoryPath: string,
        fileName: string,
    ) => ipcRenderer.invoke('file:savePngRgbaToPath', rgbaData, width, height, directoryPath, fileName),
    startPngSequenceExportWindow: (request: PngSequenceExportRequest) =>
        ipcRenderer.invoke('export:startPngSequenceWindow', request),
    takePngSequenceExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:takePngSequenceJob', jobId),
    reportPngSequenceExportProgress: (progress: PngSequenceExportProgress) => {
        ipcRenderer.send('export:pngSequenceProgress', progress);
    },
    onPngSequenceExportState: (callback: (state: PngSequenceExportState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: PngSequenceExportState) => {
            callback(state);
        };
        ipcRenderer.on('export:pngSequenceState', listener);
        return () => {
            ipcRenderer.removeListener('export:pngSequenceState', listener);
        };
    },
    onPngSequenceExportProgress: (callback: (progress: PngSequenceExportProgress) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: PngSequenceExportProgress) => {
            callback(progress);
        };
        ipcRenderer.on('export:pngSequenceProgress', listener);
        return () => {
            ipcRenderer.removeListener('export:pngSequenceProgress', listener);
        };
    },
} as ElectronAPI);
