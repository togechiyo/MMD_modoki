import type { MmdManager, WgslMaterialShaderPresetId } from "./mmd-manager";
import type { Timeline } from "./timeline";
import type { BottomPanel } from "./bottom-panel";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type {
    InterpolationChannelPreview,
    InterpolationCurve,
    KeyframeTrack,
    ModelInfo,
    MotionInfo,
    PngSequenceExportProgress,
    PngSequenceExportState,
    TimelineInterpolationPreview,
} from "./types";

type CameraViewPreset = "left" | "front" | "right";
type NumericArrayLike = ArrayLike<number> | null | undefined;

type RuntimeMovableBoneTrackLike = {
    name: string;
    frameNumbers: ArrayLike<number>;
    positions: ArrayLike<number>;
    positionInterpolations: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    physicsToggles: ArrayLike<number>;
};

type RuntimeBoneTrackLike = {
    name: string;
    frameNumbers: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    physicsToggles: ArrayLike<number>;
};

type RuntimeCameraTrackLike = {
    frameNumbers: ArrayLike<number>;
    positions: ArrayLike<number>;
    positionInterpolations: ArrayLike<number>;
    rotations: ArrayLike<number>;
    rotationInterpolations: ArrayLike<number>;
    distances: ArrayLike<number>;
    distanceInterpolations: ArrayLike<number>;
    fovs: ArrayLike<number>;
    fovInterpolations: ArrayLike<number>;
};

type RuntimeMovableBoneTrackMutable = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

type RuntimeBoneTrackMutable = {
    frameNumbers: Uint32Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

type RuntimeCameraTrackMutable = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    distances: Float32Array;
    distanceInterpolations: Uint8Array;
    fovs: Float32Array;
    fovInterpolations: Uint8Array;
};

type RuntimeModelAnimationLike = {
    movableBoneTracks: readonly RuntimeMovableBoneTrackLike[];
    boneTracks: readonly RuntimeBoneTrackLike[];
};

type RuntimeCameraAnimationLike = {
    cameraTrack: RuntimeCameraTrackLike;
};

type RuntimeAnimatableLike = {
    createRuntimeAnimation: (animation: unknown) => unknown;
    setRuntimeAnimation: (handle: unknown) => void;
};

type RuntimeCameraLike = RuntimeAnimatableLike & {
    destroyRuntimeAnimation: (handle: unknown) => void;
};

type NumericWritableArray = {
    length: number;
    [index: number]: number;
};

type InterpolationChannelBinding = {
    values: NumericWritableArray;
    offset: number;
};

type InterpolationDragState = {
    channelId: string;
    pointIndex: 1 | 2;
    changed: boolean;
};

type MmdManagerInternalView = {
    currentModel: (object & RuntimeAnimatableLike) | null;
    modelSourceAnimationsByModel: WeakMap<object, RuntimeModelAnimationLike>;
    cameraSourceAnimation: RuntimeCameraAnimationLike | null;
    mmdCamera: RuntimeCameraLike;
    cameraAnimationHandle: unknown | null;
};

export class UIController {
    private static readonly CAMERA_SELECT_VALUE = "__camera__";
    private static readonly MIN_TIMELINE_WIDTH = 160;
    private static readonly MIN_VIEWPORT_WIDTH = 360;

    private mmdManager: MmdManager;
    private timeline: Timeline;
    private bottomPanel: BottomPanel;

    // Button elements
    private btnLoadFile: HTMLElement;
    private btnSaveProject: HTMLElement;
    private btnLoadProject: HTMLElement;
    private btnExportPng: HTMLElement;
    private btnExportPngSeq: HTMLElement | null = null;
    private btnToggleGround: HTMLElement;
    private groundToggleText: HTMLElement;
    private btnToggleSkydome: HTMLElement;
    private skydomeToggleText: HTMLElement;
    private btnTogglePhysics: HTMLElement;
    private physicsToggleText: HTMLElement;
    private btnToggleShaderPanel: HTMLButtonElement | null = null;
    private shaderPanelToggleText: HTMLElement | null = null;
    private btnToggleFullscreenUi: HTMLButtonElement | null = null;
    private fullscreenUiToggleText: HTMLElement | null = null;
    private btnPlay: HTMLElement;
    private btnPause: HTMLElement;
    private btnStop: HTMLElement;
    private btnSkipStart: HTMLElement;
    private btnSkipEnd: HTMLElement;
    private currentFrameEl: HTMLElement;
    private totalFramesEl: HTMLElement;
    private statusText: HTMLElement;
    private statusDot: HTMLElement;
    private viewportOverlay: HTMLElement;
    private btnKeyframeAdd: HTMLButtonElement;
    private btnKeyframeDelete: HTMLButtonElement;
    private btnKeyframeNudgeLeft: HTMLButtonElement;
    private btnKeyframeNudgeRight: HTMLButtonElement;
    private timelineSelectionLabel: HTMLElement;
    private interpolationTrackNameLabel: HTMLElement;
    private interpolationFrameLabel: HTMLElement;
    private interpolationTypeSelect: HTMLSelectElement;
    private interpolationStatusLabel: HTMLElement;
    private interpolationCurveList: HTMLElement;
    private modelSelect: HTMLSelectElement;
    private btnModelVisibility: HTMLButtonElement;
    private btnModelDelete: HTMLButtonElement;
    private shaderModelNameEl: HTMLElement | null = null;
    private shaderPresetSelect: HTMLSelectElement | null = null;
    private shaderApplyButton: HTMLButtonElement | null = null;
    private shaderResetButton: HTMLButtonElement | null = null;
    private shaderPanelNote: HTMLElement | null = null;
    private shaderMaterialList: HTMLElement | null = null;
    private readonly shaderSelectedMaterialKeys = new Map<number, string>();
    private mainContentEl: HTMLElement;
    private timelinePanelEl: HTMLElement | null = null;
    private timelineResizerEl: HTMLElement | null = null;
    private shaderPanelEl: HTMLElement | null = null;
    private isTimelineResizing = false;
    private camFovSlider: HTMLInputElement | null = null;
    private camFovValueEl: HTMLElement | null = null;
    private camDistanceSlider: HTMLInputElement | null = null;
    private camDistanceValueEl: HTMLElement | null = null;
    private camViewLeftBtn: HTMLButtonElement | null = null;
    private camViewFrontBtn: HTMLButtonElement | null = null;
    private camViewRightBtn: HTMLButtonElement | null = null;
    private physicsGravityAccelSlider: HTMLInputElement | null = null;
    private physicsGravityDirXSlider: HTMLInputElement | null = null;
    private physicsGravityDirYSlider: HTMLInputElement | null = null;
    private physicsGravityDirZSlider: HTMLInputElement | null = null;
    private dofFocusSlider: HTMLInputElement | null = null;
    private dofFocusValueEl: HTMLElement | null = null;
    private dofFStopValueEl: HTMLElement | null = null;
    private dofFocalLengthSlider: HTMLInputElement | null = null;
    private dofFocalLengthValueEl: HTMLElement | null = null;
    private lensDistortionSlider: HTMLInputElement | null = null;
    private lensDistortionValueEl: HTMLElement | null = null;
    private syncingBoneSelection = false;
    private readonly interpolationChannelBindings = new Map<string, InterpolationChannelBinding>();
    private interpolationDragState: InterpolationDragState | null = null;
    private appRootEl: HTMLElement;
    private busyOverlayEl: HTMLElement | null = null;
    private busyTextEl: HTMLElement | null = null;
    private pngSequenceExportStateUnsubscribe: (() => void) | null = null;
    private pngSequenceExportProgressUnsubscribe: (() => void) | null = null;
    private isPngSequenceExportActive = false;
    private latestPngSequenceExportProgress: PngSequenceExportProgress | null = null;
    private isUiFullscreenActive = false;

    constructor(mmdManager: MmdManager, timeline: Timeline, bottomPanel: BottomPanel) {
        this.mmdManager = mmdManager;
        this.timeline = timeline;
        this.bottomPanel = bottomPanel;

        // Get DOM elements
        this.btnLoadFile = document.getElementById("btn-load-file")!;
        this.btnSaveProject = document.getElementById("btn-save-project")!;
        this.btnLoadProject = document.getElementById("btn-load-project")!;
        this.btnExportPng = document.getElementById("btn-export-png")!;
        this.btnExportPngSeq = document.getElementById("btn-export-png-seq");
        this.btnToggleGround = document.getElementById("btn-toggle-ground")!;
        this.groundToggleText = document.getElementById("ground-toggle-text")!;
        this.btnToggleSkydome = document.getElementById("btn-toggle-skydome")!;
        this.skydomeToggleText = document.getElementById("skydome-toggle-text")!;
        this.btnTogglePhysics = document.getElementById("btn-toggle-physics")!;
        this.physicsToggleText = document.getElementById("physics-toggle-text")!;
        this.btnToggleShaderPanel = document.getElementById("btn-toggle-shader-panel") as HTMLButtonElement | null;
        this.shaderPanelToggleText = document.getElementById("shader-panel-toggle-text");
        this.btnToggleFullscreenUi = document.getElementById("btn-toggle-fullscreen-ui") as HTMLButtonElement | null;
        this.fullscreenUiToggleText = document.getElementById("fullscreen-ui-toggle-text");
        this.btnPlay = document.getElementById("btn-play")!;
        this.btnPause = document.getElementById("btn-pause")!;
        this.btnStop = document.getElementById("btn-stop")!;
        this.btnSkipStart = document.getElementById("btn-skip-start")!;
        this.btnSkipEnd = document.getElementById("btn-skip-end")!;
        this.currentFrameEl = document.getElementById("current-frame")!;
        this.totalFramesEl = document.getElementById("total-frames")!;
        this.statusText = document.getElementById("status-text")!;
        this.statusDot = document.querySelector(".status-dot")!;
        this.viewportOverlay = document.getElementById("viewport-overlay")!;
        this.btnKeyframeAdd = document.getElementById("btn-kf-add") as HTMLButtonElement;
        this.btnKeyframeDelete = document.getElementById("btn-kf-delete") as HTMLButtonElement;
        this.btnKeyframeNudgeLeft = document.getElementById("btn-kf-nudge-left") as HTMLButtonElement;
        this.btnKeyframeNudgeRight = document.getElementById("btn-kf-nudge-right") as HTMLButtonElement;
        this.timelineSelectionLabel = document.getElementById("timeline-selection-label")!;
        this.interpolationTrackNameLabel = document.getElementById("interp-track-name")!;
        this.interpolationFrameLabel = document.getElementById("interp-frame")!;
        this.interpolationTypeSelect = document.getElementById("interp-type") as HTMLSelectElement;
        this.interpolationStatusLabel = document.getElementById("interp-status")!;
        this.interpolationCurveList = document.getElementById("interp-curve-list")!;
        this.modelSelect = document.getElementById("info-model-select") as HTMLSelectElement;
        this.btnModelVisibility = document.getElementById("btn-model-visibility") as HTMLButtonElement;
        this.btnModelDelete = document.getElementById("btn-model-delete") as HTMLButtonElement;
        this.shaderModelNameEl = document.getElementById("shader-model-name");
        this.shaderPresetSelect = document.getElementById("shader-preset-select") as HTMLSelectElement | null;
        this.shaderApplyButton = document.getElementById("btn-shader-apply") as HTMLButtonElement | null;
        this.shaderResetButton = document.getElementById("btn-shader-reset") as HTMLButtonElement | null;
        this.shaderPanelNote = document.getElementById("shader-panel-note");
        this.shaderMaterialList = document.getElementById("shader-material-list");
        this.appRootEl = document.getElementById("app") as HTMLElement;
        this.busyOverlayEl = document.getElementById("ui-busy-overlay");
        this.busyTextEl = document.getElementById("ui-busy-text");
        this.mainContentEl = document.getElementById("main-content") as HTMLElement;
        this.timelinePanelEl = document.getElementById("timeline-panel");
        this.timelineResizerEl = document.getElementById("timeline-resizer");
        this.shaderPanelEl = document.getElementById("shader-panel");

        this.setupEventListeners();
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupFileDrop();
        this.setupPngSequenceExportStateBridge();
        this.setupPerfDisplay();
        this.refreshModelSelector();
        this.updateGroundToggleButton(this.mmdManager.isGroundVisible());
        this.updateSkydomeToggleButton(this.mmdManager.isSkydomeVisible());
        this.updatePhysicsToggleButton(
            this.mmdManager.getPhysicsEnabled(),
            this.mmdManager.isPhysicsAvailable()
        );
        this.updateInfoActionButtons();
        this.updateShaderPanelToggleButton(this.isShaderPanelExpanded());
        this.updateFullscreenUiToggleButton(false);
        this.setupTimelineResizer();
        this.refreshShaderPanel();
        this.updateTimelineEditState();

        window.addEventListener("beforeunload", (event) => {
            if (this.isPngSequenceExportActive) {
                event.preventDefault();
                event.returnValue = "";
                return;
            }
            this.pngSequenceExportStateUnsubscribe?.();
            this.pngSequenceExportStateUnsubscribe = null;
            this.pngSequenceExportProgressUnsubscribe?.();
            this.pngSequenceExportProgressUnsubscribe = null;
        });
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadFile.addEventListener("click", () => {
            void this.loadFileFromDialog();
        });
        this.btnSaveProject.addEventListener("click", () => this.saveProject());
        this.btnLoadProject.addEventListener("click", () => this.loadProject());
        this.btnExportPng.addEventListener("click", () => this.exportPNG());
        this.btnExportPngSeq?.addEventListener("click", () => {
            void this.exportPNGSequence();
        });
        this.interpolationTypeSelect.addEventListener("change", () => this.updateTimelineEditState());
        this.btnToggleGround.addEventListener("click", () => {
            const visible = this.mmdManager.toggleGroundVisible();
            this.updateGroundToggleButton(visible);
            this.showToast(visible ? "Ground: ON" : "Ground: OFF", "info");
        });
        this.btnToggleSkydome.addEventListener("click", () => {
            const visible = this.mmdManager.toggleSkydomeVisible();
            this.updateSkydomeToggleButton(visible);
            this.showToast(visible ? "Skydome: ON" : "Skydome: OFF", "info");
        });
        const btnToggleAa = document.getElementById("btn-toggle-aa") as HTMLButtonElement | null;
        const aaToggleText = document.getElementById("aa-toggle-text");
        if (btnToggleAa && aaToggleText) {
            const updateAaButton = () => {
                const enabled = this.mmdManager.antialiasEnabled;
                aaToggleText.textContent = enabled ? "AA ON" : "AA OFF";
                btnToggleAa.setAttribute("aria-pressed", enabled ? "true" : "false");
                btnToggleAa.classList.toggle("toggle-on", enabled);
            };
            updateAaButton();
            btnToggleAa.addEventListener("click", () => {
                this.mmdManager.antialiasEnabled = !this.mmdManager.antialiasEnabled;
                updateAaButton();
                this.showToast(this.mmdManager.antialiasEnabled ? "AA: ON" : "AA: OFF", "info");
            });
        }
        this.btnTogglePhysics.addEventListener("click", () => {
            if (!this.mmdManager.isPhysicsAvailable()) {
                this.updatePhysicsToggleButton(false, false);
                this.showToast("Physics is unavailable in this environment", "error");
                return;
            }

            const enabled = this.mmdManager.togglePhysicsEnabled();
            this.updatePhysicsToggleButton(enabled, true);
            this.showToast(enabled ? "Physics: ON" : "Physics: OFF", "info");
        });
        this.btnToggleShaderPanel?.addEventListener("click", () => {
            const nextVisible = !this.isShaderPanelExpanded();
            this.setShaderPanelVisible(nextVisible);
            this.showToast(nextVisible ? "Shader panel shown" : "Shader panel hidden", "info");
        });
        this.btnToggleFullscreenUi?.addEventListener("click", () => {
            this.toggleUiFullscreenMode();
        });
        const physicsGravityAccel = document.getElementById("physics-gravity-accel") as HTMLInputElement | null;
        const physicsGravityAccelVal = document.getElementById("physics-gravity-accel-val");
        const physicsGravityDirX = document.getElementById("physics-gravity-dir-x") as HTMLInputElement | null;
        const physicsGravityDirXVal = document.getElementById("physics-gravity-dir-x-val");
        const physicsGravityDirY = document.getElementById("physics-gravity-dir-y") as HTMLInputElement | null;
        const physicsGravityDirYVal = document.getElementById("physics-gravity-dir-y-val");
        const physicsGravityDirZ = document.getElementById("physics-gravity-dir-z") as HTMLInputElement | null;
        const physicsGravityDirZVal = document.getElementById("physics-gravity-dir-z-val");
        this.physicsGravityAccelSlider = physicsGravityAccel;
        this.physicsGravityDirXSlider = physicsGravityDirX;
        this.physicsGravityDirYSlider = physicsGravityDirY;
        this.physicsGravityDirZSlider = physicsGravityDirZ;

        if (physicsGravityAccel && physicsGravityAccelVal) {
            const initialAccel = Math.round(this.mmdManager.getPhysicsGravityAcceleration());
            physicsGravityAccel.value = String(initialAccel);
            physicsGravityAccelVal.textContent = String(initialAccel);
            physicsGravityAccel.addEventListener("input", () => {
                const next = Number(physicsGravityAccel.value);
                this.mmdManager.setPhysicsGravityAcceleration(next);
                physicsGravityAccelVal.textContent = String(Math.round(next));
            });
        }

        if (
            physicsGravityDirX &&
            physicsGravityDirXVal &&
            physicsGravityDirY &&
            physicsGravityDirYVal &&
            physicsGravityDirZ &&
            physicsGravityDirZVal
        ) {
            const initialDir = this.mmdManager.getPhysicsGravityDirection();
            physicsGravityDirX.value = String(Math.round(initialDir.x));
            physicsGravityDirY.value = String(Math.round(initialDir.y));
            physicsGravityDirZ.value = String(Math.round(initialDir.z));
            physicsGravityDirXVal.textContent = String(Math.round(initialDir.x));
            physicsGravityDirYVal.textContent = String(Math.round(initialDir.y));
            physicsGravityDirZVal.textContent = String(Math.round(initialDir.z));

            const applyGravityDirection = () => {
                const x = Number(physicsGravityDirX.value);
                const y = Number(physicsGravityDirY.value);
                const z = Number(physicsGravityDirZ.value);
                this.mmdManager.setPhysicsGravityDirection(x, y, z);
                physicsGravityDirXVal.textContent = String(Math.round(x));
                physicsGravityDirYVal.textContent = String(Math.round(y));
                physicsGravityDirZVal.textContent = String(Math.round(z));
            };

            physicsGravityDirX.addEventListener("input", applyGravityDirection);
            physicsGravityDirY.addEventListener("input", applyGravityDirection);
            physicsGravityDirZ.addEventListener("input", applyGravityDirection);
        }
        // Playback
        this.btnPlay.addEventListener("click", () => this.play());
        this.btnPause.addEventListener("click", () => this.pause());
        this.btnStop.addEventListener("click", () => this.stop());
        this.btnSkipStart.addEventListener("click", () => this.mmdManager.seekToBoundary(0));
        this.btnSkipEnd.addEventListener("click", () =>
            this.mmdManager.seekToBoundary(this.mmdManager.totalFrames)
        );

        // Active model selector
        this.modelSelect.addEventListener("change", () => {
            const value = this.modelSelect.value;
            if (value === UIController.CAMERA_SELECT_VALUE) {
                this.mmdManager.setTimelineTarget("camera");
                this.applyCameraSelectionUI();
                this.refreshModelSelector();
                this.refreshShaderPanel();
                this.showToast("Timeline target: Camera", "success");
                return;
            }

            const index = Number.parseInt(value, 10);
            if (Number.isNaN(index)) return;
            const ok = this.mmdManager.setActiveModelByIndex(index);
            if (!ok) {
                this.showToast("Failed to switch active model", "error");
                return;
            }

            this.mmdManager.setTimelineTarget("model");
            this.refreshModelSelector();
            this.refreshShaderPanel();
            this.showToast("Active model switched", "success");
        });

        this.btnModelVisibility.addEventListener("click", () => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const visible = this.mmdManager.toggleActiveModelVisibility();
            this.updateInfoActionButtons();
            this.showToast(visible ? "Model visible" : "Model hidden", "info");
        });

