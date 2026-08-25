/**
 * Export UI controller
 *
 * Owns background export IPC state, progress tracking, and the busy overlay.
 * Builds PNG / WebM export requests from output UI state.
 */
import { t } from "../i18n";
import { logError, logInfo } from "../app-logger";
import type { MmdManager } from "../mmd-manager";
import { PngEncoderWebWorkerPool } from "../output/png-encoder-web-worker-pool";
import type { EditorAction } from "../actions/types";
import { resolveOutputFrameRangeOnProjectLoad } from "./output-frame-range-policy";
import type {
    MmdModokiProjectFileV1,
    PngSequenceExportProgress,
    PngSequenceExportState,
    ProjectOutputState,
    WebmCaptureMode,
    WebmExportProgress,
    WebmExportState,
} from "../types";

export type OutputSettings = { width: number; height: number; qualityScale: number; fps: number };

export type WebmOutputOptions = {
    includeAudio: boolean;
    preferredVideoCodec: "auto" | "vp8" | "vp9";
    captureMode: WebmCaptureMode;
};

export type OutputFormState = {
    aspectPreset: string;
    sizePreset: string;
    width: number;
    height: number;
    lockAspect: boolean;
    qualityScale: number;
    pngTransparentBackground: boolean;
    fps: number;
    includeAudio: boolean;
    preferredVideoCodec: "auto" | "vp8" | "vp9";
    captureMode: WebmCaptureMode;
    usePlaybackRange: boolean;
    frameRangeMode: "timeline" | "custom";
    startFrame: number;
    endFrame: number;
};

export type OutputSizeSettingsAdapter = {
    getState: () => OutputFormState;
    setAspectPreset: (value: string) => void;
    setSizePreset: (value: string) => void;
    setWidth: (value: number) => void;
    setHeight: (value: number) => void;
    setQualityScale: (value: number) => void;
    setPngTransparentBackground: (value: boolean) => void;
};

export type WebmExportSettingsAdapter = OutputSizeSettingsAdapter & {
    setFps: (value: number) => void;
    setIncludeAudio: (value: boolean) => void;
    setUsePlaybackRange: (value: boolean) => void;
    syncPlaybackRange: () => OutputFormState;
    resetFrameRangeToTimeline: () => OutputFormState;
    setStartFrame: (value: number) => void;
    setEndFrame: (value: number) => void;
    setCaptureMode: (value: WebmCaptureMode) => void;
};

export const OUTPUT_ASPECT_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
    { value: "16:9", labelKey: "output.aspect.landscape169" },
    { value: "9:16", labelKey: "output.aspect.portrait916" },
    { value: "1:1", labelKey: "output.aspect.square11" },
    { value: "4:3", labelKey: "output.aspect.landscape43" },
    { value: "3:4", labelKey: "output.aspect.portrait34" },
    { value: "viewport", labelKey: "output.aspect.viewport" },
];

export const OUTPUT_SIZE_PRESET_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
    { value: "1280", labelKey: "output.sizePreset.hd" },
    { value: "1920", labelKey: "output.sizePreset.fullhd" },
    { value: "2560", labelKey: "output.sizePreset.qhd" },
    { value: "3840", labelKey: "output.sizePreset.k4" },
];

export const PNG_OUTPUT_SIZE_PRESET_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
    ...OUTPUT_SIZE_PRESET_OPTIONS,
    { value: "7680", labelKey: "output.sizePreset.k8" },
];

export const OUTPUT_FPS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "24", label: "24" },
    { value: "30", label: "30" },
    { value: "60", label: "60" },
];

const FIXED_WEBM_CAPTURE_MODE: WebmCaptureMode = "rgba-surface";

type ToastType = "success" | "error" | "info";

type ExportUiElements = {
    appRoot: HTMLElement;
    busyOverlay: HTMLElement | null;
    busyText: HTMLElement | null;
    viewportOutputAspectSelect: HTMLSelectElement | null;
    outputStartFrameInput: HTMLInputElement | null;
    outputEndFrameInput: HTMLInputElement | null;
    playbackFrameStartToggleInput: HTMLInputElement | null;
    playbackFrameStopToggleInput: HTMLInputElement | null;
};

export type ExportUiControllerDeps = {
    mmdManager: MmdManager;
    buildProjectState: () => MmdModokiProjectFileV1;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    isPlaybackActive: () => boolean;
    onPausePlayback: () => void;
    getViewportSize: () => { width: number; height: number };
    onOutputAspectChanged: () => void;
    dispatchAction?: (action: EditorAction) => boolean;
};

function resolveExportUiElements(): ExportUiElements {
    return {
        appRoot: document.getElementById("app") as HTMLElement,
        busyOverlay: document.getElementById("ui-busy-overlay"),
        busyText: document.getElementById("ui-busy-text"),
        viewportOutputAspectSelect: document.getElementById("viewport-output-aspect") as HTMLSelectElement | null,
        outputStartFrameInput: document.getElementById("output-start-frame") as HTMLInputElement | null,
        outputEndFrameInput: document.getElementById("output-end-frame") as HTMLInputElement | null,
        playbackFrameStartToggleInput: document.getElementById("playback-frame-start-toggle") as HTMLInputElement | null,
        playbackFrameStopToggleInput: document.getElementById("playback-frame-stop-toggle") as HTMLInputElement | null,
    };
}

