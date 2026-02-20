import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
    readBinaryFile: (filePath: string) => Promise<Buffer | null>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; extension: string } | null>;
}

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:openFile', filters),
    readBinaryFile: (filePath: string) =>
        ipcRenderer.invoke('file:readBinary', filePath),
    getFileInfo: (filePath: string) =>
        ipcRenderer.invoke('file:getInfo', filePath),
} as ElectronAPI);
