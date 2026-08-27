import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
    AppLogData,
    AppLogScope,
    ElectronAPI,
    PngSequenceExportProgress,
    PngSequenceExportRequest,
    PngSequenceExportState,
    SmokeRendererFailurePayload,
    SmokeRendererReadyPayload,
    WebmExportProgress,
    WebmExportRequest,
    WebmExportState
} from './types';

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:openFile', filters),
    openDirectoryDialog: () =>
        ipcRenderer.invoke('dialog:openDirectory'),
    choosePngSaveTarget: (defaultFileName?: string) =>
        ipcRenderer.invoke('dialog:savePngTarget', defaultFileName),
    saveWebmDialog: (defaultFileName?: string) =>
        ipcRenderer.invoke('dialog:saveWebm', defaultFileName),
    openNewProjectWindow: () =>
        ipcRenderer.invoke('window:openNewProject'),
    snapMainWindowContentAspect: (aspectRatio: number) =>
        ipcRenderer.invoke('window:snapMainWindowContentAspect', aspectRatio),
    setWindowZoomFactor: (zoomFactor: number) =>
        ipcRenderer.invoke('window:setZoomFactor', zoomFactor),
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
    readMmdModelHeader: (filePath: string) =>
        ipcRenderer.invoke('file:readMmdModelHeader', filePath),
    readTextFile: (filePath: string) =>
        ipcRenderer.invoke('file:readText', filePath),
    getFileInfo: (filePath: string) =>
        ipcRenderer.invoke('file:getInfo', filePath),
    fileExists: (filePath: string) =>
        ipcRenderer.invoke('file:exists', filePath),
    findNearbyFile: (baseDirectoryPath: string, targetPath: string) =>
        ipcRenderer.invoke('file:findNearby', baseDirectoryPath, targetPath),
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) =>
        ipcRenderer.invoke('file:saveText', content, defaultFileName, filters),
    saveVmdFile: (document, defaultFileName: string) =>
        ipcRenderer.invoke('file:saveVmd', document, defaultFileName),
    saveVpdFile: (document, defaultFileName: string) =>
        ipcRenderer.invoke('file:saveVpd', document, defaultFileName),
    listBundledWgslFiles: () =>
        ipcRenderer.invoke('file:listBundledWgslFiles'),
    writeTextFileToPath: (filePath: string, content: string) =>
        ipcRenderer.invoke('file:writeTextToPath', filePath, content),
    savePngBytesFile: (
        pngBytes: Uint8Array,
        defaultFileName?: string,
    ) => ipcRenderer.invoke('file:savePngBytes', pngBytes, defaultFileName),
    savePngRgbaFileToPath: (
        rgbaData: Uint8Array,
        width: number,
        height: number,
        directoryPath: string,
        fileName: string,
    ) => ipcRenderer.invoke('file:savePngRgbaToPath', rgbaData, width, height, directoryPath, fileName),
    savePngBytesFileToPath: (
        pngBytes: Uint8Array,
        directoryPath: string,
        fileName: string,
    ) => ipcRenderer.invoke('file:savePngBytesToPath', pngBytes, directoryPath, fileName),
    saveWebmFileToPath: (bytes: Uint8Array, filePath: string) =>
        ipcRenderer.invoke('file:saveWebmToPath', bytes, filePath),
    beginWebmStreamSave: (filePath: string) =>
        ipcRenderer.invoke('file:beginWebmStreamSave', filePath),
    writeWebmStreamChunk: (saveId: string, bytes: Uint8Array, position: number) =>
        ipcRenderer.invoke('file:writeWebmStreamChunk', saveId, bytes, position),
    finishWebmStreamSave: (saveId: string) =>
        ipcRenderer.invoke('file:finishWebmStreamSave', saveId),
    cancelWebmStreamSave: (saveId: string) =>
        ipcRenderer.invoke('file:cancelWebmStreamSave', saveId),
    startPngSequenceExportWindow: (request: PngSequenceExportRequest) =>
        ipcRenderer.invoke('export:startPngSequenceWindow', request),
    takePngSequenceExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:takePngSequenceJob', jobId),
    reportPngSequenceExportProgress: (progress: PngSequenceExportProgress) => {
        ipcRenderer.send('export:pngSequenceProgress', progress);
    },
    completePngSequenceExport: (progress: PngSequenceExportProgress) =>
        ipcRenderer.invoke('export:pngSequenceCompleted', progress),
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
    startWebmExportWindow: (request: WebmExportRequest) =>
        ipcRenderer.invoke('export:startWebmWindow', request),
    takeWebmExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:takeWebmJob', jobId),
    cancelWebmExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:cancelWebmJob', jobId),
    finishWebmExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:finishWebmJob', jobId),
    reportWebmExportProgress: (progress: WebmExportProgress) => {
        ipcRenderer.send('export:webmProgress', progress);
    },
    onWebmExportState: (callback: (state: WebmExportState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: WebmExportState) => {
            callback(state);
        };
        ipcRenderer.on('export:webmState', listener);
        return () => {
            ipcRenderer.removeListener('export:webmState', listener);
        };
    },
    onWebmExportProgress: (callback: (progress: WebmExportProgress) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: WebmExportProgress) => {
            callback(progress);
        };
        ipcRenderer.on('export:webmProgress', listener);
        return () => {
            ipcRenderer.removeListener('export:webmProgress', listener);
        };
    },
    onWebmExportCancelRequested: (callback: (jobId: string) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, jobId: string) => {
            callback(jobId);
        };
        ipcRenderer.on('export:webmCancelRequested', listener);
        return () => {
            ipcRenderer.removeListener('export:webmCancelRequested', listener);
        };
    },
    logDebug: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'debug', scope, message, data);
    },
    logInfo: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'info', scope, message, data);
    },
    logWarn: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'warn', scope, message, data);
    },
    logError: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'error', scope, message, data);
    },
    reportSmokeRendererReady: (payload: SmokeRendererReadyPayload) => {
        ipcRenderer.send('smoke:rendererReady', payload);
    },
    reportSmokeRendererFailure: (payload: SmokeRendererFailurePayload) => {
        ipcRenderer.send('smoke:rendererFailure', payload);
    },
    getLogFileInfo: () =>
        ipcRenderer.invoke('log:getFileInfo'),
    openLogFolder: () =>
        ipcRenderer.invoke('log:openFolder'),
} as ElectronAPI);