function formatWebmExportPhaseLabel(phase: WebmExportProgress["phase"]): string {
    switch (phase) {
        case "initializing": return t("webm.phase.initializing");
        case "loading-project": return t("webm.phase.loadingProject");
        case "checking-codec": return t("webm.phase.checkingCodec");
        case "opening-output": return t("webm.phase.openingOutput");
        case "encoding": return t("webm.phase.encoding");
        case "closing-track": return t("webm.phase.closingTrack");
        case "finalizing": return t("webm.phase.finalizing");
        case "finishing-job": return t("webm.phase.finishingJob");
        case "completed": return t("webm.phase.completed");
        case "failed": return t("webm.phase.failed");
        default: return phase;
    }
}

function normalizeExportFrameProgress(frame: number, startFrame?: number, endFrame?: number): {
    currentFrame: number;
    progressCount: number;
    totalCount: number;
} {
    const normalizedCurrent = Math.max(0, Math.floor(frame));
    const normalizedStart = Math.max(0, Math.floor(startFrame ?? 0));
    const fallbackEnd = Math.max(normalizedCurrent, normalizedStart);
    const normalizedEnd = Math.max(normalizedStart, Math.floor(endFrame ?? fallbackEnd));
    const clampedCurrent = Math.min(normalizedEnd, Math.max(normalizedStart, normalizedCurrent));
    const totalCount = Math.max(1, normalizedEnd - normalizedStart + 1);
    const progressCount = Math.min(totalCount, Math.max(1, clampedCurrent - normalizedStart + 1));
    return {
        currentFrame: clampedCurrent,
        progressCount,
        totalCount,
    };
}

export class ExportUiController {
    private readonly elements: ExportUiElements;
    private readonly mmdManager: MmdManager;
    private readonly buildProjectState: () => MmdModokiProjectFileV1;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly isPlaybackActive: () => boolean;
    private readonly onPausePlayback: () => void;
    private readonly getViewportSize: () => { width: number; height: number };
    private readonly onOutputAspectChanged: () => void;
    private readonly dispatchAction: ((action: EditorAction) => boolean) | null;

    private pngSequenceExportStateUnsubscribe: (() => void) | null = null;
    private pngSequenceExportProgressUnsubscribe: (() => void) | null = null;
    private webmExportStateUnsubscribe: (() => void) | null = null;
    private webmExportProgressUnsubscribe: (() => void) | null = null;
    private isPngSequenceExportActive = false;
    private pngSequenceExportActiveCount = 0;
    private latestPngSequenceExportProgress: PngSequenceExportProgress | null = null;
    private isWebmExportActive = false;
    private webmExportActiveCount = 0;
    private latestWebmExportProgress: WebmExportProgress | null = null;
    private backgroundExportMonitorIntervalId: number | null = null;
    private outputAspectRatio = 16 / 9;
    private isSyncingOutputSettings = false;
    private isSyncingFrameRange = false;
    private isFrameRangeCustomized = false;
    private isPlaybackRangeCustomized = false;
    private playbackRangeState = {
        startFrame: 0,
        endFrame: 0,
    };
    private outputState: OutputFormState = {
        aspectPreset: "16:9",
        sizePreset: "1920",
        width: 1920,
        height: 1080,
        lockAspect: false,
        qualityScale: 1,
        pngTransparentBackground: false,
        fps: 30,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
        usePlaybackRange: false,
        frameRangeMode: "timeline",
        startFrame: 0,
        endFrame: 0,
    };

    constructor(deps: ExportUiControllerDeps) {
        this.elements = resolveExportUiElements();
        this.mmdManager = deps.mmdManager;
        this.buildProjectState = deps.buildProjectState;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.isPlaybackActive = deps.isPlaybackActive;
        this.onPausePlayback = deps.onPausePlayback;
        this.getViewportSize = deps.getViewportSize;
        this.onOutputAspectChanged = deps.onOutputAspectChanged;
        this.dispatchAction = deps.dispatchAction ?? null;

        this.setupOutputControls();
        this.setupPngSequenceExportStateBridge();
        this.setupWebmExportStateBridge();
        this.startBackgroundExportMonitor();
    }

    public dispose(): void {
        this.pngSequenceExportStateUnsubscribe?.();
        this.pngSequenceExportStateUnsubscribe = null;
        this.pngSequenceExportProgressUnsubscribe?.();
        this.pngSequenceExportProgressUnsubscribe = null;
        this.webmExportStateUnsubscribe?.();
        this.webmExportStateUnsubscribe = null;
        this.webmExportProgressUnsubscribe?.();
        this.webmExportProgressUnsubscribe = null;
        if (this.backgroundExportMonitorIntervalId !== null) {
            window.clearInterval(this.backgroundExportMonitorIntervalId);
            this.backgroundExportMonitorIntervalId = null;
        }
    }

    public hasBackgroundExportActive(): boolean {
        return this.isPngSequenceExportActive || this.isWebmExportActive;
    }

    public refreshLocalizedState(): void {
        this.syncViewportAspectSelect();
        if (!this.hasBackgroundExportActive()) return;
        this.updateBackgroundExportBusyMessage();
    }

    public exportProjectState(): ProjectOutputState {
        const outputSettings = this.getOutputSettings();
        const outputFrameRange = this.getOutputFrameRange();

        return {
            aspectPreset: this.outputState.aspectPreset,
            sizePreset: this.outputState.sizePreset,
            width: outputSettings.width,
            height: outputSettings.height,
            lockAspect: this.outputState.lockAspect,
            qualityScale: outputSettings.qualityScale,
            pngTransparentBackground: this.outputState.pngTransparentBackground,
            fps: outputSettings.fps,
            includeAudio: this.outputState.includeAudio,
            webmCodec: this.getWebmOutputOptions().preferredVideoCodec,
            webmCaptureMode: FIXED_WEBM_CAPTURE_MODE,
            usePlaybackRange: this.outputState.usePlaybackRange,
            frameRangeMode: this.isFrameRangeCustomized ? "custom" : "timeline",
            startFrame: outputFrameRange.startFrame,
            endFrame: outputFrameRange.endFrame,
            frameStartEnabled: Boolean(this.elements.playbackFrameStartToggleInput?.checked),
            frameStopEnabled: Boolean(this.elements.playbackFrameStopToggleInput?.checked),
        };
    }