        this.btnModelDelete.addEventListener("click", () => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const ok = window.confirm("Delete selected model?");
            if (!ok) return;

            const removed = this.mmdManager.removeActiveModel();
            if (!removed) {
                this.showToast("Failed to delete model", "error");
                return;
            }

            if (this.mmdManager.getLoadedModels().length === 0) {
                this.mmdManager.setTimelineTarget("camera");
                this.applyCameraSelectionUI();
            }

            this.refreshModelSelector();
            this.refreshShaderPanel();
            this.showToast("Model deleted", "success");
        });

        this.shaderApplyButton?.addEventListener("click", () => {
            this.applyShaderPresetFromPanel(false);
        });
        this.shaderResetButton?.addEventListener("click", () => {
            this.applyShaderPresetFromPanel(true);
        });

        // Camera controls
        const btnCamLeft = document.getElementById("btn-cam-left") as HTMLButtonElement | null;
        const btnCamFront = document.getElementById("btn-cam-front") as HTMLButtonElement | null;
        const btnCamRight = document.getElementById("btn-cam-right") as HTMLButtonElement | null;
        const camFov = document.getElementById("cam-fov") as HTMLInputElement;
        const camDistance = document.getElementById("cam-distance") as HTMLInputElement | null;
        const camFovVal = document.getElementById("cam-fov-value")!;
        const camDistanceVal = document.getElementById("cam-distance-value");
        this.camViewLeftBtn = btnCamLeft;
        this.camViewFrontBtn = btnCamFront;
        this.camViewRightBtn = btnCamRight;
        this.camFovSlider = camFov;
        this.camFovValueEl = camFovVal;
        this.camDistanceSlider = camDistance;
        this.camDistanceValueEl = camDistanceVal;
        const switchCameraView = (view: CameraViewPreset) => {
            this.mmdManager.setCameraView(view);
            this.updateCameraViewButtons(view);
        };
        btnCamLeft?.addEventListener("click", () => switchCameraView("left"));
        btnCamFront?.addEventListener("click", () => switchCameraView("front"));
        btnCamRight?.addEventListener("click", () => switchCameraView("right"));
        camFov.addEventListener("input", () => {
            const val = Number(camFov.value);
            camFovVal.textContent = `${Math.round(val)} deg`;
            this.mmdManager.setCameraFov(val);
            this.refreshDofAutoFocusReadout();
            this.refreshLensDistortionAutoReadout();
        });
        if (camDistance && camDistanceVal) {
            camDistance.addEventListener("input", () => {
                const val = Number(camDistance.value);
                this.mmdManager.setCameraDistance(val);
                camDistanceVal.textContent = `${this.mmdManager.getCameraDistance().toFixed(1)}m`;
                this.refreshDofAutoFocusReadout();
            });
        }
        // Initialize camera UI from runtime values
        this.updateCameraViewButtons("front");
        const initialFov = this.mmdManager.getCameraFov();
        camFov.value = String(Math.round(initialFov));
        camFovVal.textContent = `${Math.round(initialFov)} deg`;
        if (camDistance && camDistanceVal) {
            const initialDistance = this.mmdManager.getCameraDistance();
            const min = Number(camDistance.min);
            const max = Number(camDistance.max);
            const clamped = Math.max(min, Math.min(max, initialDistance));
            camDistance.value = String(Math.round(clamped));
            camDistanceVal.textContent = `${initialDistance.toFixed(1)}m`;
        }

        // Timeline seek
        this.timeline.onSeek = (frame) => {
            this.mmdManager.seekTo(frame);
        };
        this.timeline.onSelectionChanged = (track) => {
            this.syncBoneVisualizerSelection(track);
            this.syncBottomBoneSelectionFromTimeline(track);
            this.updateTimelineEditState();
        };
        this.bottomPanel.onBoneSelectionChanged = (boneName) => {
            this.syncTimelineBoneSelectionFromBottomPanel(boneName);
        };

        this.btnKeyframeAdd.addEventListener("click", () => this.addKeyframeAtCurrentFrame());
        this.btnKeyframeDelete.addEventListener("click", () => this.deleteSelectedKeyframe());
        this.btnKeyframeNudgeLeft.addEventListener("click", () => this.nudgeSelectedKeyframe(-1));
        this.btnKeyframeNudgeRight.addEventListener("click", () => this.nudgeSelectedKeyframe(1));

        // Lighting controls
        const elAzimuth = document.getElementById("light-azimuth") as HTMLInputElement;
        const elElevation = document.getElementById("light-elevation") as HTMLInputElement;
        const elIntensity = document.getElementById("light-intensity") as HTMLInputElement;
        const elAmbient = document.getElementById("light-ambient") as HTMLInputElement;
        const elShadow = document.getElementById("light-shadow") as HTMLInputElement;
        const elSelfShadowSoftness = document.getElementById("light-self-shadow-softness") as HTMLInputElement;
        const elOcclusionShadowSoftness = document.getElementById("light-occlusion-shadow-softness") as HTMLInputElement;
        const elLightMode = document.getElementById("light-mode-select") as HTMLSelectElement | null;
        const valAz = document.getElementById("light-azimuth-val")!;
        const valEl = document.getElementById("light-elevation-val")!;
        const valInt = document.getElementById("light-intensity-val")!;
        const valAmb = document.getElementById("light-ambient-val")!;
        const valSh = document.getElementById("light-shadow-val")!;
        const valSelfShSoftness = document.getElementById("light-self-shadow-softness-val")!;
        const valOcclusionShSoftness = document.getElementById("light-occlusion-shadow-softness-val")!;
        const lightRows = Array.from(document.querySelectorAll(".light-row--light"));
        const shadowRows = Array.from(document.querySelectorAll(".light-row--shadow"));
        const elEffectColorTemp = document.getElementById("effect-color-temp") as HTMLInputElement | null;
        const valEffectColorTemp = document.getElementById("effect-color-temp-val");
        const elEffectContrast = document.getElementById("effect-contrast") as HTMLInputElement | null;
        const valEffectContrast = document.getElementById("effect-contrast-val");
        const elEffectGamma = document.getElementById("effect-gamma") as HTMLInputElement | null;
        const valEffectGamma = document.getElementById("effect-gamma-val");
        const elEffectLensDistortion = document.getElementById("effect-lens-distortion") as HTMLInputElement | null;
        const valEffectLensDistortion = document.getElementById("effect-lens-distortion-val");
        const elEffectLensDistortionInfluence = document.getElementById("effect-lens-distortion-influence") as HTMLInputElement | null;
        const valEffectLensDistortionInfluence = document.getElementById("effect-lens-distortion-influence-val");
        const elEffectLensEdgeBlur = document.getElementById("effect-lens-edge-blur") as HTMLInputElement | null;
        const valEffectLensEdgeBlur = document.getElementById("effect-lens-edge-blur-val");
        const elEffectDofEnabled = document.getElementById("effect-dof-enabled") as HTMLInputElement | null;
        const valEffectDofEnabled = document.getElementById("effect-dof-enabled-val");
        const elEffectDofQuality = document.getElementById("effect-dof-quality") as HTMLSelectElement | null;
        const valEffectDofQuality = document.getElementById("effect-dof-quality-val");
        const elEffectDofFocus = document.getElementById("effect-dof-focus") as HTMLInputElement | null;
        const valEffectDofFocus = document.getElementById("effect-dof-focus-val");
        const elEffectDofFocusOffset = document.getElementById("effect-dof-focus-offset") as HTMLInputElement | null;
        const valEffectDofFocusOffset = document.getElementById("effect-dof-focus-offset-val");
        const elEffectDofFStop = document.getElementById("effect-dof-fstop") as HTMLInputElement | null;
        const valEffectDofFStop = document.getElementById("effect-dof-fstop-val");
        const elEffectDofNearSuppression = document.getElementById("effect-dof-near-suppression") as HTMLInputElement | null;
        const valEffectDofNearSuppression = document.getElementById("effect-dof-near-suppression-val");
        const elEffectDofFocalInvert = document.getElementById("effect-dof-focal-invert") as HTMLInputElement | null;
        const valEffectDofFocalInvert = document.getElementById("effect-dof-focal-invert-val");
        const elEffectDofLensBlur = document.getElementById("effect-dof-lens-blur") as HTMLInputElement | null;
        const valEffectDofLensBlur = document.getElementById("effect-dof-lens-blur-val");
        const elEffectDofLensSize = document.getElementById("effect-dof-lens-size") as HTMLInputElement | null;
        const valEffectDofLensSize = document.getElementById("effect-dof-lens-size-val");
        const elEffectDofFocalLength = document.getElementById("effect-dof-focal-length") as HTMLInputElement | null;
        const valEffectDofFocalLength = document.getElementById("effect-dof-focal-length-val");
        const elEffectEdgeWidth = document.getElementById("effect-edge-width") as HTMLInputElement | null;
        const valEffectEdgeWidth = document.getElementById("effect-edge-width-val");

        const updateDir = () => {
            const az = Number(elAzimuth.value);
            const el = Number(elElevation.value);
            valAz.textContent = `${az} deg`;
            valEl.textContent = `${el} deg`;
            this.mmdManager.setLightDirection(az, el);
        };

        const applyLightMode = () => {
            const mode = elLightMode?.value === "shadow" ? "shadow" : "light";
            for (const row of lightRows) {
                row.classList.toggle("light-row--hidden", mode !== "light");
            }
            for (const row of shadowRows) {
                row.classList.toggle("light-row--hidden", mode !== "shadow");
            }
        };

        if (elLightMode) {
            elLightMode.value = "light";
            elLightMode.addEventListener("change", applyLightMode);
        }
        applyLightMode();

        elAzimuth.addEventListener("input", updateDir);
        elElevation.addEventListener("input", updateDir);

        elIntensity.addEventListener("input", () => {
            const v = Number(elIntensity.value) / 100;
            valInt.textContent = v.toFixed(1);
            this.mmdManager.lightIntensity = v;
        });
        elAmbient.addEventListener("input", () => {
            const v = Number(elAmbient.value) / 100;
            valAmb.textContent = v.toFixed(1);
            this.mmdManager.ambientIntensity = v;
        });

        // Initialize lighting sliders from runtime defaults.
        elIntensity.value = String(Math.round(this.mmdManager.lightIntensity * 100));
        valInt.textContent = this.mmdManager.lightIntensity.toFixed(1);
        elAmbient.value = String(Math.round(this.mmdManager.ambientIntensity * 100));
        valAmb.textContent = this.mmdManager.ambientIntensity.toFixed(1);

        elShadow.addEventListener("input", () => {
            const v = Number(elShadow.value) / 100;
            valSh.textContent = v.toFixed(2);
            this.mmdManager.shadowDarkness = v;
        });
        elSelfShadowSoftness.addEventListener("input", () => {
            const v = Number(elSelfShadowSoftness.value) / 1000;
            valSelfShSoftness.textContent = v.toFixed(3);
            this.mmdManager.selfShadowEdgeSoftness = v;
        });
        elOcclusionShadowSoftness.addEventListener("input", () => {
            const v = Number(elOcclusionShadowSoftness.value) / 1000;
            valOcclusionShSoftness.textContent = v.toFixed(3);
            this.mmdManager.occlusionShadowEdgeSoftness = v;
        });

        // Shadow is always enabled in UI.
        this.mmdManager.setShadowEnabled(true);
        elShadow.value = String(Math.round(this.mmdManager.shadowDarkness * 100));
        valSh.textContent = this.mmdManager.shadowDarkness.toFixed(2);
        elSelfShadowSoftness.value = String(Math.round(this.mmdManager.selfShadowEdgeSoftness * 1000));
        valSelfShSoftness.textContent = this.mmdManager.selfShadowEdgeSoftness.toFixed(3);
        elOcclusionShadowSoftness.value = String(Math.round(this.mmdManager.occlusionShadowEdgeSoftness * 1000));
        valOcclusionShSoftness.textContent = this.mmdManager.occlusionShadowEdgeSoftness.toFixed(3);

        if (elEffectColorTemp && valEffectColorTemp) {
            const applyColorTemperature = () => {
                const kelvin = Number(elEffectColorTemp.value);
                this.mmdManager.lightColorTemperature = kelvin;
                valEffectColorTemp.textContent = `${Math.round(this.mmdManager.lightColorTemperature)} K`;
            };
            elEffectColorTemp.value = String(Math.round(this.mmdManager.lightColorTemperature));
            applyColorTemperature();
            elEffectColorTemp.addEventListener("input", applyColorTemperature);
        }

        if (elEffectContrast && valEffectContrast) {
            const applyContrast = () => {
                const offsetPercent = Number(elEffectContrast.value);
                const contrast = 1 + offsetPercent / 100;
                this.mmdManager.postEffectContrast = contrast;
                const roundedOffset = Math.round((this.mmdManager.postEffectContrast - 1) * 100);
                valEffectContrast.textContent = `${roundedOffset}%`;
            };
            elEffectContrast.value = String(Math.round((this.mmdManager.postEffectContrast - 1) * 100));
            applyContrast();
            elEffectContrast.addEventListener("input", applyContrast);
        }

        if (elEffectGamma && valEffectGamma) {
            const applyGamma = () => {
                const offsetPercent = Number(elEffectGamma.value);
                // 0% is neutral (gamma=1.0). Positive values brighten, negative values darken.
                const gammaPower = Math.pow(2, -offsetPercent / 100);
                this.mmdManager.postEffectGamma = gammaPower;
                const roundedOffset = Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100);
                valEffectGamma.textContent = `${roundedOffset}%`;
            };
            elEffectGamma.value = String(Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100));
            applyGamma();
            elEffectGamma.addEventListener("input", applyGamma);
        }

        if (elEffectLensDistortion && valEffectLensDistortion) {
            const distortionLinkedToFov = this.mmdManager.dofLensDistortionLinkedToCameraFov;
            this.lensDistortionSlider = elEffectLensDistortion;
            this.lensDistortionValueEl = valEffectLensDistortion;
            const applyLensDistortion = () => {
                if (distortionLinkedToFov) {
                    this.refreshLensDistortionAutoReadout();
                    return;
                }
                const scale = Number(elEffectLensDistortion.value) / 100;
                this.mmdManager.dofLensDistortion = scale;
                valEffectLensDistortion.textContent = `${Math.round(this.mmdManager.dofLensDistortion * 100)}%`;
            };
            elEffectLensDistortion.value = String(Math.round(this.mmdManager.dofLensDistortion * 100));
            if (distortionLinkedToFov) {
                elEffectLensDistortion.disabled = true;
                elEffectLensDistortion.title = "Auto distortion (linked to camera FoV; 30deg = 0%)";
            }
            applyLensDistortion();
            if (!distortionLinkedToFov) {
                elEffectLensDistortion.addEventListener("input", applyLensDistortion);
            }
        }

        if (elEffectLensDistortionInfluence && valEffectLensDistortionInfluence) {
            const applyLensDistortionInfluence = () => {
                const scale = Number(elEffectLensDistortionInfluence.value) / 100;
                this.mmdManager.dofLensDistortionInfluence = scale;
                valEffectLensDistortionInfluence.textContent = `${Math.round(this.mmdManager.dofLensDistortionInfluence * 100)}%`;
                this.refreshLensDistortionAutoReadout();
            };
            elEffectLensDistortionInfluence.value = String(
                Math.round(this.mmdManager.dofLensDistortionInfluence * 100)
            );
            applyLensDistortionInfluence();
            elEffectLensDistortionInfluence.addEventListener("input", applyLensDistortionInfluence);
        }

        if (elEffectLensEdgeBlur && valEffectLensEdgeBlur) {
            const applyLensEdgeBlur = () => {
                const scale = Number(elEffectLensEdgeBlur.value) / 100;
                this.mmdManager.dofLensEdgeBlur = scale;
                valEffectLensEdgeBlur.textContent = `${Math.round(this.mmdManager.dofLensEdgeBlur * 100)}%`;
            };
            elEffectLensEdgeBlur.value = String(Math.round(this.mmdManager.dofLensEdgeBlur * 100));
            applyLensEdgeBlur();
            elEffectLensEdgeBlur.addEventListener("input", applyLensEdgeBlur);
        }

        if (
            elEffectDofEnabled &&
            valEffectDofEnabled &&
            elEffectDofQuality &&
            valEffectDofQuality &&
            elEffectDofFocus &&
            valEffectDofFocus &&
            elEffectDofFocusOffset &&
            valEffectDofFocusOffset &&
            elEffectDofFStop &&
            valEffectDofFStop &&
            elEffectDofNearSuppression &&
            valEffectDofNearSuppression &&
            elEffectDofFocalInvert &&
            valEffectDofFocalInvert &&
            elEffectDofLensBlur &&
            valEffectDofLensBlur &&
            elEffectDofLensSize &&
            valEffectDofLensSize &&
            elEffectDofFocalLength &&
            valEffectDofFocalLength
        ) {
            const blurLabels = ["Low", "Medium", "High"];
            const autoFocusEnabled = this.mmdManager.dofAutoFocusEnabled;
            const focalLengthLinkedToFov = this.mmdManager.dofFocalLengthLinkedToCameraFov;
            this.dofFocusSlider = elEffectDofFocus;
            this.dofFocusValueEl = valEffectDofFocus;
            this.dofFStopValueEl = valEffectDofFStop;
            this.dofFocalLengthSlider = elEffectDofFocalLength;
            this.dofFocalLengthValueEl = valEffectDofFocalLength;

            const applyDofEnabled = () => {
                this.mmdManager.dofEnabled = elEffectDofEnabled.checked;
                valEffectDofEnabled.textContent = this.mmdManager.dofEnabled ? "ON" : "OFF";
            };
            const applyDofQuality = () => {
                const level = Number(elEffectDofQuality.value);
                this.mmdManager.dofBlurLevel = level;
                valEffectDofQuality.textContent = blurLabels[this.mmdManager.dofBlurLevel] ?? "High";
            };
            const applyDofFocus = () => {
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                const mm = Number(elEffectDofFocus.value);
                this.mmdManager.dofFocusDistanceMm = mm;
                valEffectDofFocus.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
            };
            const applyDofFocusOffset = () => {
                const mm = Number(elEffectDofFocusOffset.value);
                this.mmdManager.dofAutoFocusNearOffsetMm = mm;
                valEffectDofFocusOffset.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFStop = () => {
                const fStop = Number(elEffectDofFStop.value) / 100;
                this.mmdManager.dofFStop = fStop;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                valEffectDofFStop.textContent = this.mmdManager.dofFStop.toFixed(2);
            };
            const applyDofNearSuppression = () => {
                const scale = Number(elEffectDofNearSuppression.value) / 100;
                this.mmdManager.dofNearSuppressionScale = scale;
                valEffectDofNearSuppression.textContent = `${Math.round(this.mmdManager.dofNearSuppressionScale * 100)}%`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFocalInvert = () => {
                this.mmdManager.dofFocalLengthDistanceInverted = elEffectDofFocalInvert.checked;
                valEffectDofFocalInvert.textContent = this.mmdManager.dofFocalLengthDistanceInverted ? "ON" : "OFF";
                if (focalLengthLinkedToFov) {
                    elEffectDofFocalLength.title = this.mmdManager.dofFocalLengthDistanceInverted
                        ? "Auto focal length (linked to camera FoV, inverted)"
                        : "Auto focal length (linked to camera FoV)";
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofLensBlur = () => {
                const strength = Number(elEffectDofLensBlur.value) / 100;
                this.mmdManager.dofLensBlurStrength = strength;
                valEffectDofLensBlur.textContent = `${Math.round(this.mmdManager.dofLensBlurStrength * 100)}%`;
            };
            const applyDofLensSize = () => {
                const lensSize = Number(elEffectDofLensSize.value);
                this.mmdManager.dofLensSize = lensSize;
                valEffectDofLensSize.textContent = `${Math.round(this.mmdManager.dofLensSize)}`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };
            const applyDofFocalLength = () => {
                if (focalLengthLinkedToFov) {
                    this.refreshDofAutoFocusReadout();
                    return;
                }
                const focalLength = Number(elEffectDofFocalLength.value);
                this.mmdManager.dofFocalLength = focalLength;
                valEffectDofFocalLength.textContent = `${Math.round(this.mmdManager.dofFocalLength)}`;
                if (autoFocusEnabled) {
                    this.refreshDofAutoFocusReadout();
                }
            };

            elEffectDofEnabled.checked = this.mmdManager.dofEnabled;
            elEffectDofQuality.value = String(this.mmdManager.dofBlurLevel);
            elEffectDofFocus.value = String(Math.round(this.mmdManager.dofFocusDistanceMm));
            elEffectDofFocusOffset.value = String(Math.round(this.mmdManager.dofAutoFocusNearOffsetMm));
            elEffectDofFStop.value = String(Math.round(this.mmdManager.dofFStop * 100));
            elEffectDofNearSuppression.value = String(Math.round(this.mmdManager.dofNearSuppressionScale * 100));
            elEffectDofFocalInvert.checked = this.mmdManager.dofFocalLengthDistanceInverted;
            elEffectDofLensBlur.value = String(Math.round(this.mmdManager.dofLensBlurStrength * 100));
            elEffectDofLensSize.value = String(Math.round(this.mmdManager.dofLensSize));
            elEffectDofFocalLength.value = String(Math.round(this.mmdManager.dofFocalLength));
            if (autoFocusEnabled) {
                elEffectDofFocus.disabled = true;
                elEffectDofFocus.title = `Auto focus (camera target, ${this.mmdManager.dofAutoFocusRangeMeters.toFixed(1)}m radius in focus)`;
            }
            if (focalLengthLinkedToFov) {
                elEffectDofFocalLength.disabled = true;
                elEffectDofFocalLength.title = "Auto focal length (linked to camera FoV)";
            }

            applyDofEnabled();
            applyDofQuality();
            applyDofFocus();
            applyDofFocusOffset();
            applyDofFStop();
            applyDofNearSuppression();
            applyDofFocalInvert();
            applyDofLensBlur();
            applyDofLensSize();
            applyDofFocalLength();
            this.refreshDofAutoFocusReadout();

            elEffectDofEnabled.addEventListener("change", applyDofEnabled);
            elEffectDofQuality.addEventListener("change", applyDofQuality);
            if (!autoFocusEnabled) {
                elEffectDofFocus.addEventListener("input", applyDofFocus);
            }
            elEffectDofFocusOffset.addEventListener("input", applyDofFocusOffset);
            elEffectDofFStop.addEventListener("input", applyDofFStop);
            elEffectDofNearSuppression.addEventListener("input", applyDofNearSuppression);
            elEffectDofFocalInvert.addEventListener("change", applyDofFocalInvert);
            elEffectDofLensBlur.addEventListener("input", applyDofLensBlur);
            elEffectDofLensSize.addEventListener("input", applyDofLensSize);
            if (!focalLengthLinkedToFov) {
                elEffectDofFocalLength.addEventListener("input", applyDofFocalLength);
            }
        }

        if (elEffectEdgeWidth && valEffectEdgeWidth) {
            const applyEdgeWidth = () => {
                const sliderValue = Number(elEffectEdgeWidth.value);
                const scale = sliderValue / 100;
                this.mmdManager.modelEdgeWidth = scale;
                valEffectEdgeWidth.textContent = `${Math.round(this.mmdManager.modelEdgeWidth * 100)}%`;
            };
            elEffectEdgeWidth.value = String(Math.round(this.mmdManager.modelEdgeWidth * 100));
            applyEdgeWidth();
            elEffectEdgeWidth.addEventListener("input", applyEdgeWidth);
        }

        // Initialize direction from HTML default values
        updateDir();
    }

    private setupCallbacks(): void {
        // Frame update
        this.mmdManager.onFrameUpdate = (frame, total) => {
            this.currentFrameEl.textContent = String(frame);
            this.totalFramesEl.textContent = String(total);
            this.timeline.setTotalFrames(total);
            this.timeline.setCurrentFrame(frame);
            this.updateTimelineEditState();
            this.bottomPanel.syncSelectedBoneSlidersFromRuntime();

            // Reflect runtime camera FOV (e.g. camera VMD playback) in the camera panel.
            if (this.camFovSlider && this.camFovValueEl && document.activeElement !== this.camFovSlider) {
                const fovDeg = this.mmdManager.getCameraFov();
                const clamped = Math.max(Number(this.camFovSlider.min), Math.min(Number(this.camFovSlider.max), fovDeg));
                this.camFovSlider.value = String(Math.round(clamped));
                this.camFovValueEl.textContent = `${Math.round(fovDeg)} deg`;
            }
            if (this.camDistanceSlider && this.camDistanceValueEl && document.activeElement !== this.camDistanceSlider) {
                const distance = this.mmdManager.getCameraDistance();
                const clamped = Math.max(Number(this.camDistanceSlider.min), Math.min(Number(this.camDistanceSlider.max), distance));
                this.camDistanceSlider.value = String(Math.round(clamped));
                this.camDistanceValueEl.textContent = `${distance.toFixed(1)}m`;
            }
            this.refreshDofAutoFocusReadout();
            this.refreshLensDistortionAutoReadout();

            if (this.mmdManager.isPlaying && total > 0 && frame >= total) {
                this.stopAtPlaybackEnd();
            }
        };

        // Active model changed
        this.mmdManager.onModelLoaded = (info: ModelInfo) => {
            this.setStatus("Model ready", false);
            this.viewportOverlay.classList.add("hidden");
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                this.bottomPanel.updateBoneControls(info);
                this.bottomPanel.updateMorphControls(info);
                this.bottomPanel.updateModelInfo(info);
                this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
                this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
            }
            this.refreshModelSelector();
            this.refreshShaderPanel();
        };

        // Any model loaded into scene
        this.mmdManager.onSceneModelLoaded = (info: ModelInfo, totalCount: number, active: boolean) => {
            this.setStatus("Model loaded", false);
            this.viewportOverlay.classList.add("hidden");
            this.refreshModelSelector();
            this.refreshShaderPanel();
            const activeLabel = active ? " [active]" : "";
            this.showToast(`Loaded model: ${info.name} (${totalCount})${activeLabel}`, "success");
        };

        // Motion loaded
        this.mmdManager.onMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.showToast(`Loaded motion: ${info.name}`, "success");
        };

        this.mmdManager.onCameraMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Camera motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.showToast(`Loaded camera motion: ${info.name}`, "success");
        };

        // Keyframe data loaded
        this.mmdManager.onKeyframesLoaded = (tracks) => {
            this.timeline.setKeyframeTracks(tracks);
            this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
            this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
            this.updateTimelineEditState();
        };

        // Audio loaded
        this.mmdManager.onAudioLoaded = (name: string) => {
            this.setStatus("Audio loaded", false);
            this.showToast(`Loaded audio: ${name}`, "success");
        };

        // Error
        this.mmdManager.onError = (message: string) => {
            this.setStatus("Error", false);
            this.showToast(message, "error");
        };

        this.mmdManager.onPhysicsStateChanged = (enabled: boolean, available: boolean) => {
            this.updatePhysicsToggleButton(enabled, available);
        };

        this.mmdManager.onBoneVisualizerBonePicked = (boneName: string) => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            const selected = this.bottomPanel.setSelectedBone(boneName);
            if (!selected) return;
            this.syncTimelineBoneSelectionFromBottomPanel(boneName);
        };

        this.mmdManager.onMaterialShaderStateChanged = () => {
            this.refreshShaderPanel();
        };
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
        const active = Boolean(state?.active);
        const activeCount = Math.max(0, Math.floor(state?.activeCount ?? 0));
        this.setPngSequenceExportLock(active, activeCount);
    }

    private applyPngSequenceExportProgress(progress: PngSequenceExportProgress): void {
        if (!this.isPngSequenceExportActive) return;
        const total = Math.max(0, Math.floor(progress?.total ?? 0));
        const saved = Math.max(0, Math.floor(progress?.saved ?? 0));
        const frame = Math.max(0, Math.floor(progress?.frame ?? 0));
        if (total <= 0) return;

        this.latestPngSequenceExportProgress = progress;
        if (!this.busyTextEl) return;
        const ratio = Math.min(100, Math.max(0, (saved / total) * 100));
        this.busyTextEl.textContent = `PNG sequence exporting... ${saved}/${total} (${ratio.toFixed(1)}%) frame ${frame}`;
    }

    private setPngSequenceExportLock(active: boolean, activeCount: number): void {
        if (this.isPngSequenceExportActive === active) {
            if (active) {
                this.updatePngSequenceBusyMessage(activeCount);
            }
            return;
        }

        this.isPngSequenceExportActive = active;
        this.appRootEl.classList.toggle("ui-export-lock", active);
        this.busyOverlayEl?.classList.toggle("hidden", !active);
        this.busyOverlayEl?.setAttribute("aria-hidden", active ? "false" : "true");

        if (active) {
            this.updatePngSequenceBusyMessage(activeCount);
            if (this.mmdManager.isPlaying) {
                this.pause(false);
            }
            return;
        }

        if (this.busyTextEl) {
            this.busyTextEl.textContent = "Exporting PNG sequence...";
        }
        this.latestPngSequenceExportProgress = null;
    }

    private updatePngSequenceBusyMessage(activeCount: number): void {
        if (!this.busyTextEl) return;
        const progress = this.latestPngSequenceExportProgress;
        if (progress) {
            const total = Math.max(0, Math.floor(progress.total));
            const saved = Math.max(0, Math.floor(progress.saved));
            const frame = Math.max(0, Math.floor(progress.frame));
            if (total > 0) {
                const ratio = Math.min(100, Math.max(0, (saved / total) * 100));
                this.busyTextEl.textContent = `PNG sequence exporting... ${saved}/${total} (${ratio.toFixed(1)}%) frame ${frame}`;
                return;
            }
        }
        if (activeCount > 1) {
            this.busyTextEl.textContent = `PNG sequence exporting in background (${activeCount} jobs).`;
            return;
        }
        this.busyTextEl.textContent = "PNG sequence exporting in background. Main controls are locked.";
    }

    private setupFileDrop(): void {
        let dragDepth = 0;
        const setDragActive = (active: boolean): void => {
            document.body.classList.toggle("file-drag-active", active);
        };
        const isFileDragEvent = (event: DragEvent): boolean => {
            const types = event.dataTransfer?.types;
            if (!types) return false;
            return Array.from(types).includes("Files");
        };

        document.addEventListener("dragenter", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            dragDepth += 1;
            setDragActive(true);
        });

        document.addEventListener("dragover", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
        });

        document.addEventListener("dragleave", (event) => {
            if (!isFileDragEvent(event)) return;
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                setDragActive(false);
            }
        });

        document.addEventListener("drop", (event) => {
            event.preventDefault();
            dragDepth = 0;
            setDragActive(false);

            if (this.isPngSequenceExportActive) {
                this.showToast("Cannot load files during PNG sequence export", "error");
                return;
            }

            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return;

            void (async () => {
                const entries = files
                    .map((file) => {
                        const resolvedPath =
                            window.electronAPI.getPathForDroppedFile(file) ??
                            (file as File & { path?: string }).path ??
                            "";
                        if (!resolvedPath) return null;
                        const filePath = resolvedPath;
                        const ext = this.getFileExtension(filePath);
                        const priority = ext === "pmx" || ext === "pmd"
                            ? 0
                            : ext === "vmd" || ext === "vpd"
                                ? 1
                                : ext === "mp3" || ext === "wav" || ext === "ogg"
                                    ? 2
                                    : 3;
                        return { filePath, priority };
                    })
                    .filter((entry): entry is { filePath: string; priority: number } => entry !== null)
                    .sort((a, b) => a.priority - b.priority);

                if (entries.length === 0) {
                    this.showToast("Could not resolve dropped file path", "error");
                    return;
                }

                for (const entry of entries) {
                    const filePath = entry.filePath;
                    if (!filePath) continue;
                    await this.loadFileByPath(filePath, "drop");
                }
            })();
        });
    }

    private setupKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isUiFullscreenActive) {
                e.preventDefault();
                this.exitUiFullscreenMode();
                return;
            }

            if (this.isPngSequenceExportActive) {
                e.preventDefault();
                return;
            }

            // Don't handle keys when focused on input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

            const isAddKeyShortcut =
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                (
                    e.key === "i" ||
                    e.key === "I" ||
                    e.key === "k" ||
                    e.key === "K" ||
                    e.key === "+" ||
                    e.code === "NumpadAdd"
                );
            if (isAddKeyShortcut) {
                e.preventDefault();
                this.addKeyframeAtCurrentFrame();
                return;
            }

            if (e.key === "Delete") {
                e.preventDefault();
                this.deleteSelectedKeyframe();
                return;
            }

            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                this.nudgeSelectedKeyframe(-1);
                return;
            }

            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                this.nudgeSelectedKeyframe(1);
                return;
            }

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    if (this.mmdManager.isPlaying) {
                        this.pause();
                    } else {
                        this.play();
                    }
                    break;
                case "Home":
                    this.mmdManager.seekToBoundary(0);
                    break;
                case "End":
                    this.mmdManager.seekToBoundary(this.mmdManager.totalFrames);
                    break;
                case "ArrowLeft":
                    this.mmdManager.seekTo(this.mmdManager.currentFrame - (e.shiftKey ? 10 : 1));
                    break;
                case "ArrowRight":
                    this.mmdManager.seekTo(this.mmdManager.currentFrame + (e.shiftKey ? 10 : 1));
                    break;
            }

            // Ctrl+Alt+O = open project file
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.loadProject();
            }

            // Ctrl+Alt+S = save project file
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                this.saveProject();
            }

            // Ctrl+O = open PMX/PMD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.loadPMX();
            }

            // Ctrl+M = open VMD/VPD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.loadVMD();
            }

            // Ctrl+Shift+M = open camera VMD
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.loadCameraVMD();
            }

            // Ctrl+Shift+A = open MP3
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "A" || e.key === "a")) {
                e.preventDefault();
                this.loadMP3();
            }

            // Ctrl+Shift+S = export PNG
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                void this.exportPNG();
            }
        });
    }

    private setupPerfDisplay(): void {
        const fpsEl = document.getElementById("fps-value")!;
        const engineEl = document.getElementById("engine-type-badge")!;

        // Engine type - detect once on startup
        const engineType = this.mmdManager.getEngineType();
        engineEl.textContent = engineType === "WebGPU" ? "WebGPU (WGSL)" : engineType;
        // Color-code by type
        if (engineType === "WebGPU") {
            engineEl.style.background = "rgba(139,92,246,0.15)";
            engineEl.style.color = "#a78bfa";
            engineEl.style.borderColor = "rgba(139,92,246,0.3)";
        } else if (engineType === "WebGL1") {
            engineEl.style.background = "rgba(245,158,11,0.15)";
            engineEl.style.color = "#fbbf24";
            engineEl.style.borderColor = "rgba(245,158,11,0.3)";
        }

        // FPS - update every second
        setInterval(() => {
            const fps = this.mmdManager.getFps();
            fpsEl.textContent = String(fps);
            fpsEl.style.color = fps >= 55 ? "var(--accent-green)"
                : fps >= 30 ? "var(--accent-amber)"
                    : "var(--accent-red)";
            this.refreshDofAutoFocusReadout();
        }, 1000);

        // Volume fader
        const slider = document.getElementById("volume-slider") as HTMLInputElement;
        const volLabel = document.getElementById("volume-value")!;
        const muteBtn = document.getElementById("btn-mute")!;
        const iconOn = document.getElementById("icon-volume-on")!;
        const iconOff = document.getElementById("icon-volume-off")!;

        const updateVolumeUI = (isMuted: boolean) => {
            const pct = Number(slider.value);
            volLabel.textContent = `${pct}%`;
            iconOn.style.display = isMuted ? "none" : "";
            iconOff.style.display = isMuted ? "" : "none";
            muteBtn.classList.toggle("muted", isMuted);
        };

        slider.addEventListener("input", () => {
            this.mmdManager.volume = Number(slider.value) / 100;
            updateVolumeUI(this.mmdManager.muted);
        });

        muteBtn.addEventListener("click", async () => {
            await this.mmdManager.toggleMute();
            updateVolumeUI(this.mmdManager.muted);
        });
    }

    private async saveProject(): Promise<void> {
        this.setStatus("Saving project...", true);
        try {
            const project = this.mmdManager.exportProjectState();
            const json = JSON.stringify(project, null, 2);

            const now = new Date();
            const pad = (v: number) => String(v).padStart(2, "0");
            const fileName = `mmd_project_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.mmdproj.json`;

            const savedPath = await window.electronAPI.saveTextFile(json, fileName, [
                { name: "MMD Modoki Project", extensions: ["mmdproj", "json"] },
                { name: "All files", extensions: ["*"] },
            ]);
            if (!savedPath) {
                this.setStatus("Ready", false);
                this.showToast("Project save canceled", "info");
                return;
            }

            const basename = savedPath.replace(/^.*[\\/]/, "");
            this.setStatus("Project saved", false);
            this.showToast(`Saved project: ${basename}`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Project save failed", false);
            this.showToast(`Project save error: ${message}`, "error");
        }
    }

    private async loadProject(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "MMD Modoki Project", extensions: ["mmdproj", "json"] },
            { name: "All files", extensions: ["*"] },
        ]);
        if (!filePath) return;

        this.setStatus("Loading project...", true);
        try {
            const text = await window.electronAPI.readTextFile(filePath);
            if (!text) {
                this.setStatus("Project load failed", false);
                this.showToast("Failed to read project file", "error");
                return;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                this.setStatus("Project load failed", false);
                this.showToast("Project JSON parse failed", "error");
                return;
            }

            const result = await this.mmdManager.importProjectState(parsed);
            this.refreshModelSelector();
            this.refreshShaderPanel();
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                const activeModel = this.mmdManager.getLoadedModels().find((item) => item.active);
                if (activeModel) {
                    this.mmdManager.setActiveModelByIndex(activeModel.index);
                }
            }
            this.updateTimelineEditState();

            if (result.warnings.length > 0) {
                this.setStatus("Project loaded (with warnings)", false);
                this.showToast(
                    `Project loaded (${result.loadedModels} models, ${result.warnings.length} warnings)`,
                    "info",
                );
            } else {
                this.setStatus("Project loaded", false);
                this.showToast(`Project loaded (${result.loadedModels} models)`, "success");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.setStatus("Project load failed", false);
            this.showToast(`Project load error: ${message}`, "error");
        }
    }

    private async loadFileFromDialog(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Supported files", extensions: ["pmx", "pmd", "vmd", "vpd", "mp3", "wav", "ogg"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;
        await this.loadFileByPath(filePath, "dialog");
    }

    private getFileExtension(filePath: string): string {
        const normalized = filePath.replace(/\\/g, "/");
        const fileName = normalized.substring(normalized.lastIndexOf("/") + 1);
        const dot = fileName.lastIndexOf(".");
        if (dot < 0) return "";
        return fileName.substring(dot + 1).toLowerCase();
    }

    private isLikelyCameraVmdPath(filePath: string): boolean {
        if (this.mmdManager.getTimelineTarget() === "camera") return true;
        if (this.mmdManager.getLoadedModels().length === 0) return true;
        const normalized = filePath.replace(/\\/g, "/").toLowerCase();
        const fileName = normalized.substring(normalized.lastIndexOf("/") + 1);
        return fileName.includes("camera") || fileName.includes("cam") || fileName.includes("カメラ");
    }

    private async loadFileByPath(filePath: string, source: "dialog" | "drop"): Promise<void> {
        const ext = this.getFileExtension(filePath);
        switch (ext) {
            case "pmx":
            case "pmd":
                this.setStatus("Loading PMX/PMD...", true);
                await this.mmdManager.loadPMX(filePath);
                return;
            case "vpd":
                this.setStatus("Loading motion/pose...", true);
                await this.mmdManager.loadVMD(filePath);
                return;
            case "vmd": {
                const preferCamera = this.isLikelyCameraVmdPath(filePath);
                if (preferCamera) {
                    this.setStatus("Loading camera VMD...", true);
                    const cameraInfo = await this.mmdManager.loadCameraVMD(filePath);
                    if (cameraInfo) return;
                    this.setStatus("Loading motion/pose...", true);
                    await this.mmdManager.loadVMD(filePath);
                    return;
                }

                this.setStatus("Loading motion/pose...", true);
                const motionInfo = await this.mmdManager.loadVMD(filePath);
                if (motionInfo) return;
                this.setStatus("Loading camera VMD...", true);
                await this.mmdManager.loadCameraVMD(filePath);
                return;
            }
            case "mp3":
            case "wav":
            case "ogg":
                this.setStatus("Loading audio...", true);
                await this.mmdManager.loadMP3(filePath);
                return;
            default:
                if (source === "drop") {
                    this.showToast(`Unsupported file: ${filePath.replace(/^.*[\\/]/, "")}`, "error");
                } else {
                    this.showToast("Unsupported file type", "error");
                }
                return;
        }
    }

    private async loadPMX(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "PMX/PMD model", extensions: ["pmx", "pmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading PMX/PMD...", true);
        await this.mmdManager.loadPMX(filePath);
    }

    private async loadVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD/VPD motion or pose", extensions: ["vmd", "vpd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading motion/pose...", true);
        await this.mmdManager.loadVMD(filePath);
    }

    private async loadCameraVMD(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "VMD camera motion", extensions: ["vmd"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading camera VMD...", true);
        await this.mmdManager.loadCameraVMD(filePath);
    }

    private async loadMP3(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: "Audio", extensions: ["mp3", "wav", "ogg"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;

        this.setStatus("Loading audio...", true);
        await this.mmdManager.loadMP3(filePath);
    }

    private async exportPNG(): Promise<void> {
        this.setStatus("Exporting PNG...", true);

        const dataUrl = await this.mmdManager.capturePngDataUrl(1);
        if (!dataUrl) {
            this.setStatus("PNG export failed", false);
            return;
        }

        const now = new Date();
        const pad = (v: number) => String(v).padStart(2, "0");
        const fileName = `mmd_capture_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

        const savedPath = await window.electronAPI.savePngFile(dataUrl, fileName);
        if (!savedPath) {
            this.setStatus("Ready", false);
            this.showToast("PNG export canceled", "info");
            return;
        }

        const basename = savedPath.replace(/^.*[\\/]/, "");
        this.setStatus("PNG saved", false);
        this.showToast(`Saved PNG: ${basename}`, "success");
    }

    private async exportPNGSequence(): Promise<void> {
        const directoryPath = await window.electronAPI.openDirectoryDialog();
        if (!directoryPath) {
            this.showToast("PNG sequence export canceled", "info");
            return;
        }

        const startFrame = Math.max(0, this.mmdManager.currentFrame);
        const endFrame = Math.max(startFrame, this.mmdManager.totalFrames);
        const step = 1;
        const prefix = "mmd_seq";

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

        const project = this.mmdManager.exportProjectState();
        project.assets.audioPath = null;

        this.setStatus("Launching PNG sequence export window...", true);
        const result = await window.electronAPI.startPngSequenceExportWindow({
            project,
            outputDirectoryPath,
            startFrame,
            endFrame,
            step,
            prefix,
            fps: 30,
            precision: 1,
            outputWidth: 1920,
            outputHeight: 1080,
        });

        if (!result) {
            this.setStatus("PNG sequence export launch failed", false);
            this.showToast("Failed to start PNG sequence export window", "error");
            return;
        }

        this.setStatus("PNG sequence export started", false);
        this.showToast(`PNG sequence export started (${frameList.length} files)`, "success");
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

    private joinPathForRenderer(basePath: string, childName: string): string {
        const separator = basePath.includes("\\") ? "\\" : "/";
        const normalizedBase = basePath.replace(/[\\/]+$/, "");
        return `${normalizedBase}${separator}${childName}`;
    }

    private getCameraPanelInfo(): ModelInfo {
        return {
            name: "Camera",
            path: "",
            vertexCount: 0,
            boneCount: 1,
            boneNames: ["Camera"],
            boneControlInfos: [{ name: "Camera", movable: true, rotatable: true }],
            morphCount: 0,
            morphNames: [],
            morphDisplayFrames: [],
        };
    }

    private applyCameraSelectionUI(): void {
        const cameraInfo = this.getCameraPanelInfo();
        this.bottomPanel.updateBoneControls(cameraInfo);
        this.bottomPanel.updateMorphControls(cameraInfo);
        this.bottomPanel.updateModelInfo(cameraInfo);
        this.mmdManager.setBoneVisualizerSelectedBone(null);
        this.updateInfoActionButtons();
    }

    private updateInfoActionButtons(): void {
        const isModelTarget = this.mmdManager.getTimelineTarget() === "model";
        const hasModel = this.mmdManager.getLoadedModels().length > 0;
        const enabled = isModelTarget && hasModel;

        this.btnModelVisibility.disabled = !enabled;
        this.btnModelDelete.disabled = !enabled;

        if (!enabled) {
            this.btnModelVisibility.textContent = "Hide";
            return;
        }

        const visible = this.mmdManager.getActiveModelVisibility();
        this.btnModelVisibility.textContent = visible ? "Hide" : "Show";
    }

    private refreshModelSelector(): void {
        const models = this.mmdManager.getLoadedModels();
        const timelineTarget = this.mmdManager.getTimelineTarget();
        this.modelSelect.innerHTML = "";

        const cameraOption = document.createElement("option");
        cameraOption.value = UIController.CAMERA_SELECT_VALUE;
        cameraOption.textContent = "0: Camera";
        this.modelSelect.appendChild(cameraOption);

        let selected = false;
        if (timelineTarget === "camera") {
            cameraOption.selected = true;
            selected = true;
        }

        for (const model of models) {
            const option = document.createElement("option");
            option.value = String(model.index);
            option.textContent = `${model.index + 1}: ${model.name}`;
            option.title = model.path;
            if (!selected && timelineTarget === "model" && model.active) {
                option.selected = true;
                selected = true;
            }
            this.modelSelect.appendChild(option);
        }

        if (!selected) {
            cameraOption.selected = true;
        }

        this.modelSelect.disabled = models.length === 0;
        this.updateInfoActionButtons();
    }

    private isShaderPanelExpanded(): boolean {
        return !this.mainContentEl.classList.contains("shader-panel-collapsed");
    }

    private setShaderPanelVisible(visible: boolean): void {
        this.mainContentEl.classList.toggle("shader-panel-collapsed", !visible);
        this.clampTimelineWidthToLayout();
        this.updateShaderPanelToggleButton(visible);
    }

    private updateShaderPanelToggleButton(visible: boolean): void {
        if (!this.btnToggleShaderPanel) return;
        this.btnToggleShaderPanel.setAttribute("aria-pressed", visible ? "true" : "false");
        this.btnToggleShaderPanel.classList.toggle("toggle-on", visible);
        if (this.shaderPanelToggleText) {
            this.shaderPanelToggleText.textContent = visible ? "Shader ON" : "Shader OFF";
        }
    }

    private toggleUiFullscreenMode(): void {
        if (this.isUiFullscreenActive) {
            this.exitUiFullscreenMode();
            return;
        }
        this.enterUiFullscreenMode();
    }

    private enterUiFullscreenMode(): void {
        this.setUiFullscreenVisualState(true);
        this.showToast("UIを非表示にしました。ESCで戻れます", "info");
    }

    private exitUiFullscreenMode(): void {
        this.setUiFullscreenVisualState(false);
    }

    private setUiFullscreenVisualState(active: boolean): void {
        this.isUiFullscreenActive = active;
        this.appRootEl.classList.toggle("ui-presentation-mode", active);
        this.updateFullscreenUiToggleButton(active);
    }

    private updateFullscreenUiToggleButton(active: boolean): void {
        if (!this.btnToggleFullscreenUi) return;
        this.btnToggleFullscreenUi.setAttribute("aria-pressed", active ? "true" : "false");
        this.btnToggleFullscreenUi.classList.toggle("toggle-on", active);
        if (this.fullscreenUiToggleText) {
            this.fullscreenUiToggleText.textContent = active ? "UI非表示ON" : "UI非表示OFF";
        }
    }

    private setupTimelineResizer(): void {
        if (!this.timelineResizerEl || !this.timelinePanelEl) return;

        let startX = 0;
        let startWidth = 0;

        const stopResize = (): void => {
            if (!this.isTimelineResizing) return;
            this.isTimelineResizing = false;
            document.body.classList.remove("timeline-resizing");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (event: PointerEvent): void => {
            if (!this.isTimelineResizing) return;

            const delta = event.clientX - startX;
            const maxWidth = this.computeTimelineMaxWidth();
            const nextWidth = Math.max(
                UIController.MIN_TIMELINE_WIDTH,
                Math.min(maxWidth, startWidth + delta)
            );

            document.documentElement.style.setProperty("--timeline-width", `${Math.round(nextWidth)}px`);
        };

        const onPointerUp = (): void => {
            stopResize();
        };

        this.timelineResizerEl.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0) return;
            event.preventDefault();
            startX = event.clientX;
            startWidth = this.timelinePanelEl?.getBoundingClientRect().width ?? UIController.MIN_TIMELINE_WIDTH;
            this.isTimelineResizing = true;
            document.body.classList.add("timeline-resizing");
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        });

        window.addEventListener("resize", () => {
            this.clampTimelineWidthToLayout();
        });
    }

    private computeTimelineMaxWidth(): number {
        const panelWidth = this.mainContentEl.clientWidth;
        const resizerWidth = this.timelineResizerEl?.getBoundingClientRect().width ?? 6;
        const shaderWidth = this.isShaderPanelExpanded()
            ? (this.shaderPanelEl?.getBoundingClientRect().width ?? 0)
            : 0;
        return Math.max(
            UIController.MIN_TIMELINE_WIDTH,
            panelWidth - resizerWidth - shaderWidth - UIController.MIN_VIEWPORT_WIDTH
        );
    }

    private clampTimelineWidthToLayout(): void {
        if (!this.timelinePanelEl) return;
        const currentWidth = this.timelinePanelEl.getBoundingClientRect().width;
        const maxWidth = this.computeTimelineMaxWidth();
        const nextWidth = Math.max(
            UIController.MIN_TIMELINE_WIDTH,
            Math.min(maxWidth, currentWidth)
        );
        document.documentElement.style.setProperty("--timeline-width", `${Math.round(nextWidth)}px`);
    }

    private refreshShaderPanel(): void {
        if (
            !this.shaderModelNameEl ||
            !this.shaderPresetSelect ||
            !this.shaderApplyButton ||
            !this.shaderResetButton ||
            !this.shaderPanelNote ||
            !this.shaderMaterialList
        ) {
            return;
        }

        const isAvailable = this.mmdManager.isWgslMaterialShaderAssignmentAvailable();
        const presets = this.mmdManager.getWgslMaterialShaderPresets();
        const models = this.mmdManager.getWgslModelShaderStates();

        this.shaderPresetSelect.innerHTML = "";
        for (const preset of presets) {
            const option = document.createElement("option");
            option.value = preset.id;
            option.textContent = preset.label;
            this.shaderPresetSelect.appendChild(option);
        }

        if (!isAvailable) {
            this.shaderModelNameEl.textContent = "-";
            this.shaderPresetSelect.disabled = true;
            this.shaderApplyButton.disabled = true;
            this.shaderResetButton.disabled = true;
            this.shaderPanelNote.textContent = "WebGPU (WGSL)時のみ有効";
            this.shaderMaterialList.innerHTML = '<div class="panel-empty-state">WGSL unavailable</div>';
            return;
        }

        if (models.length === 0) {
            this.shaderModelNameEl.textContent = "-";
            this.shaderPresetSelect.disabled = true;
            this.shaderApplyButton.disabled = true;
            this.shaderResetButton.disabled = true;
            this.shaderPanelNote.textContent = "モデルを読み込んでください";
            this.shaderMaterialList.innerHTML = '<div class="panel-empty-state">No model</div>';
            return;
        }

        if (this.modelSelect.value === UIController.CAMERA_SELECT_VALUE) {
            this.shaderModelNameEl.textContent = "Camera";
            this.shaderPresetSelect.disabled = true;
            this.shaderApplyButton.disabled = true;
            this.shaderResetButton.disabled = true;
            this.shaderPanelNote.textContent = "情報欄でモデルを選択すると有効になります";
            this.shaderMaterialList.innerHTML = '<div class="panel-empty-state">Model target is camera</div>';
            return;
        }

        let selectedModelIndex = Number.parseInt(this.modelSelect.value, 10);
        if (Number.isNaN(selectedModelIndex) || !models.some((model) => model.modelIndex === selectedModelIndex)) {
            selectedModelIndex = models.find((model) => model.active)?.modelIndex ?? models[0].modelIndex;
        }

        const selectedModel = models.find((model) => model.modelIndex === selectedModelIndex) ?? models[0];
        this.shaderModelNameEl.textContent = `${selectedModel.modelIndex + 1}: ${selectedModel.modelName}`;

        if (selectedModel.materials.length === 0) {
            this.shaderPresetSelect.disabled = true;
            this.shaderApplyButton.disabled = true;
            this.shaderResetButton.disabled = true;
            this.shaderPanelNote.textContent = "このモデルには割り当て可能な材質がありません";
            this.shaderMaterialList.innerHTML = '<div class="panel-empty-state">No material</div>';
            return;
        }

        const rememberedMaterialKey = this.shaderSelectedMaterialKeys.get(selectedModel.modelIndex);
        const selectedMaterial = rememberedMaterialKey
            ? selectedModel.materials.find((material) => material.key === rememberedMaterialKey) ?? null
            : null;
        if (rememberedMaterialKey && !selectedMaterial) {
            this.shaderSelectedMaterialKeys.delete(selectedModel.modelIndex);
        }

        let selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        let mixedPresets = false;
        if (selectedMaterial) {
            selectedPresetId = selectedMaterial.presetId;
        } else {
            const allPresetIds = Array.from(new Set(selectedModel.materials.map((material) => material.presetId)));
            if (allPresetIds.length === 1) {
                selectedPresetId = allPresetIds[0];
            } else {
                mixedPresets = true;
            }
        }
        if (!presets.some((preset) => preset.id === selectedPresetId)) {
            selectedPresetId = presets[0]?.id ?? "wgsl-mmd-standard";
        }
        this.shaderPresetSelect.value = selectedPresetId;

        const presetLabelById = new Map(presets.map((preset) => [preset.id, preset.label]));
        this.shaderMaterialList.innerHTML = "";
        for (const material of selectedModel.materials) {
            const item = document.createElement("div");
            item.className = "shader-material-item";
            if (selectedMaterial?.key === material.key) {
                item.classList.add("active");
            }
            item.title = material.key;
            item.addEventListener("click", () => {
                const current = this.shaderSelectedMaterialKeys.get(selectedModel.modelIndex);
                if (current === material.key) {
                    this.shaderSelectedMaterialKeys.delete(selectedModel.modelIndex);
                } else {
                    this.shaderSelectedMaterialKeys.set(selectedModel.modelIndex, material.key);
                }
                this.refreshShaderPanel();
            });

            const nameEl = document.createElement("span");
            nameEl.className = "shader-material-name";
            nameEl.textContent = material.name;
            item.appendChild(nameEl);

            const presetEl = document.createElement("span");
            presetEl.className = "shader-material-preset";
            presetEl.textContent = presetLabelById.get(material.presetId) ?? material.presetId;
            item.appendChild(presetEl);

            this.shaderMaterialList.appendChild(item);
        }

        this.shaderApplyButton.textContent = selectedMaterial ? "選択へ割り当て" : "全材質へ割り当て";
        this.shaderResetButton.textContent = selectedMaterial ? "選択を標準化" : "全材質を標準化";

        if (selectedMaterial) {
            this.shaderPanelNote.textContent = `選択材質: ${selectedMaterial.name}`;
        } else if (mixedPresets) {
            this.shaderPanelNote.textContent = "材質未選択: 全材質に適用（現在は混在）";
        } else {
            const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
            this.shaderPanelNote.textContent = selectedPreset?.description ?? "材質未選択: 全材質に適用";
        }

        this.shaderPresetSelect.disabled = presets.length === 0;
        this.shaderApplyButton.disabled = presets.length === 0;
        this.shaderResetButton.disabled = false;
    }

    private applyShaderPresetFromPanel(resetToDefault: boolean): void {
        if (!this.shaderPresetSelect) {
            return;
        }
        if (!this.mmdManager.isWgslMaterialShaderAssignmentAvailable()) {
            this.showToast("WGSL shader assignment is unavailable", "error");
            return;
        }
        if (this.modelSelect.value === UIController.CAMERA_SELECT_VALUE) {
            this.showToast("Select a model in the info panel first", "error");
            return;
        }

        const models = this.mmdManager.getWgslModelShaderStates();
        let modelIndex = Number.parseInt(this.modelSelect.value, 10);
        if (Number.isNaN(modelIndex) || !models.some((model) => model.modelIndex === modelIndex)) {
            modelIndex = models.find((model) => model.active)?.modelIndex ?? -1;
        }
        if (modelIndex < 0) {
            this.showToast("Model is not selected", "error");
            return;
        }

        const materialKey = this.shaderSelectedMaterialKeys.get(modelIndex) ?? null;
        const presetId = resetToDefault ? "wgsl-mmd-standard" : this.shaderPresetSelect.value;
        if (!presetId) {
            this.showToast("Shader preset is not selected", "error");
            return;
        }

        const ok = this.mmdManager.setWgslMaterialShaderPreset(
            modelIndex,
            materialKey,
            presetId as WgslMaterialShaderPresetId,
        );
        if (!ok) {
            this.showToast("Shader assignment failed", "error");
            return;
        }

        this.refreshShaderPanel();
        const targetLabel = materialKey === null ? "all materials" : "selected material";
        this.showToast(`Shader assigned (${targetLabel})`, "success");
    }

    private updateGroundToggleButton(visible: boolean): void {
        this.groundToggleText.textContent = visible ? "Ground ON" : "Ground OFF";
        this.btnToggleGround.setAttribute("aria-pressed", visible ? "true" : "false");
        this.btnToggleGround.classList.toggle("toggle-on", visible);
    }

    private updateSkydomeToggleButton(visible: boolean): void {
        this.skydomeToggleText.textContent = visible ? "Sky ON" : "Sky OFF";
        this.btnToggleSkydome.setAttribute("aria-pressed", visible ? "true" : "false");
        this.btnToggleSkydome.classList.toggle("toggle-on", visible);
    }

    private updatePhysicsToggleButton(enabled: boolean, available: boolean): void {
        const active = available && enabled;
        this.physicsToggleText.textContent = available ? (active ? "Physics ON" : "Physics OFF") : "Physics N/A";
        this.btnTogglePhysics.setAttribute("aria-pressed", active ? "true" : "false");
        this.btnTogglePhysics.classList.toggle("toggle-on", active);
        (this.btnTogglePhysics as HTMLButtonElement).disabled = !available;
        if (this.physicsGravityAccelSlider) {
            this.physicsGravityAccelSlider.disabled = !available;
        }
        if (this.physicsGravityDirXSlider) this.physicsGravityDirXSlider.disabled = !available;
        if (this.physicsGravityDirYSlider) this.physicsGravityDirYSlider.disabled = !available;
        if (this.physicsGravityDirZSlider) this.physicsGravityDirZSlider.disabled = !available;
    }

    private updateCameraViewButtons(active: CameraViewPreset): void {
        const left = active === "left";
        const front = active === "front";
        const right = active === "right";
        this.camViewLeftBtn?.classList.toggle("camera-view-btn--active", left);
        this.camViewFrontBtn?.classList.toggle("camera-view-btn--active", front);
        this.camViewRightBtn?.classList.toggle("camera-view-btn--active", right);
        this.camViewLeftBtn?.setAttribute("aria-pressed", left ? "true" : "false");
        this.camViewFrontBtn?.setAttribute("aria-pressed", front ? "true" : "false");
        this.camViewRightBtn?.setAttribute("aria-pressed", right ? "true" : "false");
    }

    private refreshDofAutoFocusReadout(): void {
        if (!this.mmdManager.dofAutoFocusEnabled) return;

        if (this.dofFocusSlider && this.dofFocusValueEl) {
            const focusMm = this.mmdManager.dofFocusDistanceMm;
            const sliderMin = Number(this.dofFocusSlider.min);
            const sliderMax = Number(this.dofFocusSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focusMm));
            this.dofFocusSlider.value = String(Math.round(clamped));
            this.dofFocusValueEl.textContent = `${(focusMm / 1000).toFixed(1)}m (auto)`;
        }

        if (this.dofFStopValueEl) {
            const baseFStop = this.mmdManager.dofFStop;
            const effectiveFStop = this.mmdManager.dofEffectiveFStop;
            const hasCompensation = effectiveFStop > baseFStop + 0.01;
            this.dofFStopValueEl.textContent = hasCompensation
                ? `${baseFStop.toFixed(2)} -> ${effectiveFStop.toFixed(2)}`
                : effectiveFStop.toFixed(2);
        }

        if (
            this.mmdManager.dofFocalLengthLinkedToCameraFov &&
            this.dofFocalLengthSlider &&
            this.dofFocalLengthValueEl
        ) {
            const focalLength = this.mmdManager.dofFocalLength;
            const sliderMin = Number(this.dofFocalLengthSlider.min);
            const sliderMax = Number(this.dofFocalLengthSlider.max);
            const clamped = Math.max(sliderMin, Math.min(sliderMax, focalLength));
            this.dofFocalLengthSlider.value = String(Math.round(clamped));
            this.dofFocalLengthValueEl.textContent = this.mmdManager.dofFocalLengthDistanceInverted
                ? `${Math.round(focalLength)} (auto, inv)`
                : `${Math.round(focalLength)} (auto)`;
        }
    }

    private refreshLensDistortionAutoReadout(): void {
        if (!this.mmdManager.dofLensDistortionLinkedToCameraFov) return;
        if (!this.lensDistortionSlider || !this.lensDistortionValueEl) return;
        const distortionPercent = this.mmdManager.dofLensDistortion * 100;
        const sliderMin = Number(this.lensDistortionSlider.min);
        const sliderMax = Number(this.lensDistortionSlider.max);
        const clamped = Math.max(sliderMin, Math.min(sliderMax, distortionPercent));
        this.lensDistortionSlider.value = String(Math.round(clamped));
        this.lensDistortionValueEl.textContent = `${Math.round(distortionPercent)}% (auto)`;
    }

    private getSelectedTimelineTrack(): KeyframeTrack | null {
        const track = this.timeline.getSelectedTrack();
        if (!track) return null;
        return track;
    }

    private getTrackTypeLabel(track: Pick<KeyframeTrack, "category">): string {
        switch (track.category) {
            case "camera":
                return "Camera";
            case "morph":
                return "Morph";
            case "root":
            case "semi-standard":
            case "bone":
                return "Bone";
            default:
                return "Property";
        }
    }

    private isBoneTrackForEditor(track: KeyframeTrack | null): track is KeyframeTrack {
        if (!track) return false;
        return track.category === "root" || track.category === "semi-standard" || track.category === "bone";
    }

    private syncBottomBoneSelectionFromTimeline(track: KeyframeTrack | null): void {
        if (!this.isBoneTrackForEditor(track)) return;
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.syncingBoneSelection = true;
        try {
            this.bottomPanel.setSelectedBone(track.name);
        } finally {
            this.syncingBoneSelection = false;
        }
    }

    private syncTimelineBoneSelectionFromBottomPanel(boneName: string | null): void {
        if (!boneName) return;
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.mmdManager.setBoneVisualizerSelectedBone(boneName);
        this.syncingBoneSelection = true;
        try {
            this.timeline.selectTrackByNameAndCategory(boneName, ["root", "semi-standard", "bone"]);
        } finally {
            this.syncingBoneSelection = false;
        }
    }

    private syncBoneVisualizerSelection(track: KeyframeTrack | null): void {
        if (this.mmdManager.getTimelineTarget() !== "model") {
            this.mmdManager.setBoneVisualizerSelectedBone(null);
            return;
        }

        if (this.isBoneTrackForEditor(track)) {
            this.mmdManager.setBoneVisualizerSelectedBone(track.name);
            return;
        }

        this.mmdManager.setBoneVisualizerSelectedBone(this.bottomPanel.getSelectedBone());
    }

    private updateTimelineEditState(): void {
        const track = this.getSelectedTimelineTrack();
        const selectedFrame = this.timeline.getSelectedFrame();
        const currentFrame = this.mmdManager.currentFrame;

        if (!track) {
            this.timelineSelectionLabel.textContent = "No track selected";
            this.interpolationTrackNameLabel.textContent = "-";
            this.interpolationFrameLabel.textContent = "-";
            this.resetInterpolationTypeSelect();
            this.interpolationStatusLabel.textContent = "No track selected";
            this.renderInterpolationCurves(null);
            this.btnKeyframeAdd.disabled = true;
            this.btnKeyframeDelete.disabled = true;
            this.btnKeyframeNudgeLeft.disabled = false;
            this.btnKeyframeNudgeRight.disabled = false;
            return;
        }

        const frameLabel = selectedFrame !== null ? ` @${selectedFrame}` : "";
        const trackTypeLabel = this.getTrackTypeLabel(track);
        this.timelineSelectionLabel.textContent = `[${trackTypeLabel}] ${track.name}${frameLabel}`;
        const interpolationFrame = selectedFrame ?? currentFrame;
        this.interpolationTrackNameLabel.textContent = `${trackTypeLabel}: ${track.name}`;
        this.interpolationFrameLabel.textContent = String(interpolationFrame);
        this.updateInterpolationPreview(track, interpolationFrame);
        this.btnKeyframeAdd.disabled = false;

        const hasCurrentFrameKey = this.mmdManager.hasTimelineKeyframe(track, currentFrame);
        const canDelete = selectedFrame !== null || hasCurrentFrameKey;
        this.btnKeyframeDelete.disabled = !canDelete;

        this.btnKeyframeNudgeLeft.disabled = false;
        this.btnKeyframeNudgeRight.disabled = false;
    }

    private updateInterpolationPreview(track: KeyframeTrack, frame: number): void {
        const preview = this.buildInterpolationPreviewFromRuntime(track, frame);
        this.syncInterpolationTypeSelect(preview);

        if (preview.source === "morph") {
            this.interpolationStatusLabel.textContent = "Morph curves are not editable";
        } else if (!preview.hasKeyframe) {
            this.interpolationStatusLabel.textContent = "No keyframe at this frame";
        } else if (preview.hasCurveData) {
            this.interpolationStatusLabel.textContent = "Interpolation curve shown";
        } else {
            this.interpolationStatusLabel.textContent = "Curve data is not available for this track";
        }

        this.renderInterpolationCurves(preview);
    }

    private buildInterpolationPreviewFromRuntime(track: KeyframeTrack, frame: number): TimelineInterpolationPreview {
        this.interpolationChannelBindings.clear();
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;
        const linear = this.createLinearCurve();
        const cameraFrames = managerInternal.cameraSourceAnimation?.cameraTrack?.frameNumbers;
        const previewSourceFrames =
            track.category === "camera" && cameraFrames && cameraFrames.length > 0
                ? cameraFrames
                : track.frames;
        const previewFrame = this.resolveInterpolationReferenceFrame(
            previewSourceFrames,
            normalizedFrame,
            track.category === "camera",
            false,
        );
        const hasKeyframe = previewFrame !== null;

        if (previewFrame === null) {
            return {
                source: "none",
                frame: normalizedFrame,
                hasKeyframe: false,
                hasCurveData: false,
                channels: [],
            };
        }

        if (track.category === "camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            const keyIndex = this.findFrameIndex(cameraTrack?.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("cam-x", cameraTrack?.positionInterpolations, keyIndex, 12, 0);
            this.bindInterpolationChannel("cam-y", cameraTrack?.positionInterpolations, keyIndex, 12, 4);
            this.bindInterpolationChannel("cam-z", cameraTrack?.positionInterpolations, keyIndex, 12, 8);
            this.bindInterpolationChannel("cam-rot", cameraTrack?.rotationInterpolations, keyIndex, 4, 0);
            this.bindInterpolationChannel("cam-dist", cameraTrack?.distanceInterpolations, keyIndex, 4, 0);
            this.bindInterpolationChannel("cam-fov", cameraTrack?.fovInterpolations, keyIndex, 4, 0);
            return {
                source: "camera",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("cam-x", "Pos X", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-y", "Pos Y", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 4, linear), hasCurveData),
                    this.createCurveChannel("cam-z", "Pos Z", this.readCurve(cameraTrack?.positionInterpolations, keyIndex, 12, 8, linear), hasCurveData),
                    this.createCurveChannel("cam-rot", "Rot", this.readCurve(cameraTrack?.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-dist", "Dist", this.readCurve(cameraTrack?.distanceInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                    this.createCurveChannel("cam-fov", "FoV", this.readCurve(cameraTrack?.fovInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        if (track.category === "morph") {
            return {
                source: "morph",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData: false,
                channels: [
                    this.createCurveChannel("morph", "Weight", linear, true),
                ],
            };
        }

        const currentModel = managerInternal.currentModel ?? null;
        const modelAnimation = currentModel
            ? managerInternal.modelSourceAnimationsByModel?.get(currentModel) ?? null
            : null;

        const movableTrack = modelAnimation?.movableBoneTracks?.find((candidate) => candidate.name === track.name) ?? null;
        if (movableTrack) {
            const keyIndex = this.findFrameIndex(movableTrack.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("bone-x", movableTrack.positionInterpolations, keyIndex, 12, 0);
            this.bindInterpolationChannel("bone-y", movableTrack.positionInterpolations, keyIndex, 12, 4);
            this.bindInterpolationChannel("bone-z", movableTrack.positionInterpolations, keyIndex, 12, 8);
            this.bindInterpolationChannel("bone-rot", movableTrack.rotationInterpolations, keyIndex, 4, 0);
            return {
                source: "bone-movable",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("bone-x", "Pos X", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 0, linear), hasCurveData),
                    this.createCurveChannel("bone-y", "Pos Y", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 4, linear), hasCurveData),
                    this.createCurveChannel("bone-z", "Pos Z", this.readCurve(movableTrack.positionInterpolations, keyIndex, 12, 8, linear), hasCurveData),
                    this.createCurveChannel("bone-rot", "Rot", this.readCurve(movableTrack.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        const boneTrack = modelAnimation?.boneTracks?.find((candidate) => candidate.name === track.name) ?? null;
        if (boneTrack) {
            const keyIndex = this.findFrameIndex(boneTrack.frameNumbers, previewFrame);
            const hasCurveData = keyIndex >= 0;
            this.bindInterpolationChannel("bone-rot", boneTrack.rotationInterpolations, keyIndex, 4, 0);
            return {
                source: "bone-rotation-only",
                frame: previewFrame,
                hasKeyframe,
                hasCurveData,
                channels: [
                    this.createCurveChannel("bone-x", "Pos X", linear, false),
                    this.createCurveChannel("bone-y", "Pos Y", linear, false),
                    this.createCurveChannel("bone-z", "Pos Z", linear, false),
                    this.createCurveChannel("bone-rot", "Rot", this.readCurve(boneTrack.rotationInterpolations, keyIndex, 4, 0, linear), hasCurveData),
                ],
            };
        }

        return {
            source: "none",
            frame: previewFrame,
            hasKeyframe,
            hasCurveData: false,
            channels: [
                this.createCurveChannel("bone-x", "Pos X", linear, false),
                this.createCurveChannel("bone-y", "Pos Y", linear, false),
                this.createCurveChannel("bone-z", "Pos Z", linear, false),
                this.createCurveChannel("bone-rot", "Rot", linear, false),
            ],
        };
    }

    private resolveInterpolationReferenceFrame(
        frames: NumericArrayLike,
        frame: number,
        allowLeadingFallback = false,
        allowTrailingFallback = false,
    ): number | null {
        if (!frames || frames.length === 0) return null;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] < frame) lo = mid + 1;
            else hi = mid;
        }
        if (lo < frames.length && frames[lo] === frame) {
            return frames[lo];
        }
        if (lo === 0) {
            return allowLeadingFallback ? frames[0] : null;
        }
        if (lo < frames.length) {
            // MMD interpolation for segment A->B uses keyframe B's curve.
            return frames[lo];
        }
        return allowTrailingFallback ? frames[frames.length - 1] : null;
    }

    private createLinearCurve(): InterpolationCurve {
        return { x1: 20, x2: 107, y1: 20, y2: 107 };
    }

    private createCurveChannel(
        id: string,
        label: string,
        curve: InterpolationCurve,
        available: boolean,
    ): InterpolationChannelPreview {
        return { id, label, curve, available };
    }

    private bindInterpolationChannel(
        channelId: string,
        values: NumericArrayLike,
        frameIndex: number,
        stride: number,
        baseOffset: number,
    ): void {
        if (!values || frameIndex < 0) return;
        const writable = values as unknown as NumericWritableArray;
        const offset = frameIndex * stride + baseOffset;
        if (offset + 3 >= writable.length) return;
        this.interpolationChannelBindings.set(channelId, { values: writable, offset });
    }

    private isInterpolationChannelEditable(channelId: string): boolean {
        return this.interpolationChannelBindings.has(channelId);
    }

    private startInterpolationCurveDrag(event: PointerEvent, channelId: string, pointIndex: 1 | 2): void {
        if (!this.isInterpolationChannelEditable(channelId)) return;
        if (!(event.currentTarget instanceof SVGElement)) return;
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return;

        event.preventDefault();
        event.stopPropagation();

        this.interpolationDragState = { channelId, pointIndex, changed: false };
        const onMove = (moveEvent: PointerEvent) => this.handleInterpolationCurveDragMove(moveEvent, svg);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const changed = this.interpolationDragState?.changed ?? false;
            this.interpolationDragState = null;
            if (changed) {
                this.refreshRuntimeAnimationFromInterpolationEdit();
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        this.handleInterpolationCurveDragMove(event, svg);
    }

    private handleInterpolationCurveDragMove(event: PointerEvent, svg: SVGSVGElement): void {
        const dragState = this.interpolationDragState;
        if (!dragState) return;

        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        // Matches createInterpolationCurveSvg() viewBox geometry.
        const width = 132;
        const height = 52;
        const left = 8;
        const right = width - 8;
        const top = 6;
        const bottom = height - 6;
        const innerWidth = right - left;
        const innerHeight = bottom - top;

        const viewX = ((event.clientX - rect.left) / rect.width) * width;
        const viewY = ((event.clientY - rect.top) / rect.height) * height;
        const x = this.clampInterpolationValue(((viewX - left) / innerWidth) * 127, 0);
        const y = this.clampInterpolationValue(((bottom - viewY) / innerHeight) * 127, 0);

        const binding = this.interpolationChannelBindings.get(dragState.channelId);
        if (!binding) return;

        const oldX = dragState.pointIndex === 1 ? binding.values[binding.offset + 0] : binding.values[binding.offset + 1];
        const oldY = dragState.pointIndex === 1 ? binding.values[binding.offset + 2] : binding.values[binding.offset + 3];
        if (oldX === x && oldY === y) return;

        if (dragState.pointIndex === 1) {
            binding.values[binding.offset + 0] = x;
            binding.values[binding.offset + 2] = y;
        } else {
            binding.values[binding.offset + 1] = x;
            binding.values[binding.offset + 3] = y;
        }

        dragState.changed = true;
        this.updateTimelineEditState();
    }

    private refreshRuntimeAnimationFromInterpolationEdit(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track || track.category === "morph") return;

        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;
        if (track.category === "camera") {
            const animation = managerInternal.cameraSourceAnimation;
            const mmdCamera = managerInternal.mmdCamera;
            if (!animation || !mmdCamera) return;

            if (managerInternal.cameraAnimationHandle !== null && managerInternal.cameraAnimationHandle !== undefined) {
                mmdCamera.destroyRuntimeAnimation(managerInternal.cameraAnimationHandle);
            }
            const handle = mmdCamera.createRuntimeAnimation(animation as unknown);
            mmdCamera.setRuntimeAnimation(handle);
            managerInternal.cameraAnimationHandle = handle;
            this.mmdManager.seekTo(this.mmdManager.currentFrame);
            return;
        }

        const currentModel = managerInternal.currentModel;
        const animation = currentModel ? managerInternal.modelSourceAnimationsByModel?.get(currentModel) : null;
        if (!currentModel || !animation) return;
        const handle = currentModel.createRuntimeAnimation(animation);
        currentModel.setRuntimeAnimation(handle);
        this.mmdManager.seekTo(this.mmdManager.currentFrame);
    }

    private clampInterpolationValue(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        return Math.max(0, Math.min(127, Math.round(value)));
    }

    private readCurve(
        values: NumericArrayLike,
        frameIndex: number,
        stride: number,
        baseOffset: number,
        fallback: InterpolationCurve,
    ): InterpolationCurve {
        if (!values || frameIndex < 0) {
            return { ...fallback };
        }
        const offset = frameIndex * stride + baseOffset;
        if (offset + 3 >= values.length) {
            return { ...fallback };
        }
        return {
            x1: this.clampInterpolationValue(values[offset + 0], fallback.x1),
            x2: this.clampInterpolationValue(values[offset + 1], fallback.x2),
            y1: this.clampInterpolationValue(values[offset + 2], fallback.y1),
            y2: this.clampInterpolationValue(values[offset + 3], fallback.y2),
        };
    }

    private findFrameIndex(frames: NumericArrayLike, frame: number): number {
        if (!frames || frames.length === 0) return -1;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] < frame) lo = mid + 1;
            else hi = mid;
        }
        return lo < frames.length && frames[lo] === frame ? lo : -1;
    }

    private renderInterpolationCurves(preview: TimelineInterpolationPreview | null): void {
        this.interpolationCurveList.textContent = "";

        if (!preview || preview.channels.length === 0) {
            const empty = document.createElement("div");
            empty.className = "interp-curve-empty";
            empty.textContent = "No keyframes with interpolation data";
            this.interpolationCurveList.appendChild(empty);
            return;
        }

        const renderChannels = this.getInterpolationChannelsForRender(preview);
        if (renderChannels.length === 0) {
            const empty = document.createElement("div");
            empty.className = "interp-curve-empty";
            empty.textContent = "No channels available for the selected type";
            this.interpolationCurveList.appendChild(empty);
            return;
        }

        this.interpolationCurveList.appendChild(this.createInterpolationCurveCard(renderChannels));
    }

    private resetInterpolationTypeSelect(): void {
        this.interpolationTypeSelect.textContent = "";
        const option = document.createElement("option");
        option.value = "__all__";
        option.textContent = "All";
        this.interpolationTypeSelect.appendChild(option);
        this.interpolationTypeSelect.value = "__all__";
        this.interpolationTypeSelect.disabled = true;
    }

    private syncInterpolationTypeSelect(preview: TimelineInterpolationPreview): void {
        const previous = this.interpolationTypeSelect.value;
        const selectableChannels = this.getSelectableInterpolationChannels(preview.channels);

        this.interpolationTypeSelect.textContent = "";

        const allOption = document.createElement("option");
        allOption.value = "__all__";
        allOption.textContent = `All (${selectableChannels.length}ch)`;
        this.interpolationTypeSelect.appendChild(allOption);

        for (const channel of selectableChannels) {
            const option = document.createElement("option");
            option.value = channel.id;
            option.textContent = channel.label;
            this.interpolationTypeSelect.appendChild(option);
        }

        this.interpolationTypeSelect.disabled = selectableChannels.length === 0;
        const hasPrevious = Array.from(this.interpolationTypeSelect.options).some((option) => option.value === previous);
        this.interpolationTypeSelect.value = hasPrevious ? previous : "__all__";
    }

    private getSelectableInterpolationChannels(channels: InterpolationChannelPreview[]): InterpolationChannelPreview[] {
        const visibleChannels = channels.filter((channel) => channel.available);
        return (visibleChannels.length > 0 ? visibleChannels : channels)
            .slice()
            .sort((a, b) => this.getCurveChannelOrder(a) - this.getCurveChannelOrder(b));
    }

    private getInterpolationChannelsForRender(preview: TimelineInterpolationPreview): InterpolationChannelPreview[] {
        const selectableChannels = this.getSelectableInterpolationChannels(preview.channels);
        const filter = this.interpolationTypeSelect.value;
        if (filter === "__all__") {
            return selectableChannels;
        }
        return selectableChannels.filter((channel) => channel.id === filter);
    }

    private createInterpolationCurveCard(channels: InterpolationChannelPreview[]): HTMLElement {
        const visibleChannels = channels.filter((channel) => channel.available);
        const targetChannels = (visibleChannels.length > 0 ? visibleChannels : channels)
            .slice()
            .sort((a, b) => this.getCurveChannelOrder(a) - this.getCurveChannelOrder(b));

        const card = document.createElement("div");
        card.className = "interp-curve-card";

        const legend = document.createElement("div");
        legend.className = "interp-curve-legend";

        for (const channel of targetChannels) {
            const item = document.createElement("div");
            item.className = "interp-curve-legend-item";
            if (!channel.available) {
                item.classList.add("interp-curve-legend-item--muted");
            }
            const color = this.getCurveChannelColor(channel);

            const name = document.createElement("span");
            name.className = "interp-curve-name";
            name.textContent = channel.label;
            name.style.color = color;

            const value = document.createElement("span");
            value.className = "interp-curve-value";
            value.textContent = `${channel.curve.x1},${channel.curve.x2},${channel.curve.y1},${channel.curve.y2}`;

            item.appendChild(name);
            item.appendChild(value);
            legend.appendChild(item);
        }

        card.appendChild(this.createInterpolationCurveSvg(targetChannels));
        card.appendChild(legend);

        return card;
    }

    private getCurveChannelOrder(channel: InterpolationChannelPreview): number {
        const id = channel.id.toLowerCase();
        if (id.includes("-x")) return 0;
        if (id.includes("-y")) return 1;
        if (id.includes("-z")) return 2;
        if (id.includes("rot")) return 3;
        if (id.includes("dist")) return 4;
        if (id.includes("fov")) return 5;
        return 9;
    }

    private getCurveChannelColor(channel: InterpolationChannelPreview): string {
        const id = channel.id.toLowerCase();
        if (id.includes("-x")) return "var(--axis-x-color)";
        if (id.includes("-y")) return "var(--axis-y-color)";
        if (id.includes("-z")) return "var(--axis-z-color)";
        if (id.includes("rot")) return "var(--accent-amber)";
        if (id.includes("dist")) return "var(--accent-cyan)";
        if (id.includes("fov")) return "var(--accent-pink)";
        return "var(--text-accent)";
    }

    private createInterpolationCurveSvg(channels: InterpolationChannelPreview[]): SVGSVGElement {
        const width = 132;
        const height = 52;
        const left = 8;
        const right = width - 8;
        const top = 6;
        const bottom = height - 6;
        const innerWidth = right - left;
        const innerHeight = bottom - top;

        const svgNs = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNs, "svg");
        svg.classList.add("interp-curve-svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "none");

        const guide = document.createElementNS(svgNs, "line");
        guide.classList.add("interp-curve-guide");
        guide.setAttribute("x1", String(left));
        guide.setAttribute("y1", String(bottom));
        guide.setAttribute("x2", String(right));
        guide.setAttribute("y2", String(top));

        svg.appendChild(guide);
        for (const channel of channels) {
            const curve = channel.curve;
            const channelPx1 = left + (curve.x1 / 127) * innerWidth;
            const channelPx2 = left + (curve.x2 / 127) * innerWidth;
            const channelPy1 = bottom - (curve.y1 / 127) * innerHeight;
            const channelPy2 = bottom - (curve.y2 / 127) * innerHeight;
            const color = this.getCurveChannelColor(channel);

            const path = document.createElementNS(svgNs, "path");
            path.classList.add("interp-curve-path");
            path.setAttribute("d", `M ${left} ${bottom} C ${channelPx1} ${channelPy1}, ${channelPx2} ${channelPy2}, ${right} ${top}`);
            path.setAttribute("stroke", color);
            if (!channel.available) {
                path.setAttribute("stroke-dasharray", "3 2");
                path.setAttribute("opacity", "0.45");
            }

            const p1 = document.createElementNS(svgNs, "circle");
            p1.classList.add("interp-curve-point");
            p1.setAttribute("cx", String(channelPx1));
            p1.setAttribute("cy", String(channelPy1));
            p1.setAttribute("r", "2");
            p1.setAttribute("fill", color);
            if (!channel.available) {
                p1.setAttribute("opacity", "0.5");
            } else if (this.isInterpolationChannelEditable(channel.id)) {
                p1.classList.add("interp-curve-point--editable");
                p1.style.cursor = "grab";
                p1.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 1)
                );
            }

            const p2 = document.createElementNS(svgNs, "circle");
            p2.classList.add("interp-curve-point");
            p2.setAttribute("cx", String(channelPx2));
            p2.setAttribute("cy", String(channelPy2));
            p2.setAttribute("r", "2");
            p2.setAttribute("fill", color);
            if (!channel.available) {
                p2.setAttribute("opacity", "0.5");
            } else if (this.isInterpolationChannelEditable(channel.id)) {
                p2.classList.add("interp-curve-point--editable");
                p2.style.cursor = "grab";
                p2.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 2)
                );
            }

            svg.appendChild(path);
            svg.appendChild(p1);
            svg.appendChild(p2);
        }
        return svg;
    }

    private addKeyframeAtCurrentFrame(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        const interpolationSnapshot = this.captureInterpolationCurveSnapshot(track, frame);
        const created = this.mmdManager.addTimelineKeyframe(track, frame);
        if (!created) {
            const overwritten = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot);
            if (overwritten) {
                this.refreshRuntimeAnimationFromInterpolationEdit();
                this.timeline.setSelectedFrame(null);
                this.updateTimelineEditState();
                this.showToast(`Frame ${frame} keyframe updated`, "success");
                return;
            }
            this.showToast(`Frame ${frame} already has a keyframe`, "info");
            return;
        }

        const persistedInterpolation = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot);
        if (persistedInterpolation) {
            this.refreshRuntimeAnimationFromInterpolationEdit();
        }

        this.timeline.setSelectedFrame(null);
        this.updateTimelineEditState();
        this.showToast(`Frame ${frame}: keyframe added`, "success");
    }

    private captureInterpolationCurveSnapshot(track: KeyframeTrack, frame: number): Map<string, InterpolationCurve> {
        const preview = this.buildInterpolationPreviewFromRuntime(track, frame);
        const snapshot = new Map<string, InterpolationCurve>();
        for (const channel of preview.channels) {
            snapshot.set(channel.id, { ...channel.curve });
        }
        return snapshot;
    }

    private persistInterpolationForNewKeyframe(
        track: KeyframeTrack,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
    ): boolean {
        if (track.category === "morph") return false;

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (track.category === "camera") {
            const cameraTrackLike = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrackLike) return false;
            return this.persistCameraKeyframeInterpolation(
                cameraTrackLike as RuntimeCameraTrackLike & RuntimeCameraTrackMutable,
                normalizedFrame,
                curves,
            );
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return false;
        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel);
        if (!modelAnimation) return false;

        const movableTrackLike = modelAnimation.movableBoneTracks.find((candidate) => candidate.name === track.name);
        if (movableTrackLike) {
            return this.persistMovableBoneKeyframeInterpolation(
                track.name,
                movableTrackLike as RuntimeMovableBoneTrackLike & RuntimeMovableBoneTrackMutable,
                normalizedFrame,
                curves,
            );
        }

        const boneTrackLike = modelAnimation.boneTracks.find((candidate) => candidate.name === track.name);
        if (boneTrackLike) {
            return this.persistBoneKeyframeInterpolation(
                track.name,
                boneTrackLike as RuntimeBoneTrackLike & RuntimeBoneTrackMutable,
                normalizedFrame,
                curves,
            );
        }

        return false;
    }

    private persistCameraKeyframeInterpolation(
        track: RuntimeCameraTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const cameraPosition = this.mmdManager.getCameraPosition();
        const cameraRotationDeg = this.mmdManager.getCameraRotation();
        const cameraDistance = this.mmdManager.getCameraDistance();
        const cameraFovRad = (this.mmdManager.getCameraFov() * Math.PI) / 180;
        const degToRad = Math.PI / 180;

        track.positions = this.upsertFloatValues(track.positions, 3, frameEdit.index, frameEdit.exists, [
            cameraPosition.x,
            cameraPosition.y,
            cameraPosition.z,
        ]);
        track.rotations = this.upsertFloatValues(track.rotations, 3, frameEdit.index, frameEdit.exists, [
            cameraRotationDeg.x * degToRad,
            cameraRotationDeg.y * degToRad,
            cameraRotationDeg.z * degToRad,
        ]);
        track.distances = this.upsertFloatValues(track.distances, 1, frameEdit.index, frameEdit.exists, [cameraDistance]);
        track.fovs = this.upsertFloatValues(track.fovs, 1, frameEdit.index, frameEdit.exists, [cameraFovRad]);
        track.positionInterpolations = this.upsertUint8Values(
            track.positionInterpolations,
            12,
            frameEdit.index,
            frameEdit.exists,
            this.composePositionInterpolationBlock(curves, "cam-x", "cam-y", "cam-z"),
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-rot")),
        );
        track.distanceInterpolations = this.upsertUint8Values(
            track.distanceInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-dist")),
        );
        track.fovInterpolations = this.upsertUint8Values(
            track.fovInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-fov")),
        );
        return true;
    }

    private persistMovableBoneKeyframeInterpolation(
        boneName: string,
        track: RuntimeMovableBoneTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = this.mmdManager.getBoneTransform(boneName);
        const fallbackPosition = this.readFloatBlock(track.positions, referenceIndex, 3, [0, 0, 0]);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);

        const positionBlock = transform
            ? [transform.position.x, transform.position.y, transform.position.z]
            : fallbackPosition;

        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;

        track.positions = this.upsertFloatValues(track.positions, 3, frameEdit.index, frameEdit.exists, positionBlock);
        track.rotations = this.upsertFloatValues(track.rotations, 4, frameEdit.index, frameEdit.exists, rotationBlock);
        track.physicsToggles = this.upsertUint8Values(
            track.physicsToggles,
            1,
            frameEdit.index,
            frameEdit.exists,
            fallbackPhysicsToggle,
        );
        track.positionInterpolations = this.upsertUint8Values(
            track.positionInterpolations,
            12,
            frameEdit.index,
            frameEdit.exists,
            this.composePositionInterpolationBlock(curves, "bone-x", "bone-y", "bone-z"),
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "bone-rot")),
        );
        return true;
    }

    private persistBoneKeyframeInterpolation(
        boneName: string,
        track: RuntimeBoneTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = this.mmdManager.getBoneTransform(boneName);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);
        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;

        track.rotations = this.upsertFloatValues(track.rotations, 4, frameEdit.index, frameEdit.exists, rotationBlock);
        track.physicsToggles = this.upsertUint8Values(
            track.physicsToggles,
            1,
            frameEdit.index,
            frameEdit.exists,
            fallbackPhysicsToggle,
        );
        track.rotationInterpolations = this.upsertUint8Values(
            track.rotationInterpolations,
            4,
            frameEdit.index,
            frameEdit.exists,
            this.curveToBlock(this.getCurveFromSnapshot(curves, "bone-rot")),
        );
        return true;
    }

    private rotationDegreesToQuaternionBlock(xDeg: number, yDeg: number, zDeg: number): number[] {
        const degToRad = Math.PI / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yDeg * degToRad, xDeg * degToRad, zDeg * degToRad);
        return [rotation.x, rotation.y, rotation.z, rotation.w];
    }

    private composePositionInterpolationBlock(
        curves: ReadonlyMap<string, InterpolationCurve>,
        xChannelId: string,
        yChannelId: string,
        zChannelId: string,
    ): number[] {
        const x = this.curveToBlock(this.getCurveFromSnapshot(curves, xChannelId));
        const y = this.curveToBlock(this.getCurveFromSnapshot(curves, yChannelId));
        const z = this.curveToBlock(this.getCurveFromSnapshot(curves, zChannelId));
        return [...x, ...y, ...z];
    }

    private getCurveFromSnapshot(curves: ReadonlyMap<string, InterpolationCurve>, channelId: string): InterpolationCurve {
        const curve = curves.get(channelId);
        if (curve) return curve;
        return this.createLinearCurve();
    }

    private curveToBlock(curve: InterpolationCurve): number[] {
        return [
            this.clampInterpolationValue(curve.x1, 20),
            this.clampInterpolationValue(curve.x2, 107),
            this.clampInterpolationValue(curve.y1, 20),
            this.clampInterpolationValue(curve.y2, 107),
        ];
    }

    private resolveInsertReferenceIndex(frames: NumericArrayLike, frame: number): number {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const exactIndex = this.findFrameIndex(frames, normalizedFrame);
        if (exactIndex >= 0) return exactIndex;
        const referenceFrame = this.resolveInterpolationReferenceFrame(frames, normalizedFrame, true, true);
        if (referenceFrame === null) return -1;
        return this.findFrameIndex(frames, referenceFrame);
    }

    private upsertFrameNumber(
        frames: ArrayLike<number>,
        frame: number,
    ): { frames: Uint32Array; index: number; exists: boolean } {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        const sourceLength = frames?.length ?? 0;

        let lo = 0;
        let hi = sourceLength;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((frames[mid] ?? 0) < normalizedFrame) lo = mid + 1;
            else hi = mid;
        }

        const exists = lo < sourceLength && (frames[lo] ?? 0) === normalizedFrame;
        if (exists) {
            const nextFrames = new Uint32Array(sourceLength);
            for (let i = 0; i < sourceLength; i += 1) nextFrames[i] = Math.max(0, Math.floor(frames[i] ?? 0));
            return { frames: nextFrames, index: lo, exists: true };
        }

        const nextFrames = new Uint32Array(sourceLength + 1);
        for (let i = 0; i < lo; i += 1) nextFrames[i] = Math.max(0, Math.floor(frames[i] ?? 0));
        nextFrames[lo] = normalizedFrame;
        for (let i = lo; i < sourceLength; i += 1) nextFrames[i + 1] = Math.max(0, Math.floor(frames[i] ?? 0));
        return { frames: nextFrames, index: lo, exists: false };
    }

    private upsertFloatValues(
        values: ArrayLike<number>,
        stride: number,
        frameIndex: number,
        exists: boolean,
        block: readonly number[],
    ): Float32Array {
        const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
        const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
        const target = new Float32Array(targetFrameCount * stride);

        for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
            const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
                ? sourceFrameIndex + 1
                : sourceFrameIndex;
            const sourceOffset = sourceFrameIndex * stride;
            const targetOffset = targetFrameIndex * stride;
            for (let i = 0; i < stride; i += 1) {
                const value = values[sourceOffset + i];
                target[targetOffset + i] = Number.isFinite(value) ? value : 0;
            }
        }

        const writeOffset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = block[i] ?? 0;
            target[writeOffset + i] = Number.isFinite(value) ? value : 0;
        }

        return target;
    }

    private upsertUint8Values(
        values: ArrayLike<number>,
        stride: number,
        frameIndex: number,
        exists: boolean,
        block: readonly number[],
    ): Uint8Array {
        const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
        const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
        const target = new Uint8Array(targetFrameCount * stride);

        for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
            const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
                ? sourceFrameIndex + 1
                : sourceFrameIndex;
            const sourceOffset = sourceFrameIndex * stride;
            const targetOffset = targetFrameIndex * stride;
            for (let i = 0; i < stride; i += 1) {
                const value = values[sourceOffset + i];
                const normalized = Number.isFinite(value) ? Math.round(value) : 0;
                target[targetOffset + i] = Math.max(0, Math.min(255, normalized));
            }
        }

        const writeOffset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = block[i] ?? 0;
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            target[writeOffset + i] = Math.max(0, Math.min(255, normalized));
        }

        return target;
    }

    private readFloatBlock(
        values: ArrayLike<number>,
        frameIndex: number,
        stride: number,
        fallback: readonly number[],
    ): number[] {
        const block = new Array<number>(stride);
        for (let i = 0; i < stride; i += 1) block[i] = Number.isFinite(fallback[i]) ? fallback[i] : 0;
        if (frameIndex < 0) return block;

        const offset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[offset + i];
            if (Number.isFinite(value)) block[i] = value;
        }
        return block;
    }

    private readUint8Block(
        values: ArrayLike<number>,
        frameIndex: number,
        stride: number,
        fallback: readonly number[],
    ): number[] {
        const block = new Array<number>(stride);
        for (let i = 0; i < stride; i += 1) {
            const value = Number.isFinite(fallback[i]) ? Math.round(fallback[i]) : 0;
            block[i] = Math.max(0, Math.min(255, value));
        }
        if (frameIndex < 0) return block;

        const offset = frameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const raw = values[offset + i];
            if (!Number.isFinite(raw)) continue;
            const normalized = Math.round(raw);
            block[i] = Math.max(0, Math.min(255, normalized));
        }
        return block;
    }

    private deleteSelectedKeyframe(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.timeline.getSelectedFrame() ?? this.mmdManager.currentFrame;
        const removed = this.mmdManager.removeTimelineKeyframe(track, frame);
        if (!removed) {
            this.showToast(`Frame ${frame}: no keyframe`, "info");
            return;
        }

        if (this.timeline.getSelectedFrame() === frame) {
            this.timeline.setSelectedFrame(null);
        }
        this.updateTimelineEditState();
        this.showToast(`Frame ${frame}: keyframe deleted`, "success");
    }

    private nudgeSelectedKeyframe(deltaFrame: number): void {
        const seekByDelta = (): void => {
            const toFrame = Math.max(0, this.mmdManager.currentFrame + deltaFrame);
            this.mmdManager.seekTo(toFrame);
            this.updateTimelineEditState();
        };

        const track = this.getSelectedTimelineTrack();
        const fromFrame = this.timeline.getSelectedFrame();
        if (!track || fromFrame === null) {
            seekByDelta();
            return;
        }

        const toFrame = Math.max(0, fromFrame + deltaFrame);
        const moved = this.mmdManager.moveTimelineKeyframe(track, fromFrame, toFrame);
        if (!moved) {
            seekByDelta();
            return;
        }

        this.timeline.setSelectedFrame(toFrame);
        this.mmdManager.seekTo(toFrame);
        this.updateTimelineEditState();
        this.showToast(`Key moved: ${fromFrame} -> ${toFrame}`, "success");
    }

    private play(updateStatus = true): void {
        this.mmdManager.play();
        this.btnPlay.style.display = "none";
        this.btnPause.style.display = "flex";
        if (updateStatus) this.setStatus("Playing", false);
    }

    private pause(updateStatus = true): void {
        this.mmdManager.pause();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        if (updateStatus) this.setStatus("Paused", false);
    }

    private stop(): void {
        this.mmdManager.stop();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
    }

    private stopAtPlaybackEnd(): void {
        this.mmdManager.pause();
        this.mmdManager.seekTo(this.mmdManager.totalFrames);
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
    }

    private setStatus(text: string, loading: boolean): void {
        this.statusText.textContent = text;
        if (loading) {
            this.statusDot.classList.add("loading");
        } else {
            this.statusDot.classList.remove("loading");
        }
    }

    private showToast(message: string, type: "success" | "error" | "info" = "info"): void {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "slideOut 0.3s ease forwards";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}










