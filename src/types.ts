export interface ElectronAPI {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
    readBinaryFile: (filePath: string) => Promise<Buffer | null>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; extension: string } | null>;
    savePngFile: (dataUrl: string, defaultFileName?: string) => Promise<string | null>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export interface ModelInfo {
    name: string;
    path: string;
    vertexCount: number;
    boneCount: number;
    morphCount: number;
    morphNames: string[];
}

export interface MotionInfo {
    name: string;
    path: string;
    frameCount: number;
}

/** Track category for timeline row ordering */
export type TrackCategory = 'root' | 'camera' | 'semi-standard' | 'bone' | 'morph';

/** A single row in the keyframe timeline */
export interface KeyframeTrack {
    /** Bone or morph name */
    name: string;
    /** Row ordering category */
    category: TrackCategory;
    /** Frame numbers that have keyframes (sorted ascending) */
    frames: Uint32Array;
}

export interface AppState {
    modelLoaded: boolean;
    motionLoaded: boolean;
    isPlaying: boolean;
    currentFrame: number;
    totalFrames: number;
    modelInfo: ModelInfo | null;
    motionInfo: MotionInfo | null;
}
