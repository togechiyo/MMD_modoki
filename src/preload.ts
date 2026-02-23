import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
    readBinaryFile: (filePath: string) => Promise<Buffer | null>;
    readTextFile: (filePath: string) => Promise<string | null>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; extension: string } | null>;
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) => Promise<string | null>;
    savePngFile: (dataUrl: string, defaultFileName?: string) => Promise<string | null>;
}

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:openFile', filters),
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
} as ElectronAPI);