    public applyProjectState(state: ProjectOutputState | null | undefined): void {
        if (!state) {
            this.outputState.pngTransparentBackground = false;
            return;
        }

        if (typeof state.aspectPreset === "string" && this.isOutputAspectPreset(state.aspectPreset)) {
            this.outputState.aspectPreset = state.aspectPreset;
        }
        if (typeof state.sizePreset === "string" && this.isOutputSizePreset(state.sizePreset)) {
            this.outputState.sizePreset = state.sizePreset;
        }
        if (Number.isFinite(state.width)) {
            this.outputState.width = this.clampOutputWidth(state.width);
        }
        if (Number.isFinite(state.height)) {
            this.outputState.height = this.clampOutputHeight(state.height);
        }
        this.outputState.lockAspect = Boolean(state.lockAspect);
        if (Number.isFinite(state.qualityScale)) {
            this.outputState.qualityScale = this.clampOutputQuality(state.qualityScale);
        }
        this.outputState.pngTransparentBackground = Boolean(state.pngTransparentBackground);
        if (Number.isFinite(state.fps)) {
            this.outputState.fps = this.clampOutputFps(state.fps);
        }
        this.outputState.includeAudio = Boolean(state.includeAudio);
        this.outputState.usePlaybackRange = Boolean(state.usePlaybackRange);
        if (state.webmCodec === "auto" || state.webmCodec === "vp8" || state.webmCodec === "vp9") {
            this.outputState.preferredVideoCodec = state.webmCodec;
        }
        this.outputState.captureMode = FIXED_WEBM_CAPTURE_MODE;
        const hasStoredFrameRange = Number.isFinite(state.startFrame) && Number.isFinite(state.endFrame);
        if (hasStoredFrameRange) {
            this.isPlaybackRangeCustomized = true;
            this.setPlaybackFrameRangeValues(state.startFrame ?? 0, state.endFrame ?? 0);
        } else {
            this.isPlaybackRangeCustomized = false;
        }
        const outputRange = resolveOutputFrameRangeOnProjectLoad(state, this.getMaxOutputFrame());
        this.isFrameRangeCustomized = outputRange.customized;
        this.outputState.frameRangeMode = outputRange.mode;
        this.setOutputFrameRangeValues(outputRange.startFrame, outputRange.endFrame);
        if (this.elements.playbackFrameStartToggleInput) {
            this.elements.playbackFrameStartToggleInput.checked = Boolean(state.frameStartEnabled);
        }
        if (this.elements.playbackFrameStopToggleInput) {
            this.elements.playbackFrameStopToggleInput.checked = Boolean(state.frameStopEnabled);
        }

        const width = this.outputState.width;
        const height = this.outputState.height;
        this.outputAspectRatio = height > 0
            ? Math.max(0.1, width / height)
            : this.resolveSelectedOutputAspectRatio();
        this.onOutputAspectChanged();
        this.syncViewportAspectSelect();
    }

    public syncFrameRangeFromTimeline(force = false): void {
        const maxFrame = this.getMaxOutputFrame();
        if (force || !this.isPlaybackRangeCustomized) {
            this.setPlaybackFrameRangeValues(0, maxFrame);
        }
        if (!force && this.isFrameRangeCustomized) return;

        if (force) {
            this.isFrameRangeCustomized = false;
            this.outputState.frameRangeMode = "timeline";
        }
        this.setOutputFrameRangeValues(0, maxFrame);
    }

    public getSelectedAspectPreset(): string {
        return this.outputState.aspectPreset;
    }

    public setAspectPreset(value: string, applyPreset = true): void {
        if (!this.isOutputAspectPreset(value)) return;
        this.outputState.aspectPreset = value;
        if (applyPreset) {
            this.applyOutputPreset();
            return;
        }

        this.outputAspectRatio = this.resolveSelectedOutputAspectRatio();
        this.onOutputAspectChanged();
        this.syncViewportAspectSelect();
    }

    public resolveSelectedOutputAspectRatio(): number {
        const value = this.outputState.aspectPreset;
        if (value === "viewport") {
            const { width, height } = this.getViewportSize();
            if (width > 0 && height > 0) {
                return Math.max(0.1, width / height);
            }
            return 16 / 9;
        }

        const parts = value.split(":");
        if (parts.length === 2) {
            const w = Number.parseFloat(parts[0]);
            const h = Number.parseFloat(parts[1]);
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
                return Math.max(0.1, w / h);
            }
        }

        return this.outputAspectRatio > 0 ? this.outputAspectRatio : 16 / 9;
    }

    public getOutputSettings(): OutputSettings {
        return {
            width: this.clampOutputWidth(this.outputState.width),
            height: this.clampOutputHeight(this.outputState.height),
            qualityScale: this.clampOutputQuality(this.outputState.qualityScale),
            fps: this.clampOutputFps(this.outputState.fps),
        };
    }

    public getWebmOutputOptions(): WebmOutputOptions {
        return {
            includeAudio: this.outputState.includeAudio,
            preferredVideoCodec: this.outputState.preferredVideoCodec,
            captureMode: FIXED_WEBM_CAPTURE_MODE,
        };
    }

    public async exportPNG(): Promise<void> {
        this.setStatus("Exporting PNG...", true);

        const outputSettings = this.getOutputSettings();
        const captureWidth = Math.max(320, Math.round(outputSettings.width * outputSettings.qualityScale));
        const captureHeight = Math.max(180, Math.round(outputSettings.height * outputSettings.qualityScale));
        const fileName = this.buildPngFileName(captureWidth, captureHeight);

        let savedPath: string | null = null;
        const encoderPool = new PngEncoderWebWorkerPool({ size: 1 });
        try {
            document.body.classList.add("png-capture-mode");
            this.mmdManager.setCaptureEditorOverlaysSuppressed(true);
            await this.waitForNextPaint();
            const capturedFrame = await this.mmdManager.capturePngRgbaData({
                width: captureWidth,
                height: captureHeight,
                transparentBackground: this.outputState.pngTransparentBackground,
            });
            if (!capturedFrame) {
                throw new Error("PNG framebuffer capture returned no data");
            }
            const encoded = await encoderPool.encode(
                capturedFrame.rgbaData,
                capturedFrame.width,
                capturedFrame.height,
            );
            savedPath = await window.electronAPI.savePngBytesFile(
                encoded.pngBuffer,
                fileName,
            );
        } catch (error: unknown) {
            logError("ui", "PNG snapshot encode or save failed", { error: error instanceof Error ? error.message : String(error) });
            this.setStatus("PNG export failed", false);
            this.showToast("PNG export failed", "error");
            return;
        } finally {
            encoderPool.terminate();
            this.mmdManager.setCaptureEditorOverlaysSuppressed(false);
            document.body.classList.remove("png-capture-mode");
        }
        if (!savedPath) {
            this.setStatus("Ready", false);
            this.showToast("PNG export canceled", "info");
            return;
        }

        const basename = savedPath.replace(/^.*[\\/]/, "");
        this.setStatus("PNG saved", false);
        this.showToast(`Saved PNG: ${basename}`, "success");
    }

    public async exportPNGDetached(): Promise<void> {
        const outputSettings = this.getOutputSettings();
        const outputWidth = outputSettings.width;
        const outputHeight = outputSettings.height;
        const defaultFileName = this.buildPngFileName(outputWidth, outputHeight);
        const saveTarget = await window.electronAPI.choosePngSaveTarget(defaultFileName);
        if (!saveTarget) {
            this.setStatus("Ready", false);
            this.showToast("PNG export canceled", "info");
            return;
        }

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const project = this.buildProjectState();
        project.assets.audioPath = null;

        logInfo("ui", "detached PNG export launching", {
            frame,
            outputWidth,
            outputHeight,
            fileName: saveTarget.fileName,
        });
        this.setStatus("Launching high-resolution PNG export...", true);
        const result = await window.electronAPI.startPngSequenceExportWindow({
            project,
            outputDirectoryPath: saveTarget.directoryPath,
            startFrame: frame,
            endFrame: frame,
            step: 1,
            prefix: "mmd_capture",
            fps: outputSettings.fps,
            precision: 1,
            outputWidth,
            outputHeight,
            transparentBackground: this.outputState.pngTransparentBackground,
            exportKind: "single",
            singleFileName: saveTarget.fileName,
        });

        if (!result) {
            logError("ui", "detached PNG export launch failed", {
                outputWidth,
                outputHeight,
                fileName: saveTarget.fileName,
            });
            this.setStatus("PNG export launch failed", false);
            this.showToast("Failed to start high-resolution PNG export", "error");
            return;
        }

        this.setStatus("PNG export started", false);
        this.showToast(`PNG export started: ${saveTarget.fileName}`, "success");
    }

    private async waitForNextPaint(): Promise<void> {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    public async exportPNGSequence(): Promise<void> {
        const directoryPath = await window.electronAPI.openDirectoryDialog();
        if (!directoryPath) {
            this.showToast("PNG sequence export canceled", "info");
            return;
        }

        const { startFrame, endFrame } = this.getOutputFrameRange();
        const step = 1;
        const outputSettings = this.getOutputSettings();
        const prefix = `mmd_seq_${outputSettings.width}x${outputSettings.height}`;

        const frameList: number[] = [];
        for (let frame = startFrame; frame <= endFrame; frame += step) {
            frameList.push(frame);
        }
        if (frameList.length === 0) {
            this.showToast("No frames to export", "error");
            return;
        }

        const outputFolderName = this.buildPngSequenceFolderName(
            prefix,
            startFrame,
            endFrame,
            step
        );
        const outputDirectoryPath = this.joinPathForRenderer(directoryPath, outputFolderName);

        const project = this.buildProjectState();
        project.assets.audioPath = null;

        this.setStatus("Launching PNG sequence export window...", true);
        const result = await window.electronAPI.startPngSequenceExportWindow({
            project,
            outputDirectoryPath,
            startFrame,
            endFrame,
            step,
            prefix,
            fps: outputSettings.fps,
            precision: outputSettings.qualityScale,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            transparentBackground: this.outputState.pngTransparentBackground,
        });

        if (!result) {
            this.setStatus("PNG sequence export launch failed", false);
            this.showToast("Failed to start PNG sequence export window", "error");
            return;
        }

        this.setStatus("PNG sequence export started", false);
        this.showToast(`PNG sequence export started (${frameList.length} files)`, "success");
    }

    public async exportWebm(): Promise<void> {
        if (!window.isSecureContext) {
            logError("webm", "export blocked by insecure context");
            this.showToast("WebM export requires a secure context", "error");
            return;
        }

        const { startFrame, endFrame } = this.getOutputFrameRange();
        const totalTimelineFrames = endFrame - startFrame + 1;
        if (totalTimelineFrames <= 0) {
            logError("webm", "export blocked because no frames are available", {
                startFrame,
                endFrame,
            });
            this.showToast("No frames to export", "error");
            return;
        }

        const outputSettings = this.getOutputSettings();
        const totalOutputFrames = Math.max(1, Math.round((totalTimelineFrames / 30) * outputSettings.fps));
        logInfo("webm", "export requested", {
            startFrame,
            endFrame,
            totalTimelineFrames,
            totalOutputFrames,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            qualityScale: outputSettings.qualityScale,
        });
        const defaultFileName = this.buildWebmFileName(
            outputSettings.width,
            outputSettings.height,
            startFrame,
            endFrame,
        );
        const outputFilePath = await window.electronAPI.saveWebmDialog(defaultFileName);
        if (!outputFilePath) {
            logInfo("webm", "export canceled before launch", { defaultFileName });
            this.showToast(t("toast.webmExportCanceled"), "info");
            return;
        }

        const project = this.buildProjectState();
        const audioFilePath = project.assets.audioPath;
        const webmOutputOptions = this.getWebmOutputOptions();
        const includeAudio = webmOutputOptions.includeAudio && typeof audioFilePath === "string" && audioFilePath.length > 0;
        const preferredVideoCodec = webmOutputOptions.preferredVideoCodec;
        const captureMode = webmOutputOptions.captureMode;
        if (webmOutputOptions.includeAudio && !includeAudio) {
            this.showToast(t("toast.audioMissingForWebm"), "info");
        }
        project.assets.audioPath = null;
        const initialPhysicsState = this.mmdManager.captureWebmInitialPhysicsState();
        logInfo("webm", "export launching", {
            outputFilePath,
            startFrame,
            endFrame,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            includeAudio,
            audioFilePath: includeAudio ? audioFilePath : null,
            preferredVideoCodec,
            captureMode,
            initialPhysicsModels: initialPhysicsState?.models.length ?? 0,
            initialPhysicsFrame: initialPhysicsState?.capturedFrame ?? null,
        });

        this.setStatus(t("busy.webmExportLaunching"), true);
        const result = await window.electronAPI.startWebmExportWindow({
            project,
            outputFilePath,
            startFrame,
            endFrame,
            fps: outputSettings.fps,
            outputWidth: outputSettings.width,
            outputHeight: outputSettings.height,
            includeAudio,
            audioFilePath: includeAudio ? audioFilePath : null,
            preferredVideoCodec,
            captureMode,
            initialPhysicsState,
        });

        if (!result) {
            logError("webm", "export launch failed", { outputFilePath });
            this.setStatus("WebM export launch failed", false);
            this.showToast("Failed to start WebM export window", "error");
            return;
        }

        logInfo("webm", "export launch completed", {
            jobId: result.jobId,
            totalOutputFrames,
        });
        this.setStatus("WebM export started", false);
        this.showToast(`WebM export started (${totalOutputFrames} frames)`, "success");
    }

    private sanitizeFileNameSegment(value: string): string {
        const source = value.replace(/\s+/g, "_");
        let sanitized = "";
        for (const ch of source) {
            const code = ch.charCodeAt(0);
            if (code <= 31 || '<>:"/\\|?*'.includes(ch)) {
                sanitized += "_";
            } else {
                sanitized += ch;
            }
        }
        return sanitized.length > 0 ? sanitized : "mmd_seq";
    }

    private buildPngSequenceFolderName(prefix: string, startFrame: number, endFrame: number, step: number): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return this.sanitizeFileNameSegment(`${prefix}_${timestamp}_${startFrame}-${endFrame}_s${step}`);
    }

    private buildPngFileName(width: number, height: number): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `${this.sanitizeFileNameSegment(`mmd_capture_${width}x${height}_${timestamp}`)}.png`;
    }

    private buildWebmFileName(width: number, height: number, startFrame: number, endFrame: number): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `${this.sanitizeFileNameSegment(`mmd_capture_${width}x${height}_${timestamp}_${startFrame}-${endFrame}`)}.webm`;
    }

    private joinPathForRenderer(basePath: string, childName: string): string {
        const separator = basePath.includes("\\") ? "\\" : "/";
        const normalizedBase = basePath.replace(/[\\/]+$/, "");
        return `${normalizedBase}${separator}${childName}`;
    }

    private setupOutputControls(): void {
        this.elements.outputStartFrameInput?.addEventListener("input", () => {
            this.outputState.startFrame = this.parseOutputFrameDraft(this.elements.outputStartFrameInput?.value, 0);
            if (this.dispatchAction?.({ type: "output.markFrameRangeCustomized", source: "panel" })) return;
            this.markOutputFrameRangeCustomized();
        });
        this.elements.outputEndFrameInput?.addEventListener("input", () => {
            this.outputState.endFrame = this.parseOutputFrameDraft(this.elements.outputEndFrameInput?.value, this.getMaxOutputFrame());
            if (this.dispatchAction?.({ type: "output.markFrameRangeCustomized", source: "panel" })) return;
            this.markOutputFrameRangeCustomized();
        });
        this.elements.outputStartFrameInput?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "output.sanitizeFrameRange", source: "panel", boundary: "start" })) return;
            this.sanitizeOutputFrameRange("start");
        });
        this.elements.outputEndFrameInput?.addEventListener("change", () => {
            if (this.dispatchAction?.({ type: "output.sanitizeFrameRange", source: "panel", boundary: "end" })) return;
            this.sanitizeOutputFrameRange("end");
        });
        this.elements.viewportOutputAspectSelect?.addEventListener("change", () => {
            this.setAspectPreset(this.elements.viewportOutputAspectSelect?.value ?? "16:9");
        });

        this.outputAspectRatio = this.resolveSelectedOutputAspectRatio();
        this.applyOutputPreset();
        this.syncFrameRangeFromTimeline(true);
        this.onOutputAspectChanged();
    }

    private getMaxOutputFrame(): number {
        const totalFrames = Math.floor(this.mmdManager.totalFrames);
        return Number.isFinite(totalFrames) ? Math.max(0, totalFrames) : 0;
    }

    public getOutputFrameRange(): { startFrame: number; endFrame: number } {
        const maxFrame = this.getMaxOutputFrame();
        const startFrame = Math.max(0, Math.min(maxFrame, Math.floor(this.outputState.startFrame)));
        const endFrame = Math.max(startFrame, Math.min(maxFrame, Math.floor(this.outputState.endFrame)));
        if (startFrame !== this.outputState.startFrame || endFrame !== this.outputState.endFrame) {
            this.setOutputFrameRangeValues(startFrame, endFrame);
        }
        return { startFrame, endFrame };
    }

    public isUsingPlaybackRangeForOutput(): boolean {
        return this.outputState.usePlaybackRange;
    }

    public getPlaybackFrameRange(): { startFrame: number; endFrame: number } {
        const maxFrame = this.getMaxOutputFrame();
        const startFrame = Math.max(0, Math.min(maxFrame, Math.floor(this.playbackRangeState.startFrame)));
        const endFrame = Math.max(startFrame, Math.min(maxFrame, Math.floor(this.playbackRangeState.endFrame)));
        if (startFrame !== this.playbackRangeState.startFrame || endFrame !== this.playbackRangeState.endFrame) {
            this.setPlaybackFrameRangeValues(startFrame, endFrame);
        }
        return { startFrame, endFrame };
    }

    public isPlaybackFrameStartEnabled(): boolean {
        return Boolean(this.elements.playbackFrameStartToggleInput?.checked);
    }

    public isPlaybackFrameStopEnabled(): boolean {
        return Boolean(this.elements.playbackFrameStopToggleInput?.checked);
    }

    public setPlaybackFrameRangeBoundary(boundary: "start" | "end", frame: number): void {
        const current = this.getPlaybackFrameRange();
        const startFrame = boundary === "start" ? frame : current.startFrame;
        const endFrame = boundary === "end" ? frame : current.endFrame;
        this.setPlaybackFrameRangeValues(startFrame, endFrame);
        this.isPlaybackRangeCustomized = true;
        if (this.outputState.usePlaybackRange) {
            this.setOutputFrameRangeValues(startFrame, endFrame);
            this.markOutputFrameRangeCustomized();
        }
    }

    public setPlaybackFrameToggle(kind: "start" | "stop", enabled: boolean): void {
        const input = kind === "start"
            ? this.elements.playbackFrameStartToggleInput
            : this.elements.playbackFrameStopToggleInput;
        if (input) {
            input.checked = enabled;
        }
    }

    public getOutputFormState(): OutputFormState {
        this.getOutputFrameRange();
        return { ...this.outputState };
    }

    public createExportSettingsAdapter(): WebmExportSettingsAdapter {
        return {
            getState: () => this.getOutputFormState(),
            setAspectPreset: (value) => {
                this.setAspectPreset(value, false);
            },
            setSizePreset: (value) => {
                if (this.isOutputSizePreset(value)) this.outputState.sizePreset = value;
            },
            setWidth: (value) => {
                this.outputState.width = this.clampOutputWidth(value);
            },
            setHeight: (value) => {
                this.outputState.height = this.clampOutputHeight(value);
            },
            setQualityScale: (value) => {
                this.outputState.qualityScale = this.clampOutputQuality(value);
            },
            setPngTransparentBackground: (value) => {
                this.outputState.pngTransparentBackground = Boolean(value);
            },
            setFps: (value) => {
                this.outputState.fps = this.clampOutputFps(value);
            },
            setIncludeAudio: (value) => {
                this.outputState.includeAudio = value;
            },
            setUsePlaybackRange: (value) => {
                this.outputState.usePlaybackRange = value;
            },
            syncPlaybackRange: () => {
                const range = this.getPlaybackFrameRange();
                this.setOutputFrameRangeValues(range.startFrame, range.endFrame);
                this.markOutputFrameRangeCustomized();
                return this.getOutputFormState();
            },
            resetFrameRangeToTimeline: () => this.resetOutputFrameRangeToTimeline(),
            setStartFrame: (value) => {
                this.outputState.startFrame = this.parseOutputFrameDraft(value, 0);
                if (this.elements.outputStartFrameInput) this.elements.outputStartFrameInput.value = String(this.outputState.startFrame);
            },
            setEndFrame: (value) => {
                this.outputState.endFrame = this.parseOutputFrameDraft(value, this.getMaxOutputFrame());
                if (this.elements.outputEndFrameInput) this.elements.outputEndFrameInput.value = String(this.outputState.endFrame);
            },
            setCaptureMode: () => {
                this.outputState.captureMode = FIXED_WEBM_CAPTURE_MODE;
            },
        };
    }

    public applyOutputPreset(): void {
        const ratio = this.resolveSelectedOutputAspectRatio();
        const longEdgeRaw = Number.parseInt(this.outputState.sizePreset, 10);
        const longEdge = Number.isFinite(longEdgeRaw) ? Math.max(320, Math.min(8192, longEdgeRaw)) : 1920;

        let nextWidth = longEdge;
        let nextHeight = Math.max(180, Math.round(longEdge / Math.max(0.1, ratio)));
        if (ratio < 1) {
            nextHeight = longEdge;
            nextWidth = Math.max(320, Math.round(longEdge * ratio));
        }

        this.isSyncingOutputSettings = true;
        this.outputState.width = this.clampOutputWidth(nextWidth);
        this.outputState.height = this.clampOutputHeight(nextHeight);
        this.isSyncingOutputSettings = false;

        const width = this.outputState.width;
        const height = this.outputState.height;
        if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
            this.outputAspectRatio = Math.max(0.1, width / height);
        }

        this.onOutputAspectChanged();
        this.syncViewportAspectSelect();
    }

    private syncViewportAspectSelect(): void {
        if (!this.elements.viewportOutputAspectSelect) return;
        if (this.elements.viewportOutputAspectSelect.value !== this.outputState.aspectPreset) {
            this.elements.viewportOutputAspectSelect.value = this.outputState.aspectPreset;
        }
    }

    public syncOutputDimensionWithLock(source: "width" | "height"): void {
        if (this.isSyncingOutputSettings) return;

        let width = this.clampOutputWidth(this.outputState.width);
        let height = this.clampOutputHeight(this.outputState.height);
        const locked = this.outputState.lockAspect;
        const ratio = Math.max(0.1, this.outputAspectRatio);

        if (locked) {
            if (source === "width") {
                height = this.clampOutputHeight(Math.round(width / ratio));
            } else {
                width = this.clampOutputWidth(Math.round(height * ratio));
            }
        } else if (height > 0) {
            this.outputAspectRatio = Math.max(0.1, width / height);
        }

        this.isSyncingOutputSettings = true;
        this.outputState.width = width;
        this.outputState.height = height;
        this.isSyncingOutputSettings = false;
    }

    public setOutputLockAspect(locked: boolean): void {
        this.outputState.lockAspect = locked;
        if (!locked) return;

        this.outputAspectRatio = this.resolveSelectedOutputAspectRatio();
        this.syncOutputDimensionWithLock("width");
    }

    public markOutputFrameRangeCustomized(): void {
        if (this.isSyncingFrameRange) return;
        this.isFrameRangeCustomized = true;
        this.outputState.frameRangeMode = "custom";
    }

    public resetOutputFrameRangeToTimeline(): OutputFormState {
        this.outputState.usePlaybackRange = false;
        this.isFrameRangeCustomized = false;
        this.outputState.frameRangeMode = "timeline";
        this.setOutputFrameRangeValues(0, this.getMaxOutputFrame());
        return this.getOutputFormState();
    }

    public sanitizeOutputFrameRange(source: "start" | "end"): void {
        this.sanitizeFrameRangeInputs(source);
    }

    private sanitizeFrameRangeInputs(source: "start" | "end"): void {
        const maxFrame = this.getMaxOutputFrame();
        const startRaw = Number.parseInt(this.elements.outputStartFrameInput?.value ?? String(this.outputState.startFrame), 10);
        const endRaw = Number.parseInt(this.elements.outputEndFrameInput?.value ?? String(this.outputState.endFrame), 10);

        let startFrame = Number.isFinite(startRaw) ? Math.floor(startRaw) : 0;
        let endFrame = Number.isFinite(endRaw) ? Math.floor(endRaw) : maxFrame;

        startFrame = Math.max(0, Math.min(maxFrame, startFrame));
        endFrame = Math.max(0, Math.min(maxFrame, endFrame));

        if (source === "start" && endFrame < startFrame) {
            endFrame = startFrame;
        } else if (source === "end" && startFrame > endFrame) {
            startFrame = endFrame;
        } else if (endFrame < startFrame) {
            endFrame = startFrame;
        }

        this.setOutputFrameRangeValues(startFrame, endFrame);
    }

    private setOutputFrameRangeValues(startFrame: number, endFrame: number): void {
        const normalizedStart = Math.max(0, Math.floor(startFrame));
        const normalizedEnd = Math.max(normalizedStart, Math.floor(endFrame));
        this.outputState.startFrame = normalizedStart;
        this.outputState.endFrame = normalizedEnd;
        this.isSyncingFrameRange = true;
        if (this.elements.outputStartFrameInput) this.elements.outputStartFrameInput.value = String(normalizedStart);
        if (this.elements.outputEndFrameInput) this.elements.outputEndFrameInput.value = String(normalizedEnd);
        this.isSyncingFrameRange = false;
    }

    private setPlaybackFrameRangeValues(startFrame: number, endFrame: number): void {
        const maxFrame = this.getMaxOutputFrame();
        const normalizedStart = Math.max(0, Math.min(maxFrame, Math.floor(startFrame)));
        const normalizedEnd = Math.max(normalizedStart, Math.min(maxFrame, Math.floor(endFrame)));
        this.playbackRangeState = {
            startFrame: normalizedStart,
            endFrame: normalizedEnd,
        };
    }

    private clampOutputWidth(value: number): number {
        if (!Number.isFinite(value)) return 1920;
        return Math.max(320, Math.min(8192, Math.round(value)));
    }

    private clampOutputHeight(value: number): number {
        if (!Number.isFinite(value)) return 1080;
        return Math.max(180, Math.min(8192, Math.round(value)));
    }

    private clampOutputQuality(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.max(0.25, Math.min(4, value));
    }

    private clampOutputFps(value: number): number {
        if (!Number.isFinite(value)) return 30;
        return Math.max(1, Math.min(120, Math.round(value)));
    }

    private parseOutputFrameDraft(value: string | number | null | undefined, fallback: number): number {
        const raw = typeof value === "number" ? value : Number.parseInt(value ?? String(fallback), 10);
        if (!Number.isFinite(raw)) return Math.max(0, Math.floor(fallback));
        return Math.max(0, Math.floor(raw));
    }

    private isOutputAspectPreset(value: string): boolean {
        return OUTPUT_ASPECT_OPTIONS.some((option) => option.value === value);
    }

    private isOutputSizePreset(value: string): boolean {
        return PNG_OUTPUT_SIZE_PRESET_OPTIONS.some((option) => option.value === value);
    }

    private setupPngSequenceExportStateBridge(): void {
        this.pngSequenceExportStateUnsubscribe?.();
        this.pngSequenceExportStateUnsubscribe = window.electronAPI.onPngSequenceExportState((state) => {
            this.applyPngSequenceExportState(state);
        });
        this.pngSequenceExportProgressUnsubscribe?.();
        this.pngSequenceExportProgressUnsubscribe = window.electronAPI.onPngSequenceExportProgress((progress) => {
            this.applyPngSequenceExportProgress(progress);
        });
    }

    private applyPngSequenceExportState(state: PngSequenceExportState): void {
        this.isPngSequenceExportActive = Boolean(state?.active);
        this.pngSequenceExportActiveCount = Math.max(0, Math.floor(state?.activeCount ?? 0));
        if (!this.isPngSequenceExportActive) {
            this.latestPngSequenceExportProgress = null;
        }
        this.refreshBackgroundExportLock();
    }

    private applyPngSequenceExportProgress(progress: PngSequenceExportProgress): void {
        if (!this.isPngSequenceExportActive) return;
        this.latestPngSequenceExportProgress = progress;
        this.refreshBackgroundExportLock();
    }

    private setupWebmExportStateBridge(): void {
        this.webmExportStateUnsubscribe?.();
        this.webmExportStateUnsubscribe = window.electronAPI.onWebmExportState((state) => {
            this.applyWebmExportState(state);
        });
        this.webmExportProgressUnsubscribe?.();
        this.webmExportProgressUnsubscribe = window.electronAPI.onWebmExportProgress((progress) => {
            this.applyWebmExportProgress(progress);
        });
    }

    private startBackgroundExportMonitor(): void {
        if (this.backgroundExportMonitorIntervalId !== null) return;
        this.backgroundExportMonitorIntervalId = window.setInterval(() => {
            if (!this.hasBackgroundExportActive()) return;
            this.refreshBackgroundExportLock();
        }, 500);
    }

    private applyWebmExportState(state: WebmExportState): void {
        this.isWebmExportActive = Boolean(state?.active);
        this.webmExportActiveCount = Math.max(0, Math.floor(state?.activeCount ?? 0));
        if (!this.isWebmExportActive) {
            this.latestWebmExportProgress = null;
        }
        this.refreshBackgroundExportLock();
    }

    private applyWebmExportProgress(progress: WebmExportProgress): void {
        if (!this.isWebmExportActive) return;
        this.latestWebmExportProgress = progress;
        this.refreshBackgroundExportLock();
    }

    private refreshBackgroundExportLock(): void {
        const active = this.hasBackgroundExportActive();
        this.elements.appRoot.classList.toggle("ui-export-lock", active);
        this.elements.busyOverlay?.classList.toggle("hidden", !active);
        this.elements.busyOverlay?.setAttribute("aria-hidden", active ? "false" : "true");

        if (!active) {
            if (this.elements.busyText) {
                this.elements.busyText.textContent = t("busy.backgroundExportFinished");
            }
            return;
        }

        if (this.isPlaybackActive()) {
            this.onPausePlayback();
        }
        this.updateBackgroundExportBusyMessage();
    }

    private updateBackgroundExportBusyMessage(): void {
        const busyText = this.elements.busyText;
        if (!busyText) return;

        if (this.isWebmExportActive) {
            const progress = this.latestWebmExportProgress;
            if (progress) {
                const { currentFrame, progressCount, totalCount } = normalizeExportFrameProgress(
                    progress.frame,
                    progress.startFrame,
                    progress.endFrame,
                );
                const phaseLabel = formatWebmExportPhaseLabel(progress.phase);
                if (totalCount > 0) {
                    const ratio = Math.min(100, Math.max(0, (progressCount / totalCount) * 100));
                    const baseText = t("busy.webmProgress", {
                        phase: phaseLabel,
                        encoded: progressCount,
                        total: totalCount,
                        ratio: ratio.toFixed(1),
                        frame: currentFrame,
                    });
                    const detailText = typeof progress.message === "string" && progress.message.trim().length > 0
                        ? progress.message.trim()
                        : "";
                    busyText.textContent = detailText.length > 0
                        ? `${baseText}\n${detailText}`
                        : baseText;
                    return;
                }
                busyText.textContent = t("busy.webmExportRunning");
                return;
            }
            if (this.webmExportActiveCount > 1) {
                busyText.textContent = t("busy.webmExportActive", { count: this.webmExportActiveCount });
                return;
            }
            busyText.textContent = t("busy.webmExportRunning");
            return;
        }

        if (this.isPngSequenceExportActive) {
            const progress = this.latestPngSequenceExportProgress;
            if (progress) {
                const { currentFrame, progressCount, totalCount } = normalizeExportFrameProgress(
                    progress.frame,
                    progress.startFrame,
                    progress.endFrame,
                );
                if (totalCount > 0) {
                    const ratio = Math.min(100, Math.max(0, (progressCount / totalCount) * 100));
                    busyText.textContent = t("busy.webmProgress", {
                        phase: "PNG",
                        encoded: progressCount,
                        total: totalCount,
                        ratio: ratio.toFixed(1),
                        frame: currentFrame,
                    });
                    return;
                }
            }
            if (this.pngSequenceExportActiveCount > 1) {
                busyText.textContent = t("busy.webmExportActive", { count: this.pngSequenceExportActiveCount });
                return;
            }
            busyText.textContent = progress?.exportKind === "sequence"
                ? t("busy.exportingPngSequence")
                : t("busy.exportingPng");
        }
    }
}
