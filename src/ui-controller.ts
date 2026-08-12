import type { MmdManager } from "./mmd-manager";
import type { Timeline, TimelineBoneTrackSelectionRef, TimelineKeySelectionRef } from "./timeline";
import type { BottomPanel } from "./bottom-panel";
import { applyI18nToDom, getLocale, setLocale, t } from "./i18n";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type {
    InterpolationChannelPreview,
    InterpolationCurve,
    KeyframeTrack,
    MmdModokiProjectFileV1,
    ModelInfo,
    MotionInfo,
    ProjectLightingState,
    ProjectOutputState,
    TimelineRotationOverlay,
    UiLocale,
    TrackCategory,
    TimelineInterpolationPreview,
} from "./types";
import { AccessoryPanelController } from "./ui/accessory-panel-controller";
import { AppMenuController } from "./ui/app-menu-controller";
import { BloomToneMapController } from "./ui/bloom-tone-map-controller";
import { BottomPanelLayoutController } from "./ui/bottom-panel-layout-controller";
import { CameraPanelController } from "./ui/camera-panel-controller";
import { ColorPostFxController } from "./ui/color-postfx-controller";
import { DofPanelController } from "./ui/dof-panel-controller";
import { ExperimentalPostFxController } from "./ui/experimental-postfx-controller";
import { ExportUiController } from "./ui/export-ui-controller";
import { EffectPanelShellController } from "./ui/effect-panel-shell-controller";
import { FogPanelController } from "./ui/fog-panel-controller";
import { LayoutUiController } from "./ui/layout-ui-controller";
import { LensEffectController } from "./ui/lens-effect-controller";
import { LutPanelController } from "./ui/lut-panel-controller";
import { ModelInfoPanelController, MODEL_INFO_CAMERA_SELECT_VALUE, type ModelInfoSelectState } from "./ui/model-info-panel-controller";
import { ModelEdgeController } from "./ui/model-edge-controller";
import { ModelExternalParentController } from "./ui/model-external-parent-controller";
import { installEnterCommitNumberInput } from "./ui/panel-control-helpers";
import {
    FRAME_GRAPH_EFFECT_SLIDER_MAX,
    FRAME_GRAPH_EFFECT_SLIDER_MIN,
    fromFrameGraphEffectSliderValue,
    isFrameGraphEffectSliderField,
    toFrameGraphEffectSliderValue,
    type FrameGraphEffectSliderField,
} from "./ui/frame-graph-effect-slider-mapping";
import { RuntimeFeatureUiController } from "./ui/runtime-feature-ui-controller";
import { SceneEnvironmentUiController } from "./ui/scene-environment-ui-controller";
import { ShaderPanelController } from "./ui/shader-panel-controller";
import { ViewportSeekBarController } from "./ui/viewport-bottom-bar-controller";
import { ViewportAxisHandleController } from "./ui/viewport-axis-handle-controller";
import { ViewportTopBarController, type ViewportTopBarCameraTransform } from "./ui/viewport-top-bar-controller";
import { ActionDispatcher } from "./actions/action-dispatcher";
import type { ActionSource } from "./actions/types";
import { executeCommand, type CommandExecutionContext } from "./actions/command-executor";
import { HistoryManager } from "./actions/history-manager";
import {
    buildKeyframeCommand,
    createCommandTrackKey,
    type KeyframeCommandSnapshot,
} from "./actions/keyframe-command-builder";
import { buildBoneTransformCommand } from "./actions/bone-transform-command-builder";
import { buildCameraTransformCommand } from "./actions/camera-transform-command-builder";
import type { BoneTransformCommandSnapshot, BuiltCommand, CameraTransformCommandSnapshot, CommandTrackRef } from "./actions/command-types";
import type {
    BoneKeyframePayload,
    CameraExternalParentKeyframePayload,
    CameraKeyframePayload,
    MovableBoneKeyframePayload,
    TimelineKeyframePayload,
} from "./editor/timeline-edit-service";
import type { ModelExternalParentKeyframePayload } from "./shared/model-external-parent";
import {
    buildMirrorPasteItems,
    type MirrorPasteClipboardItem,
} from "./editor/mirror-paste-service";
import {
    POST_EFFECT_BACKEND_STORAGE_KEY,
    normalizePostEffectBackend,
    type PostEffectBackend,
} from "./render/post-effect-backend";
import {
    addFrameGraphPostEffectId,
    isFrameGraphPostEffectId,
    type FrameGraphPostEffectId,
} from "./shared/frame-graph-post-effect-stack";

type SectionKeyframeButtonState = "none" | "dirty" | "registered";
type SectionKeyframeSection = "info" | "interpolation" | "bone" | "morph" | "accessory";
type NumericArrayLike = ArrayLike<number> | null | undefined;
const FIXED_DOF_FSTOP = 2.0;
type SelectedBonePoseSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    distance?: number;
    fov?: number;
};

type PendingBoneTransformCommand = {
    boneName: string;
    frame: number;
    before: BoneTransformCommandSnapshot;
};

type SingleKeyframeClipboard = {
    version: 1;
    mode: "single";
    sourceTarget: "model" | "camera";
    sourceFrame: number;
    track: CommandTrackRef;
    payload: TimelineKeyframePayload;
};

type BatchKeyframeClipboard = {
    version: 2;
    mode: "batch";
    sourceTarget: "model" | "camera";
    sourceBaseFrame: number;
    items: {
        track: CommandTrackRef;
        sourceFrame: number;
        frameOffset: number;
        payload: TimelineKeyframePayload;
    }[];
};

type KeyframeClipboard = SingleKeyframeClipboard | BatchKeyframeClipboard;

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
    dirtyMarked: boolean;
};

type InterpolationCurveClipboard = {
    curves: InterpolationCurve[];
    sourceChannelCount: number;
};

type FrameGraphPostAddEffectId = FrameGraphPostEffectId;

type FrameGraphPostAddEffect = {
    id: FrameGraphPostAddEffectId;
    labelKey: string;
    isActive: (manager: MmdManager) => boolean;
    setActive: (manager: MmdManager, active: boolean) => void;
};

const FRAME_GRAPH_POST_ADD_EFFECTS: readonly FrameGraphPostAddEffect[] = [
    {
        id: "ssr",
        labelKey: "effect.frameGraphPost.effects.ssr",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("ssr"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("ssr", active); },
    },
    {
        id: "ssgi",
        labelKey: "effect.frameGraphPost.effects.ssgi",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("ssgi"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("ssgi", active); },
    },
    {
        id: "ssao",
        labelKey: "effect.frameGraphPost.effects.ssao",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("ssao"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("ssao", active); },
    },
    {
        id: "offsetShadow",
        labelKey: "effect.frameGraphPost.effects.offsetShadow",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("offsetShadow"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("offsetShadow", active); },
    },
    {
        id: "offsetHighlight",
        labelKey: "effect.frameGraphPost.effects.offsetHighlight",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("offsetHighlight"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("offsetHighlight", active); },
    },
    {
        id: "dof",
        labelKey: "effect.frameGraphPost.effects.dof",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("dof"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("dof", active); },
    },
    {
        id: "luminous",
        labelKey: "effect.frameGraphPost.effects.luminous",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("luminous"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("luminous", active); },
    },
    {
        id: "bloom",
        labelKey: "effect.frameGraphPost.effects.bloom",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("bloom"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("bloom", active); },
    },
    {
        id: "lut",
        labelKey: "effect.frameGraphPost.effects.lut",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("lut"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("lut", active); },
    },
    {
        id: "ocean",
        labelKey: "effect.frameGraphPost.effects.ocean",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("ocean"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("ocean", active); },
    },
    {
        id: "motionBlur",
        labelKey: "effect.frameGraphPost.effects.motionBlur",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("motionBlur"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("motionBlur", active); },
    },
    {
        id: "sharpen",
        labelKey: "effect.frameGraphPost.effects.sharpen",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("sharpen"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("sharpen", active); },
    },
    {
        id: "grain",
        labelKey: "effect.frameGraphPost.effects.grain",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("grain"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("grain", active); },
    },
    {
        id: "chromatic",
        labelKey: "effect.frameGraphPost.effects.chromatic",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("chromatic"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("chromatic", active); },
    },
    {
        id: "vignette",
        labelKey: "effect.frameGraphPost.effects.vignette",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("vignette"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("vignette", active); },
    },
    {
        id: "edgeBlur",
        labelKey: "effect.frameGraphPost.effects.edgeBlur",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("edgeBlur"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("edgeBlur", active); },
    },
    {
        id: "distortion",
        labelKey: "effect.frameGraphPost.effects.distortion",
        isActive: (manager) => manager.isFrameGraphPostEffectActive("distortion"),
        setActive: (manager, active) => { manager.setFrameGraphPostEffectStackEntryEnabled("distortion", active); },
    },
];

const FRAME_GRAPH_STACK_LUT_PRESETS = [
    { id: "anime-soft", label: "Anime Soft" },
    { id: "anime-cool", label: "Anime Cool" },
    { id: "anime-dramatic", label: "Anime Dramatic" },
    { id: "monotone", label: "Monotone" },
    { id: "sepia", label: "Sepia" },
    { id: "teal-orange", label: "Teal Orange" },
] as const;

type MmdManagerInternalView = {
    currentModel: (object & RuntimeAnimatableLike) | null;
    modelSourceAnimationsByModel: WeakMap<object, RuntimeModelAnimationLike>;
    cameraSourceAnimation: RuntimeCameraAnimationLike | null;
    mmdCamera: RuntimeCameraLike;
    cameraAnimationHandle: unknown | null;
};

function getRequiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required element not found: #${id}`);
    }
    return element as T;
}

function queryRequiredElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Required element not found: ${selector}`);
    }
    return element as T;
}

export class UIController {
    private static readonly DEBUG_KEYFRAME_FLOW = false;
    private static readonly INTERP_CURVE_VIEWBOX_WIDTH = 120;
    private static readonly INTERP_CURVE_VIEWBOX_HEIGHT = 120;
    private static readonly TIMELINE_WAVEFORM_FPS = 30;
    private static readonly RUNTIME_MODE_STORAGE_KEY = "mmd_modoki.runtimeMode";
    private static readonly AUTO_KEY_STORAGE_KEY = "mmd_modoki.autoKey.enabled";
    private mmdManager: MmdManager;
    private timeline: Timeline;
    private bottomPanel: BottomPanel;
    private bottomPanelLayoutController: BottomPanelLayoutController | null = null;
    private viewportSeekBarController: ViewportSeekBarController | null = null;
    private viewportAxisHandleController: ViewportAxisHandleController | null = null;
    private viewportTopBarController: ViewportTopBarController | null = null;

    // Button elements
    private btnLoadFile: HTMLElement;
    private btnSaveProject: HTMLElement;
    private btnLoadProject: HTMLElement;
    private btnExportPng: HTMLElement | null = null;
    private btnExportPngSeq: HTMLElement | null = null;
    private btnExportWebm: HTMLElement | null = null;
    private toolbarLocaleSelect: HTMLSelectElement | null = null;
    private toolbarRuntimeModeSelect: HTMLSelectElement | null = null;
    private btnPlay: HTMLElement;
    private btnPause: HTMLElement;
    private btnStop: HTMLElement | null;
    private btnSkipStart: HTMLElement;
    private btnSkipEnd: HTMLElement;
    private currentFrameEl: HTMLInputElement;
    private totalFramesEl: HTMLElement;
    private statusText: HTMLElement;
    private statusDot: HTMLElement;
    private viewportOverlay: HTMLElement;
    private btnKeyframeAdd: HTMLButtonElement;
    private btnKeyframeCopy: HTMLButtonElement;
    private btnKeyframePaste: HTMLButtonElement;
    private btnKeyframeMirrorPaste: HTMLButtonElement;
    private btnKeyframeDelete: HTMLButtonElement;
    private btnAutoKey: HTMLButtonElement;
    private btnKeyframeNudgeLeft: HTMLButtonElement;
    private btnKeyframeNudgeRight: HTMLButtonElement;
    private btnFrameStepLeft: HTMLButtonElement;
    private btnFrameStepRight: HTMLButtonElement;
    private btnFrameRangeStart: HTMLButtonElement;
    private btnFrameRangeEnd: HTMLButtonElement;
    private timelineSelectionLabel: HTMLElement | null;
    private interpolationTrackNameLabel: HTMLElement;
    private interpolationFrameLabel: HTMLElement;
    private interpolationTypeSelect: HTMLSelectElement;
    private interpolationStatusLabel: HTMLElement;
    private interpolationCurveList: HTMLElement;
    private btnInterpolationCopy: HTMLButtonElement | null = null;
    private btnInterpolationPaste: HTMLButtonElement | null = null;
    private btnInterpolationLinear: HTMLButtonElement | null = null;
    private shaderModelSelect: HTMLSelectElement | null = null;
    private shaderPresetSelect: HTMLSelectElement | null = null;
    private shaderApplySelectedButton: HTMLButtonElement | null = null;
    private shaderApplyAllButton: HTMLButtonElement | null = null;
    private shaderResetButton: HTMLButtonElement | null = null;
    private shaderPanelNote: HTMLElement | null = null;
    private shaderMaterialList: HTMLElement | null = null;
    private postEffectPanelHost: HTMLElement | null = null;
    private postEffectStackList: HTMLElement | null = null;
    private postEffectAddPanel: HTMLElement | null = null;
    private postEffectAddButton: HTMLButtonElement | null = null;
    private postEffectReloadFrameGraphButton: HTMLButtonElement | null = null;
    private postEffectEnableFrameGraphButton: HTMLButtonElement | null = null;
    private expandedFrameGraphPostEffectId: FrameGraphPostAddEffectId | null = null;
    private draggingFrameGraphPostEffectId: FrameGraphPostAddEffectId | null = null;
    private btnInfoKeyframe: HTMLButtonElement | null = null;
    private btnInterpolationKeyframe: HTMLButtonElement | null = null;
    private btnBoneKeyframe: HTMLButtonElement | null = null;
    private btnPhysicsKeyframe: HTMLButtonElement | null = null;
    private physicsKeyframeInputMode: 0 | 1 = 1;
    private btnMorphKeyframe: HTMLButtonElement | null = null;
    private btnAccessoryKeyframe: HTMLButtonElement | null = null;
    private shortcutEdgeWidthRestore = 1;
    private readonly rangeNumberInputs = new WeakMap<HTMLInputElement, HTMLInputElement>();
    private syncingBoneSelection = false;
    private selectedBoneTrackCategory: TrackCategory | null = null;
    private readonly sectionKeyframeDirtyKeys: Record<SectionKeyframeSection, Set<string>> = {
        info: new Set<string>(),
        interpolation: new Set<string>(),
        bone: new Set<string>(),
        morph: new Set<string>(),
        accessory: new Set<string>(),
    };
    private readonly pendingBonePoseSnapshots = new Map<string, { frame: number; snapshot: SelectedBonePoseSnapshot }>();
    private readonly interpolationChannelBindings = new Map<string, InterpolationChannelBinding>();
    private interpolationDragState: InterpolationDragState | null = null;
    private currentInterpolationPreview: TimelineInterpolationPreview | null = null;
    private interpolationCurveClipboard: InterpolationCurveClipboard | null = null;
    private keyframeClipboard: KeyframeClipboard | null = null;
    private timelineWaveformRequestId = 0;
    private lastObservedFrame: number | null = null;
    private accessoryPanelController: AccessoryPanelController | null = null;
    private appMenuController: AppMenuController | null = null;
    private bloomToneMapController: BloomToneMapController | null = null;
    private cameraPanelController: CameraPanelController | null = null;
    private colorPostFxController: ColorPostFxController | null = null;
    private dofPanelController: DofPanelController | null = null;
    private effectPanelShellController: EffectPanelShellController | null = null;
    private experimentalPostFxController: ExperimentalPostFxController | null = null;
    private exportUiController: ExportUiController | null = null;
    private fogPanelController: FogPanelController | null = null;
    private layoutUiController: LayoutUiController | null = null;
    private lensEffectController: LensEffectController | null = null;
    private lutPanelController: LutPanelController | null = null;
    private modelEdgeController: ModelEdgeController | null = null;
    private modelExternalParentController: ModelExternalParentController | null = null;
    private modelInfoPanelController: ModelInfoPanelController | null = null;
    private runtimeFeatureUiController: RuntimeFeatureUiController | null = null;
    private sceneEnvironmentUiController: SceneEnvironmentUiController | null = null;
    private shaderPanelController: ShaderPanelController | null = null;
    private readonly actionDispatcher = new ActionDispatcher();
    private readonly commandHistory = new HistoryManager();
    private pendingBoneTransformCommand: PendingBoneTransformCommand | null = null;
    private autoKeyEnabled = false;
    private postFxWgslToonPath: string | null = null;
    private postFxWgslToonText: string | null = null;
    private currentProjectFilePath: string | null = null;
    private readonly onLocaleChanged = (): void => {
        this.applyLocalizedUiState();
        this.viewportSeekBarController?.refreshLocale();
        this.viewportAxisHandleController?.refreshLocale();
        this.viewportTopBarController?.refreshLocale();
        this.dofPanelController?.refreshFocusTargetControls();
        this.refreshFrameGraphPostAddUi();
        this.refreshShaderPanel();
    };

    private debugKeyframeFlow(message: string, payload?: unknown): void {
        if (!UIController.DEBUG_KEYFRAME_FLOW) return;
        if (payload === undefined) {
            console.info(`[KeyframeFlow] ${message}`);
            return;
        }
        console.info(`[KeyframeFlow] ${message}`, payload);
    }

    constructor(mmdManager: MmdManager, timeline: Timeline, bottomPanel: BottomPanel) {
        this.mmdManager = mmdManager;
        this.timeline = timeline;
        this.bottomPanel = bottomPanel;
        this.bottomPanel.onRangeInputsRendered = (root) => this.installRangeNumberInputs(root);
        this.bottomPanel.onRangeSliderSynced = (slider) => this.syncRangeNumberInput(slider);

        // Get DOM elements
        this.btnLoadFile = getRequiredElement("btn-load-file");
        this.btnSaveProject = getRequiredElement("btn-save-project");
        this.btnLoadProject = getRequiredElement("btn-load-project");
        this.btnExportPng = document.getElementById("btn-export-png");
        this.btnExportPngSeq = document.getElementById("btn-export-png-seq");
        this.btnExportWebm = document.getElementById("btn-export-webm");
        this.toolbarLocaleSelect = document.getElementById("toolbar-locale-select") as HTMLSelectElement | null;
        this.toolbarRuntimeModeSelect = document.getElementById("toolbar-runtime-mode-select") as HTMLSelectElement | null;
        this.btnPlay = getRequiredElement("btn-play");
        this.btnPause = getRequiredElement("btn-pause");
        this.btnStop = document.getElementById("btn-stop");
        this.btnSkipStart = getRequiredElement("btn-skip-start");
        this.btnSkipEnd = getRequiredElement("btn-skip-end");
        this.currentFrameEl = document.getElementById("current-frame") as HTMLInputElement;
        this.totalFramesEl = getRequiredElement("total-frames");
        this.statusText = getRequiredElement("status-text");
        this.statusDot = queryRequiredElement(".status-dot");
        this.viewportOverlay = getRequiredElement("viewport-overlay");
        this.btnKeyframeAdd = document.getElementById("btn-kf-add") as HTMLButtonElement;
        this.btnKeyframeCopy = document.getElementById("btn-kf-copy") as HTMLButtonElement;
        this.btnKeyframePaste = document.getElementById("btn-kf-paste") as HTMLButtonElement;
        this.btnKeyframeMirrorPaste = document.getElementById("btn-kf-mirror-paste") as HTMLButtonElement;
        this.btnKeyframeDelete = document.getElementById("btn-kf-delete") as HTMLButtonElement;
        this.btnAutoKey = document.getElementById("btn-auto-key") as HTMLButtonElement;
        this.btnKeyframeNudgeLeft = document.getElementById("btn-kf-nudge-left") as HTMLButtonElement;
        this.btnKeyframeNudgeRight = document.getElementById("btn-kf-nudge-right") as HTMLButtonElement;
        this.btnFrameStepLeft = document.getElementById("btn-frame-step-left") as HTMLButtonElement;
        this.btnFrameStepRight = document.getElementById("btn-frame-step-right") as HTMLButtonElement;
        this.btnFrameRangeStart = document.getElementById("btn-frame-range-start") as HTMLButtonElement;
        this.btnFrameRangeEnd = document.getElementById("btn-frame-range-end") as HTMLButtonElement;
        this.timelineSelectionLabel = document.getElementById("timeline-selection-label");
        this.interpolationTrackNameLabel = getRequiredElement("interp-track-name");
        this.interpolationFrameLabel = getRequiredElement("interp-frame");
        this.interpolationTypeSelect = document.getElementById("interp-type") as HTMLSelectElement;
        this.interpolationStatusLabel = getRequiredElement("interp-status");
        this.interpolationCurveList = getRequiredElement("interp-curve-list");
        this.btnInterpolationCopy = document.getElementById("btn-interp-copy") as HTMLButtonElement | null;
        this.btnInterpolationPaste = document.getElementById("btn-interp-paste") as HTMLButtonElement | null;
        this.btnInterpolationLinear = document.getElementById("btn-interp-linear") as HTMLButtonElement | null;
        this.shaderModelSelect = document.getElementById("shader-model-select") as HTMLSelectElement | null;
        this.shaderPresetSelect = document.getElementById("shader-preset-select") as HTMLSelectElement | null;
        this.shaderApplySelectedButton = document.getElementById("btn-shader-apply-selected") as HTMLButtonElement | null;
        this.shaderApplyAllButton = document.getElementById("btn-shader-apply-all") as HTMLButtonElement | null;
        this.shaderResetButton = document.getElementById("btn-shader-reset") as HTMLButtonElement | null;
        this.shaderPanelNote = document.getElementById("shader-panel-note");
        this.shaderMaterialList = document.getElementById("shader-material-list");
        this.postEffectPanelHost = document.getElementById("effect-post-host");
        this.postEffectStackList = document.getElementById("effect-post-stack-list");
        this.postEffectAddPanel = document.getElementById("effect-post-add-panel");
        this.postEffectAddButton = document.getElementById("btn-effect-add-post") as HTMLButtonElement | null;
        this.postEffectReloadFrameGraphButton = document.getElementById("btn-effect-reload-framegraph") as HTMLButtonElement | null;
        this.postEffectEnableFrameGraphButton = document.getElementById("btn-effect-enable-framegraph") as HTMLButtonElement | null;

        this.modelEdgeController = new ModelEdgeController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.lensEffectController = new LensEffectController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            isRangeInputEditing: (slider) => this.isRangeInputEditing(slider),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.fogPanelController = new FogPanelController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            normalizeRangeInputValue: (slider, value) => this.normalizeRangeInputValue(slider, value),
            formatRangeInputValue: (slider, value) => this.formatRangeInputValue(slider, value),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.modelInfoPanelController = new ModelInfoPanelController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            onTargetSelected: (value, showToast) => this.handleModelTargetSelection(value, showToast),
            onModelVisibilityChanged: () => {
                this.markSectionKeyframeDirty("info", this.getInfoKeyframeContextKey());
                this.runtimeFeatureUiController?.refreshRigidBodies();
                this.updateSectionKeyframeButtons();
            },
            onModelDeleted: (hasRemainingModels) => {
                if (!hasRemainingModels) {
                    this.mmdManager.setTimelineTarget("camera");
                    this.applyCameraSelectionUI();
                } else {
                    this.applyActiveModelSelectionUI();
                }
                this.refreshModelSelector();
                this.refreshShaderPanel();
            },
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.cameraPanelController = new CameraPanelController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            onCameraEdited: () => {
                this.actionDispatcher.dispatch({ type: "edit.cameraTransformChanged", source: "panel" });
            },
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.modelExternalParentController = new ModelExternalParentController({
            mmdManager: this.mmdManager,
            getSelectedBone: () => this.bottomPanel.getSelectedBone(),
            registerKeyframe: (childModelIndex, childBoneName, parentModelIndex, parentBoneName) =>
                this.registerModelExternalParentKeyframe(
                    childModelIndex,
                    childBoneName,
                    parentModelIndex,
                    parentBoneName,
                ),
            showToast: (message, type) => this.showToast(message, type),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.setupActionHandlers();
        this.exportUiController = new ExportUiController({
            mmdManager: this.mmdManager,
            buildProjectState: () => this.buildProjectStateForPersistence(),
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
            isPlaybackActive: () => this.mmdManager.isPlaying,
            onPausePlayback: () => this.pause(false),
            getViewportSize: () => ({
                width: document.getElementById("viewport-container")?.clientWidth ?? 0,
                height: document.getElementById("viewport-container")?.clientHeight ?? 0,
            }),
            onOutputAspectChanged: () => {
                this.layoutUiController?.applyViewportAspectPresentation();
                this.layoutUiController?.syncMainWindowPresentationAspect();
            },
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.appMenuController = new AppMenuController({
            mmdManager: this.mmdManager,
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
            setStatus: (text, loading) => this.setStatus(text, loading ?? false),
            showToast: (message, type) => this.showToast(message, type),
            refreshEnvironmentUi: () => this.sceneEnvironmentUiController?.refresh(),
            refreshCameraUi: () => this.cameraPanelController?.refresh(true),
            refreshRuntimeUi: () => this.runtimeFeatureUiController?.refresh(),
            refreshModelEdgeUi: () => this.modelEdgeController?.refresh(),
            refreshLightingUi: () => this.refreshLightingUiFromRuntime(),
            refreshMaterialUi: () => this.shaderPanelController?.refresh(),
            createExportSettingsAdapter: () => this.exportUiController?.createExportSettingsAdapter() ?? {
                getState: () => ({
                    aspectPreset: "16:9",
                    sizePreset: "1920",
                    width: 1920,
                    height: 1080,
                    lockAspect: false,
                    qualityScale: 1,
                    fps: 30,
                    includeAudio: false,
                    preferredVideoCodec: "vp8",
                    captureMode: "rgba-surface",
                    usePlaybackRange: false,
                    startFrame: 0,
                    endFrame: 0,
                }),
                setAspectPreset: () => undefined,
                setSizePreset: () => undefined,
                setWidth: () => undefined,
                setHeight: () => undefined,
                setQualityScale: () => undefined,
                setFps: () => undefined,
                setIncludeAudio: () => undefined,
                setUsePlaybackRange: () => undefined,
                syncPlaybackRange: () => ({
                    aspectPreset: "16:9",
                    sizePreset: "1920",
                    width: 1920,
                    height: 1080,
                    lockAspect: false,
                    qualityScale: 1,
                    fps: 30,
                    includeAudio: false,
                    preferredVideoCodec: "vp8",
                    captureMode: "rgba-surface",
                    usePlaybackRange: false,
                    startFrame: 0,
                    endFrame: 0,
                }),
                setStartFrame: () => undefined,
                setEndFrame: () => undefined,
                setCaptureMode: () => undefined,
            },
        });
        this.setupEventListeners();
        this.setAutoKeyEnabled(false, { persist: false, toast: false });
        this.setupCallbacks();
        this.setupKeyboard();
        this.setupFileDrop();
        this.viewportSeekBarController = new ViewportSeekBarController({
            onSeekFrame: (frame, phase) => this.actionDispatcher.dispatch({
                type: "timeline.seekFrame",
                source: "bottomBar",
                frame,
                phase,
            }),
            onCommitCurrentFrame: (frame) => this.actionDispatcher.dispatch({
                type: "playback.seekFrame",
                source: "bottomBar",
                frame,
            }),
            onTogglePlayback: () => this.actionDispatcher.dispatch({ type: "playback.toggle", source: "bottomBar" }),
            onStepFrame: (deltaFrames) => this.actionDispatcher.dispatch({
                type: "playback.stepFrame",
                source: "bottomBar",
                deltaFrames,
            }),
            onSeekBoundary: (boundary) => this.actionDispatcher.dispatch({
                type: boundary === "start" ? "playback.seekStart" : "playback.seekEnd",
                source: "bottomBar",
            }),
            onSeekAdjacentKeyframe: (direction) => this.actionDispatcher.dispatch({
                type: "playback.seekAdjacentKeyframe",
                source: "bottomBar",
                direction,
            }),
            onRangeFrameChange: (boundary, frame, phase) => {
                this.exportUiController?.setPlaybackFrameRangeBoundary(boundary, frame);
                if (phase === "commit") {
                    this.exportUiController?.sanitizeOutputFrameRange(boundary);
                }
                this.refreshViewportBottomBar();
            },
            onRangeToggle: (kind, enabled) => {
                this.exportUiController?.setPlaybackFrameToggle(kind, enabled);
                this.refreshViewportBottomBar();
            },
            onExportPng: () => this.actionDispatcher.dispatch({ type: "project.exportPng", source: "bottomBar" }),
            onToggleUi: () => this.actionDispatcher.dispatch({ type: "layout.fullscreen.toggle", source: "bottomBar" }),
        });
        this.viewportAxisHandleController = new ViewportAxisHandleController({
            onPreviewBoneTransform: (value) => this.previewBottomBarBoneTransform(
                this.bottomPanel.getSelectedBone(),
                value.position,
                value.rotation,
            ),
            onPreviewCameraTransform: (value) => this.previewBottomBarCameraTransform(
                value.target,
                value.rotation,
                value.distance,
                value.fov,
            ),
            onCommitBoneTransform: (value, before) => this.actionDispatcher.dispatch({
                type: "edit.setBoneTransformFromBottomBar",
                source: "bottomBar",
                boneName: this.bottomPanel.getSelectedBone(),
                position: value.position,
                rotation: value.rotation,
                before,
            }),
            onCommitCameraTransform: (value, before) => this.actionDispatcher.dispatch({
                type: "edit.setCameraTransformFromBottomBar",
                source: "bottomBar",
                target: value.target,
                rotation: value.rotation,
                distance: value.distance,
                fov: value.fov,
                before,
            }),
        });
        this.viewportTopBarController = new ViewportTopBarController({
            getCameraTransform: () => this.captureCameraTransformCommandSnapshot(),
            onToggleMode: () => {
                if (this.mmdManager.getTimelineTarget() === "model") {
                    this.switchToCameraMode();
                    return;
                }
                this.switchViewportBottomBarToModel();
            },
            onPreviewCameraTransform: (value) => this.previewBottomBarCameraTransform(
                value.target,
                value.rotation,
                value.distance,
                value.fov,
            ),
            onPreviewCameraPan: (before, deltaX, deltaY) => this.previewTopBarCameraPan(before, deltaX, deltaY),
            onCommitCameraTransform: (value, before) => this.actionDispatcher.dispatch({
                type: "edit.setCameraTransformFromBottomBar",
                source: "viewport",
                target: value.target,
                rotation: value.rotation,
                distance: value.distance,
                fov: value.fov,
                before,
            }),
            onTogglePerspective: (enabled) => {
                this.mmdManager.setPerspectiveEnabled(enabled);
                this.refreshViewportBottomBar();
            },
            onViewPreset: (view) => this.actionDispatcher.dispatch({
                type: "camera.setViewPreset",
                source: "viewport",
                view,
            }),
        });
        this.bottomPanelLayoutController = new BottomPanelLayoutController();
        this.bottomPanelLayoutController.applyMode(this.mmdManager.getTimelineTarget() === "model" ? "model" : "camera");
        this.layoutUiController = new LayoutUiController({
            mmdManager: this.mmdManager,
            exportUiController: this.exportUiController,
            showToast: (message, type) => this.showToast(message, type),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.sceneEnvironmentUiController = new SceneEnvironmentUiController({
            mmdManager: this.mmdManager,
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.runtimeFeatureUiController = new RuntimeFeatureUiController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.accessoryPanelController = new AccessoryPanelController({
            mmdManager: this.mmdManager,
            showToast: (message, type) => this.showToast(message, type),
            onAccessoryTransformChanged: (accessoryIndex) => {
                this.markSectionKeyframeDirty("accessory", this.getAccessoryKeyframeContextKey(accessoryIndex));
                this.updateSectionKeyframeButtons();
            },
            onSelectionChanged: () => this.updateSectionKeyframeButtons(),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.colorPostFxController = new ColorPostFxController({
            mmdManager: this.mmdManager,
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.bloomToneMapController = new BloomToneMapController({
            mmdManager: this.mmdManager,
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.experimentalPostFxController = new ExperimentalPostFxController({
            mmdManager: this.mmdManager,
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.dofPanelController = new DofPanelController({
            mmdManager: this.mmdManager,
            syncRangeNumberInput: (slider) => this.syncRangeNumberInput(slider),
            isRangeInputEditing: (slider) => this.isRangeInputEditing(slider),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.effectPanelShellController = new EffectPanelShellController();
        this.effectPanelShellController.setActiveTab("post");
        this.setupPostEffectAddControls();
        this.lutPanelController = new LutPanelController({
            mmdManager: this.mmdManager,
            getBaseNameForRenderer: (filePath) => this.getBaseNameForRenderer(filePath),
            setStatus: (text, loading) => this.setStatus(text, loading),
            showToast: (message, type) => this.showToast(message, type),
            refreshShaderPanel: () => this.refreshShaderPanel(),
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.shaderPanelController = new ShaderPanelController({
            mmdManager: this.mmdManager,
            getInfoModelSelectState: () => this.getInfoModelSelectState(),
            onModelTargetSelected: (value, showToast) => this.handleModelTargetSelection(value, showToast),
            renderCameraPostEffectsPanel: () => this.renderShaderCameraPostEffectsPanel(),
            restoreCameraDofControlsToCameraPanel: () => this.dofPanelController?.restoreControlsToCameraPanel(),
            getBaseNameForRenderer: (filePath) => this.getBaseNameForRenderer(filePath),
            showToast: (message, type) => this.showToast(message, type),
            onExternalWgslToonChanged: (path, text) => {
                this.postFxWgslToonPath = path;
                this.postFxWgslToonText = text;
            },
            dispatchAction: (action) => this.actionDispatcher.dispatch(action),
        });
        this.setupPerfDisplay();
        this.showStartupRenderingDiagnostics();
        this.refreshModelSelector();
        this.accessoryPanelController?.refresh();
        this.sceneEnvironmentUiController?.refresh();
        this.runtimeFeatureUiController?.refresh();
        this.updateInfoActionButtons();
        this.refreshShaderPanel();
        this.installRangeNumberInputs();
        void this.shaderPanelController.reloadBundledWgslShaderFiles();
        this.updateTimelineEditState();
        this.timeline.setWaveformPeaks(null);
        this.shortcutEdgeWidthRestore = Math.max(0.01, this.mmdManager.modelEdgeWidth || 1);
        this.applyLocalizedUiState();
        this.refreshViewportBottomBar();
        document.addEventListener("app:locale-changed", this.onLocaleChanged as EventListener);

        window.addEventListener("beforeunload", (event) => {
            if (this.hasBackgroundExportActive()) {
                event.preventDefault();
                event.returnValue = "";
                return;
            }
            this.exportUiController?.dispose();
            this.layoutUiController?.dispose();
            document.removeEventListener("app:locale-changed", this.onLocaleChanged as EventListener);
        });
    }

    private setupEventListeners(): void {
        // File loading
        this.btnLoadFile.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.openFile", source: "button" });
        });
        this.btnSaveProject.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.save", source: "button", forceChoosePath: true });
        });
        this.btnLoadProject.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.load", source: "button" });
        });
        this.btnExportPng?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.exportPng", source: "button" });
        });
        this.btnExportPngSeq?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.exportPngSequence", source: "button" });
        });
        this.btnExportWebm?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "project.exportWebm", source: "button" });
        });
        this.interpolationTypeSelect.addEventListener("change", () => this.updateTimelineEditState());
        this.btnInterpolationCopy?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "interpolation.copy", source: "button" });
        });
        this.btnInterpolationPaste?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "interpolation.paste", source: "button" });
        });
        this.btnInterpolationLinear?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "interpolation.applyLinear", source: "button" });
        });
        this.toolbarLocaleSelect?.addEventListener("change", () => {
            const nextLocale = this.getSelectedToolbarLocale();
            if (!nextLocale || nextLocale === getLocale()) {
                this.syncToolbarLocaleSelect();
                return;
            }
            setLocale(nextLocale);
        });
        this.toolbarRuntimeModeSelect?.addEventListener("change", () => {
            const nextMode = this.getSelectedRuntimeMode();
            if (!nextMode) {
                this.syncRuntimeModeSelect();
                return;
            }
            const currentMode = this.getConfiguredRuntimeMode();
            if (nextMode === currentMode) return;

            try {
                localStorage.setItem(UIController.RUNTIME_MODE_STORAGE_KEY, nextMode);
            } catch {
                this.syncRuntimeModeSelect();
                this.showToast("Runtime mode setting could not be saved", "error");
                return;
            }

            this.setStatus(`Runtime: ${nextMode.toUpperCase()} / reloading...`, true);
            window.setTimeout(() => {
                window.location.reload();
            }, 120);
        });
        // Playback
        this.btnPlay.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.play", source: "button" });
        });
        this.btnPause.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.pause", source: "button" });
        });
        this.btnStop?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.stop", source: "button" });
        });
        this.btnSkipStart.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.seekStart", source: "button" });
        });
        this.btnSkipEnd.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.seekEnd", source: "button" });
        });
        this.currentFrameEl.addEventListener("focus", () => {
            this.currentFrameEl.select();
        });
        installEnterCommitNumberInput(this.currentFrameEl, {
            commit: () => this.commitCurrentFrameInput(),
            revert: () => {
                this.currentFrameEl.value = String(this.mmdManager.currentFrame);
            },
        });

        this.btnInfoKeyframe = document.getElementById("btn-info-keyframe") as HTMLButtonElement | null;
        this.btnInterpolationKeyframe = document.getElementById("btn-interpolation-keyframe") as HTMLButtonElement | null;
        this.btnBoneKeyframe = document.getElementById("btn-bone-keyframe") as HTMLButtonElement | null;
        this.btnPhysicsKeyframe = document.querySelector(".timeline-edit-btn--physics-toggle") as HTMLButtonElement | null;
        this.btnMorphKeyframe = document.getElementById("btn-morph-keyframe") as HTMLButtonElement | null;
        this.btnAccessoryKeyframe = document.getElementById("btn-accessory-keyframe") as HTMLButtonElement | null;
        this.btnInfoKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.registerInfo", source: "button" });
        });
        this.btnInterpolationKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.addCurrent", source: "button" });
        });
        this.btnBoneKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.registerBone", source: "button" });
        });
        this.btnPhysicsKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.togglePhysicsInputMode", source: "button" });
        });
        this.btnMorphKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.registerMorph", source: "button" });
        });
        this.btnAccessoryKeyframe?.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.registerAccessoryTransform", source: "button" });
        });

        this.timeline.onSelectionChanged = (track) => {
            this.actionDispatcher.dispatch({
                type: "timeline.selectionChanged",
                source: "timeline",
                track,
                frame: this.timeline.getSelectedFrame(),
            });
        };
        this.bottomPanel.onBoneSelectionChanged = (boneName) => {
            this.actionDispatcher.dispatch({ type: "selection.setBone", source: "panel", boneName });
            this.modelExternalParentController?.refresh();
            this.refreshViewportBottomBar();
        };
        this.bottomPanel.onMorphFrameSelectionChanged = () => {
            this.actionDispatcher.dispatch({ type: "selection.setMorphFrame", source: "panel" });
        };
        this.bottomPanel.onBoneTransformEditStarted = (boneName) => {
            this.beginBoneTransformCommand(boneName);
        };
        this.bottomPanel.onBoneTransformEdited = (boneName) => {
            this.actionDispatcher.dispatch({ type: "edit.boneTransformChanged", source: "panel", boneName });
            this.refreshViewportBottomBar();
        };
        this.bottomPanel.onBoneTransformEditCommitted = (boneName) => {
            this.commitBoneTransformCommand(boneName);
        };
        this.mmdManager.onBoneTransformEditStarted = (boneName) => {
            this.beginBoneTransformCommand(boneName);
        };
        this.mmdManager.onBoneTransformEdited = (boneName) => {
            this.actionDispatcher.dispatch({ type: "edit.boneTransformChanged", source: "viewport", boneName });
            this.refreshViewportBottomBar();
        };
        this.mmdManager.onBoneTransformEditCommitted = (boneName) => {
            this.commitBoneTransformCommand(boneName);
        };
        this.mmdManager.onCameraTransformEdited = () => {
            this.actionDispatcher.dispatch({ type: "edit.cameraTransformChanged", source: "viewport" });
            this.refreshViewportBottomBar();
        };
        this.bottomPanel.onMorphValueEdited = (frameIndex) => {
            this.actionDispatcher.dispatch({ type: "edit.morphValueChanged", source: "panel", frameIndex });
        };
        this.bottomPanel.onMorphValueEditCommitted = (morph) => {
            this.registerAutoKeyForEditedMorph(morph);
        };
        this.bottomPanel.onMorphKeyframeRequested = (morph) => {
            this.registerSingleMorphKeyframeAtCurrentFrame(morph);
        };

        this.btnKeyframeAdd.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.addCurrent", source: "button" });
        });
        this.btnKeyframeCopy.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.copySelected", source: "button" });
        });
        this.btnKeyframePaste.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.paste", source: "button" });
        });
        this.btnKeyframeMirrorPaste.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.mirrorPaste", source: "button" });
        });
        this.btnKeyframeDelete.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.deleteSelected", source: "button" });
        });
        this.btnAutoKey.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "keyframe.toggleAutoKey", source: "button" });
        });
        this.btnKeyframeNudgeLeft.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.seekAdjacentKeyframe", source: "button", direction: -1 });
        });
        this.btnKeyframeNudgeRight.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.seekAdjacentKeyframe", source: "button", direction: 1 });
        });
        this.btnFrameStepLeft.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.stepFrame", source: "button", deltaFrames: -1 });
        });
        this.btnFrameStepRight.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.stepFrame", source: "button", deltaFrames: 1 });
        });
        this.btnFrameRangeStart.addEventListener("click", () => {
            this.actionDispatcher.dispatch({ type: "playback.seekFrame", source: "button", frame: 0 });
        });
        this.btnFrameRangeEnd.addEventListener("click", () => {
            this.actionDispatcher.dispatch({
                type: "playback.seekFrame",
                source: "button",
                frame: this.mmdManager.totalFrames,
            });
        });

        // Lighting controls
        const elLightDirectionX = document.getElementById("light-direction-x") as HTMLInputElement;
        const elLightDirectionY = document.getElementById("light-direction-y") as HTMLInputElement;
        const elLightDirectionZ = document.getElementById("light-direction-z") as HTMLInputElement;
        const elIntensity = document.getElementById("light-intensity") as HTMLInputElement;
        const elAmbient = document.getElementById("light-ambient") as HTMLInputElement;
        const elLightColorR = document.getElementById("light-color-r") as HTMLInputElement;
        const elLightColorG = document.getElementById("light-color-g") as HTMLInputElement;
        const elLightColorB = document.getElementById("light-color-b") as HTMLInputElement;
        const elLightFlatStrength = document.getElementById("light-flat-strength") as HTMLInputElement;
        const elLightFlatColorInfluence = document.getElementById("light-flat-color-influence") as HTMLInputElement;
        const elShadow = document.getElementById("light-shadow") as HTMLInputElement;
        const elShadowFrustumSize = document.getElementById("light-shadow-frustum-size") as HTMLInputElement;
        const elShadowMaxZ = document.getElementById("light-shadow-max-z") as HTMLInputElement;
        const elShadowFilteringQuality = document.getElementById("light-shadow-filter-quality") as HTMLInputElement;
        const elSoftTransparentShadow = document.getElementById("light-soft-transparent-shadow") as HTMLInputElement;
        const elIblShadows = document.getElementById("light-ibl-shadows") as HTMLInputElement;
        const elIblShadowOpacity = document.getElementById("light-ibl-shadow-opacity") as HTMLInputElement;
        const elIblShadowRange = document.getElementById("light-ibl-shadow-range") as HTMLInputElement;
        const elCharacterContactShadow = document.getElementById("light-character-contact-shadow") as HTMLInputElement;
        const elCharacterContactShadowOpacity = document.getElementById("light-character-contact-shadow-opacity") as HTMLInputElement;
        const elCharacterContactShadowScale = document.getElementById("light-character-contact-shadow-scale") as HTMLInputElement;
        const elShadowBias = document.getElementById("light-shadow-bias") as HTMLInputElement;
        const elShadowNormalBias = document.getElementById("light-shadow-normal-bias") as HTMLInputElement;
        const elShadowColorR = document.getElementById("light-shadow-color-r") as HTMLInputElement;
        const elShadowColorG = document.getElementById("light-shadow-color-g") as HTMLInputElement;
        const elShadowColorB = document.getElementById("light-shadow-color-b") as HTMLInputElement;
        const elToonShadowInfluence = document.getElementById("light-toon-shadow-influence") as HTMLInputElement;
        const elSelfShadowSoftness = document.getElementById("light-self-shadow-softness") as HTMLInputElement;
        const elOcclusionShadowSoftness = document.getElementById("light-occlusion-shadow-softness") as HTMLInputElement;
        const elLightMode = document.getElementById("light-mode-select") as HTMLSelectElement | null;
        const valLightDirectionX = getRequiredElement("light-direction-x-val");
        const valLightDirectionY = getRequiredElement("light-direction-y-val");
        const valLightDirectionZ = getRequiredElement("light-direction-z-val");
        const valInt = getRequiredElement("light-intensity-val");
        const valAmb = getRequiredElement("light-ambient-val");
        const valLightColorR = getRequiredElement("light-color-r-val");
        const valLightColorG = getRequiredElement("light-color-g-val");
        const valLightColorB = getRequiredElement("light-color-b-val");
        const valLightFlatStrength = getRequiredElement("light-flat-strength-val");
        const valLightFlatColorInfluence = getRequiredElement("light-flat-color-influence-val");
        const valSh = getRequiredElement("light-shadow-val");
        const valShadowFrustumSize = getRequiredElement("light-shadow-frustum-size-val");
        const valShadowMaxZ = getRequiredElement("light-shadow-max-z-val");
        const valShadowFilteringQuality = getRequiredElement("light-shadow-filter-quality-val");
        const valSoftTransparentShadow = getRequiredElement("light-soft-transparent-shadow-val");
        const valIblShadows = getRequiredElement("light-ibl-shadows-val");
        const valIblShadowOpacity = getRequiredElement("light-ibl-shadow-opacity-val");
        const valIblShadowRange = getRequiredElement("light-ibl-shadow-range-val");
        const valCharacterContactShadow = getRequiredElement("light-character-contact-shadow-val");
        const valCharacterContactShadowOpacity = getRequiredElement("light-character-contact-shadow-opacity-val");
        const valCharacterContactShadowScale = getRequiredElement("light-character-contact-shadow-scale-val");
        const valShadowBias = getRequiredElement("light-shadow-bias-val");
        const valShadowNormalBias = getRequiredElement("light-shadow-normal-bias-val");
        const valShadowColorR = getRequiredElement("light-shadow-color-r-val");
        const valShadowColorG = getRequiredElement("light-shadow-color-g-val");
        const valShadowColorB = getRequiredElement("light-shadow-color-b-val");
        const valToonShadowInfluence = getRequiredElement("light-toon-shadow-influence-val");
        const valSelfShSoftness = getRequiredElement("light-self-shadow-softness-val");
        const valOcclusionShSoftness = getRequiredElement("light-occlusion-shadow-softness-val");
        const lightRows = Array.from(document.querySelectorAll(".light-row--light"));
        const shadowRows = Array.from(document.querySelectorAll(".light-row--shadow"));
        const elEffectColorTemp = document.getElementById("effect-color-temp") as HTMLInputElement | null;
        const valEffectColorTemp = document.getElementById("effect-color-temp-val");
        const elEffectContrast = document.getElementById("effect-contrast") as HTMLInputElement | null;
        const valEffectContrast = document.getElementById("effect-contrast-val");
        const elEffectGamma = document.getElementById("effect-gamma") as HTMLInputElement | null;
        const valEffectGamma = document.getElementById("effect-gamma-val");

        const updateDir = () => {
            const x = Number(elLightDirectionX.value);
            const y = Number(elLightDirectionY.value);
            const z = Number(elLightDirectionZ.value);
            valLightDirectionX.textContent = x.toFixed(2);
            valLightDirectionY.textContent = y.toFixed(2);
            valLightDirectionZ.textContent = z.toFixed(2);
            if (!this.actionDispatcher.dispatch({ type: "effect.setLightDirection", source: "panel", x, y, z })) {
                this.mmdManager.setLightDirection(x, y, z);
            }
        };

        const applyLightMode = () => {
            if (!elLightMode) {
                for (const row of lightRows) {
                    row.classList.remove("light-row--hidden");
                }
                for (const row of shadowRows) {
                    row.classList.remove("light-row--hidden");
                }
                return;
            }
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

        elLightDirectionX.addEventListener("input", updateDir);
        elLightDirectionY.addEventListener("input", updateDir);
        elLightDirectionZ.addEventListener("input", updateDir);

        const initialLightDirection = this.mmdManager.getSerializedLightDirection();
        elLightDirectionX.value = this.formatRangeInputValue(elLightDirectionX, initialLightDirection.x);
        elLightDirectionY.value = this.formatRangeInputValue(elLightDirectionY, initialLightDirection.y);
        elLightDirectionZ.value = this.formatRangeInputValue(elLightDirectionZ, initialLightDirection.z);
        updateDir();

        elIntensity.addEventListener("input", () => {
            const v = Number(elIntensity.value) / 100;
            valInt.textContent = v.toFixed(1);
            if (!this.actionDispatcher.dispatch({ type: "effect.setLightIntensity", source: "panel", value: v })) {
                this.mmdManager.lightIntensity = v;
            }
        });
        elAmbient.addEventListener("input", () => {
            const v = Number(elAmbient.value) / 100;
            valAmb.textContent = v.toFixed(1);
            if (!this.actionDispatcher.dispatch({ type: "effect.setAmbientIntensity", source: "panel", value: v })) {
                this.mmdManager.ambientIntensity = v;
            }
        });
        const applyLightColor = () => {
            const r = Number(elLightColorR.value) / 127.5;
            const g = Number(elLightColorG.value) / 127.5;
            const b = Number(elLightColorB.value) / 127.5;
            if (!this.actionDispatcher.dispatch({ type: "effect.setLightColor", source: "panel", r, g, b })) {
                this.mmdManager.setLightColor(r, g, b);
            }
            valLightColorR.textContent = `${Math.round(r * 100)}%`;
            valLightColorG.textContent = `${Math.round(g * 100)}%`;
            valLightColorB.textContent = `${Math.round(b * 100)}%`;
        };
        elLightColorR.addEventListener("input", applyLightColor);
        elLightColorG.addEventListener("input", applyLightColor);
        elLightColorB.addEventListener("input", applyLightColor);
        const applyLightFlatStrength = () => {
            const v = Number(elLightFlatStrength.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setLightFlatStrength", source: "panel", value: v })) {
                this.mmdManager.lightFlatStrength = v;
            }
            valLightFlatStrength.textContent = `${Math.round(v * 100)}%`;
        };
        elLightFlatStrength.addEventListener("input", applyLightFlatStrength);
        const applyLightFlatColorInfluence = () => {
            const v = Number(elLightFlatColorInfluence.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setLightFlatColorInfluence", source: "panel", value: v })) {
                this.mmdManager.lightFlatColorInfluence = v;
            }
            valLightFlatColorInfluence.textContent = `${Math.round(v * 100)}%`;
        };
        elLightFlatColorInfluence.addEventListener("input", applyLightFlatColorInfluence);

        // Initialize lighting sliders from runtime defaults.
        elIntensity.value = String(Math.round(this.mmdManager.lightIntensity * 100));
        valInt.textContent = this.mmdManager.lightIntensity.toFixed(1);
        elAmbient.value = String(Math.round(this.mmdManager.ambientIntensity * 100));
        valAmb.textContent = this.mmdManager.ambientIntensity.toFixed(1);
        const initialLightColor = this.mmdManager.getLightColor();
        elLightColorR.value = String(Math.round(initialLightColor.r * 127.5));
        elLightColorG.value = String(Math.round(initialLightColor.g * 127.5));
        elLightColorB.value = String(Math.round(initialLightColor.b * 127.5));
        applyLightColor();
        elLightFlatStrength.value = String(Math.round(this.mmdManager.lightFlatStrength * 100));
        applyLightFlatStrength();
        elLightFlatColorInfluence.value = String(Math.round(this.mmdManager.lightFlatColorInfluence * 100));
        applyLightFlatColorInfluence();

        elShadow.addEventListener("input", () => {
            const v = Number(elShadow.value) / 100;
            valSh.textContent = v.toFixed(2);
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowDarkness", source: "panel", value: v })) {
                this.mmdManager.shadowDarkness = v;
            }
        });
        elShadowFrustumSize.addEventListener("input", () => {
            const v = Number(elShadowFrustumSize.value);
            valShadowFrustumSize.textContent = String(Math.round(v));
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowFrustumSize", source: "panel", value: v })) {
                this.mmdManager.shadowFrustumSize = v;
            }
        });
        elShadowMaxZ.addEventListener("input", () => {
            const v = Number(elShadowMaxZ.value);
            valShadowMaxZ.textContent = String(Math.round(v));
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowMaxZ", source: "panel", value: v })) {
                this.mmdManager.shadowMaxZ = v;
            }
        });
        const formatShadowFilteringQuality = (quality: number): string => {
            if (quality <= 0) return "High";
            if (quality >= 2) return "Low";
            return "Med";
        };
        elShadowFilteringQuality.addEventListener("input", () => {
            const v = Number(elShadowFilteringQuality.value);
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowFilteringQuality", source: "panel", value: v })) {
                this.mmdManager.shadowFilteringQuality = v;
            }
            valShadowFilteringQuality.textContent = formatShadowFilteringQuality(this.mmdManager.shadowFilteringQuality);
        });
        elSoftTransparentShadow.addEventListener("input", () => {
            const enabled = Number(elSoftTransparentShadow.value) > 0;
            if (!this.actionDispatcher.dispatch({ type: "effect.setSoftTransparentShadow", source: "panel", enabled })) {
                this.mmdManager.softTransparentShadowEnabled = enabled;
            }
            valSoftTransparentShadow.textContent = enabled ? "Soft" : "Hard";
        });
        elIblShadows.addEventListener("input", () => {
            const enabled = Number(elIblShadows.value) > 0;
            const dispatched = this.actionDispatcher.dispatch({ type: "effect.setIblShadows", source: "panel", enabled });
            const applied = dispatched || this.mmdManager.setIblShadowsEnabled(enabled);
            const actual = applied ? this.mmdManager.iblShadowsEnabled : false;
            elIblShadows.value = actual ? "1" : "0";
            valIblShadows.textContent = actual ? "On" : "Off";
        });
        elIblShadowOpacity.addEventListener("input", () => {
            const opacity = Number(elIblShadowOpacity.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setIblShadowOpacity", source: "panel", value: opacity })) {
                this.mmdManager.iblShadowOpacity = opacity;
            }
            valIblShadowOpacity.textContent = `${Math.round(this.mmdManager.iblShadowOpacity * 100)}%`;
        });
        elIblShadowRange.addEventListener("input", () => {
            const range = Number(elIblShadowRange.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setIblShadowDistanceScale", source: "panel", value: range })) {
                this.mmdManager.iblShadowDistanceScale = range;
            }
            valIblShadowRange.textContent = this.mmdManager.iblShadowDistanceScale.toFixed(1);
        });
        elCharacterContactShadow.addEventListener("input", () => {
            const enabled = Number(elCharacterContactShadow.value) > 0;
            if (!this.actionDispatcher.dispatch({ type: "effect.setCharacterContactShadow", source: "panel", enabled })) {
                this.mmdManager.characterContactShadowEnabled = enabled;
            }
            valCharacterContactShadow.textContent = enabled ? "On" : "Off";
        });
        elCharacterContactShadowOpacity.addEventListener("input", () => {
            const opacity = Number(elCharacterContactShadowOpacity.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setCharacterContactShadowOpacity", source: "panel", value: opacity })) {
                this.mmdManager.characterContactShadowOpacity = opacity;
            }
            valCharacterContactShadowOpacity.textContent = `${Math.round(this.mmdManager.characterContactShadowOpacity * 100)}%`;
        });
        elCharacterContactShadowScale.addEventListener("input", () => {
            const scale = Number(elCharacterContactShadowScale.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setCharacterContactShadowScale", source: "panel", value: scale })) {
                this.mmdManager.characterContactShadowScale = scale;
            }
            valCharacterContactShadowScale.textContent = this.mmdManager.characterContactShadowScale.toFixed(2);
        });
        elShadowBias.addEventListener("input", () => {
            const v = Number(elShadowBias.value) / 1_000_000;
            valShadowBias.textContent = v.toFixed(5);
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowBias", source: "panel", value: v })) {
                this.mmdManager.shadowBias = v;
            }
        });
        elShadowNormalBias.addEventListener("input", () => {
            const v = Number(elShadowNormalBias.value) / 100_000;
            valShadowNormalBias.textContent = v.toFixed(5);
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowNormalBias", source: "panel", value: v })) {
                this.mmdManager.shadowNormalBias = v;
            }
        });
        const applyShadowColor = () => {
            const r = Number(elShadowColorR.value) / 255;
            const g = Number(elShadowColorG.value) / 255;
            const b = Number(elShadowColorB.value) / 255;
            if (!this.actionDispatcher.dispatch({ type: "effect.setShadowColor", source: "panel", r, g, b })) {
                this.mmdManager.setShadowColor(r, g, b);
            }
            valShadowColorR.textContent = String(Math.round(r * 255));
            valShadowColorG.textContent = String(Math.round(g * 255));
            valShadowColorB.textContent = String(Math.round(b * 255));
        };
        elShadowColorR.addEventListener("input", applyShadowColor);
        elShadowColorG.addEventListener("input", applyShadowColor);
        elShadowColorB.addEventListener("input", applyShadowColor);
        const applyToonShadowInfluence = () => {
            const influence = Number(elToonShadowInfluence.value) / 100;
            if (!this.actionDispatcher.dispatch({ type: "effect.setToonShadowInfluence", source: "panel", value: influence })) {
                this.mmdManager.toonShadowInfluence = influence;
            }
            valToonShadowInfluence.textContent = `${Math.round(influence * 100)}%`;
        };
        elToonShadowInfluence.addEventListener("input", applyToonShadowInfluence);
        elSelfShadowSoftness.addEventListener("input", () => {
            const v = Number(elSelfShadowSoftness.value) / 1000;
            valSelfShSoftness.textContent = v.toFixed(3);
            if (!this.actionDispatcher.dispatch({ type: "effect.setSelfShadowSoftness", source: "panel", value: v })) {
                this.mmdManager.selfShadowEdgeSoftness = v;
            }
        });
        elOcclusionShadowSoftness.addEventListener("input", () => {
            const v = Number(elOcclusionShadowSoftness.value) / 1000;
            valOcclusionShSoftness.textContent = v.toFixed(3);
            if (!this.actionDispatcher.dispatch({ type: "effect.setOcclusionShadowSoftness", source: "panel", value: v })) {
                this.mmdManager.occlusionShadowEdgeSoftness = v;
            }
        });

        elShadow.value = String(Math.round(this.mmdManager.shadowDarkness * 100));
        valSh.textContent = this.mmdManager.shadowDarkness.toFixed(2);
        elShadowFrustumSize.value = String(Math.round(this.mmdManager.shadowFrustumSize));
        valShadowFrustumSize.textContent = String(Math.round(this.mmdManager.shadowFrustumSize));
        elShadowMaxZ.value = String(Math.round(this.mmdManager.shadowMaxZ));
        valShadowMaxZ.textContent = String(Math.round(this.mmdManager.shadowMaxZ));
        elShadowFilteringQuality.value = String(this.mmdManager.shadowFilteringQuality);
        valShadowFilteringQuality.textContent = formatShadowFilteringQuality(this.mmdManager.shadowFilteringQuality);
        elSoftTransparentShadow.value = this.mmdManager.softTransparentShadowEnabled ? "1" : "0";
        valSoftTransparentShadow.textContent = this.mmdManager.softTransparentShadowEnabled ? "Soft" : "Hard";
        elIblShadows.value = this.mmdManager.iblShadowsEnabled ? "1" : "0";
        valIblShadows.textContent = this.mmdManager.iblShadowsEnabled ? "On" : "Off";
        elIblShadowOpacity.value = String(Math.round(this.mmdManager.iblShadowOpacity * 100));
        valIblShadowOpacity.textContent = `${Math.round(this.mmdManager.iblShadowOpacity * 100)}%`;
        elIblShadowRange.value = String(Math.round(this.mmdManager.iblShadowDistanceScale * 100));
        valIblShadowRange.textContent = this.mmdManager.iblShadowDistanceScale.toFixed(1);
        elCharacterContactShadow.value = this.mmdManager.characterContactShadowEnabled ? "1" : "0";
        valCharacterContactShadow.textContent = this.mmdManager.characterContactShadowEnabled ? "On" : "Off";
        elCharacterContactShadowOpacity.value = String(Math.round(this.mmdManager.characterContactShadowOpacity * 100));
        valCharacterContactShadowOpacity.textContent = `${Math.round(this.mmdManager.characterContactShadowOpacity * 100)}%`;
        elCharacterContactShadowScale.value = String(Math.round(this.mmdManager.characterContactShadowScale * 100));
        valCharacterContactShadowScale.textContent = this.mmdManager.characterContactShadowScale.toFixed(2);
        elShadowBias.value = String(Math.round(this.mmdManager.shadowBias * 1_000_000));
        valShadowBias.textContent = this.mmdManager.shadowBias.toFixed(5);
        elShadowNormalBias.value = String(Math.round(this.mmdManager.shadowNormalBias * 100_000));
        valShadowNormalBias.textContent = this.mmdManager.shadowNormalBias.toFixed(5);
        const initialShadowColor = this.mmdManager.getShadowColor();
        elShadowColorR.value = String(Math.round(initialShadowColor.r * 255));
        elShadowColorG.value = String(Math.round(initialShadowColor.g * 255));
        elShadowColorB.value = String(Math.round(initialShadowColor.b * 255));
        applyShadowColor();
        elToonShadowInfluence.value = String(Math.round(this.mmdManager.toonShadowInfluence * 100));
        applyToonShadowInfluence();
        elSelfShadowSoftness.value = String(Math.round(this.mmdManager.selfShadowEdgeSoftness * 1000));
        valSelfShSoftness.textContent = this.mmdManager.selfShadowEdgeSoftness.toFixed(3);
        elOcclusionShadowSoftness.value = String(Math.round(this.mmdManager.occlusionShadowEdgeSoftness * 1000));
        valOcclusionShSoftness.textContent = this.mmdManager.occlusionShadowEdgeSoftness.toFixed(3);

        if (elEffectColorTemp && valEffectColorTemp) {
            const applyColorTemperature = () => {
                const kelvin = Number(elEffectColorTemp.value);
                if (!this.actionDispatcher.dispatch({ type: "effect.setLightColorTemperature", source: "panel", kelvin })) {
                    this.mmdManager.lightColorTemperature = kelvin;
                }
                valEffectColorTemp.textContent = `${Math.round(this.mmdManager.lightColorTemperature)} K`;
            };
            elEffectColorTemp.value = String(Math.round(this.mmdManager.lightColorTemperature));
            applyColorTemperature();
            elEffectColorTemp.addEventListener("input", applyColorTemperature);
        }

        if (elEffectContrast && valEffectContrast) {
            const applyContrast = () => {
                const offsetPercent = Number(elEffectContrast.value);
                if (!this.actionDispatcher.dispatch({ type: "effect.setContrastOffset", source: "panel", offsetPercent })) {
                    this.mmdManager.postEffectContrast = 1 + offsetPercent / 100;
                }
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
                if (!this.actionDispatcher.dispatch({ type: "effect.setGammaOffset", source: "panel", offsetPercent })) {
                    // 0% is neutral (gamma=1.0). Positive values brighten, negative values darken.
                    this.mmdManager.postEffectGamma = Math.pow(2, -offsetPercent / 100);
                }
                const roundedOffset = Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100);
                valEffectGamma.textContent = `${roundedOffset}%`;
            };
            elEffectGamma.value = String(Math.round(-Math.log2(this.mmdManager.postEffectGamma) * 100));
            applyGamma();
            elEffectGamma.addEventListener("input", applyGamma);
        }

        // Initialize direction from HTML default values
        updateDir();
    }

    private setupCallbacks(): void {
        // Frame update
        this.mmdManager.onFrameUpdate = (frame, total) => {
            if (document.activeElement !== this.currentFrameEl) {
                this.currentFrameEl.value = String(frame);
            }
            this.totalFramesEl.textContent = String(total);
            this.timeline.setTotalFrames(total);
            this.timeline.setCurrentFrame(frame, { lightweight: this.mmdManager.isPlaying });
            const frameChanged = this.lastObservedFrame !== frame;
            this.lastObservedFrame = frame;
            if (frameChanged) {
                this.modelExternalParentController?.refresh();
            }

            if (this.mmdManager.isPlaying) {
                this.refreshPlaybackFrameBar();
                const { endFrame } = this.getPlaybackFrameRange();
                if (this.isPlaybackFrameStopEnabled() && frame >= endFrame) {
                    this.stopAtPlaybackEnd(endFrame);
                }
                return;
            }

            this.debugKeyframeFlow("frame update", {
                frame,
                total,
                frameChanged,
                selectedBone: this.bottomPanel.getSelectedBone(),
                selectedTrack: this.getSelectedTimelineTrack()?.name ?? null,
            });
            if (frameChanged) {
                this.clearTransientEditingStateForFrameChange();
                if (this.timeline.getSelectedKeys().length > 0) {
                    this.timeline.clearSelectedKeys({ keepActiveTrack: true });
                }
            }
            this.updateTimelineEditState();
            const sourcePose = this.getDisplayBonePoseSnapshot(frame);
            const selectedBone = this.bottomPanel.getSelectedBone();
            const shouldApplyPoseToRuntime = selectedBone !== "Camera" || frameChanged;
            if (shouldApplyPoseToRuntime) {
                this.applySelectedBonePoseSnapshotToRuntime(frame, sourcePose);
            }
            this.debugKeyframeFlow("display pose", {
                frame,
                source: sourcePose ? "snapshot-or-source" : "none",
                pose: sourcePose,
            });
            if (sourcePose) {
                this.bottomPanel.syncSelectedBoneSlidersFromSnapshot(sourcePose, true);
            } else {
                this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
            }
            this.syncMorphPanelFromRuntimeIfPlaybackIdle();

            this.cameraPanelController?.refresh(false, sourcePose?.distance ?? this.mmdManager.getCameraDistance());
            this.dofPanelController?.refreshAutoFocusReadout();
            this.lensEffectController?.refreshAutoReadout();
            this.exportUiController?.syncFrameRangeFromTimeline();
            this.refreshViewportBottomBar();

            const { endFrame } = this.getPlaybackFrameRange();
            if (this.mmdManager.isPlaying && this.isPlaybackFrameStopEnabled() && frame >= endFrame) {
                this.stopAtPlaybackEnd(endFrame);
            }
        };

        // Active model changed
        this.mmdManager.onModelLoaded = () => {
            this.setStatus("Model ready", false);
            this.viewportOverlay.classList.add("hidden");
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                this.applyActiveModelSelectionUI();
            }
            this.refreshModelSelector();
            this.dofPanelController?.refreshFocusTargetControls();
            this.refreshShaderPanel();
            this.runtimeFeatureUiController?.refreshRigidBodies();
        };

        // Any model loaded into scene
        this.mmdManager.onSceneModelLoaded = (info: ModelInfo, totalCount: number, active: boolean) => {
            this.setStatus("Model loaded", false);
            this.viewportOverlay.classList.add("hidden");
            if (active) {
                this.applyActiveModelSelectionUI();
            }
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.cameraPanelController?.refresh(true);
            }
            this.refreshModelSelector();
            this.dofPanelController?.refreshFocusTargetControls();
            this.refreshShaderPanel();
            this.runtimeFeatureUiController?.refreshRigidBodies();
            const activeLabel = active ? " [active]" : "";
            this.showToast(`Loaded model: ${info.name} (${totalCount})${activeLabel}`, "success");
        };

        this.mmdManager.onDofFocusTargetChanged = () => {
            this.dofPanelController?.refreshFocusTargetControls();
            this.dofPanelController?.refreshAutoFocusReadout();
        };

        // Motion loaded
        this.mmdManager.onMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.exportUiController?.syncFrameRangeFromTimeline();
            this.showToast(`Loaded motion: ${info.name}`, "success");
        };

        this.mmdManager.onCameraMotionLoaded = (info: MotionInfo) => {
            this.setStatus("Camera motion loaded", false);
            this.timeline.setTotalFrames(info.frameCount);
            this.totalFramesEl.textContent = String(info.frameCount);
            this.exportUiController?.syncFrameRangeFromTimeline();
            this.showToast(`Loaded camera motion: ${info.name}`, "success");
        };

        // Keyframe data loaded
        this.mmdManager.onKeyframesLoaded = (tracks) => {
            this.timeline.setKeyframeTracks(tracks);
            if (this.mmdManager.getTimelineTarget() === "model") {
                const selectedBone = this.bottomPanel.getSelectedBone();
                if (selectedBone) {
                    this.syncTimelineBoneSelectionFromBottomPanel(selectedBone);
                }
            } else {
                this.timeline.selectTrackByNameAndCategory("Camera", ["camera"]);
            }
            this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
            this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
            this.refreshSelectedTrackRotationOverlay();
            this.updateTimelineEditState();
        };

        // Audio loaded
        this.mmdManager.onAudioLoaded = (name: string) => {
            this.setStatus("Audio loaded", false);
            this.showToast(`Loaded audio: ${name}`, "success");
            void this.refreshTimelineWaveformFromAudio();
        };

        // Error
        this.mmdManager.onError = (message: string) => {
            this.setStatus("Error", false);
            this.showToast(message, "error");
        };

        this.mmdManager.onPhysicsStateChanged = () => {
            this.runtimeFeatureUiController?.refreshPhysics();
            this.runtimeFeatureUiController?.refreshRigidBodies();
        };

        this.mmdManager.onGlobalIlluminationStateChanged = () => {
            this.runtimeFeatureUiController?.refreshGi();
        };

        this.mmdManager.onBoneVisualizerBonePicked = (pick) => {
            this.actionDispatcher.dispatch({
                type: "selection.pickBone",
                source: "viewport",
                boneName: pick.boneName,
                additive: pick.additive,
            });
        };

        this.mmdManager.onMaterialShaderStateChanged = () => {
            this.refreshShaderPanel();
        };
    }

    private async refreshTimelineWaveformFromAudio(): Promise<void> {
        const requestId = ++this.timelineWaveformRequestId;
        const audioPath = this.mmdManager.getAudioSourcePath();
        if (!audioPath) {
            this.timeline.setWaveformPeaks(null);
            return;
        }

        try {
            const arrayBuffer = await this.readRendererBinaryFileAsArrayBuffer(audioPath);
            if (!arrayBuffer) {
                if (requestId === this.timelineWaveformRequestId) {
                    this.timeline.setWaveformPeaks(null);
                }
                return;
            }

            const audioContext = new AudioContext();
            let audioBuffer: AudioBuffer;
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } finally {
                try {
                    await audioContext.close();
                } catch {
                    // ignore close failures
                }
            }

            if (requestId !== this.timelineWaveformRequestId) {
                return;
            }

            const peaks = this.buildTimelineWaveformPeaks(audioBuffer, UIController.TIMELINE_WAVEFORM_FPS);
            this.timeline.setWaveformPeaks(peaks);
        } catch (err: unknown) {
            if (requestId !== this.timelineWaveformRequestId) {
                return;
            }
            console.warn("Failed to refresh timeline waveform:", err);
            this.timeline.setWaveformPeaks(null);
        }
    }

    private async readRendererBinaryFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer | null> {
        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            return null;
        }

        const bytes = buffer instanceof Uint8Array
            ? buffer
            : new Uint8Array(buffer as unknown as ArrayBuffer);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
    }

    private buildTimelineWaveformPeaks(audioBuffer: AudioBuffer, fps: number): Float32Array {
        const normalizedFps = Math.max(1, Math.floor(fps));
        const sampleRate = Math.max(1, audioBuffer.sampleRate);
        const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * normalizedFps));
        const peaks = new Float32Array(frameCount);
        const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
            audioBuffer.getChannelData(index)
        );

        for (let frame = 0; frame < frameCount; frame += 1) {
            const startSample = Math.min(audioBuffer.length, Math.floor(frame * sampleRate / normalizedFps));
            const nextStartSample = Math.min(audioBuffer.length, Math.floor((frame + 1) * sampleRate / normalizedFps));
            const endSample = Math.max(startSample + 1, nextStartSample);

            let peak = 0;
            for (let channelIndex = 0; channelIndex < channelData.length; channelIndex += 1) {
                const samples = channelData[channelIndex];
                const sampleLimit = Math.min(endSample, samples.length);
                for (let sampleIndex = startSample; sampleIndex < sampleLimit; sampleIndex += 1) {
                    const amplitude = Math.abs(samples[sampleIndex] ?? 0);
                    if (amplitude > peak) {
                        peak = amplitude;
                    }
                }
            }

            peaks[frame] = peak;
        }

        return peaks;
    }

    private hasBackgroundExportActive(): boolean {
        return this.exportUiController?.hasBackgroundExportActive() ?? false;
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

            if (this.hasBackgroundExportActive()) {
                this.showToast("Cannot load files during background export", "error");
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
                        const priority = ext === "3dl" || ext === "cube"
                            ? 0
                            : ext === "pmx" || ext === "pmd"
                                ? 1
                                : ext === "x"
                                    ? 1
                                    : ext === "vmd" || ext === "vpd"
                                        ? 2
                                        : ext === "mp3" || ext === "wav" || ext === "ogg"
                                            ? 3
                                            : 4;
                        return { filePath, priority };
                    })
                    .filter((entry): entry is { filePath: string; priority: number } => entry !== null)
                    .sort((a, b) => a.priority - b.priority);

                if (entries.length === 0) {
                    this.showToast("Could not resolve dropped file path", "error");
                    return;
                }

                this.actionDispatcher.dispatch({
                    type: "project.dropFiles",
                    source: "drop",
                    filePaths: entries.map((entry) => entry.filePath),
                });
            })();
        });
    }

    private async loadDroppedFiles(filePaths: readonly string[]): Promise<void> {
        if (this.hasBackgroundExportActive()) {
            this.showToast("Cannot load files during background export", "error");
            return;
        }

        for (const filePath of filePaths) {
            if (!filePath) continue;
            await this.loadFileByPath(filePath, "drop");
        }
    }

    private setupKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.layoutUiController?.isUiFullscreenModeActive()) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "layout.fullscreen.exit", source: "shortcut" });
                return;
            }

            if (this.hasBackgroundExportActive()) {
                e.preventDefault();
                return;
            }

            // Don't handle shortcuts while editing text fields.
            if (this.isTextInputLikeTarget(e.target)) return;

            const lowerKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

            if (!hasModifier && e.key === "Escape" && this.timeline.getSelectedKeys().length > 0) {
                e.preventDefault();
                this.timeline.clearSelectedKeys({ keepActiveTrack: true });
                this.updateTimelineEditState();
                return;
            }

            // Alt+Enter: MMD-like fullscreen toggle (mapped to UI fullscreen mode).
            if (!e.ctrlKey && !e.metaKey && e.altKey && e.key === "Enter") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "layout.fullscreen.toggle", source: "shortcut" });
                return;
            }

            // Ctrl+S: save project (overwrite current project when possible)
            if (!e.metaKey && !e.altKey && e.ctrlKey && !e.shiftKey && lowerKey === "s") {
                e.preventDefault();
                void this.saveProject();
                return;
            }

            if (!e.metaKey && !e.altKey && e.ctrlKey && !e.shiftKey && lowerKey === "z") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "history.undo", source: "shortcut" });
                return;
            }

            if (!e.altKey && (e.ctrlKey || e.metaKey) && !e.shiftKey && lowerKey === "c") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.copySelected", source: "shortcut" });
                return;
            }

            if (!e.altKey && (e.ctrlKey || e.metaKey) && !e.shiftKey && lowerKey === "v") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.paste", source: "shortcut" });
                return;
            }

            if (!e.metaKey && !e.altKey && e.ctrlKey && !e.shiftKey && lowerKey === "y") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "history.redo", source: "shortcut" });
                return;
            }

            // Ctrl + arrow: jump to previous/next keyframe point
            if (!e.metaKey && !e.altKey && e.ctrlKey) {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({
                        type: "playback.seekAdjacentKeyframe",
                        source: "shortcut",
                        direction: -1,
                    });
                    return;
                }
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({
                        type: "playback.seekAdjacentKeyframe",
                        source: "shortcut",
                        direction: 1,
                    });
                    return;
                }
            }

            const isAddKeyShortcut =
                !hasModifier &&
                (
                    lowerKey === "i" ||
                    lowerKey === "k" ||
                    e.key === "+" ||
                    e.code === "NumpadAdd" ||
                    e.key === "Enter"
                );
            if (isAddKeyShortcut) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.addCurrent", source: "shortcut" });
                return;
            }

            if (!hasModifier && e.key === "Delete") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.deleteSelected", source: "shortcut" });
                return;
            }

            // Tab / Shift+Tab / めE IntlRo ) : cycle active model
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "Tab" || e.code === "IntlRo")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({
                    type: "selection.cycleActiveModel",
                    source: "shortcut",
                    direction: e.shiftKey ? -1 : 1,
                });
                return;
            }

            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: -1 });
                return;
            }

            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 });
                return;
            }

            // MMD-like playback / display shortcuts
            if (!hasModifier) {
                if (lowerKey === "p") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({ type: "playback.toggle", source: "shortcut" });
                    return;
                }

                if (lowerKey === "g") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({ type: "viewport.toggleGround", source: "shortcut" });
                    return;
                }

                if (lowerKey === "e") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({ type: "viewport.toggleEdge", source: "shortcut" });
                    return;
                }

                if (lowerKey === "b") {
                    e.preventDefault();
                    this.actionDispatcher.dispatch({ type: "viewport.toggleBackgroundBlack", source: "shortcut" });
                    return;
                }
            }

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    this.actionDispatcher.dispatch({ type: "playback.toggle", source: "shortcut" });
                    break;
                case "Home":
                    this.actionDispatcher.dispatch({ type: "playback.seekStart", source: "shortcut" });
                    break;
                case "End":
                    this.actionDispatcher.dispatch({ type: "playback.seekEnd", source: "shortcut" });
                    break;
                case "ArrowLeft":
                    this.actionDispatcher.dispatch({
                        type: "playback.stepFrame",
                        source: "shortcut",
                        deltaFrames: e.shiftKey ? -10 : -1,
                    });
                    break;
                case "ArrowRight":
                    this.actionDispatcher.dispatch({
                        type: "playback.stepFrame",
                        source: "shortcut",
                        deltaFrames: e.shiftKey ? 10 : 1,
                    });
                    break;
            }

            // Ctrl+Alt+O = open project file
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.load", source: "shortcut" });
            }

            // Ctrl+Alt+S = save project as
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.save", source: "shortcut", forceChoosePath: true });
            }

            // Ctrl+O = open PMX/PMD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "O" || e.key === "o")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.openModel", source: "shortcut" });
            }

            // Ctrl+M = open VMD/VPD
            if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.openMotion", source: "shortcut" });
            }

            // Ctrl+Shift+M = open camera VMD
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "M" || e.key === "m")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.openCameraMotion", source: "shortcut" });
            }

            // Ctrl+Shift+A = open MP3
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "A" || e.key === "a")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.openAudio", source: "shortcut" });
            }

            // Ctrl+Shift+S = export PNG
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "S" || e.key === "s")) {
                e.preventDefault();
                this.actionDispatcher.dispatch({ type: "project.exportPng", source: "shortcut" });
            }
        });
    }

    private setupActionHandlers(): void {
        this.actionDispatcher.register("playback.play", () => this.play());
        this.actionDispatcher.register("playback.pause", () => this.pause());
        this.actionDispatcher.register("playback.stop", () => this.stop());
        this.actionDispatcher.register("playback.toggle", () => {
            if (this.mmdManager.isPlaying) {
                this.pause();
                return;
            }
            this.play();
        });
        this.actionDispatcher.register("playback.seekFrame", (action) => {
            this.mmdManager.seekToBoundary(action.frame);
        });
        this.actionDispatcher.register("playback.stepFrame", (action) => {
            this.mmdManager.seekToBoundary(this.mmdManager.currentFrame + action.deltaFrames);
        });
        this.actionDispatcher.register("playback.seekStart", () => {
            this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().startFrame);
        });
        this.actionDispatcher.register("playback.seekEnd", () => {
            this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().endFrame);
        });
        this.actionDispatcher.register("playback.seekAdjacentKeyframe", (action) => {
            this.seekToAdjacentKeyframePoint(action.direction);
        });
        this.actionDispatcher.register("keyframe.addCurrent", (action) => this.addKeyframeAtCurrentFrame(null, action.source));
        this.actionDispatcher.register("keyframe.copySelected", () => this.copySelectedKeyframe());
        this.actionDispatcher.register("keyframe.paste", () => this.pasteKeyframeClipboard());
        this.actionDispatcher.register("keyframe.mirrorPaste", () => this.pasteMirroredKeyframeClipboard());
        this.actionDispatcher.register("keyframe.deleteSelected", (action) => this.deleteSelectedKeyframe(action.source));
        this.actionDispatcher.register("keyframe.nudgeSelected", (action) => {
            this.nudgeSelectedKeyframe(action.deltaFrames);
        });
        this.actionDispatcher.register("keyframe.toggleAutoKey", () => {
            this.setAutoKeyEnabled(!this.autoKeyEnabled, { persist: true, toast: true });
        });
        this.actionDispatcher.register("keyframe.togglePhysicsInputMode", () => {
            this.physicsKeyframeInputMode = this.physicsKeyframeInputMode === 1 ? 0 : 1;
            this.updatePhysicsKeyframeButtonState();
        });
        this.actionDispatcher.register("history.undo", () => this.undoLastCommand());
        this.actionDispatcher.register("history.redo", () => this.redoLastCommand());
        this.actionDispatcher.register("keyframe.registerInfo", () => this.registerInfoKeyframe());
        this.actionDispatcher.register("keyframe.registerBone", () => this.registerBoneKeyframeAtCurrentFrame());
        this.actionDispatcher.register("keyframe.registerMorph", () => this.registerMorphKeyframesAtCurrentFrame());
        this.actionDispatcher.register("keyframe.registerAccessoryTransform", () => {
            this.registerAccessoryTransformKeyframe();
        });
        this.actionDispatcher.register("interpolation.copy", () => this.copyInterpolationCurves());
        this.actionDispatcher.register("interpolation.paste", () => this.pasteInterpolationCurves());
        this.actionDispatcher.register("interpolation.applyLinear", () => this.resetInterpolationCurvesToLinear());
        this.actionDispatcher.register("interpolation.updateHandle", (action) => {
            this.updateInterpolationCurveHandle(action.channelId, action.pointIndex, action.x, action.y);
        });
        this.actionDispatcher.register("interpolation.finishHandleDrag", (action) => {
            if (!action.changed) return;
            this.refreshRuntimeAnimationFromInterpolationEdit();
            this.updateTimelineEditState();
        });
        this.actionDispatcher.register("selection.cycleActiveModel", (action) => {
            this.cycleActiveModelByShortcut(action.direction);
        });
        this.actionDispatcher.register("selection.pickBone", (action) => {
            if (this.mmdManager.getTimelineTarget() !== "model") return;
            if (action.additive === true) {
                if (!this.timeline.selectBoneTrackByName(action.boneName, { additive: true })) return;
                this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
                this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
                this.refreshSelectedTrackRotationOverlay();
                this.updateTimelineEditState();
                this.updateSectionKeyframeButtons();
                return;
            }

            const selected = this.bottomPanel.setSelectedBone(action.boneName);
            if (!selected) return;
            this.syncTimelineBoneSelectionFromBottomPanel(action.boneName);
        });
        this.actionDispatcher.register("selection.setBone", (action) => {
            this.syncTimelineBoneSelectionFromBottomPanel(action.boneName);
            this.updateSectionKeyframeButtons();
        });
        this.actionDispatcher.register("selection.setMorphFrame", () => {
            this.updateSectionKeyframeButtons();
        });
        this.actionDispatcher.register("viewport.toggleGround", () => {
            this.sceneEnvironmentUiController?.toggleGround();
        });
        this.actionDispatcher.register("viewport.toggleEdge", () => this.toggleEdgeWidthByShortcut());
        this.actionDispatcher.register("viewport.toggleBackgroundMedia", () => {
            this.sceneEnvironmentUiController?.toggleBackgroundMedia();
        });
        this.actionDispatcher.register("viewport.toggleBackgroundBlack", () => {
            this.sceneEnvironmentUiController?.toggleBackgroundBlack();
        });
        this.actionDispatcher.register("viewport.toggleEnvironmentBackground", () => {
            this.mmdManager.toggleEnvironmentBackgroundVisible();
            this.appMenuController?.refresh();
        });
        this.actionDispatcher.register("viewport.toggleSkydome", () => {
            this.sceneEnvironmentUiController?.toggleSkydome();
        });
        this.actionDispatcher.register("viewport.togglePhysicsBones", () => {
            const visible = this.mmdManager.toggleShowPhysicsBonesInViewport();
            this.showToast(visible ? "Physics bones shown in viewport" : "Physics bones hidden in viewport", "info");
            this.appMenuController?.refresh();
        });
        this.actionDispatcher.register("timeline.togglePhysicsBones", () => {
            const visible = this.mmdManager.toggleShowPhysicsBonesInTimeline();
            this.showToast(visible ? "Physics bones shown in timeline" : "Physics bones hidden in timeline", "info");
            this.updateTimelineEditState();
            this.appMenuController?.refresh();
        });
        this.actionDispatcher.register("project.openFile", () => {
            void this.loadFileFromDialog();
        });
        this.actionDispatcher.register("project.openEnvironmentHdr", () => {
            void this.loadEnvironmentHdrFromDialog();
        });
        this.actionDispatcher.register("project.dropFiles", (action) => {
            void this.loadDroppedFiles(action.filePaths);
        });
        this.actionDispatcher.register("project.openModel", () => this.loadPMX());
        this.actionDispatcher.register("project.openMotion", () => this.loadVMD());
        this.actionDispatcher.register("project.openCameraMotion", () => this.loadCameraVMD());
        this.actionDispatcher.register("project.openAudio", () => this.loadMP3());
        this.actionDispatcher.register("project.save", (action) => {
            void this.saveProject(action.forceChoosePath ?? false);
        });
        this.actionDispatcher.register("project.load", () => this.loadProject());
        this.actionDispatcher.register("project.exportPng", (action) => {
            if (action.renderMode === "detached") {
                void this.exportUiController?.exportPNGDetached();
                return;
            }
            void this.exportUiController?.exportPNG();
        });
        this.actionDispatcher.register("project.exportPngSequence", () => {
            void this.exportUiController?.exportPNGSequence();
        });
        this.actionDispatcher.register("project.exportWebm", () => {
            void this.exportUiController?.exportWebm();
        });
        this.actionDispatcher.register("layout.fullscreen.toggle", () => {
            this.layoutUiController?.toggleUiFullscreenMode();
        });
        this.actionDispatcher.register("layout.fullscreen.exit", () => {
            this.layoutUiController?.exitUiFullscreenMode();
        });
        this.actionDispatcher.register("layout.shaderPanel.toggle", () => {
            this.layoutUiController?.toggleShaderPanel();
        });
        this.actionDispatcher.register("runtime.toggleAntialias", () => {
            this.runtimeFeatureUiController?.toggleAntialias();
        });
        this.actionDispatcher.register("runtime.togglePhysics", () => {
            this.runtimeFeatureUiController?.togglePhysics();
        });
        this.actionDispatcher.register("runtime.toggleShadow", () => {
            this.runtimeFeatureUiController?.toggleShadow();
        });
        this.actionDispatcher.register("runtime.toggleEnvironmentLighting", () => {
            const enabled = this.mmdManager.setEnvironmentLightingEnabled(
                !this.mmdManager.isEnvironmentLightingEnabled(),
            );
            this.shaderPanelController?.refresh();
            this.refreshLightingUiFromRuntime();
            this.appMenuController?.refresh();
            this.showToast(
                enabled ? t("shader.toast.iblEnabled") : t("shader.toast.iblDisabled"),
                "info",
            );
        });
        this.actionDispatcher.register("runtime.toggleFloorCollision", () => {
            this.runtimeFeatureUiController?.toggleFloorCollision();
        });
        this.actionDispatcher.register("runtime.toggleRigidBodies", () => {
            this.runtimeFeatureUiController?.toggleRigidBodies();
        });
        this.actionDispatcher.register("runtime.toggleGlobalIllumination", () => {
            this.runtimeFeatureUiController?.toggleGlobalIllumination();
        });
        this.actionDispatcher.register("runtime.setRenderFpsLimit", (action) => {
            this.mmdManager.setRenderFpsLimit(action.limit);
            this.appMenuController?.refresh();
        });
        this.actionDispatcher.register("model.selectTimelineTarget", (action) => {
            this.modelInfoPanelController?.selectTimelineTarget(action.value, action.showToast);
        });
        this.actionDispatcher.register("model.toggleActiveVisibility", () => {
            this.modelInfoPanelController?.toggleActiveModelVisibility();
        });
        this.actionDispatcher.register("model.setActiveShadow", (action) => {
            this.modelInfoPanelController?.setActiveModelCastsShadow(action.castShadow);
        });
        this.actionDispatcher.register("model.deleteActive", () => {
            this.modelInfoPanelController?.deleteActiveModel();
        });
        this.actionDispatcher.register("model.setExternalParent", () => {
            this.modelExternalParentController?.setExternalParentFromPanel();
        });
        this.actionDispatcher.register("shader.selectModelTarget", (action) => {
            this.shaderPanelController?.selectModelTarget(action.value, action.showToast);
        });
        this.actionDispatcher.register("shader.applySelected", () => {
            void this.shaderPanelController?.applySelectedShaderPreset();
        });
        this.actionDispatcher.register("shader.applyAll", () => {
            void this.shaderPanelController?.applyShaderPresetToAll();
        });
        this.actionDispatcher.register("shader.reset", () => {
            void this.shaderPanelController?.resetShaderPreset();
        });
        this.actionDispatcher.register("accessory.select", () => {
            this.accessoryPanelController?.selectAccessory();
        });
        this.actionDispatcher.register("accessory.setParentModel", () => {
            this.accessoryPanelController?.setParentModelFromPanel();
        });
        this.actionDispatcher.register("accessory.setParentBone", () => {
            this.accessoryPanelController?.setParentBoneFromPanel();
        });
        this.actionDispatcher.register("accessory.toggleVisibility", () => {
            this.accessoryPanelController?.toggleSelectedAccessoryVisibility();
        });
        this.actionDispatcher.register("accessory.deleteSelected", () => {
            this.accessoryPanelController?.deleteSelectedAccessory();
        });
        this.actionDispatcher.register("camera.setViewPreset", (action) => {
            this.cameraPanelController?.setCameraViewPreset(action.view);
        });
        this.actionDispatcher.register("camera.setExternalParent", () => {
            if (!this.cameraPanelController?.setExternalParentFromPanel(false)) return;
            const externalParent = this.mmdManager.getCameraExternalParentPayload();
            this.tryRegisterEditorCameraKeyframe({
                name: "Camera",
                category: "camera",
                frames: new Uint32Array(0),
            }, this.captureCurrentBonePoseSnapshot("Camera"), externalParent);
        });
        this.actionDispatcher.register("camera.setMirroringFloorEnabled", (action) => {
            this.mmdManager.mirroringFloorEnabled = action.enabled;
            this.sceneEnvironmentUiController?.refresh();
            this.cameraPanelController?.refresh(true);
        });
        this.actionDispatcher.register("camera.setMirroringFloorResolution", (action) => {
            this.mmdManager.mirroringFloorResolution = action.resolution;
            this.sceneEnvironmentUiController?.refresh();
            this.cameraPanelController?.refresh(true);
        });
        this.actionDispatcher.register("output.applyPreset", () => {
            this.exportUiController?.applyOutputPreset();
        });
        this.actionDispatcher.register("output.syncDimension", (action) => {
            this.exportUiController?.syncOutputDimensionWithLock(action.dimension);
        });
        this.actionDispatcher.register("output.setLockAspect", (action) => {
            this.exportUiController?.setOutputLockAspect(action.locked);
        });
        this.actionDispatcher.register("output.markFrameRangeCustomized", () => {
            this.exportUiController?.markOutputFrameRangeCustomized();
            this.refreshViewportBottomBar();
        });
        this.actionDispatcher.register("output.sanitizeFrameRange", (action) => {
            this.exportUiController?.sanitizeOutputFrameRange(action.boundary);
            this.refreshViewportBottomBar();
        });
        this.actionDispatcher.register("timeline.selectionChanged", (action) => {
            this.syncBoneVisualizerSelection(action.track);
            this.syncBottomBoneSelectionFromTimeline(action.track);
            this.refreshSelectedTrackRotationOverlay();
            this.updateTimelineEditState();
            this.updateSectionKeyframeButtons();
        });
        this.actionDispatcher.register("timeline.seekFrame", (action) => {
            this.mmdManager.seekToBoundary(action.frame);
            this.updateSectionKeyframeButtons();
        });
        this.actionDispatcher.register("edit.boneTransformChanged", (action) => {
            this.handleBoneTransformChanged(action.boneName, action.source);
        });
        this.actionDispatcher.register("edit.setBoneTransformFromBottomBar", (action) => {
            this.applyBottomBarBoneTransform(action.boneName, action.position, action.rotation, action.before);
        });
        this.actionDispatcher.register("edit.setCameraTransformFromBottomBar", (action) => {
            this.applyBottomBarCameraTransform(action.target, action.rotation, action.distance, action.fov, action.before);
        });
        this.actionDispatcher.register("edit.cameraTransformChanged", (action) => {
            this.handleCameraTransformChanged(action.source);
        });
        this.actionDispatcher.register("edit.morphValueChanged", (action) => {
            this.markSectionKeyframeDirty("morph", this.getMorphKeyframeContextKey(action.frameIndex));
            this.updateSectionKeyframeButtons();
        });
        this.actionDispatcher.register("effect.setModelEdgeWidth", (action) => {
            this.modelEdgeController?.setModelEdgeWidthPercent(action.percent);
            this.refreshFrameGraphPostAddUi();
        });
        this.actionDispatcher.register("effect.setModelEdgeColorOverride", (action) => {
            this.mmdManager.modelEdgeColorOverrideEnabled = action.enabled;
            this.modelEdgeController?.refresh();
        });
        this.actionDispatcher.register("effect.setModelEdgeColor", (action) => {
            this.mmdManager.setModelEdgeColor(action.r, action.g, action.b);
            this.modelEdgeController?.refresh();
        });
        this.actionDispatcher.register("effect.setContrastOffset", (action) => {
            this.colorPostFxController?.setContrastOffsetPercent(action.offsetPercent);
        });
        this.actionDispatcher.register("effect.setGammaOffset", (action) => {
            this.colorPostFxController?.setGammaOffsetPercent(action.offsetPercent);
        });
        this.actionDispatcher.register("effect.setExposure", (action) => {
            this.colorPostFxController?.setExposure(action.value);
        });
        this.actionDispatcher.register("effect.setDitheringIntensity", (action) => {
            this.colorPostFxController?.setDitheringIntensity(action.value);
        });
        this.actionDispatcher.register("effect.setVignetteWeight", (action) => {
            this.colorPostFxController?.setVignetteWeight(action.value);
        });
        this.actionDispatcher.register("effect.setGrainIntensity", (action) => {
            this.colorPostFxController?.setGrainIntensity(action.value);
        });
        this.actionDispatcher.register("effect.setSharpenEdge", (action) => {
            this.colorPostFxController?.setSharpenEdgePercent(action.percent);
        });
        this.actionDispatcher.register("effect.setColorCurvesSaturation", (action) => {
            this.colorPostFxController?.setColorCurvesSaturation(action.value);
        });
        this.actionDispatcher.register("effect.setToneMappingType", (action) => {
            this.bloomToneMapController?.setToneMappingType(action.value);
        });
        this.actionDispatcher.register("effect.setBloom", (action) => {
            this.bloomToneMapController?.setBloom(
                action.enabled,
                action.weightPercent,
                action.thresholdSlider,
                action.kernel,
            );
        });
        this.actionDispatcher.register("effect.setGlowIntensity", (action) => {
            this.bloomToneMapController?.setGlowIntensityPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setDofEnabled", (action) => {
            this.dofPanelController?.setDofEnabled(action.enabled);
        });
        this.actionDispatcher.register("effect.setDofQuality", (action) => {
            this.dofPanelController?.setDofQuality(action.level);
        });
        this.actionDispatcher.register("effect.setDofFocusDistance", (action) => {
            this.dofPanelController?.setDofFocusDistanceMm(action.millimeters);
        });
        this.actionDispatcher.register("effect.setDofFocusOffset", (action) => {
            this.dofPanelController?.setDofFocusOffsetMm(action.millimeters);
        });
        this.actionDispatcher.register("effect.setDofFStop", () => {
            this.dofPanelController?.setDofFStop();
        });
        this.actionDispatcher.register("effect.setDofNearSuppression", (action) => {
            this.dofPanelController?.setDofNearSuppressionPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setDofFocalInvert", (action) => {
            this.dofPanelController?.setDofFocalInvert(action.enabled);
        });
        this.actionDispatcher.register("effect.setDofLensBlur", (action) => {
            this.dofPanelController?.setDofLensBlurPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setDofLensSize", (action) => {
            this.dofPanelController?.setDofLensSize(action.value);
        });
        this.actionDispatcher.register("effect.setDofFocalLength", (action) => {
            this.dofPanelController?.setDofFocalLength(action.value);
        });
        this.actionDispatcher.register("effect.setDofTargetModel", (action) => {
            this.dofPanelController?.setDofTargetModel(action.modelIndex);
        });
        this.actionDispatcher.register("effect.setDofTargetBone", (action) => {
            this.dofPanelController?.setDofTargetBone(action.modelIndex, action.boneName);
        });
        this.actionDispatcher.register("effect.setMotionBlurStrength", (action) => {
            this.experimentalPostFxController?.setMotionBlurStrengthPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setSsrStrength", (action) => {
            this.experimentalPostFxController?.setSsrStrengthPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setVlsExposure", (action) => {
            this.experimentalPostFxController?.setVlsExposurePercent(action.percent);
        });
        this.actionDispatcher.register("effect.setFrameGraphSsao", (action) => {
            this.mmdManager.postEffectSsaoEnabled = action.enabled;
            this.mmdManager.postEffectSsaoStrength = action.strengthPercent / 100;
            this.mmdManager.postEffectSsaoRadius = action.radiusPercent / 100;
            this.mmdManager.postEffectSsaoDebugView = false;
            this.modelEdgeController?.refresh();
        });
        this.actionDispatcher.register("effect.setFrameGraphSsr", (action) => {
            this.mmdManager.postEffectSsrEnabled = action.enabled;
            this.mmdManager.postEffectSsrStrength = action.strengthPercent / 100;
        });
        this.actionDispatcher.register("effect.setFrameGraphDofEnabled", (action) => {
            this.mmdManager.dofEnabled = action.enabled;
        });
        this.actionDispatcher.register("effect.setFrameGraphDofFocusDistance", (action) => {
            if (!this.mmdManager.dofAutoFocusEnabled) {
                this.mmdManager.dofFocusDistanceMm = action.millimeters;
            }
        });
        this.actionDispatcher.register("effect.setFrameGraphDofFocusOffset", (action) => {
            this.mmdManager.dofAutoFocusNearOffsetMm = action.millimeters;
        });
        this.actionDispatcher.register("effect.setFrameGraphDofFStop", () => {
            this.applySimplifiedDofDefaults();
        });
        this.actionDispatcher.register("effect.setFrameGraphDofLensSize", (action) => {
            this.mmdManager.dofLensSize = action.value;
        });
        this.actionDispatcher.register("effect.setFrameGraphDofFocalLength", (action) => {
            if (!this.mmdManager.dofFocalLengthLinkedToCameraFov) {
                this.mmdManager.dofFocalLength = action.value;
            }
        });
        this.actionDispatcher.register("effect.setFrameGraphDofTargetModel", (action) => {
            if (action.modelIndex === null) {
                this.mmdManager.setDofFocusTargetByIndex(null, null);
                return;
            }
            this.mmdManager.setDofFocusTargetByIndex(
                action.modelIndex,
                this.mmdManager.getPreferredDofFocusBoneName(action.modelIndex),
            );
        });
        this.actionDispatcher.register("effect.setFrameGraphDofTargetBone", (action) => {
            if (action.modelIndex === null) {
                this.mmdManager.setDofFocusTargetByIndex(null, null);
                return;
            }
            this.mmdManager.setDofFocusTargetByIndex(action.modelIndex, action.boneName);
        });
        this.actionDispatcher.register("effect.setLightDirection", (action) => {
            this.mmdManager.setLightDirection(action.x, action.y, action.z);
        });
        this.actionDispatcher.register("effect.setLightIntensity", (action) => {
            this.mmdManager.lightIntensity = action.value;
        });
        this.actionDispatcher.register("effect.setAmbientIntensity", (action) => {
            this.mmdManager.ambientIntensity = action.value;
        });
        this.actionDispatcher.register("effect.setLightColor", (action) => {
            this.mmdManager.setLightColor(action.r, action.g, action.b);
        });
        this.actionDispatcher.register("effect.setLightFlatStrength", (action) => {
            this.mmdManager.lightFlatStrength = action.value;
        });
        this.actionDispatcher.register("effect.setLightFlatColorInfluence", (action) => {
            this.mmdManager.lightFlatColorInfluence = action.value;
        });
        this.actionDispatcher.register("effect.setShadowMode", (action) => {
            this.mmdManager.shadowMode = action.mode;
        });
        this.actionDispatcher.register("effect.setShadowDarkness", (action) => {
            this.mmdManager.shadowDarkness = action.value;
        });
        this.actionDispatcher.register("effect.setShadowFrustumSize", (action) => {
            this.mmdManager.shadowFrustumSize = action.value;
        });
        this.actionDispatcher.register("effect.setShadowMaxZ", (action) => {
            this.mmdManager.shadowMaxZ = action.value;
        });
        this.actionDispatcher.register("effect.setShadowFilteringQuality", (action) => {
            this.mmdManager.shadowFilteringQuality = action.value;
        });
        this.actionDispatcher.register("effect.setShadowBlurKernel", (action) => {
            this.mmdManager.shadowBlurKernel = action.value;
        });
        this.actionDispatcher.register("effect.setShadowBlurScale", (action) => {
            this.mmdManager.shadowBlurScale = action.value;
        });
        this.actionDispatcher.register("effect.setShadowBlurBoxOffset", (action) => {
            this.mmdManager.shadowBlurBoxOffset = action.value;
        });
        this.actionDispatcher.register("effect.setShadowPenumbra", (action) => {
            this.mmdManager.shadowPenumbraEnabled = action.enabled;
        });
        this.actionDispatcher.register("effect.setShadowPenumbraSize", (action) => {
            this.mmdManager.shadowPenumbraSize = action.value;
        });
        this.actionDispatcher.register("effect.setTransparentShadow", (action) => {
            this.mmdManager.transparentShadowEnabled = action.enabled;
        });
        this.actionDispatcher.register("effect.setSoftTransparentShadow", (action) => {
            this.mmdManager.softTransparentShadowEnabled = action.enabled;
        });
        this.actionDispatcher.register("effect.setIblShadows", (action) => {
            this.mmdManager.setIblShadowsEnabled(action.enabled);
        });
        this.actionDispatcher.register("effect.setIblShadowOpacity", (action) => {
            this.mmdManager.iblShadowOpacity = action.value;
        });
        this.actionDispatcher.register("effect.setIblShadowDistanceScale", (action) => {
            this.mmdManager.iblShadowDistanceScale = action.value;
        });
        this.actionDispatcher.register("effect.setCharacterContactShadow", (action) => {
            this.mmdManager.characterContactShadowEnabled = action.enabled;
        });
        this.actionDispatcher.register("effect.setCharacterContactShadowOpacity", (action) => {
            this.mmdManager.characterContactShadowOpacity = action.value;
        });
        this.actionDispatcher.register("effect.setCharacterContactShadowScale", (action) => {
            this.mmdManager.characterContactShadowScale = action.value;
        });
        this.actionDispatcher.register("effect.setShadowBias", (action) => {
            this.mmdManager.shadowBias = action.value;
        });
        this.actionDispatcher.register("effect.setShadowNormalBias", (action) => {
            this.mmdManager.shadowNormalBias = action.value;
        });
        this.actionDispatcher.register("effect.setShadowColor", (action) => {
            this.mmdManager.setShadowColor(action.r, action.g, action.b);
        });
        this.actionDispatcher.register("effect.setToonShadowInfluence", (action) => {
            this.mmdManager.toonShadowInfluence = action.value;
        });
        this.actionDispatcher.register("effect.setSelfShadowSoftness", (action) => {
            this.mmdManager.selfShadowEdgeSoftness = action.value;
        });
        this.actionDispatcher.register("effect.setOcclusionShadowSoftness", (action) => {
            this.mmdManager.occlusionShadowEdgeSoftness = action.value;
        });
        this.actionDispatcher.register("effect.setLightColorTemperature", (action) => {
            this.mmdManager.lightColorTemperature = action.kelvin;
        });
        this.actionDispatcher.register("effect.setFogEnabled", (action) => {
            this.fogPanelController?.setFogEnabled(action.enabled);
        });
        this.actionDispatcher.register("effect.setFogStart", (action) => {
            this.fogPanelController?.setFogStart(action.value);
        });
        this.actionDispatcher.register("effect.setFogEnd", (action) => {
            this.fogPanelController?.setFogEnd(action.value);
        });
        this.actionDispatcher.register("effect.setFogDensity", (action) => {
            this.fogPanelController?.setFogDensity(action.value);
        });
        this.actionDispatcher.register("effect.setFogOpacity", (action) => {
            this.fogPanelController?.setFogOpacity(action.value);
        });
        this.actionDispatcher.register("effect.setFogColor", (action) => {
            this.fogPanelController?.setFogColor(action.r, action.g, action.b);
        });
        this.actionDispatcher.register("effect.setChromaticAberration", (action) => {
            this.lensEffectController?.setChromaticAberration(action.value);
        });
        this.actionDispatcher.register("effect.setLensDistortion", (action) => {
            this.lensEffectController?.setLensDistortionPercent(action.percent);
        });
        this.actionDispatcher.register("effect.setLensDistortionInfluence", (action) => {
            this.lensEffectController?.setLensDistortionInfluencePercent(action.percent);
        });
        this.actionDispatcher.register("effect.setLensEdgeBlur", (action) => {
            this.lensEffectController?.setLensEdgeBlurPercent(action.percent);
        });
        this.actionDispatcher.register("effect.applyLut", () => {
            this.lutPanelController?.applyLutFromPanel();
        });
        this.actionDispatcher.register("effect.chooseExternalLut", () => {
            void this.lutPanelController?.chooseExternalLut();
        });
    }

    private isTextInputLikeTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (target instanceof HTMLInputElement) return true;
        if (target instanceof HTMLSelectElement) return true;
        if (target instanceof HTMLTextAreaElement) return true;
        return target.isContentEditable || target.closest("[contenteditable='true']") !== null;
    }

    private commitCurrentFrameInput(): void {
        const rawValue = this.currentFrameEl.value.trim();
        if (rawValue.length === 0) {
            this.currentFrameEl.value = String(this.mmdManager.currentFrame);
            return;
        }

        const parsedFrame = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsedFrame)) {
            this.currentFrameEl.value = String(this.mmdManager.currentFrame);
            return;
        }

        const nextFrame = Math.max(0, parsedFrame);
        this.currentFrameEl.value = String(nextFrame);
        this.actionDispatcher.dispatch({ type: "playback.seekFrame", source: "panel", frame: nextFrame });
    }

    private cycleActiveModelByShortcut(direction: 1 | -1): void {
        const models = this.mmdManager.getLoadedModels();
        if (models.length === 0) return;

        const timelineTarget = this.mmdManager.getTimelineTarget();
        let nextModel = models[0];

        if (timelineTarget !== "model") {
            nextModel = direction > 0 ? models[0] : models[models.length - 1];
        } else {
            const active = models.find((model) => model.active) ?? models[0];
            const activeIndex = models.findIndex((model) => model.index === active.index);
            const nextIndex = (activeIndex + direction + models.length) % models.length;
            nextModel = models[nextIndex];
        }

        const ok = this.mmdManager.setActiveModelByIndex(nextModel.index);
        if (!ok) return;

        this.mmdManager.setTimelineTarget("model");
        this.refreshModelSelector();
        this.refreshShaderPanel();
    }

    private seekToAdjacentKeyframePoint(direction: 1 | -1): void {
        const track = this.getSelectedTimelineTrack();
        const frames = track?.frames;
        if (!frames || frames.length === 0) return;

        const currentFrame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        let targetFrame: number | null = null;

        if (direction > 0) {
            for (let i = 0; i < frames.length; i += 1) {
                const frame = Math.max(0, Math.floor(frames[i] ?? 0));
                if (frame > currentFrame) {
                    targetFrame = frame;
                    break;
                }
            }
        } else {
            for (let i = frames.length - 1; i >= 0; i -= 1) {
                const frame = Math.max(0, Math.floor(frames[i] ?? 0));
                if (frame < currentFrame) {
                    targetFrame = frame;
                    break;
                }
            }
        }

        if (targetFrame === null) return;
        this.mmdManager.seekToBoundary(targetFrame);
        this.timeline.setSelectedFrame(targetFrame);
        this.updateTimelineEditState();
    }

    private toggleEdgeWidthByShortcut(): void {
        const currentEdgeWidth = this.mmdManager.modelEdgeWidth;
        if (currentEdgeWidth > 0.001) {
            this.shortcutEdgeWidthRestore = Math.max(0.01, currentEdgeWidth);
            this.mmdManager.modelEdgeWidth = 0;
            this.showToast(t("toast.edge.off"), "info");
        } else {
            const restore = Math.max(0.01, this.shortcutEdgeWidthRestore || 1);
            this.mmdManager.modelEdgeWidth = restore;
            this.showToast(t("toast.edge.on"), "info");
        }
        this.modelEdgeController?.refresh();
    }

    private setupPerfDisplay(): void {
        const fpsEl = getRequiredElement("fps-value");
        const engineEl = getRequiredElement("engine-type-badge");
        const shaderEl = getRequiredElement("shader-type-badge");
        const physicsEl = getRequiredElement("physics-type-badge");

        const updatePerfBadges = (): void => {
            const engineType = this.mmdManager.getEngineType();
            const shaderType = this.mmdManager.getShaderRuntimeLabel();
            const physicsType = this.mmdManager.getPhysicsBackendLabel();
            const physicsEvaluationType = this.mmdManager.getPhysicsEvaluationTypeLabel();
            const applyMutedBadgeStyle = (element: HTMLElement): void => {
                element.style.background = "rgba(255,255,255,0.045)";
                element.style.color = "#9a9aa3";
                element.style.borderColor = "rgba(255,255,255,0.08)";
            };
            const shaderBadgeLabel = shaderType === "WGSL-first"
                ? "WGSL"
                : shaderType === "WGSL-custom"
                    ? "WGSL+"
                    : shaderType;
            engineEl.textContent = engineType;
            shaderEl.textContent = shaderBadgeLabel;
            physicsEl.textContent = physicsEvaluationType === "WasmImmediate" || physicsType === "Off"
                ? physicsType
                : `${physicsType} ${physicsEvaluationType}`;
            shaderEl.title = shaderType === "WGSL-custom"
                ? "WGSL renderer with custom material presets or external WGSL toon shaders"
                : shaderType === "WGSL-first"
                    ? "WGSL renderer with standard MMD material presets"
                    : "GLSL renderer";
            physicsEl.title = physicsEvaluationType === "WasmImmediate"
                ? "WASM runtime physics evaluation"
                : `Bullet physics evaluation: ${physicsEvaluationType}`;

            applyMutedBadgeStyle(engineEl);
            applyMutedBadgeStyle(shaderEl);
            applyMutedBadgeStyle(physicsEl);
        };

        updatePerfBadges();

        // FPS - update every second
        setInterval(() => {
            const fps = this.mmdManager.getFps();
            fpsEl.textContent = String(fps);
            fpsEl.style.color = "#ff4fa3";
            updatePerfBadges();
            this.dofPanelController?.refreshAutoFocusReadout();
        }, 1000);

        // Volume fader
        const slider = document.getElementById("viewport-volume-slider") as HTMLInputElement | null;
        const muteBtn = document.getElementById("viewport-volume-mute");
        const iconOn = document.getElementById("viewport-icon-volume-on");
        const iconOff = document.getElementById("viewport-icon-volume-off");

        const updateVolumeUI = (isMuted: boolean) => {
            if (iconOn) iconOn.style.display = isMuted ? "none" : "";
            if (iconOff) iconOff.style.display = isMuted ? "" : "none";
            muteBtn?.classList.toggle("muted", isMuted);
        };

        slider?.addEventListener("input", () => {
            this.mmdManager.volume = Number(slider.value) / 100;
            updateVolumeUI(this.mmdManager.muted);
        });

        muteBtn?.addEventListener("click", async () => {
            await this.mmdManager.toggleMute();
            updateVolumeUI(this.mmdManager.muted);
        });
        updateVolumeUI(this.mmdManager.muted);
    }

    private showStartupRenderingDiagnostics(): void {
        const summary = this.mmdManager.consumeRuntimeDiagnosticSummary();
        if (!summary) {
            return;
        }
        this.showToast(summary, "info");
    }

    private buildProjectDefaultFileName(): string {
        const now = new Date();
        const pad = (v: number) => String(v).padStart(2, "0");
        return `project_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.modoki.json`;
    }

    private buildProjectStateForPersistence(): MmdModokiProjectFileV1 {
        const project = this.mmdManager.exportProjectState();
        project.output = this.exportOutputProjectState();
        return project;
    }

    private exportOutputProjectState(): ProjectOutputState {
        return this.exportUiController?.exportProjectState() ?? {
            aspectPreset: "16:9",
            sizePreset: "1920",
            width: 1920,
            height: 1080,
            lockAspect: false,
            qualityScale: 1,
            fps: 30,
            includeAudio: false,
            webmCodec: "vp8",
            webmCaptureMode: "rgba-surface",
            startFrame: 0,
            endFrame: 0,
            frameStartEnabled: false,
            frameStopEnabled: false,
        };
    }

    private applyOutputProjectState(state: ProjectOutputState | null | undefined): void {
        this.exportUiController?.applyProjectState(state);
    }

    private reapplyImportedLightingState(lighting: Partial<ProjectLightingState> | null | undefined): void {
        if (!lighting) return;

        if (
            typeof lighting.x === "number"
            && Number.isFinite(lighting.x)
            && typeof lighting.y === "number"
            && Number.isFinite(lighting.y)
            && typeof lighting.z === "number"
            && Number.isFinite(lighting.z)
        ) {
            this.mmdManager.setLightDirection(lighting.x, lighting.y, lighting.z);
        }

        if (typeof lighting.shadowFrustumSize === "number" && Number.isFinite(lighting.shadowFrustumSize)) {
            this.mmdManager.shadowFrustumSize = lighting.shadowFrustumSize;
        }
        if (typeof lighting.shadowMaxZ === "number" && Number.isFinite(lighting.shadowMaxZ)) {
            this.mmdManager.shadowMaxZ = lighting.shadowMaxZ;
        }
        if (lighting.shadowMode === "standard" || lighting.shadowMode === "cascaded") {
            this.mmdManager.shadowMode = lighting.shadowMode;
        }
    }

    private async saveProject(forceChoosePath = false): Promise<void> {
        this.setStatus("Saving project...", true);
        try {
            const project = this.buildProjectStateForPersistence();
            let relativeLutFileName: string | null = null;
            let relativeLutText: string | null = null;
            let relativeWgslFileName: string | null = null;
            const lutSavePlan = this.lutPanelController?.prepareProjectSave();
            if (lutSavePlan) {
                project.effects.lutSourceMode = lutSavePlan.sourceMode;
                project.effects.lutExternalPath = lutSavePlan.externalPath;
                relativeLutFileName = lutSavePlan.relativeFileName;
                relativeLutText = lutSavePlan.externalText;
                if (lutSavePlan.disableLut) {
                    project.effects.lutEnabled = false;
                    this.showToast("External LUT is missing, saving with LUT disabled", "info");
                }
            }
            if (!this.postFxWgslToonPath || !this.postFxWgslToonText) {
                project.effects.wgslToonShaderPath = null;
            } else {
                relativeWgslFileName = this.getBaseNameForRenderer(this.postFxWgslToonPath) || "external_toon.wgsl";
                project.effects.wgslToonShaderPath = `wgsl/${relativeWgslFileName}`;
            }

            const json = JSON.stringify(project, null, 2);
            let savedPath = this.currentProjectFilePath;
            if (forceChoosePath || !savedPath) {
                const defaultFileName = savedPath
                    ? this.getBaseNameForRenderer(savedPath) || this.buildProjectDefaultFileName()
                    : this.buildProjectDefaultFileName();
                savedPath = await window.electronAPI.saveTextFile(json, defaultFileName, [
                    { name: "MMD Modoki Project", extensions: ["mmdproj", "json"] },
                    { name: "All files", extensions: ["*"] },
                ]);
                if (!savedPath) {
                    this.setStatus("Ready", false);
                    this.showToast("Project save canceled", "info");
                    return;
                }
            } else {
                const wrote = await window.electronAPI.writeTextFileToPath(savedPath, json);
                if (!wrote) {
                    this.setStatus("Project save failed", false);
                    this.showToast("Failed to overwrite project file", "error");
                    return;
                }
            }

            if (relativeLutFileName && relativeLutText) {
                const projectDir = this.getDirectoryPathForRenderer(savedPath);
                const lutDir = this.joinPathForRenderer(projectDir, "luts");
                const lutPath = this.joinPathForRenderer(lutDir, relativeLutFileName);
                const wrote = await window.electronAPI.writeTextFileToPath(lutPath, relativeLutText);
                if (!wrote) {
                    this.showToast("Failed to save project-relative LUT file", "error");
                }
            }
            if (relativeWgslFileName && this.postFxWgslToonText) {
                const projectDir = this.getDirectoryPathForRenderer(savedPath);
                const wgslDir = this.joinPathForRenderer(projectDir, "wgsl");
                const wgslPath = this.joinPathForRenderer(wgslDir, relativeWgslFileName);
                const wrote = await window.electronAPI.writeTextFileToPath(wgslPath, this.postFxWgslToonText);
                if (!wrote) {
                    this.showToast("Failed to save project-relative WGSL file", "error");
                }
            }

            this.currentProjectFilePath = savedPath;
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

            const parsedProject = parsed as Partial<MmdModokiProjectFileV1>;
            const requestedLutMode = parsedProject.effects?.lutSourceMode;
            const requestedLutPath = parsedProject.effects?.lutExternalPath;
            const requestedWgslToonPath = parsedProject.effects?.wgslToonShaderPath;
            const isExternalLutMode = requestedLutMode === "external-absolute" || requestedLutMode === "project-relative";

            let resolvedExternalLutPath: string | null = null;
            let resolvedExternalLutText: string | null = null;
            let externalLutWarning: string | null = null;
            let resolvedWgslToonPath: string | null = null;
            let resolvedWgslToonText: string | null = null;
            let wgslToonWarning: string | null = null;

            if (isExternalLutMode) {
                if (typeof requestedLutPath === "string" && requestedLutPath.trim().length > 0) {
                    const normalizedPath = requestedLutPath.trim();
                    resolvedExternalLutPath = requestedLutMode === "project-relative" && !this.isAbsolutePathForRenderer(normalizedPath)
                        ? this.resolveProjectRelativePath(filePath, normalizedPath)
                        : normalizedPath;
                    const lutText = await window.electronAPI.readTextFile(resolvedExternalLutPath);
                    if (lutText) {
                        resolvedExternalLutText = lutText;
                        const imported = await this.lutPanelController?.importExternalLutFile(
                            resolvedExternalLutPath,
                            "project",
                            false,
                            lutText,
                            requestedLutMode === "project-relative" ? "project-relative" : "external-absolute",
                        ) ?? false;
                        if (!imported) {
                            resolvedExternalLutText = null;
                            this.lutPanelController?.clearExternalAsset();
                            externalLutWarning = 'External LUT parse failed: ' + requestedLutPath;
                        }
                    } else {
                        externalLutWarning = 'External LUT load failed: ' + requestedLutPath;
                    }
                } else {
                    externalLutWarning = 'External LUT path is missing';
                }
            }
            if (typeof requestedWgslToonPath === "string" && requestedWgslToonPath.trim().length > 0) {
                const normalizedPath = requestedWgslToonPath.trim();
                resolvedWgslToonPath = this.isAbsolutePathForRenderer(normalizedPath)
                    ? normalizedPath
                    : this.resolveProjectRelativePath(filePath, normalizedPath);
                const wgslText = await window.electronAPI.readTextFile(resolvedWgslToonPath);
                if (wgslText) {
                    const validationError = this.shaderPanelController?.validateExternalWgslToonSnippet(wgslText) ?? null;
                    if (validationError) {
                        wgslToonWarning = `WGSL shader invalid (${requestedWgslToonPath}): ${validationError}`;
                        resolvedWgslToonPath = null;
                        resolvedWgslToonText = null;
                    } else {
                        resolvedWgslToonText = wgslText;
                    }
                } else {
                    wgslToonWarning = `WGSL shader load failed: ${requestedWgslToonPath}`;
                }
            }

            const result = await this.mmdManager.importProjectState(parsed);
            this.commandHistory.clear("project-load");
            this.currentProjectFilePath = filePath;

            this.postFxWgslToonPath = resolvedWgslToonPath;
            this.postFxWgslToonText = resolvedWgslToonText;
            this.shaderPanelController?.setExternalWgslToonAsset(resolvedWgslToonPath, resolvedWgslToonText);
            this.mmdManager.setExternalWgslToonShader(resolvedWgslToonPath, resolvedWgslToonText);
            this.lutPanelController?.restoreProjectExternalAsset(resolvedExternalLutPath, resolvedExternalLutText);
            if (isExternalLutMode && !resolvedExternalLutText) {
                this.mmdManager.postEffectLutEnabled = false;
            }
            this.applyOutputProjectState(parsedProject.output);
            if (externalLutWarning) {
                result.warnings.push(externalLutWarning);
            }
            if (wgslToonWarning) {
                result.warnings.push(wgslToonWarning);
            }

            this.refreshModelSelector();
            this.refreshShaderPanel();
            this.applyLocalizedUiState();
            this.refreshCameraUiFromRuntime();
            this.refreshLightingUiFromRuntime();
            this.runtimeFeatureUiController?.refreshPhysics();
            this.accessoryPanelController?.refresh();
            if (this.mmdManager.getTimelineTarget() === "camera") {
                this.applyCameraSelectionUI();
            } else {
                const activeModel = this.mmdManager.getLoadedModels().find((item) => item.active);
                if (activeModel) {
                    this.mmdManager.setActiveModelByIndex(activeModel.index);
                }
            }
            this.reapplyImportedLightingState(parsedProject.lighting);
            this.refreshLightingUiFromRuntime();
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
            { name: "Supported files", extensions: ["pmx", "pmd", "x", "vmd", "vpd", "mp3", "wav", "ogg", "png", "jpg", "jpeg", "bmp", "webp", "webm", "mp4", "avi", "hdr"] },
            { name: "All files", extensions: ["*"] },
        ]);

        if (!filePath) return;
        await this.loadFileByPath(filePath, "dialog");
    }

    private async loadEnvironmentHdrFromDialog(): Promise<void> {
        const filePath = await window.electronAPI.openFileDialog([
            { name: t("dialog.hdri.hdrFiles"), extensions: ["hdr"] },
            { name: t("option.allFiles"), extensions: ["*"] },
        ]);
        if (!filePath) return;
        await this.loadEnvironmentHdrByPath(filePath);
    }

    private async loadEnvironmentHdrByPath(filePath: string): Promise<boolean> {
        this.setStatus(t("dialog.hdri.loading"), true);
        const loaded = await this.mmdManager.setEnvironmentLightingSourcePath(filePath);
        if (!loaded) {
            this.setStatus(t("dialog.hdri.loadFailed"), false);
            this.showToast(t("dialog.hdri.loadFailed"), "error");
            return false;
        }

        this.mmdManager.setEnvironmentLightingEnabled(true);
        this.shaderPanelController?.refresh();
        this.refreshLightingUiFromRuntime();
        this.appMenuController?.refresh();
        this.setStatus(t("dialog.hdri.loaded"), false);
        this.showToast(`${t("dialog.hdri.loaded")}: ${this.getBaseNameForRenderer(filePath)}`, "success");
        return true;
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
            case "hdr":
                await this.loadEnvironmentHdrByPath(filePath);
                return;
            case "pmx":
            case "pmd":
                this.setStatus("Loading PMX/PMD...", true);
                await this.mmdManager.loadPMX(filePath);
                return;
            case "x": {
                this.setStatus("Loading X model...", true);
                const ok = await this.mmdManager.loadX(filePath);
                if (ok) {
                    this.setStatus("X model loaded", false);
                    this.accessoryPanelController?.refresh();
                    this.showToast(`Loaded X model: ${filePath.replace(/^.*[\\/]/, "")}`, "success");
                } else {
                    this.setStatus("X model load failed", false);
                }
                return;
            }
            case "3dl":
            case "cube":
                this.setStatus("Loading LUT...", true);
                if (await this.lutPanelController?.importExternalLutFile(filePath, source)) {
                    this.setStatus("LUT loaded", false);
                } else {
                    this.setStatus("LUT load failed", false);
                }
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
            case "png":
            case "jpg":
            case "jpeg":
            case "bmp":
            case "webp":
                await this.sceneEnvironmentUiController?.applyBackgroundImage(filePath);
                return;
            case "webm":
            case "mp4":
            case "avi":
                await this.sceneEnvironmentUiController?.applyBackgroundVideo(filePath);
                return;
            case "glb":
                this.showToast("GLB import is currently disabled", "error");
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

    private joinPathForRenderer(basePath: string, childName: string): string {
        const separator = basePath.includes("\\") ? "\\" : "/";
        const normalizedBase = basePath.replace(/[\\/]+$/, "");
        return `${normalizedBase}${separator}${childName}`;
    }

    private getDirectoryPathForRenderer(filePath: string): string {
        const normalized = filePath.replace(/[\\/]+$/, "");
        const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
        if (index < 0) return normalized;
        return normalized.slice(0, index);
    }

    private getBaseNameForRenderer(filePath: string): string {
        const normalized = filePath.replace(/[\\/]+$/, "");
        const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
        if (index < 0) return normalized;
        return normalized.slice(index + 1);
    }

    private isAbsolutePathForRenderer(filePath: string): boolean {
        return /^[A-Za-z]:[\\/]/.test(filePath)
            || /^\\\\/.test(filePath)
            || filePath.startsWith("/");
    }

    private normalizeRelativePathForRenderer(filePath: string): string {
        return filePath.replace(/^[.][\\/]/, "").replace(/[\\]+/g, "/");
    }

    private resolveProjectRelativePath(projectFilePath: string, relativePath: string): string {
        const projectDir = this.getDirectoryPathForRenderer(projectFilePath);
        const normalizedRelative = this.normalizeRelativePathForRenderer(relativePath);
        return this.joinPathForRenderer(projectDir, normalizedRelative.replace(/\//g, "\\"));
    }

    private isSamePathForRenderer(a: string, b: string): boolean {
        const norm = (v: string): string => v.replace(/[\\/]+/g, "\\").toLowerCase();
        return norm(a) === norm(b);
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
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
        this.refreshCameraUiFromRuntime(true);
        this.mmdManager.setBoneVisualizerSelectedBone(null);
        this.updateInfoActionButtons();
        this.bottomPanelLayoutController?.applyMode("camera");
        this.effectPanelShellController?.setActiveTab("post");
        this.modelExternalParentController?.refresh();
        this.refreshViewportBottomBar();
    }

    private applyActiveModelSelectionUI(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        const info = this.mmdManager.getActiveModelInfo();
        if (!info) return;

        this.bottomPanel.updateBoneControls(info);
        this.bottomPanel.updateMorphControls(info);
        this.bottomPanel.updateModelInfo(info);
        this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
        this.syncBottomBoneSelectionFromTimeline(this.timeline.getSelectedTrack());
        this.updateInfoActionButtons();
        this.bottomPanelLayoutController?.applyMode("model");
        this.cameraPanelController?.refresh();
        this.modelExternalParentController?.refresh();
        this.refreshViewportBottomBar();
    }

    private updateInfoActionButtons(): void {
        this.modelInfoPanelController?.updateActionButtons();
        this.updateSectionKeyframeButtons();
    }

    private refreshModelSelector(): void {
        this.modelInfoPanelController?.refresh();
        this.shaderPanelController?.syncModelSelectorFromInfo();
        this.updateInfoActionButtons();
        this.runtimeFeatureUiController?.refreshRigidBodies();
        this.accessoryPanelController?.refresh();
        this.modelExternalParentController?.refresh();
        this.refreshViewportBottomBar();
    }

    private refreshViewportBottomBar(): void {
        const hasLoadedModels = this.mmdManager.getLoadedModels().length > 0;
        const target = hasLoadedModels ? this.mmdManager.getTimelineTarget() : "camera";
        this.refreshToolbarTimelineTargetSwitch(target === "model" ? "model" : "camera", hasLoadedModels);
        this.viewportSeekBarController?.refresh({
            currentFrame: this.mmdManager.currentFrame,
            totalFrames: this.mmdManager.totalFrames,
            isPlaying: this.mmdManager.isPlaying,
            playbackRange: {
                ...this.getPlaybackFrameRange(),
                frameStartEnabled: this.isPlaybackFrameStartEnabled(),
                frameStopEnabled: this.isPlaybackFrameStopEnabled(),
            },
        });
        this.viewportAxisHandleController?.applyMode(target === "model" ? "model" : "camera");

        if (target === "model") {
            const boneName = this.bottomPanel.getSelectedBone();
            const transform = boneName && boneName !== "Camera"
                ? this.mmdManager.getBoneTransform(boneName)
                : null;
            this.viewportAxisHandleController?.updateModelTransform(transform);
            return;
        }

        const cameraPose = this.mmdManager.getCameraKeyframePose();
        this.viewportAxisHandleController?.updateCameraTransform({
            target: cameraPose.target,
            rotation: cameraPose.rotation,
            distance: cameraPose.distance,
            fov: cameraPose.fov,
        });
    }

    private refreshPlaybackFrameBar(): void {
        this.viewportSeekBarController?.refresh({
            currentFrame: this.mmdManager.currentFrame,
            totalFrames: this.mmdManager.totalFrames,
            isPlaying: true,
            playbackRange: {
                ...this.getPlaybackFrameRange(),
                frameStartEnabled: this.isPlaybackFrameStartEnabled(),
                frameStopEnabled: this.isPlaybackFrameStopEnabled(),
            },
        });
    }

    private refreshToolbarTimelineTargetSwitch(mode: "model" | "camera", canSwitchToModel: boolean): void {
        this.viewportTopBarController?.refresh({
            mode,
            canSwitchToModel,
            perspectiveEnabled: this.mmdManager.getPerspectiveEnabled(),
        });
    }

    private switchViewportBottomBarToModel(): void {
        const hasLoadedModels = this.mmdManager.getLoadedModels().length > 0;
        if (!hasLoadedModels) {
            this.refreshViewportBottomBar();
            return;
        }
        const models = this.mmdManager.getLoadedModels();
        const target = models.find((model) => model.active) ?? models[0] ?? null;
        if (!target) {
            this.refreshViewportBottomBar();
            return;
        }
        this.actionDispatcher.dispatch({
            type: "model.selectTimelineTarget",
            source: "button",
            value: String(target.index),
            showToast: true,
        });
    }

    private switchToCameraMode(): void {
        this.actionDispatcher.dispatch({
            type: "model.selectTimelineTarget",
            source: "button",
            value: MODEL_INFO_CAMERA_SELECT_VALUE,
            showToast: true,
        });
    }

    private getInfoModelSelectState(): ModelInfoSelectState {
        return this.modelInfoPanelController?.getSelectState() ?? {
            innerHTML: '<option value="">-</option>',
            value: "",
            disabled: true,
        };
    }

    private handleModelTargetSelection(value: string, showToast: boolean): void {
        const frameGraphDofEnabledBeforeTargetSwitch = this.getConfiguredPostEffectBackend() === "frameGraph"
            ? this.mmdManager.dofEnabled
            : null;
        const frameGraphSsaoEnabledBeforeTargetSwitch = this.getConfiguredPostEffectBackend() === "frameGraph"
            ? this.mmdManager.postEffectSsaoEnabled
            : null;
        const restoreFrameGraphPostEffectEnabledStates = (): boolean => {
            let changed = false;
            if (frameGraphDofEnabledBeforeTargetSwitch === null) return false;
            if (this.mmdManager.dofEnabled !== frameGraphDofEnabledBeforeTargetSwitch) {
                this.mmdManager.dofEnabled = frameGraphDofEnabledBeforeTargetSwitch;
                changed = true;
            }
            if (
                frameGraphSsaoEnabledBeforeTargetSwitch !== null &&
                this.mmdManager.postEffectSsaoEnabled !== frameGraphSsaoEnabledBeforeTargetSwitch
            ) {
                this.mmdManager.postEffectSsaoEnabled = frameGraphSsaoEnabledBeforeTargetSwitch;
                changed = true;
            }
            return changed;
        };

        if (value === MODEL_INFO_CAMERA_SELECT_VALUE) {
            this.mmdManager.setTimelineTarget("camera");
            this.applyCameraSelectionUI();
            this.refreshModelSelector();
            this.refreshShaderPanel();
            if (restoreFrameGraphPostEffectEnabledStates()) {
                this.refreshShaderPanel();
            }
            if (showToast) {
                this.showToast("Timeline target: Camera", "success");
            }
            return;
        }

        const index = Number.parseInt(value, 10);
        if (Number.isNaN(index)) return;
        const ok = this.mmdManager.setActiveModelByIndex(index);
        if (!ok) {
            if (showToast) {
                this.showToast("Failed to switch active model", "error");
            }
            return;
        }

        this.mmdManager.setTimelineTarget("model");
        this.applyActiveModelSelectionUI();
        this.refreshModelSelector();
        this.refreshShaderPanel();
        restoreFrameGraphPostEffectEnabledStates();
        if (showToast) {
            this.showToast("Active model switched", "success");
        }
    }

    private installRangeNumberInputs(root: ParentNode = document): void {
        const sliders = root.querySelectorAll<HTMLInputElement>(
            'input[type="range"].bone-slider, .morph-slider-row input[type="range"], input[type="range"].cam-slider, input[type="range"].light-slider, input[type="range"].effect-slider, input[type="range"].effect-layer-control-slider',
        );

        for (const slider of sliders) {
            if (this.rangeNumberInputs.has(slider)) continue;

            const parent = slider.parentElement;
            if (!parent) continue;

            const numberInput = document.createElement("input");
            numberInput.type = "number";
            numberInput.className = "range-number-input";
            numberInput.min = this.formatRangeDisplayValue(
                slider,
                slider.min === "" ? Number.NEGATIVE_INFINITY : Number(slider.min),
            );
            numberInput.max = this.formatRangeDisplayValue(
                slider,
                slider.max === "" ? Number.POSITIVE_INFINITY : Number(slider.max),
            );
            numberInput.step = this.formatRangeDisplayValue(slider, slider.step && slider.step !== "any" ? Number(slider.step) : 1);
            numberInput.disabled = slider.disabled;

            const labelText = parent.querySelector("label, .light-label, .effect-label, .effect-layer-control-label, .accessory-label")?.textContent?.trim();
            if (labelText) {
                numberInput.setAttribute("aria-label", `${labelText} value`);
            }

            parent.classList.add("range-has-number");
            parent.insertBefore(numberInput, slider.nextSibling);
            this.rangeNumberInputs.set(slider, numberInput);

            const commit = (): void => {
                const parsed = Number(numberInput.value);
                if (!Number.isFinite(parsed)) {
                    this.syncRangeNumberInput(slider);
                    return;
                }

                const nextValue = this.formatRangeInputValue(
                    slider,
                    this.normalizeRangeInputValue(slider, this.parseRangeDisplayValue(slider, parsed)),
                );

                if (slider.value !== nextValue) {
                    slider.value = nextValue;
                }

                slider.dispatchEvent(new Event("input", { bubbles: true }));
                this.syncRangeNumberInput(slider);
            };

            slider.addEventListener("input", () => this.syncRangeNumberInput(slider));
            slider.addEventListener("change", () => this.syncRangeNumberInput(slider));
            installEnterCommitNumberInput(numberInput, {
                commit,
                revert: () => this.syncRangeNumberInput(slider),
            });

            this.syncRangeNumberInput(slider);
        }
    }

    private syncRangeNumberInput(slider: HTMLInputElement): void {
        const numberInput = this.rangeNumberInputs.get(slider);
        if (!numberInput) return;

        numberInput.disabled = slider.disabled;
        const parsed = Number(slider.value);
        if (!Number.isFinite(parsed)) return;

        const nextValue = this.formatRangeDisplayValue(slider, parsed);
        if (numberInput.value !== nextValue) {
            numberInput.value = nextValue;
        }
    }

    private getRangeDisplayScale(slider: HTMLInputElement): number {
        const parsed = Number(slider.dataset.displayScale ?? "1");
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    private getRangeDisplayDecimals(slider: HTMLInputElement): number {
        const parsed = Number.parseInt(slider.dataset.displayDecimals ?? "", 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : this.getRangeStepDecimals(slider.step);
    }

    private parseRangeDisplayValue(slider: HTMLInputElement, displayValue: number): number {
        return displayValue / this.getRangeDisplayScale(slider);
    }

    private formatRangeDisplayValue(slider: HTMLInputElement, internalValue: number): string {
        if (!Number.isFinite(internalValue)) return "";
        const displayValue = internalValue * this.getRangeDisplayScale(slider);
        const decimals = this.getRangeDisplayDecimals(slider);
        return decimals > 0
            ? String(Number(displayValue.toFixed(decimals)))
            : String(Math.round(displayValue));
    }

    private isRangeInputEditing(slider: HTMLInputElement): boolean {
        const activeElement = document.activeElement;
        return activeElement === slider || activeElement === this.rangeNumberInputs.get(slider);
    }

    private normalizeRangeInputValue(slider: HTMLInputElement, value: number): number {
        let next = value;
        const min = slider.min === "" ? -Infinity : Number(slider.min);
        const max = slider.max === "" ? Infinity : Number(slider.max);

        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);

        if (slider.step && slider.step !== "any") {
            const step = Number(slider.step);
            if (Number.isFinite(step) && step > 0) {
                const base = Number.isFinite(min) ? min : 0;
                next = base + Math.round((next - base) / step) * step;
                if (Number.isFinite(min)) next = Math.max(min, next);
                if (Number.isFinite(max)) next = Math.min(max, next);
            }
        }

        return next;
    }

    private formatRangeInputValue(slider: HTMLInputElement, value: number): string {
        const decimals = this.getRangeStepDecimals(slider.step);
        return decimals > 0
            ? String(Number(value.toFixed(decimals)))
            : String(Math.round(value));
    }

    private getRangeStepDecimals(stepValue: string): number {
        if (!stepValue || stepValue === "any") return 0;

        const normalized = stepValue.toLowerCase();
        if (normalized.includes("e-")) {
            const exponent = Number.parseInt(normalized.split("e-")[1] ?? "0", 10);
            return Number.isFinite(exponent) ? exponent : 0;
        }

        const decimalIndex = normalized.indexOf(".");
        return decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
    }

    private refreshShaderPanel(): void {
        this.shaderPanelController?.refresh();
    }

    private renderShaderCameraPostEffectsPanel(): void {
        if (
            !this.shaderModelSelect ||
            !this.shaderPresetSelect ||
            !this.shaderApplySelectedButton ||
            !this.shaderApplyAllButton ||
            !this.shaderResetButton ||
            !this.shaderPanelNote ||
            !this.postEffectPanelHost
        ) {
            return;
        }

        this.shaderPanelController?.syncModelSelectorFromInfo();
        const infoModelState = this.getInfoModelSelectState();
        this.shaderModelSelect.value = MODEL_INFO_CAMERA_SELECT_VALUE;
        this.shaderModelSelect.disabled = infoModelState.disabled;
        this.shaderPresetSelect.innerHTML = `<option value="postfx">${t("shader.camera.postfx")}</option>`;
        this.shaderPresetSelect.value = "postfx";
        this.shaderPresetSelect.disabled = true;
        this.shaderApplySelectedButton.disabled = true;
        this.shaderApplyAllButton.disabled = true;
        this.shaderResetButton.disabled = true;
        this.shaderPanelNote.textContent = t("shader.camera.note");
        const lutPresetOptionsHtml = this.lutPanelController?.buildPresetOptionsHtml() ?? "";

        this.postEffectPanelHost.innerHTML = `
            <div class="shader-postfx-controls">
                <div class="effect-row">
                    <span class="effect-label">Backend</span>
                    <select data-postfx-select="backend" class="effect-select" title="Post effect backend を切り替える。変更後に自動で再読み込みします">
                        <option value="classic">Classic</option>
                        <option value="frameGraph">Frame Graph PoC</option>
                    </select>
                    <span data-postfx-val="backend" class="effect-value">Classic</span>
                </div>
                <div class="effect-row" data-postfx-classic-only="color">
                    <span class="effect-label" data-i18n="shader.postfx.contrast">Contrast</span>
                    <input data-postfx="contrast" type="range" class="effect-slider" min="-100" max="200" value="0" step="1">
                    <span data-postfx-val="contrast" class="effect-value">0%</span>
                </div>
                <div class="effect-row" data-postfx-classic-only="color">
                    <span class="effect-label" data-i18n="shader.postfx.gamma">Gamma</span>
                    <input data-postfx="gamma" type="range" class="effect-slider" min="-100" max="100" value="0" step="1">
                    <span data-postfx-val="gamma" class="effect-value">0%</span>
                </div>
                <div class="postfx-backend-panel" data-postfx-backend-panel="classic">
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.exposure">Exposure</span>
                    <input data-postfx="exposure" type="range" class="effect-slider" min="0" max="8" value="1" step="0.01">
                    <span data-postfx-val="exposure" class="effect-value">x1.00</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.dithering">Dither</span>
                    <input data-postfx="dithering-intensity" type="range" class="effect-slider" min="0" max="1" value="0" step="0.0001">
                    <span data-postfx-val="dithering" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.vignette">Vignette</span>
                    <input data-postfx="vignette-weight" type="range" class="effect-slider" min="0" max="4" value="0" step="0.01">
                    <span data-postfx-val="vignette" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.chroma">Chroma</span>
                    <input data-postfx="chromatic-aberration" type="range" class="effect-slider" min="0" max="200" value="0" step="1">
                    <span data-postfx-val="chromatic-aberration" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.edgeBlur">EdgeBlur</span>
                    <input data-postfx="lens-edge-blur" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="lens-edge-blur" class="effect-value">0%</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.distortion">Distortion</span>
                    <input data-postfx="distortion-influence" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="distortion-influence" class="effect-value">0%</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.grain">Grain</span>
                    <input data-postfx="grain-intensity" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                    <span data-postfx-val="grain-intensity" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.sharpen">Sharpen</span>
                    <input data-postfx="sharpen-edge" type="range" class="effect-slider" min="0" max="400" value="0" step="1">
                    <span data-postfx-val="sharpen-edge" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.curves">Curves</span>
                    <input data-postfx="color-curves-saturation" type="range" class="effect-slider" min="-100" max="100" value="0" step="1">
                    <span data-postfx-val="color-curves-saturation" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.glow">Glow</span>
                    <input data-postfx="glow-intensity" type="range" class="effect-slider" min="0" max="100" value="50" step="1">
                    <span data-postfx-val="glow-intensity" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.lutSource">LUTSrc</span>
                    <select data-postfx-select="lut-source" class="effect-select">
                        <option value="builtin" data-i18n="shader.option.builtin">Builtin</option>
                        <option value="external-absolute" data-i18n="shader.option.externalAbsolute">External Abs</option>
                        <option value="project-relative" data-i18n="shader.option.projectLut">Project LUT</option>
                    </select>
                    <span data-postfx-val="lut-source" class="effect-value" data-i18n="shader.option.builtin">Builtin</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.lutFile">LUTFile</span>
                    <button data-postfx-btn="lut-file" type="button" class="effect-button" data-i18n="button.load">Load...</button>
                    <span data-postfx-val="lut-file" class="effect-value" data-i18n="option.none">None</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.motionBlur">MBlur</span>
                    <input data-postfx="motion-blur-strength" type="range" class="effect-slider" min="0" max="200" value="50" step="1">
                    <span data-postfx-val="motion-blur-strength" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.ssr">SSR</span>
                    <input data-postfx="ssr-strength" type="range" class="effect-slider" min="0" max="200" value="80" step="1">
                    <span data-postfx-val="ssr-strength" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row" style="display:none;">
                    <span class="effect-label" data-i18n="shader.postfx.volumetricLight">VLight</span>
                    <input data-postfx="vls-exposure" type="range" class="effect-slider" min="0" max="200" value="30" step="1">
                    <span data-postfx-val="vls-exposure" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.edge">Edge</span>
                    <input data-postfx="edge-width" type="range" class="effect-slider" min="0" max="200" value="0" step="1">
                    <span data-postfx-val="edge-width" class="effect-value">0%</span>
                </div>
                </div>
                <div class="postfx-backend-panel" data-postfx-backend-panel="classic">
                <div class="effect-row effect-row-toggle">
                    <span class="effect-label" data-i18n="shader.postfx.bloom">Bloom</span>
                    <label class="effect-check-wrap">
                        <input data-postfx-check="bloom" type="checkbox" class="effect-check">
                        <span data-i18n="status.on">On</span>
                    </label>
                    <span data-postfx-val="bloom-enabled" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="label.bloomStrength">Bloom���x</span>
                    <input data-postfx="bloom-weight" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                    <span data-postfx-val="bloom-weight" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.bloomThreshold">BloomTh</span>
                    <input data-postfx="bloom-threshold" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                    <span data-postfx-val="bloom-threshold" class="effect-value">1.00</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.bloomKernel">BloomK</span>
                    <input data-postfx="bloom-kernel" type="range" class="effect-slider" min="1" max="256" value="100" step="1">
                    <span data-postfx-val="bloom-kernel" class="effect-value">100</span>
                </div>
                </div>
                <div class="postfx-backend-panel" data-postfx-backend-panel="classic">
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.toneMap">ToneMap</span>
                    <select data-postfx-select="tone-mapping-type" class="effect-select">
                        <option value="-1" data-i18n="option.none">None</option>
                        <option value="0" data-i18n="shader.option.standard">Standard</option>
                        <option value="1" data-i18n="shader.option.aces">ACES</option>
                        <option value="2" data-i18n="shader.option.neutral">Neutral</option>
                    </select>
                    <span data-postfx-val="tone-mapping" class="effect-value" data-i18n="option.none">None</span>
                </div>
                </div>
                <div class="effect-row effect-row-check">
                    <span class="effect-label" data-i18n="shader.postfx.lut">LUT</span>
                    <label class="effect-check-wrap">
                        <input data-postfx-check="lut" type="checkbox" class="effect-check">
                        <span data-i18n="status.on">On</span>
                    </label>
                    <select data-postfx-select="lut-preset" class="effect-select">
                        ${lutPresetOptionsHtml}
                    </select>
                    <span data-postfx-val="lut" class="effect-value" data-i18n="status.off">OFF</span>
                </div>
                <div class="effect-row">
                    <span class="effect-label" data-i18n="shader.postfx.lutIntensity">LUTInt</span>
                    <input data-postfx="lut-intensity" type="range" class="effect-slider" min="0" max="100" value="100" step="1">
                    <span data-postfx-val="lut-intensity" class="effect-value">1.00</span>
                </div>
                <div class="postfx-backend-panel" data-postfx-backend-panel="frameGraph" hidden>
                    <div class="postfx-backend-note">
                        <strong>Frame Graph</strong><br>
                        Experimental backend. Gamma / Contrast, LUT, SSAO2, DoF, Bloom, Sharpen, Grain, Chroma, Vignette, EdgeBlur, Distortion, and FXAA are available above.
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">Pass</span>
                        <span class="effect-value">Image</span>
                        <span class="effect-value">SSR</span>
                        <span class="effect-value">SSAO</span>
                        <span class="effect-value">DoF</span>
                        <span class="effect-value">Bloom</span>
                        <span class="effect-value">LUT</span>
                        <span class="effect-value">Color</span>
                        <span class="effect-value">Sharp</span>
                        <span class="effect-value">Grain</span>
                        <span class="effect-value">Chroma</span>
                        <span class="effect-value">Vignette</span>
                        <span class="effect-value">EdgeBlur</span>
                        <span class="effect-value">Distort</span>
                        <span class="effect-value">FXAA</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.contrast">Contrast</span>
                        <input data-postfx="frame-graph-contrast" type="range" class="effect-slider" min="-100" max="200" value="0" step="1">
                        <span data-postfx-val="frame-graph-contrast" class="effect-value">0%</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.gamma">Gamma</span>
                        <input data-postfx="frame-graph-gamma" type="range" class="effect-slider" min="-100" max="100" value="0" step="1">
                        <span data-postfx-val="frame-graph-gamma" class="effect-value">0%</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.chroma">Chroma</span>
                        <input data-postfx="frame-graph-chromatic-aberration" type="range" class="effect-slider" min="0" max="200" value="0" step="1">
                        <span data-postfx-val="frame-graph-chromatic-aberration" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.vignette">Vignette</span>
                        <input data-postfx="frame-graph-vignette-weight" type="range" class="effect-slider" min="0" max="4" value="0" step="0.01">
                        <span data-postfx-val="frame-graph-vignette-weight" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.edgeBlur">EdgeBlur</span>
                        <input data-postfx="frame-graph-edge-blur" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                        <span data-postfx-val="frame-graph-edge-blur" class="effect-value">0%</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.distortion">Distortion</span>
                        <input data-postfx="frame-graph-distortion-influence" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                        <span data-postfx-val="frame-graph-distortion-influence" class="effect-value">0%</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.grain">Grain</span>
                        <input data-postfx="frame-graph-grain-intensity" type="range" class="effect-slider" min="0" max="100" value="0" step="1">
                        <span data-postfx-val="frame-graph-grain-intensity" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.sharpen">Sharpen</span>
                        <input data-postfx="frame-graph-sharpen-edge" type="range" class="effect-slider" min="0" max="400" value="0" step="1">
                        <span data-postfx-val="frame-graph-sharpen-edge" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row effect-row-toggle">
                        <span class="effect-label">SSR</span>
                        <label class="effect-check-wrap">
                            <input data-frame-graph-ssr-check="enabled" type="checkbox" class="effect-check">
                            <span data-i18n="status.on">On</span>
                        </label>
                        <span data-frame-graph-ssr-val="enabled" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">SSR Strength</span>
                        <input data-frame-graph-ssr="strength" type="range" class="effect-slider" min="0" max="200" value="30" step="1">
                        <span data-frame-graph-ssr-val="strength" class="effect-value">0.30</span>
                    </div>
                    <div class="effect-row effect-row-toggle">
                        <span class="effect-label">SSAO</span>
                        <label class="effect-check-wrap">
                            <input data-frame-graph-ssao-check="enabled" type="checkbox" class="effect-check">
                            <span data-i18n="status.on">On</span>
                        </label>
                        <span data-frame-graph-ssao-val="enabled" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">SSAO Strength</span>
                        <input data-frame-graph-ssao="strength" type="range" class="effect-slider" min="0" max="100" value="50" step="1">
                        <span data-frame-graph-ssao-val="strength" class="effect-value">0.50</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">SSAO Radius</span>
                        <input data-frame-graph-ssao="radius" type="range" class="effect-slider" min="1" max="500" value="300" step="1">
                        <span data-frame-graph-ssao-val="radius" class="effect-value">3.00</span>
                    </div>
                    <div class="effect-row effect-row-toggle">
                        <span class="effect-label">DoF</span>
                        <label class="effect-check-wrap">
                            <input data-frame-graph-dof-check="enabled" type="checkbox" class="effect-check">
                            <span data-i18n="status.on">On</span>
                        </label>
                        <span data-frame-graph-dof-val="enabled" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoFフォーカス</span>
                        <input data-frame-graph-dof="focus" type="range" class="effect-slider" min="100" max="300000" value="55000" step="100">
                        <span data-frame-graph-dof-val="focus" class="effect-value">55.0m</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoF中心モデル</span>
                        <select data-frame-graph-dof-select="target-model" class="effect-select"></select>
                        <span class="effect-value"></span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoF中心ボーン</span>
                        <select data-frame-graph-dof-select="target-bone" class="effect-select"></select>
                        <span class="effect-value"></span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">前後補正</span>
                        <input data-frame-graph-dof="focus-offset" type="range" class="effect-slider" min="-20000" max="20000" value="0" step="100">
                        <span data-frame-graph-dof-val="focus-offset" class="effect-value">0.0m</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoF F-stop</span>
                        <input data-frame-graph-dof="fstop" type="range" class="effect-slider" min="0" max="400" value="280" step="1">
                        <span data-frame-graph-dof-val="fstop" class="effect-value">2.80</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoF lens</span>
                        <input data-frame-graph-dof="lens-size" type="range" class="effect-slider" min="1" max="4096" value="30" step="1">
                        <span data-frame-graph-dof-val="lens-size" class="effect-value">30</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">DoF focal</span>
                        <input data-frame-graph-dof="focal-length" type="range" class="effect-slider" min="1" max="300" value="50" step="1">
                        <span data-frame-graph-dof-val="focal-length" class="effect-value">50</span>
                    </div>
                    <div class="effect-row effect-row-toggle">
                        <span class="effect-label" data-i18n="shader.postfx.bloom">Bloom</span>
                        <label class="effect-check-wrap">
                            <input data-postfx-check="frame-graph-bloom" type="checkbox" class="effect-check">
                            <span data-i18n="status.on">On</span>
                        </label>
                        <span data-postfx-val="frame-graph-bloom-enabled" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="label.bloomStrength">Bloom・ｽ・ｽ・ｽx</span>
                        <input data-postfx="frame-graph-bloom-weight" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                        <span data-postfx-val="frame-graph-bloom-weight" class="effect-value" data-i18n="status.off">OFF</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.bloomThreshold">BloomTh</span>
                        <input data-postfx="frame-graph-bloom-threshold" type="range" class="effect-slider" min="0" max="200" value="100" step="1">
                        <span data-postfx-val="frame-graph-bloom-threshold" class="effect-value">1.00</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label" data-i18n="shader.postfx.bloomKernel">BloomK</span>
                        <input data-postfx="frame-graph-bloom-kernel" type="range" class="effect-slider" min="1" max="256" value="100" step="1">
                        <span data-postfx-val="frame-graph-bloom-kernel" class="effect-value">100</span>
                    </div>
                </div>
            </div>
        `;
        applyI18nToDom(this.postEffectPanelHost);

        const postFxControls = this.postEffectPanelHost.querySelector<HTMLElement>(".shader-postfx-controls");
        if (
            !postFxControls ||
            !this.colorPostFxController?.connect(postFxControls) ||
            !this.lutPanelController?.connect(postFxControls) ||
            !this.modelEdgeController?.connect(postFxControls) ||
            !this.lensEffectController?.connect(postFxControls) ||
            !this.bloomToneMapController?.connect(postFxControls) ||
            !this.experimentalPostFxController?.connect(postFxControls)
        ) {
            return;
        }
        this.dofPanelController?.attachControlsToShaderPanel(postFxControls);
        this.installPostEffectBackendControls(postFxControls);
        this.installFrameGraphLensEffectControls(postFxControls);
        this.installFrameGraphSsrControls(postFxControls);
        this.installFrameGraphSsaoControls(postFxControls);
        this.installFrameGraphDofControls(postFxControls);
        this.installRangeNumberInputs(postFxControls);
        this.refreshFrameGraphPostAddUi();
    }

    private applyLocalizedUiState(): void {
        this.sceneEnvironmentUiController?.refresh();
        this.runtimeFeatureUiController?.refresh();
        this.layoutUiController?.refreshLocalizedState();
        this.updateInfoActionButtons();
        this.exportUiController?.refreshLocalizedState();
        this.fogPanelController?.refresh();
        this.syncToolbarLocaleSelect();
        this.syncRuntimeModeSelect();
        this.syncPostEffectBackendSelect();
    }

    private getSelectedToolbarLocale(): UiLocale | null {
        if (!this.toolbarLocaleSelect) return null;
        const value = this.toolbarLocaleSelect.value;
        return value === "ja"
            || value === "en"
            || value === "zh-Hant"
            || value === "zh-Hans"
            || value === "ko"
            ? value
            : null;
    }

    private syncToolbarLocaleSelect(): void {
        if (!this.toolbarLocaleSelect) return;
        const locale = getLocale();
        if (this.toolbarLocaleSelect.value !== locale) {
            this.toolbarLocaleSelect.value = locale;
        }
    }

    private getSelectedRuntimeMode(): "classic" | "wasm" | null {
        if (!this.toolbarRuntimeModeSelect) return null;
        const value = this.toolbarRuntimeModeSelect.value;
        return value === "classic" || value === "wasm" ? value : null;
    }

    private getConfiguredRuntimeMode(): "classic" | "wasm" {
        try {
            return localStorage.getItem(UIController.RUNTIME_MODE_STORAGE_KEY) === "wasm" ? "wasm" : "classic";
        } catch {
            return "classic";
        }
    }

    private syncRuntimeModeSelect(): void {
        if (!this.toolbarRuntimeModeSelect) return;
        const mode = this.getConfiguredRuntimeMode();
        if (this.toolbarRuntimeModeSelect.value !== mode) {
            this.toolbarRuntimeModeSelect.value = mode;
        }
    }

    private getSelectedPostEffectBackend(select: HTMLSelectElement | null = null): PostEffectBackend | null {
        const targetSelect = select ?? this.getPostEffectBackendSelectElement();
        if (!targetSelect) return null;
        const value = targetSelect.value;
        if (value === "classic" || value === "frameGraph") {
            return value;
        }
        return null;
    }

    private getConfiguredPostEffectBackend(): PostEffectBackend {
        try {
            return normalizePostEffectBackend(localStorage.getItem(POST_EFFECT_BACKEND_STORAGE_KEY));
        } catch {
            return "classic";
        }
    }

    private syncPostEffectBackendSelect(): void {
        const select = this.getPostEffectBackendSelectElement();
        const backend = this.getConfiguredPostEffectBackend();
        if (select && select.value !== backend) {
            select.value = backend;
        }
        this.applyPostEffectBackendPanelState(
            select?.closest(".shader-postfx-controls") as HTMLElement | null,
            backend,
        );
        this.refreshFrameGraphPostAddUi();
    }

    private getPostEffectBackendSelectElement(): HTMLSelectElement | null {
        return this.postEffectPanelHost?.querySelector<HTMLSelectElement>('select[data-postfx-select="backend"]') ?? null;
    }

    private setupPostEffectAddControls(): void {
        this.postEffectAddButton?.addEventListener("click", () => {
            this.setPostEffectAddPanelOpen(this.postEffectAddPanel?.hidden ?? true);
        });

        this.postEffectEnableFrameGraphButton?.addEventListener("click", () => {
            this.switchPostEffectBackendToFrameGraph();
        });

        this.postEffectReloadFrameGraphButton?.addEventListener("click", () => {
            this.reloadFrameGraphPostEffectsBackend();
        });

        this.postEffectAddPanel?.querySelectorAll<HTMLButtonElement>("[data-effect-add-post]").forEach((button) => {
            button.addEventListener("click", () => {
                const effectId = button.dataset.effectAddPost ?? "";
                if (!this.isFrameGraphPostAddEffectId(effectId)) return;
                this.addFrameGraphPostEffect(effectId);
                this.setPostEffectAddPanelOpen(false);
            });
        });

        document.addEventListener("click", (event) => {
            if (this.postEffectAddPanel?.hidden ?? true) return;
            const target = event.target instanceof Node ? event.target : null;
            if (!target) return;
            if (this.postEffectAddPanel?.contains(target) || this.postEffectAddButton?.contains(target)) {
                return;
            }
            this.setPostEffectAddPanelOpen(false);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || (this.postEffectAddPanel?.hidden ?? true)) return;
            this.setPostEffectAddPanelOpen(false);
            this.postEffectAddButton?.focus();
        });

        this.postEffectStackList?.addEventListener("change", (event) => {
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            const effectId = input?.dataset.effectStackToggle ?? "";
            if (!input || !this.isFrameGraphPostAddEffectId(effectId)) return;
            this.setFrameGraphPostEffectEnabled(effectId, input.checked);
        });

        this.postEffectStackList?.addEventListener("input", (event) => {
            const control = event.target instanceof HTMLInputElement ? event.target : null;
            if (!control?.dataset.effectStackControl) return;
            this.applyFrameGraphPostStackControl(control, false);
        });

        this.postEffectStackList?.addEventListener("change", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const control = target?.closest<HTMLInputElement | HTMLSelectElement>("[data-effect-stack-control]") ?? null;
            if (!control) return;
            this.applyFrameGraphPostStackControl(control, true);
        });

        this.postEffectStackList?.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const detailTarget = target?.closest<HTMLButtonElement>("[data-effect-stack-item]") ?? null;
            if (detailTarget) {
                const effectId = detailTarget.dataset.effectStackItem ?? "";
                if (!this.isFrameGraphPostAddEffectId(effectId)) return;
                this.expandedFrameGraphPostEffectId = this.expandedFrameGraphPostEffectId === effectId ? null : effectId;
                this.refreshFrameGraphPostAddUi();
                return;
            }

            const actionButton = target?.closest<HTMLButtonElement>("[data-effect-stack-action]") ?? null;
            if (actionButton) {
                const action = actionButton.dataset.effectStackAction ?? "";
                void this.applyFrameGraphPostStackAction(action);
                return;
            }

            const removeButton = target?.closest<HTMLButtonElement>("[data-effect-stack-remove]") ?? null;
            const removeEffectId = removeButton?.dataset.effectStackRemove ?? "";
            if (removeButton && this.isFrameGraphPostAddEffectId(removeEffectId)) {
                this.removeFrameGraphPostEffect(removeEffectId);
            }
        });

        this.postEffectStackList?.addEventListener("dragstart", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const handle = target?.closest<HTMLElement>("[data-effect-stack-drag]") ?? null;
            const effectId = handle?.dataset.effectStackDrag ?? "";
            if (!handle || !this.isFrameGraphPostAddEffectId(effectId)) {
                return;
            }
            this.draggingFrameGraphPostEffectId = effectId;
            event.dataTransfer?.setData("text/plain", effectId);
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
            }
        });

        this.postEffectStackList?.addEventListener("dragover", (event) => {
            if (!this.draggingFrameGraphPostEffectId) return;
            const row = this.getFrameGraphPostStackDropRow(event.target);
            if (!row) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            this.updateFrameGraphPostStackDropMarker(row, event);
        });

        this.postEffectStackList?.addEventListener("drop", (event) => {
            const draggedId = this.draggingFrameGraphPostEffectId
                ?? event.dataTransfer?.getData("text/plain")
                ?? "";
            const row = this.getFrameGraphPostStackDropRow(event.target);
            const targetId = row?.dataset.effectStackRow ?? "";
            if (!this.isFrameGraphPostAddEffectId(draggedId) || !this.isFrameGraphPostAddEffectId(targetId)) {
                this.clearFrameGraphPostStackDropMarkers();
                return;
            }
            event.preventDefault();
            const placement = this.getFrameGraphPostStackDropPlacement(row, event);
            this.moveFrameGraphPostEffectToDisplayPosition(draggedId, targetId, placement);
            this.clearFrameGraphPostStackDropMarkers();
            this.draggingFrameGraphPostEffectId = null;
        });

        this.postEffectStackList?.addEventListener("dragend", () => {
            this.draggingFrameGraphPostEffectId = null;
            this.clearFrameGraphPostStackDropMarkers();
        });

        this.postEffectStackList?.addEventListener("dragleave", (event) => {
            const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
            if (related && this.postEffectStackList?.contains(related)) {
                return;
            }
            this.clearFrameGraphPostStackDropMarkers();
        });

        this.refreshFrameGraphPostAddUi();
    }

    private isFrameGraphPostAddEffectId(value: string): value is FrameGraphPostAddEffectId {
        return isFrameGraphPostEffectId(value);
    }

    private switchPostEffectBackendToFrameGraph(): void {
        if (this.getConfiguredPostEffectBackend() === "frameGraph") {
            this.refreshFrameGraphPostAddUi();
            return;
        }

        try {
            localStorage.setItem(POST_EFFECT_BACKEND_STORAGE_KEY, "frameGraph");
        } catch {
            this.showToast(t("effect.frameGraphPost.backendSaveFailed"), "error");
            return;
        }

        this.setStatus("PostFX: Frame Graph / reloading...", true);
        window.setTimeout(() => {
            window.location.reload();
        }, 120);
    }

    private reloadFrameGraphPostEffectsBackend(): void {
        if (this.getConfiguredPostEffectBackend() !== "frameGraph") {
            this.showToast(t("effect.frameGraphPost.backendRequired"), "info");
            return;
        }

        this.setPostEffectAddPanelOpen(false);
        if (this.postEffectReloadFrameGraphButton) {
            this.postEffectReloadFrameGraphButton.disabled = true;
        }
        try {
            const reloaded = this.mmdManager.reloadFrameGraphPostEffectsBackend();
            this.showToast(
                t(reloaded
                    ? "effect.frameGraphPost.reloaded"
                    : "effect.frameGraphPost.reloadFailed"),
                reloaded ? "success" : "error",
            );
        } catch {
            this.showToast(t("effect.frameGraphPost.reloadFailed"), "error");
        } finally {
            this.refreshFrameGraphPostAddUi();
        }
    }

    private applyFrameGraphPostEffectDefaultValues(effectId: FrameGraphPostAddEffectId): void {
        switch (effectId) {
            case "bloom":
                this.mmdManager.postEffectBloomWeight = Math.max(this.mmdManager.postEffectBloomWeight, 1);
                this.mmdManager.postEffectBloomThreshold = Math.max(this.mmdManager.postEffectBloomThreshold, 1);
                this.mmdManager.postEffectBloomKernel = Math.max(this.mmdManager.postEffectBloomKernel, 128);
                break;
            case "dof":
                this.applySimplifiedDofDefaults();
                this.mmdManager.dofLensSize = Math.max(this.mmdManager.dofLensSize, 1000);
                this.mmdManager.dofFocalLength = Math.max(this.mmdManager.dofFocalLength, 50);
                break;
            case "luminous":
                this.mmdManager.postEffectGlowIntensity = Math.max(this.mmdManager.postEffectGlowIntensity, 1.0);
                this.mmdManager.postEffectGlowThreshold = Math.min(this.mmdManager.postEffectGlowThreshold, 0.15);
                this.mmdManager.postEffectGlowKernel = Math.max(this.mmdManager.postEffectGlowKernel, 48);
                break;
            case "lut":
                this.mmdManager.postEffectLutIntensity = Math.max(this.mmdManager.postEffectLutIntensity, 1);
                break;
            case "ssao":
                this.mmdManager.postEffectSsaoStrength = this.mmdManager.postEffectSsaoStrength > 0.00001
                    ? this.mmdManager.postEffectSsaoStrength
                    : 0.5;
                this.mmdManager.postEffectSsaoRadius = this.mmdManager.postEffectSsaoRadius > 0.00001
                    ? this.mmdManager.postEffectSsaoRadius
                    : 3;
                this.mmdManager.postEffectSsaoFadeEnd = this.mmdManager.postEffectSsaoFadeEnd >= 4
                    ? this.mmdManager.postEffectSsaoFadeEnd
                    : 100;
                this.mmdManager.postEffectSsaoDebugView = false;
                break;
            case "offsetShadow":
                this.mmdManager.postEffectOffsetShadowStrength = 0.35;
                this.mmdManager.postEffectOffsetShadowOffsetX = 0;
                this.mmdManager.postEffectOffsetShadowOffsetY = -30;
                this.mmdManager.postEffectOffsetShadowDepthBias = 0.2;
                this.mmdManager.postEffectOffsetShadowMaxDepth = 2;
                this.mmdManager.postEffectOffsetShadowDepthScale = 1;
                this.mmdManager.postEffectOffsetShadowThickness = 1;
                this.mmdManager.postEffectOffsetShadowSoftness = 0;
                this.mmdManager.postEffectOffsetShadowNormalInfluence = 0;
                break;
            case "offsetHighlight":
                this.mmdManager.postEffectOffsetHighlightStrength = 1;
                this.mmdManager.postEffectOffsetHighlightOffsetX = 0;
                this.mmdManager.postEffectOffsetHighlightOffsetY = -100;
                this.mmdManager.postEffectOffsetHighlightDepthThreshold = 0.1;
                this.mmdManager.postEffectOffsetHighlightNormalThreshold = 0;
                this.mmdManager.postEffectOffsetHighlightThickness = 1;
                this.mmdManager.postEffectOffsetHighlightSoftness = 0;
                this.mmdManager.postEffectOffsetHighlightDepthScale = 1;
                this.mmdManager.setPostEffectOffsetHighlightColor(1, 1, 1);
                this.mmdManager.postEffectOffsetHighlightDebugView = false;
                break;
            case "ssr":
                this.mmdManager.postEffectSsrStrength = Math.max(this.mmdManager.postEffectSsrStrength, 1);
                this.mmdManager.postEffectSsrStep = Math.max(this.mmdManager.postEffectSsrStep, 4);
                break;
            case "ssgi":
                break;
            case "ocean":
                this.mmdManager.postEffectOceanWaterHeight = 8;
                this.mmdManager.postEffectOceanWaveStrength = 0.7;
                this.mmdManager.postEffectOceanClarity = 0.85;
                this.mmdManager.postEffectOceanCausticsStrength = 1.1;
                this.mmdManager.postEffectOceanVolumeStrength = 0.65;
                break;
            case "vignette":
                this.mmdManager.postEffectVignetteWeight = Math.max(this.mmdManager.postEffectVignetteWeight, 2);
                break;
            case "grain":
                this.mmdManager.postEffectGrainIntensity = Math.max(this.mmdManager.postEffectGrainIntensity, 50);
                break;
            case "sharpen":
                this.mmdManager.postEffectSharpenEdge = Math.max(this.mmdManager.postEffectSharpenEdge, 2);
                break;
            case "chromatic":
                this.mmdManager.postEffectChromaticAberration = Math.max(this.mmdManager.postEffectChromaticAberration, 100);
                break;
            case "edgeBlur":
                this.mmdManager.dofLensEdgeBlur = Math.max(this.mmdManager.dofLensEdgeBlur, 0.5);
                break;
            case "distortion":
                this.mmdManager.dofLensDistortionInfluence = Math.max(this.mmdManager.dofLensDistortionInfluence, 0.5);
                break;
        }
    }

    private addFrameGraphPostEffect(effectId: FrameGraphPostAddEffectId): void {
        if (this.getConfiguredPostEffectBackend() !== "frameGraph") {
            this.showToast(t("effect.frameGraphPost.backendRequired"), "info");
            this.refreshFrameGraphPostAddUi();
            return;
        }

        const wasActive = this.mmdManager.isFrameGraphPostEffectActive(effectId);
        const previousStackIds = [...this.mmdManager.getFrameGraphPostEffectStackIds()];
        this.applyFrameGraphPostEffectDefaultValues(effectId);
        switch (effectId) {
            case "bloom":
                this.mmdManager.postEffectBloomEnabled = true;
                break;
            case "dof":
                this.mmdManager.dofEnabled = true;
                break;
            case "luminous":
                this.mmdManager.postEffectGlowEnabled = true;
                break;
            case "lut":
                this.mmdManager.postEffectLutEnabled = true;
                break;
            case "ssao":
                this.mmdManager.postEffectSsaoEnabled = true;
                break;
            case "offsetShadow":
                this.mmdManager.postEffectOffsetShadowEnabled = true;
                break;
            case "offsetHighlight":
                this.mmdManager.postEffectOffsetHighlightEnabled = true;
                break;
            case "ssr":
                this.mmdManager.postEffectSsrEnabled = true;
                break;
            case "ssgi":
                break;
            case "ocean":
                break;
            case "vignette":
                this.mmdManager.postEffectVignetteEnabled = true;
                break;
            case "grain":
                break;
            case "sharpen":
                break;
            case "chromatic":
                break;
            case "edgeBlur":
                break;
            case "distortion":
                break;
        }
        const nextStackIds = addFrameGraphPostEffectId(previousStackIds, effectId);
        const stackChanged = !this.areFrameGraphPostEffectIdsEqual(previousStackIds, nextStackIds);
        this.mmdManager.setFrameGraphPostEffectStackIds(nextStackIds);
        if (!stackChanged && wasActive !== this.mmdManager.isFrameGraphPostEffectActive(effectId)) {
            this.mmdManager.refreshFrameGraphPostEffectsBackendForStackStateChange();
        }

        this.expandedFrameGraphPostEffectId = effectId;
        this.refreshFrameGraphPostAddUi();
        this.showToast(t("effect.frameGraphPost.effectAdded", { name: this.getFrameGraphPostEffectLabel(effectId) }), "success");
    }

    private removeFrameGraphPostEffect(effectId: FrameGraphPostAddEffectId): void {
        const currentStackIds = [...this.mmdManager.getFrameGraphPostEffectStackIds()];
        if (!currentStackIds.includes(effectId)) {
            return;
        }
        this.mmdManager.setFrameGraphPostEffectStackIds(
            currentStackIds.filter((id) => id !== effectId),
        );
        if (this.expandedFrameGraphPostEffectId === effectId) {
            this.expandedFrameGraphPostEffectId = null;
        }
        this.refreshFrameGraphPostAddUi();
        this.showToast(t("effect.frameGraphPost.effectRemoved", {
            name: this.getFrameGraphPostEffectLabel(effectId),
        }), "success");
    }

    private setFrameGraphPostEffectEnabled(effectId: FrameGraphPostAddEffectId, enabled: boolean): void {
        const effect = FRAME_GRAPH_POST_ADD_EFFECTS.find((candidate) => candidate.id === effectId);
        if (!effect) return;
        effect.setActive(this.mmdManager, enabled);
        this.refreshFrameGraphPostAddUi();
    }

    private getFrameGraphPostEffectLabel(effectId: FrameGraphPostAddEffectId): string {
        const effect = FRAME_GRAPH_POST_ADD_EFFECTS.find((candidate) => candidate.id === effectId);
        return effect ? t(effect.labelKey) : effectId;
    }

    private areFrameGraphPostEffectIdsEqual(
        a: readonly FrameGraphPostEffectId[],
        b: readonly FrameGraphPostEffectId[],
    ): boolean {
        return a.length === b.length && a.every((id, index) => id === b[index]);
    }

    private getFrameGraphPostStackDropRow(target: EventTarget | null): HTMLElement | null {
        return target instanceof Element
            ? target.closest<HTMLElement>("[data-effect-stack-row]")
            : null;
    }

    private getFrameGraphPostStackDropPlacement(row: HTMLElement, event: DragEvent): "before" | "after" {
        const rect = row.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }

    private updateFrameGraphPostStackDropMarker(row: HTMLElement, event: DragEvent): void {
        const placement = this.getFrameGraphPostStackDropPlacement(row, event);
        this.clearFrameGraphPostStackDropMarkers();
        row.classList.toggle("effect-layer-placeholder--drop-before", placement === "before");
        row.classList.toggle("effect-layer-placeholder--drop-after", placement === "after");
    }

    private clearFrameGraphPostStackDropMarkers(): void {
        this.postEffectStackList
            ?.querySelectorAll<HTMLElement>(".effect-layer-placeholder--drop-before, .effect-layer-placeholder--drop-after")
            .forEach((row) => {
                row.classList.remove("effect-layer-placeholder--drop-before", "effect-layer-placeholder--drop-after");
            });
    }

    private moveFrameGraphPostEffectToDisplayPosition(
        draggedId: FrameGraphPostAddEffectId,
        targetId: FrameGraphPostAddEffectId,
        placement: "before" | "after",
    ): void {
        if (draggedId === targetId) {
            return;
        }
        const displayIds = [...this.mmdManager.getFrameGraphPostEffectStackIds()].reverse();
        const withoutDragged = displayIds.filter((id) => id !== draggedId);
        const targetIndex = withoutDragged.indexOf(targetId);
        if (targetIndex < 0) {
            return;
        }
        const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
        withoutDragged.splice(insertIndex, 0, draggedId);
        this.mmdManager.setFrameGraphPostEffectStackIds(withoutDragged.reverse());
        this.expandedFrameGraphPostEffectId = draggedId;
        this.refreshFrameGraphPostAddUi();
    }

    private refreshFrameGraphPostAddUi(): void {
        const backend = this.getConfiguredPostEffectBackend();
        const frameGraphReady = backend === "frameGraph";

        this.postEffectEnableFrameGraphButton?.toggleAttribute("hidden", frameGraphReady);
        if (this.postEffectReloadFrameGraphButton) {
            this.postEffectReloadFrameGraphButton.disabled = !frameGraphReady;
        }
        this.postEffectAddPanel?.querySelectorAll<HTMLButtonElement>("[data-effect-add-post]").forEach((button) => {
            const effectId = button.dataset.effectAddPost ?? "";
            const known = this.isFrameGraphPostAddEffectId(effectId);
            button.disabled = !frameGraphReady || (known && this.isFrameGraphPostEffectInStack(effectId));
        });

        this.renderFrameGraphPostStack(frameGraphReady);
        if (this.postEffectStackList) {
            this.installRangeNumberInputs(this.postEffectStackList);
        }
    }

    private isFrameGraphPostEffectActive(effectId: FrameGraphPostAddEffectId): boolean {
        return FRAME_GRAPH_POST_ADD_EFFECTS.find((effect) => effect.id === effectId)?.isActive(this.mmdManager) ?? false;
    }

    private isFrameGraphPostEffectInStack(effectId: FrameGraphPostAddEffectId): boolean {
        return this.mmdManager.getFrameGraphPostEffectStackIds().includes(effectId)
            || this.isFrameGraphPostEffectActive(effectId);
    }

    private escapeEffectStackHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private toEffectStackHexColor(color: { r: number; g: number; b: number }): string {
        const toHex = (value: number): string => {
            const byte = Math.max(0, Math.min(255, Math.round(value * 255)));
            return byte.toString(16).padStart(2, "0");
        };
        return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
    }

    private readEffectStackHexColor(value: string): { r: number; g: number; b: number } | null {
        const match = /^#([0-9a-f]{6})$/i.exec(value);
        if (!match) return null;
        const hex = match[1];
        return {
            r: Number.parseInt(hex.slice(0, 2), 16) / 255,
            g: Number.parseInt(hex.slice(2, 4), 16) / 255,
            b: Number.parseInt(hex.slice(4, 6), 16) / 255,
        };
    }

    private getFrameGraphPostStackLutSourceLabel(): string {
        switch (this.mmdManager.postEffectLutSourceMode) {
            case "external-absolute":
                return "External";
            case "project-relative":
                return "Project";
            default:
                return "Builtin";
        }
    }

    private buildFrameGraphPostStackLutPresetOptionsHtml(): string {
        const currentValue = this.mmdManager.postEffectLutSourceMode === "builtin"
            ? this.mmdManager.postEffectLutPreset
            : (this.mmdManager.postEffectLutExternalPath ?? this.mmdManager.postEffectLutPreset);
        const optionsHtml = this.lutPanelController?.buildPresetOptionsHtml()
            ?? FRAME_GRAPH_STACK_LUT_PRESETS
                .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
                .join("");

        return optionsHtml.replace(
            `value="${this.escapeEffectStackHtml(currentValue)}"`,
            `value="${this.escapeEffectStackHtml(currentValue)}" selected`,
        );
    }

    private getFrameGraphPostStackLutPresetLabel(): string {
        if (this.mmdManager.postEffectLutSourceMode !== "builtin" && this.mmdManager.postEffectLutExternalPath) {
            return this.getBaseNameForRenderer(this.mmdManager.postEffectLutExternalPath);
        }
        return this.mmdManager.postEffectLutPreset;
    }

    private getFrameGraphPostStackDofResolvedModel(): { index: number; name: string; path: string } | null {
        const targetPath = this.mmdManager.getDofFocusTargetModelPath();
        if (!targetPath) return null;
        return this.mmdManager.getLoadedModels().find((model) => model.path === targetPath) ?? null;
    }

    private buildFrameGraphPostStackDofTargetModelOptionsHtml(): string {
        const resolvedModel = this.getFrameGraphPostStackDofResolvedModel();
        const cameraSelected = resolvedModel === null ? " selected" : "";
        const modelOptions = this.mmdManager.getLoadedModels()
            .map((model) => {
                const selected = resolvedModel?.index === model.index ? " selected" : "";
                return `<option value="${model.index}"${selected}>${this.escapeEffectStackHtml(model.name)}</option>`;
            })
            .join("");
        return `<option value=""${cameraSelected}>Camera</option>${modelOptions}`;
    }

    private buildFrameGraphPostStackDofTargetBoneOptionsHtml(): string {
        const resolvedModel = this.getFrameGraphPostStackDofResolvedModel();
        if (!resolvedModel) {
            return `<option value="" selected>${this.escapeEffectStackHtml(t("option.none"))}</option>`;
        }

        const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
        const boneNames = this.mmdManager.getModelBoneNames(resolvedModel.index);
        if (boneNames.length === 0) {
            return `<option value="" selected>${this.escapeEffectStackHtml(t("option.none"))}</option>`;
        }
        const selectedBoneName = targetBoneName && boneNames.includes(targetBoneName)
            ? targetBoneName
            : this.mmdManager.getPreferredDofFocusBoneName(resolvedModel.index);

        return boneNames.map((boneName) => {
            const selected = boneName === selectedBoneName ? " selected" : "";
            return `<option value="${this.escapeEffectStackHtml(boneName)}"${selected}>${this.escapeEffectStackHtml(boneName)}</option>`;
        }).join("");
    }

    private getFrameGraphPostStackDofTargetModelLabel(): string {
        return this.getFrameGraphPostStackDofResolvedModel()?.name ?? "Camera";
    }

    private getFrameGraphPostStackDofTargetBoneLabel(): string {
        return this.mmdManager.getDofFocusTargetBoneName() ?? "-";
    }

    private async applyFrameGraphPostStackAction(action: string): Promise<void> {
        if (action !== "lutFile") return;
        await this.lutPanelController?.chooseExternalLut();
        this.mmdManager.setFrameGraphPostEffectStackIds(addFrameGraphPostEffectId(
            this.mmdManager.getFrameGraphPostEffectStackIds(),
            "lut",
        ));
        this.expandedFrameGraphPostEffectId = "lut";
        this.refreshFrameGraphPostAddUi();
    }

    private applySimplifiedDofDefaults(): void {
        this.mmdManager.dofFStop = FIXED_DOF_FSTOP;
    }

    private getDofLensSizeSliderValue(): number {
        return Math.round(this.mmdManager.dofLensSize);
    }

    private renderFrameGraphPostEffectDetails(effect: FrameGraphPostAddEffect): string {
        const rows: string[] = [];
        const controlsDisabled = !effect.isActive(this.mmdManager);
        const disabledAttr = controlsDisabled ? " disabled" : "";
        const label = (key: string): string => this.escapeEffectStackHtml(t(`effect.frameGraphPost.controls.${key}`));
        const range = (
            field: FrameGraphEffectSliderField,
            label: string,
            actualValue: number,
            displayValue: string,
        ): string => `
            <div class="effect-layer-control-row">
                <span class="effect-layer-control-label">${this.escapeEffectStackHtml(label)}</span>
                <input class="effect-layer-control-slider" type="range" min="${FRAME_GRAPH_EFFECT_SLIDER_MIN}" max="${FRAME_GRAPH_EFFECT_SLIDER_MAX}" step="1" value="${toFrameGraphEffectSliderValue(field, actualValue)}" data-effect-stack-control="${field}"${disabledAttr}>
                <span class="effect-layer-control-value" data-effect-stack-value="${field}">${displayValue}</span>
            </div>
        `;
        const select = (
            field: string,
            label: string,
            optionsHtml: string,
            displayValue: string,
        ): string => `
            <div class="effect-layer-control-row">
                <span class="effect-layer-control-label">${this.escapeEffectStackHtml(label)}</span>
                <select class="effect-layer-control-select" data-effect-stack-control="${field}"${disabledAttr}>
                    ${optionsHtml}
                </select>
                <span class="effect-layer-control-value" data-effect-stack-value="${field}">${displayValue}</span>
            </div>
        `;
        const button = (
            action: string,
            label: string,
            buttonLabel: string,
            displayValue: string,
        ): string => `
            <div class="effect-layer-control-row">
                <span class="effect-layer-control-label">${this.escapeEffectStackHtml(label)}</span>
                <button class="effect-layer-control-button" type="button" data-effect-stack-action="${action}"${disabledAttr}>${buttonLabel}</button>
                <span class="effect-layer-control-value" data-effect-stack-value="${action}">${displayValue}</span>
            </div>
        `;
        const color = (
            field: string,
            label: string,
            value: string,
            displayValue: string,
        ): string => `
            <div class="effect-layer-control-row">
                <span class="effect-layer-control-label">${this.escapeEffectStackHtml(label)}</span>
                <input class="effect-layer-control-color" type="color" value="${value}" data-effect-stack-control="${field}"${disabledAttr}>
                <span class="effect-layer-control-value" data-effect-stack-value="${field}">${displayValue}</span>
            </div>
        `;

        switch (effect.id) {
            case "bloom": {
                const bloomColor = this.toEffectStackHexColor(this.mmdManager.getPostEffectBloomColor());
                rows.push(
                    color("bloomColor", label("color"), bloomColor, bloomColor),
                    range("bloomWeight", label("weight"), this.mmdManager.postEffectBloomWeight, this.mmdManager.postEffectBloomWeight.toFixed(2)),
                    range("bloomThreshold", label("threshold"), this.mmdManager.postEffectBloomThreshold, this.mmdManager.postEffectBloomThreshold.toFixed(2)),
                    range("bloomKernel", label("kernel"), this.mmdManager.postEffectBloomKernel, String(Math.round(this.mmdManager.postEffectBloomKernel))),
                );
                break;
            }
            case "luminous":
                rows.push(
                    range("luminousIntensity", label("intensity"), this.mmdManager.postEffectGlowIntensity, this.mmdManager.postEffectGlowIntensity.toFixed(2)),
                    range("luminousThreshold", label("threshold"), this.mmdManager.postEffectGlowThreshold, this.mmdManager.postEffectGlowThreshold.toFixed(2)),
                    range("luminousRadius", label("radius"), this.mmdManager.postEffectGlowKernel, `${Math.round(this.mmdManager.postEffectGlowKernel)}px`),
                );
                break;
            case "dof":
                this.applySimplifiedDofDefaults();
                rows.push(
                    select(
                        "dofTargetModel",
                        label("target"),
                        this.buildFrameGraphPostStackDofTargetModelOptionsHtml(),
                        this.getFrameGraphPostStackDofTargetModelLabel(),
                    ),
                    select(
                        "dofTargetBone",
                        label("bone"),
                        this.buildFrameGraphPostStackDofTargetBoneOptionsHtml(),
                        this.getFrameGraphPostStackDofTargetBoneLabel(),
                    ),
                    range("dofFocusOffset", label("offset"), this.mmdManager.dofAutoFocusNearOffsetMm, `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`),
                    range(
                        "dofLensSize",
                        label("lens"),
                        this.getDofLensSizeSliderValue(),
                        String(this.getDofLensSizeSliderValue()),
                    ),
                );
                break;
            case "lut":
                rows.push(select(
                    "lutSource",
                    label("source"),
                    `
                        <option value="builtin"${this.mmdManager.postEffectLutSourceMode === "builtin" ? " selected" : ""}>${this.escapeEffectStackHtml(t("shader.option.builtin"))}</option>
                        <option value="external-absolute"${this.mmdManager.postEffectLutSourceMode === "external-absolute" ? " selected" : ""}>${this.escapeEffectStackHtml(t("shader.option.externalAbsolute"))}</option>
                        <option value="project-relative"${this.mmdManager.postEffectLutSourceMode === "project-relative" ? " selected" : ""}>${this.escapeEffectStackHtml(t("shader.option.projectLut"))}</option>
                    `,
                    this.getFrameGraphPostStackLutSourceLabel(),
                ));
                rows.push(button(
                    "lutFile",
                    label("file"),
                    t("action.load"),
                    this.mmdManager.postEffectLutExternalPath
                        ? this.getBaseNameForRenderer(this.mmdManager.postEffectLutExternalPath)
                        : t("option.none"),
                ));
                rows.push(`
                    <div class="effect-layer-control-row">
                        <span class="effect-layer-control-label">${label("preset")}</span>
                        <select class="effect-layer-control-select" data-effect-stack-control="lutPreset"${disabledAttr}>
                            ${this.buildFrameGraphPostStackLutPresetOptionsHtml()}
                        </select>
                        <span class="effect-layer-control-value" data-effect-stack-value="lutPreset">${this.getFrameGraphPostStackLutPresetLabel()}</span>
                    </div>
                `);
                rows.push(range("lutIntensity", label("intensity"), this.mmdManager.postEffectLutIntensity, this.mmdManager.postEffectLutIntensity.toFixed(2)));
                break;
            case "motionBlur":
                rows.push(
                    range("motionBlurStrength", label("strength"), this.mmdManager.postEffectMotionBlurStrength, this.mmdManager.postEffectMotionBlurStrength.toFixed(2)),
                    range("motionBlurSamples", label("samples"), this.mmdManager.postEffectMotionBlurSamples, String(Math.round(this.mmdManager.postEffectMotionBlurSamples))),
                );
                break;
            case "ssao":
                rows.push(
                    range("ssaoStrength", label("strength"), this.mmdManager.postEffectSsaoStrength, this.mmdManager.postEffectSsaoStrength.toFixed(2)),
                    range("ssaoRadius", label("radius"), this.mmdManager.postEffectSsaoRadius, this.mmdManager.postEffectSsaoRadius.toFixed(2)),
                );
                break;
            case "ssgi":
                rows.push(
                    range("ssgiStrength", label("strength"), this.mmdManager.postEffectSsgiStrength, this.mmdManager.postEffectSsgiStrength.toFixed(2)),
                    range("ssgiSampleRadius", label("radius"), this.mmdManager.postEffectSsgiSampleRadius, `${Math.round(this.mmdManager.postEffectSsgiSampleRadius)}px`),
                );
                break;
            case "ocean":
                rows.push(
                    range("oceanWaterHeight", label("waterHeight"), this.mmdManager.postEffectOceanWaterHeight, this.mmdManager.postEffectOceanWaterHeight.toFixed(1)),
                    range("oceanWaveStrength", label("waves"), this.mmdManager.postEffectOceanWaveStrength, this.mmdManager.postEffectOceanWaveStrength.toFixed(2)),
                    range("oceanClarity", label("clarity"), this.mmdManager.postEffectOceanClarity, this.mmdManager.postEffectOceanClarity.toFixed(2)),
                    range("oceanCausticsStrength", label("caustics"), this.mmdManager.postEffectOceanCausticsStrength, this.mmdManager.postEffectOceanCausticsStrength.toFixed(2)),
                    range("oceanVolumeStrength", label("volumeLight"), this.mmdManager.postEffectOceanVolumeStrength, this.mmdManager.postEffectOceanVolumeStrength.toFixed(2)),
                );
                break;
            case "offsetShadow": {
                const offsetShadowColor = this.toEffectStackHexColor(this.mmdManager.getPostEffectOffsetShadowColor());
                rows.push(
                    color("offsetShadowColor", label("color"), offsetShadowColor, offsetShadowColor),
                    range("offsetShadowStrength", label("strength"), this.mmdManager.postEffectOffsetShadowStrength, this.mmdManager.postEffectOffsetShadowStrength.toFixed(2)),
                    range("offsetShadowOffsetX", label("offsetX"), this.mmdManager.postEffectOffsetShadowOffsetX, `${Math.round(this.mmdManager.postEffectOffsetShadowOffsetX)}px`),
                    range("offsetShadowOffsetY", label("offsetY"), this.mmdManager.postEffectOffsetShadowOffsetY, `${Math.round(this.mmdManager.postEffectOffsetShadowOffsetY)}px`),
                    range("offsetShadowDepthBias", label("minDepth"), this.mmdManager.postEffectOffsetShadowDepthBias, this.mmdManager.postEffectOffsetShadowDepthBias.toFixed(3)),
                    range("offsetShadowMaxDepth", label("maxDepth"), this.mmdManager.postEffectOffsetShadowMaxDepth, this.mmdManager.postEffectOffsetShadowMaxDepth.toFixed(3)),
                    range("offsetShadowDepthScale", label("depthScale"), this.mmdManager.postEffectOffsetShadowDepthScale, this.mmdManager.postEffectOffsetShadowDepthScale.toFixed(2)),
                );
                break;
            }
            case "offsetHighlight": {
                const offsetHighlightColor = this.toEffectStackHexColor(this.mmdManager.getPostEffectOffsetHighlightColor());
                const offsetHighlightStrength = Math.max(0, Math.min(1, this.mmdManager.postEffectOffsetHighlightStrength));
                rows.push(
                    color("offsetHighlightColor", label("color"), offsetHighlightColor, offsetHighlightColor),
                    range("offsetHighlightStrength", label("strength"), offsetHighlightStrength, offsetHighlightStrength.toFixed(2)),
                    range("offsetHighlightOffsetX", label("offsetX"), this.mmdManager.postEffectOffsetHighlightOffsetX, `${Math.round(this.mmdManager.postEffectOffsetHighlightOffsetX)}px`),
                    range("offsetHighlightOffsetY", label("offsetY"), this.mmdManager.postEffectOffsetHighlightOffsetY, `${Math.round(this.mmdManager.postEffectOffsetHighlightOffsetY)}px`),
                    range("offsetHighlightDepthScale", label("depthScale"), this.mmdManager.postEffectOffsetHighlightDepthScale, this.mmdManager.postEffectOffsetHighlightDepthScale.toFixed(2)),
                );
                break;
            }
            case "ssr":
                rows.push(
                    range("ssrStrength", label("strength"), this.mmdManager.postEffectSsrStrength, this.mmdManager.postEffectSsrStrength.toFixed(2)),
                    range("ssrStep", label("step"), this.mmdManager.postEffectSsrStep, String(Math.round(this.mmdManager.postEffectSsrStep))),
                );
                break;
            case "vignette":
                rows.push(range("vignetteWeight", label("weight"), this.mmdManager.postEffectVignetteWeight, this.mmdManager.postEffectVignetteWeight.toFixed(2)));
                break;
            case "grain":
                rows.push(range("grainIntensity", label("intensity"), this.mmdManager.postEffectGrainIntensity, `${Math.round(this.mmdManager.postEffectGrainIntensity)}%`));
                break;
            case "sharpen":
                rows.push(range("sharpenEdge", label("edge"), this.mmdManager.postEffectSharpenEdge, this.mmdManager.postEffectSharpenEdge.toFixed(2)));
                break;
            case "chromatic":
                rows.push(range("chromaticAberration", label("offset"), this.mmdManager.postEffectChromaticAberration, `${Math.round(this.mmdManager.postEffectChromaticAberration)}px`));
                break;
            case "edgeBlur":
                rows.push(range("edgeBlur", label("strength"), this.mmdManager.dofLensEdgeBlur, `${Math.round(this.mmdManager.dofLensEdgeBlur * 100)}%`));
                break;
            case "distortion":
                rows.push(range("distortion", label("influence"), this.mmdManager.dofLensDistortionInfluence, `${Math.round(this.mmdManager.dofLensDistortionInfluence * 100)}%`));
                break;
        }

        return `
            <div class="effect-layer-detail-controls">
                ${rows.join("")}
                <div class="effect-layer-control-row">
                    <span class="effect-layer-control-label"></span>
                    <button class="effect-layer-control-button" type="button" data-effect-stack-remove="${effect.id}">${this.escapeEffectStackHtml(t("effect.frameGraphPost.remove"))}</button>
                    <span class="effect-layer-control-value"></span>
                </div>
            </div>
        `;
    }

    private applyFrameGraphPostStackControl(control: HTMLInputElement | HTMLSelectElement, commit: boolean): void {
        const field = control.dataset.effectStackControl ?? "";
        const rawValue = control instanceof HTMLInputElement && control.type !== "color"
            ? Number(control.value)
            : control.value;
        const actualValue = typeof rawValue === "number" && isFrameGraphEffectSliderField(field)
            ? fromFrameGraphEffectSliderValue(field, rawValue)
            : rawValue;
        const effectId = this.getFrameGraphPostEffectIdForControlField(field);
        const wasActive = effectId ? this.mmdManager.isFrameGraphPostEffectActive(effectId) : false;

        switch (field) {
            case "bloomWeight":
                this.mmdManager.postEffectBloomWeight = Number(actualValue);
                break;
            case "bloomThreshold":
                this.mmdManager.postEffectBloomThreshold = Number(actualValue);
                break;
            case "bloomKernel":
                this.mmdManager.postEffectBloomKernel = Number(actualValue);
                break;
            case "bloomColor": {
                const colorValue = this.readEffectStackHexColor(String(rawValue));
                if (!colorValue) return;
                this.mmdManager.setPostEffectBloomColor(colorValue.r, colorValue.g, colorValue.b);
                break;
            }
            case "luminousIntensity":
                this.mmdManager.postEffectGlowIntensity = Number(actualValue);
                break;
            case "luminousThreshold":
                this.mmdManager.postEffectGlowThreshold = Number(actualValue);
                break;
            case "luminousRadius":
                this.mmdManager.postEffectGlowKernel = Number(actualValue);
                break;
            case "luminousGlareCount":
                this.mmdManager.postEffectGlowGlareCount = Number(rawValue);
                break;
            case "luminousGlareLength":
                this.mmdManager.postEffectGlowGlareLength = Number(rawValue);
                break;
            case "luminousGlareAngle":
                this.mmdManager.postEffectGlowGlareAngle = Number(rawValue);
                break;
            case "luminousGlarePower":
                this.mmdManager.postEffectGlowGlarePower = Number(rawValue) / 100;
                break;
            case "dofFocus":
                if (!this.mmdManager.dofAutoFocusEnabled) {
                    this.mmdManager.dofFocusDistanceMm = Number(rawValue);
                }
                break;
            case "dofTargetModel": {
                const modelIndex = Number.parseInt(String(rawValue), 10);
                if (Number.isNaN(modelIndex)) {
                    this.mmdManager.setDofFocusTargetByIndex(null, null);
                } else {
                    this.mmdManager.setDofFocusTargetByIndex(
                        modelIndex,
                        this.mmdManager.getPreferredDofFocusBoneName(modelIndex),
                    );
                }
                break;
            }
            case "dofTargetBone": {
                const resolvedModel = this.getFrameGraphPostStackDofResolvedModel();
                if (!resolvedModel) {
                    this.mmdManager.setDofFocusTargetByIndex(null, null);
                } else {
                    this.mmdManager.setDofFocusTargetByIndex(resolvedModel.index, String(rawValue) || null);
                }
                break;
            }
            case "dofFocusOffset":
                this.mmdManager.dofAutoFocusNearOffsetMm = Number(actualValue);
                break;
            case "dofFStop":
                this.applySimplifiedDofDefaults();
                break;
            case "dofLensSize":
                this.mmdManager.dofLensSize = Number(actualValue);
                break;
            case "dofFocalLength":
                this.mmdManager.dofFocalLength = Number(rawValue);
                break;
            case "lutPreset":
                if (this.mmdManager.postEffectLutSourceMode === "builtin") {
                    this.mmdManager.postEffectLutPreset = String(rawValue);
                }
                break;
            case "lutSource":
                if (rawValue === "builtin" || rawValue === "external-absolute" || rawValue === "project-relative") {
                    this.mmdManager.postEffectLutSourceMode = rawValue;
                }
                if (rawValue === "builtin") {
                    this.mmdManager.setPostEffectExternalLut(null, null, null);
                }
                break;
            case "lutIntensity":
                this.mmdManager.postEffectLutIntensity = Number(actualValue);
                break;
            case "motionBlurStrength":
                this.mmdManager.postEffectMotionBlurStrength = Number(actualValue);
                break;
            case "motionBlurSamples":
                this.mmdManager.postEffectMotionBlurSamples = Number(actualValue);
                break;
            case "ssaoStrength":
                this.mmdManager.postEffectSsaoStrength = Number(actualValue);
                this.mmdManager.postEffectSsaoDebugView = false;
                break;
            case "ssaoRadius":
                this.mmdManager.postEffectSsaoRadius = Number(actualValue);
                break;
            case "ssgiStrength":
                this.mmdManager.postEffectSsgiStrength = Number(actualValue);
                break;
            case "ssgiSampleRadius":
                this.mmdManager.postEffectSsgiSampleRadius = Number(actualValue);
                break;
            case "oceanWaterHeight":
                this.mmdManager.postEffectOceanWaterHeight = Number(actualValue);
                break;
            case "oceanWaveStrength":
                this.mmdManager.postEffectOceanWaveStrength = Number(actualValue);
                break;
            case "oceanClarity":
                this.mmdManager.postEffectOceanClarity = Number(actualValue);
                break;
            case "oceanCausticsStrength":
                this.mmdManager.postEffectOceanCausticsStrength = Number(actualValue);
                break;
            case "oceanVolumeStrength":
                this.mmdManager.postEffectOceanVolumeStrength = Number(actualValue);
                break;
            case "offsetShadowStrength":
                this.mmdManager.postEffectOffsetShadowStrength = Number(actualValue);
                break;
            case "offsetShadowOffsetX":
                this.mmdManager.postEffectOffsetShadowOffsetX = Number(actualValue);
                break;
            case "offsetShadowOffsetY":
                this.mmdManager.postEffectOffsetShadowOffsetY = Number(actualValue);
                break;
            case "offsetShadowDepthBias":
                this.mmdManager.postEffectOffsetShadowDepthBias = Number(actualValue);
                break;
            case "offsetShadowMaxDepth":
                this.mmdManager.postEffectOffsetShadowMaxDepth = Number(actualValue);
                break;
            case "offsetShadowDepthScale":
                this.mmdManager.postEffectOffsetShadowDepthScale = Number(actualValue);
                break;
            case "offsetShadowThickness":
                this.mmdManager.postEffectOffsetShadowThickness = Number(rawValue) / 100;
                break;
            case "offsetShadowSoftness":
                this.mmdManager.postEffectOffsetShadowSoftness = Number(rawValue) / 10;
                break;
            case "offsetShadowNormalInfluence":
                this.mmdManager.postEffectOffsetShadowNormalInfluence = Number(rawValue) / 100;
                break;
            case "offsetShadowColor": {
                const colorValue = this.readEffectStackHexColor(String(rawValue));
                if (!colorValue) return;
                this.mmdManager.setPostEffectOffsetShadowColor(colorValue.r, colorValue.g, colorValue.b);
                break;
            }
            case "offsetHighlightStrength":
                this.mmdManager.postEffectOffsetHighlightStrength = Number(actualValue);
                break;
            case "offsetHighlightOffsetX":
                this.mmdManager.postEffectOffsetHighlightOffsetX = Number(actualValue);
                break;
            case "offsetHighlightOffsetY":
                this.mmdManager.postEffectOffsetHighlightOffsetY = Number(actualValue);
                break;
            case "offsetHighlightDepthThreshold":
                this.mmdManager.postEffectOffsetHighlightDepthThreshold = Number(rawValue) / 1000;
                break;
            case "offsetHighlightNormalThreshold":
                this.mmdManager.postEffectOffsetHighlightNormalThreshold = Number(rawValue) / 100;
                break;
            case "offsetHighlightDepthScale":
                this.mmdManager.postEffectOffsetHighlightDepthScale = Number(actualValue);
                break;
            case "offsetHighlightThickness":
                this.mmdManager.postEffectOffsetHighlightThickness = Number(rawValue) / 100;
                break;
            case "offsetHighlightSoftness":
                this.mmdManager.postEffectOffsetHighlightSoftness = Number(rawValue) / 10;
                break;
            case "offsetHighlightColor": {
                const colorValue = this.readEffectStackHexColor(String(rawValue));
                if (!colorValue) return;
                this.mmdManager.setPostEffectOffsetHighlightColor(colorValue.r, colorValue.g, colorValue.b);
                break;
            }
            case "ssrStrength":
                this.mmdManager.postEffectSsrStrength = Number(actualValue);
                break;
            case "ssrStep":
                this.mmdManager.postEffectSsrStep = Number(actualValue);
                break;
            case "vignetteWeight":
                this.mmdManager.postEffectVignetteWeight = Number(actualValue);
                this.mmdManager.postEffectVignetteEnabled = this.mmdManager.postEffectVignetteWeight > 0.0001;
                break;
            case "grainIntensity":
                this.mmdManager.postEffectGrainIntensity = Number(actualValue);
                break;
            case "sharpenEdge":
                this.mmdManager.postEffectSharpenEdge = Number(actualValue);
                break;
            case "chromaticAberration":
                this.mmdManager.postEffectChromaticAberration = Number(actualValue);
                break;
            case "edgeBlur":
                this.mmdManager.dofLensEdgeBlur = Number(actualValue);
                break;
            case "distortion":
                this.mmdManager.dofLensDistortionInfluence = Number(actualValue);
                break;
            default:
                return;
        }

        this.updateFrameGraphPostStackControlValue(control);
        if (commit && effectId && wasActive !== this.mmdManager.isFrameGraphPostEffectActive(effectId)) {
            this.mmdManager.refreshFrameGraphPostEffectsBackendForStackStateChange();
        }
        if (commit) {
            this.refreshFrameGraphPostAddUi();
        }
    }

    private getFrameGraphPostEffectIdForControlField(field: string): FrameGraphPostAddEffectId | null {
        switch (field) {
            case "bloomWeight":
            case "bloomThreshold":
            case "bloomKernel":
            case "bloomColor":
                return "bloom";
            case "luminousIntensity":
            case "luminousThreshold":
            case "luminousRadius":
            case "luminousGlareCount":
            case "luminousGlareLength":
            case "luminousGlareAngle":
            case "luminousGlarePower":
                return "luminous";
            case "dofFocus":
            case "dofTargetModel":
            case "dofTargetBone":
            case "dofFocusOffset":
            case "dofFStop":
            case "dofLensSize":
            case "dofFocalLength":
                return "dof";
            case "lutPreset":
            case "lutSource":
            case "lutIntensity":
                return "lut";
            case "motionBlurStrength":
            case "motionBlurSamples":
                return "motionBlur";
            case "ssaoStrength":
            case "ssaoRadius":
                return "ssao";
            case "ssgiStrength":
            case "ssgiSampleRadius":
                return "ssgi";
            case "oceanWaterHeight":
            case "oceanWaveStrength":
            case "oceanClarity":
            case "oceanCausticsStrength":
            case "oceanVolumeStrength":
                return "ocean";
            case "offsetShadowStrength":
            case "offsetShadowOffsetX":
            case "offsetShadowOffsetY":
            case "offsetShadowDepthBias":
            case "offsetShadowMaxDepth":
            case "offsetShadowDepthScale":
            case "offsetShadowThickness":
            case "offsetShadowSoftness":
            case "offsetShadowNormalInfluence":
            case "offsetShadowColor":
                return "offsetShadow";
            case "offsetHighlightStrength":
            case "offsetHighlightOffsetX":
            case "offsetHighlightOffsetY":
            case "offsetHighlightDepthThreshold":
            case "offsetHighlightNormalThreshold":
            case "offsetHighlightDepthScale":
            case "offsetHighlightThickness":
            case "offsetHighlightSoftness":
            case "offsetHighlightColor":
                return "offsetHighlight";
            case "ssrStrength":
            case "ssrStep":
                return "ssr";
            case "vignetteWeight":
                return "vignette";
            case "grainIntensity":
                return "grain";
            case "sharpenEdge":
                return "sharpen";
            case "chromaticAberration":
                return "chromatic";
            case "edgeBlur":
                return "edgeBlur";
            case "distortion":
                return "distortion";
            default:
                return null;
        }
    }

    private updateFrameGraphPostStackControlValue(control: HTMLInputElement | HTMLSelectElement): void {
        const field = control.dataset.effectStackControl ?? "";
        const root = control.closest<HTMLElement>(".effect-layer-details");
        const valueElement = root?.querySelector<HTMLElement>(`[data-effect-stack-value="${field}"]`) ?? null;
        if (!valueElement) return;

        switch (field) {
            case "bloomWeight":
                valueElement.textContent = this.mmdManager.postEffectBloomWeight.toFixed(2);
                break;
            case "bloomThreshold":
                valueElement.textContent = this.mmdManager.postEffectBloomThreshold.toFixed(2);
                break;
            case "bloomKernel":
                valueElement.textContent = String(Math.round(this.mmdManager.postEffectBloomKernel));
                break;
            case "bloomColor":
                valueElement.textContent = this.toEffectStackHexColor(this.mmdManager.getPostEffectBloomColor());
                break;
            case "luminousIntensity":
                valueElement.textContent = this.mmdManager.postEffectGlowIntensity.toFixed(2);
                break;
            case "luminousThreshold":
                valueElement.textContent = this.mmdManager.postEffectGlowThreshold.toFixed(2);
                break;
            case "luminousRadius":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectGlowKernel)}px`;
                break;
            case "luminousGlareCount":
                valueElement.textContent = String(Math.round(this.mmdManager.postEffectGlowGlareCount));
                break;
            case "luminousGlareLength":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectGlowGlareLength)}px`;
                break;
            case "luminousGlareAngle":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectGlowGlareAngle)}deg`;
                break;
            case "luminousGlarePower":
                valueElement.textContent = this.mmdManager.postEffectGlowGlarePower.toFixed(2);
                break;
            case "dofFocus":
                valueElement.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
                break;
            case "dofTargetModel":
                valueElement.textContent = this.getFrameGraphPostStackDofTargetModelLabel();
                break;
            case "dofTargetBone":
                valueElement.textContent = this.getFrameGraphPostStackDofTargetBoneLabel();
                break;
            case "dofFocusOffset":
                valueElement.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
                break;
            case "dofFStop":
                valueElement.textContent = this.mmdManager.dofFStop.toFixed(2);
                break;
            case "dofLensSize":
                valueElement.textContent = String(this.getDofLensSizeSliderValue());
                break;
            case "dofFocalLength":
                valueElement.textContent = String(Math.round(this.mmdManager.dofFocalLength));
                break;
            case "lutPreset":
                valueElement.textContent = this.getFrameGraphPostStackLutPresetLabel();
                break;
            case "lutSource":
                valueElement.textContent = this.getFrameGraphPostStackLutSourceLabel();
                break;
            case "lutIntensity":
                valueElement.textContent = this.mmdManager.postEffectLutIntensity.toFixed(2);
                break;
            case "motionBlurStrength":
                valueElement.textContent = this.mmdManager.postEffectMotionBlurStrength.toFixed(2);
                break;
            case "motionBlurSamples":
                valueElement.textContent = String(Math.round(this.mmdManager.postEffectMotionBlurSamples));
                break;
            case "ssaoStrength":
                valueElement.textContent = this.mmdManager.postEffectSsaoStrength.toFixed(2);
                break;
            case "ssaoRadius":
                valueElement.textContent = this.mmdManager.postEffectSsaoRadius.toFixed(2);
                break;
            case "ssgiStrength":
                valueElement.textContent = this.mmdManager.postEffectSsgiStrength.toFixed(2);
                break;
            case "ssgiSampleRadius":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectSsgiSampleRadius)}px`;
                break;
            case "oceanWaterHeight":
                valueElement.textContent = this.mmdManager.postEffectOceanWaterHeight.toFixed(1);
                break;
            case "oceanWaveStrength":
                valueElement.textContent = this.mmdManager.postEffectOceanWaveStrength.toFixed(2);
                break;
            case "oceanClarity":
                valueElement.textContent = this.mmdManager.postEffectOceanClarity.toFixed(2);
                break;
            case "oceanCausticsStrength":
                valueElement.textContent = this.mmdManager.postEffectOceanCausticsStrength.toFixed(2);
                break;
            case "oceanVolumeStrength":
                valueElement.textContent = this.mmdManager.postEffectOceanVolumeStrength.toFixed(2);
                break;
            case "offsetShadowStrength":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowStrength.toFixed(2);
                break;
            case "offsetShadowOffsetX":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectOffsetShadowOffsetX)}px`;
                break;
            case "offsetShadowOffsetY":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectOffsetShadowOffsetY)}px`;
                break;
            case "offsetShadowDepthBias":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowDepthBias.toFixed(3);
                break;
            case "offsetShadowMaxDepth":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowMaxDepth.toFixed(3);
                break;
            case "offsetShadowDepthScale":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowDepthScale.toFixed(2);
                break;
            case "offsetShadowThickness":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowThickness.toFixed(2);
                break;
            case "offsetShadowSoftness":
                valueElement.textContent = `${this.mmdManager.postEffectOffsetShadowSoftness.toFixed(1)}px`;
                break;
            case "offsetShadowNormalInfluence":
                valueElement.textContent = this.mmdManager.postEffectOffsetShadowNormalInfluence.toFixed(2);
                break;
            case "offsetShadowColor":
                valueElement.textContent = this.toEffectStackHexColor(this.mmdManager.getPostEffectOffsetShadowColor());
                break;
            case "offsetHighlightStrength":
                valueElement.textContent = this.mmdManager.postEffectOffsetHighlightStrength.toFixed(2);
                break;
            case "offsetHighlightOffsetX":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectOffsetHighlightOffsetX)}px`;
                break;
            case "offsetHighlightOffsetY":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectOffsetHighlightOffsetY)}px`;
                break;
            case "offsetHighlightDepthThreshold":
                valueElement.textContent = this.mmdManager.postEffectOffsetHighlightDepthThreshold.toFixed(3);
                break;
            case "offsetHighlightNormalThreshold":
                valueElement.textContent = this.mmdManager.postEffectOffsetHighlightNormalThreshold.toFixed(2);
                break;
            case "offsetHighlightDepthScale":
                valueElement.textContent = this.mmdManager.postEffectOffsetHighlightDepthScale.toFixed(2);
                break;
            case "offsetHighlightThickness":
                valueElement.textContent = this.mmdManager.postEffectOffsetHighlightThickness.toFixed(2);
                break;
            case "offsetHighlightSoftness":
                valueElement.textContent = `${this.mmdManager.postEffectOffsetHighlightSoftness.toFixed(1)}px`;
                break;
            case "offsetHighlightColor":
                valueElement.textContent = this.toEffectStackHexColor(this.mmdManager.getPostEffectOffsetHighlightColor());
                break;
            case "ssrStrength":
                valueElement.textContent = this.mmdManager.postEffectSsrStrength.toFixed(2);
                break;
            case "ssrStep":
                valueElement.textContent = String(Math.round(this.mmdManager.postEffectSsrStep));
                break;
            case "vignetteWeight":
                valueElement.textContent = this.mmdManager.postEffectVignetteWeight.toFixed(2);
                break;
            case "grainIntensity":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectGrainIntensity)}%`;
                break;
            case "sharpenEdge":
                valueElement.textContent = this.mmdManager.postEffectSharpenEdge.toFixed(2);
                break;
            case "chromaticAberration":
                valueElement.textContent = `${Math.round(this.mmdManager.postEffectChromaticAberration)}px`;
                break;
            case "edgeBlur":
                valueElement.textContent = `${Math.round(this.mmdManager.dofLensEdgeBlur * 100)}%`;
                break;
            case "distortion":
                valueElement.textContent = `${Math.round(this.mmdManager.dofLensDistortionInfluence * 100)}%`;
                break;
        }
    }

    private renderFrameGraphPostStack(frameGraphReady: boolean): void {
        if (!this.postEffectStackList) return;
        const stackEffectIds = [...this.mmdManager.getFrameGraphPostEffectStackIds()];
        const effectById = new Map(FRAME_GRAPH_POST_ADD_EFFECTS.map((effect) => [effect.id, effect]));
        const stackEffects = stackEffectIds
            .map((id) => effectById.get(id) ?? null)
            .filter((effect): effect is FrameGraphPostAddEffect => effect !== null)
            .reverse();

        if (!frameGraphReady) {
            this.expandedFrameGraphPostEffectId = null;
            this.postEffectStackList.innerHTML = `
                <div class="effect-layer-placeholder">
                    <span class="effect-layer-name">${this.escapeEffectStackHtml(t("effect.frameGraphPost.backendRequired"))}</span>
                    <span class="effect-status-badge effect-status-badge--experimental">classic</span>
                </div>
            `;
            return;
        }

        if (stackEffects.length === 0) {
            this.expandedFrameGraphPostEffectId = null;
            this.postEffectStackList.innerHTML = `<div class="panel-empty-state">${this.escapeEffectStackHtml(t("effect.frameGraphPost.empty"))}</div>`;
            return;
        }

        if (!stackEffects.some((effect) => effect.id === this.expandedFrameGraphPostEffectId)) {
            this.expandedFrameGraphPostEffectId = null;
        }

        this.postEffectStackList.innerHTML = stackEffects.map((effect) => {
            const expanded = effect.id === this.expandedFrameGraphPostEffectId;
            const enabled = effect.isActive(this.mmdManager);
            const effectLabel = this.escapeEffectStackHtml(t(effect.labelKey));
            const toggleTitle = this.escapeEffectStackHtml(t("effect.frameGraphPost.toggleVisibility"));
            const dragTitle = this.escapeEffectStackHtml(t("effect.frameGraphPost.dragToReorder"));
            return `
                <div class="effect-layer-placeholder effect-layer-placeholder--active effect-layer-placeholder--check${enabled ? "" : " effect-layer-placeholder--off"}" data-effect-stack-row="${effect.id}">
                    <div class="effect-layer-header">
                        <label class="effect-layer-check-wrap" title="${toggleTitle}">
                            <input class="effect-layer-check" type="checkbox" data-effect-stack-toggle="${effect.id}"${enabled ? " checked" : ""}>
                        </label>
                        <button class="effect-layer-main" type="button" data-effect-stack-item="${effect.id}" aria-expanded="${expanded ? "true" : "false"}">
                            <span class="effect-layer-name">${effectLabel}</span>
                        </button>
                        <button class="effect-layer-drag-handle" type="button" draggable="true" data-effect-stack-drag="${effect.id}" title="${dragTitle}" aria-label="${dragTitle}">
                            <span class="effect-layer-drag-grip" aria-hidden="true"></span>
                        </button>
                    </div>
                    ${expanded ? `
                        <div class="effect-layer-details">
                            ${this.renderFrameGraphPostEffectDetails(effect)}
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("");
    }

    private installPostEffectBackendControls(root: HTMLElement): void {
        const select = root.querySelector<HTMLSelectElement>('select[data-postfx-select="backend"]');
        if (!select) return;

        this.syncPostEffectBackendSelect();
        select.addEventListener("change", () => {
            const nextBackend = this.getSelectedPostEffectBackend(select);
            if (!nextBackend) {
                this.syncPostEffectBackendSelect();
                return;
            }
            const currentBackend = this.getConfiguredPostEffectBackend();
            this.applyPostEffectBackendPanelState(root, nextBackend);
            if (nextBackend === currentBackend) return;

            try {
                localStorage.setItem(POST_EFFECT_BACKEND_STORAGE_KEY, nextBackend);
            } catch {
                this.syncPostEffectBackendSelect();
                this.showToast("PostFX backend setting could not be saved", "error");
                return;
            }

            this.setStatus(`PostFX: ${nextBackend === "frameGraph" ? "Frame Graph PoC" : "Classic"} / reloading...`, true);
            window.setTimeout(() => {
                window.location.reload();
            }, 120);
        });
    }

    private setPostEffectAddPanelOpen(open: boolean): void {
        if (!this.postEffectAddPanel) return;
        this.postEffectAddPanel.hidden = !open;
        this.postEffectAddButton?.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
            this.refreshFrameGraphPostAddUi();
        }
    }

    private installFrameGraphLensEffectControls(root: HTMLElement): void {
        const vignetteSlider = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-vignette-weight"]');
        const vignetteValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-vignette-weight"]');
        const edgeBlurSlider = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-edge-blur"]');
        const edgeBlurValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-edge-blur"]');
        const distortionSlider = root.querySelector<HTMLInputElement>('input[data-postfx="frame-graph-distortion-influence"]');
        const distortionValue = root.querySelector<HTMLElement>('span[data-postfx-val="frame-graph-distortion-influence"]');
        if (
            !vignetteSlider ||
            !vignetteValue ||
            !edgeBlurSlider ||
            !edgeBlurValue ||
            !distortionSlider ||
            !distortionValue
        ) {
            return;
        }

        const refreshValues = (): void => {
            const vignetteWeight = this.mmdManager.postEffectVignetteEnabled
                ? this.mmdManager.postEffectVignetteWeight
                : 0;
            vignetteSlider.value = Math.max(0, Math.min(4, vignetteWeight)).toFixed(2);
            vignetteValue.textContent = vignetteWeight > 0.0001
                ? this.mmdManager.postEffectVignetteWeight.toFixed(2)
                : t("status.off");

            const edgeBlurPercent = Math.max(0, Math.min(100, Math.round(this.mmdManager.dofLensEdgeBlur * 100)));
            edgeBlurSlider.value = String(edgeBlurPercent);
            edgeBlurValue.textContent = edgeBlurPercent > 0
                ? `${edgeBlurPercent}%`
                : t("status.off");

            const distortionPercent = Math.max(0, Math.min(100, Math.round(this.mmdManager.dofLensDistortionInfluence * 100)));
            distortionSlider.value = String(distortionPercent);
            const currentDistortionPercent = Math.round(this.mmdManager.dofLensDistortion * 100);
            distortionValue.textContent = distortionPercent > 0
                ? `${distortionPercent}% (${currentDistortionPercent}%)`
                : t("status.off");
        };

        vignetteSlider.addEventListener("input", () => {
            const weight = Number(vignetteSlider.value);
            this.mmdManager.postEffectVignetteWeight = weight;
            this.mmdManager.postEffectVignetteEnabled = weight > 0.0001;
            refreshValues();
        });
        edgeBlurSlider.addEventListener("input", () => {
            this.mmdManager.dofLensEdgeBlur = Number(edgeBlurSlider.value) / 100;
            refreshValues();
        });
        distortionSlider.addEventListener("input", () => {
            this.mmdManager.dofLensDistortionInfluence = Number(distortionSlider.value) / 100;
            refreshValues();
        });
        refreshValues();
    }

    private installFrameGraphSsaoControls(root: HTMLElement): void {
        const enabledInput = root.querySelector<HTMLInputElement>('input[data-frame-graph-ssao-check="enabled"]');
        const enabledValue = root.querySelector<HTMLElement>('span[data-frame-graph-ssao-val="enabled"]');
        const strengthSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-ssao="strength"]');
        const strengthValue = root.querySelector<HTMLElement>('span[data-frame-graph-ssao-val="strength"]');
        const radiusSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-ssao="radius"]');
        const radiusValue = root.querySelector<HTMLElement>('span[data-frame-graph-ssao-val="radius"]');
        if (!enabledInput || !enabledValue || !strengthSlider || !strengthValue || !radiusSlider || !radiusValue) {
            return;
        }

        const refreshValues = (): void => {
            const enabled = this.mmdManager.postEffectSsaoEnabled;
            enabledInput.checked = enabled;
            enabledValue.textContent = enabled ? t("status.on") : t("status.off");
            strengthSlider.value = String(Math.max(0, Math.min(100, Math.round(this.mmdManager.postEffectSsaoStrength * 100))));
            strengthValue.textContent = enabled
                ? this.mmdManager.postEffectSsaoStrength.toFixed(2)
                : t("status.off");
            radiusSlider.value = String(Math.max(1, Math.min(500, Math.round(this.mmdManager.postEffectSsaoRadius * 100))));
            radiusValue.textContent = this.mmdManager.postEffectSsaoRadius.toFixed(2);
            strengthSlider.disabled = !enabled;
            radiusSlider.disabled = !enabled;
        };

        const applyValues = (): void => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphSsao",
                source: "panel",
                enabled: enabledInput.checked,
                strengthPercent: Number(strengthSlider.value),
                radiusPercent: Number(radiusSlider.value),
            })) {
                this.mmdManager.postEffectSsaoEnabled = enabledInput.checked;
                this.mmdManager.postEffectSsaoStrength = Number(strengthSlider.value) / 100;
                this.mmdManager.postEffectSsaoRadius = Number(radiusSlider.value) / 100;
                this.mmdManager.postEffectSsaoDebugView = false;
            }
            refreshValues();
        };

        enabledInput.addEventListener("change", applyValues);
        strengthSlider.addEventListener("input", applyValues);
        radiusSlider.addEventListener("input", applyValues);
        refreshValues();
    }

    private installFrameGraphSsrControls(root: HTMLElement): void {
        const enabledInput = root.querySelector<HTMLInputElement>('input[data-frame-graph-ssr-check="enabled"]');
        const enabledValue = root.querySelector<HTMLElement>('span[data-frame-graph-ssr-val="enabled"]');
        const strengthSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-ssr="strength"]');
        const strengthValue = root.querySelector<HTMLElement>('span[data-frame-graph-ssr-val="strength"]');
        if (!enabledInput || !enabledValue || !strengthSlider || !strengthValue) {
            return;
        }

        const refreshValues = (): void => {
            const enabled = this.mmdManager.postEffectSsrEnabled;
            enabledInput.checked = enabled;
            enabledValue.textContent = enabled ? t("status.on") : t("status.off");
            strengthSlider.value = String(Math.max(0, Math.min(200, Math.round(this.mmdManager.postEffectSsrStrength * 100))));
            strengthValue.textContent = enabled
                ? this.mmdManager.postEffectSsrStrength.toFixed(2)
                : t("status.off");
            strengthSlider.disabled = !enabled;
        };

        const applyValues = (): void => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphSsr",
                source: "panel",
                enabled: enabledInput.checked,
                strengthPercent: Number(strengthSlider.value),
            })) {
                this.mmdManager.postEffectSsrEnabled = enabledInput.checked;
                this.mmdManager.postEffectSsrStrength = Number(strengthSlider.value) / 100;
            }
            refreshValues();
        };

        enabledInput.addEventListener("change", applyValues);
        strengthSlider.addEventListener("input", applyValues);
        refreshValues();
    }

    private installFrameGraphDofControls(root: HTMLElement): void {
        const enabledInput = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof-check="enabled"]');
        const enabledValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="enabled"]');
        const focusSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof="focus"]');
        const focusValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="focus"]');
        const targetModelSelect = root.querySelector<HTMLSelectElement>('select[data-frame-graph-dof-select="target-model"]');
        const targetBoneSelect = root.querySelector<HTMLSelectElement>('select[data-frame-graph-dof-select="target-bone"]');
        const focusOffsetSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof="focus-offset"]');
        const focusOffsetValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="focus-offset"]');
        const fStopSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof="fstop"]');
        const fStopValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="fstop"]');
        const lensSizeSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof="lens-size"]');
        const lensSizeValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="lens-size"]');
        const focalLengthSlider = root.querySelector<HTMLInputElement>('input[data-frame-graph-dof="focal-length"]');
        const focalLengthValue = root.querySelector<HTMLElement>('span[data-frame-graph-dof-val="focal-length"]');
        if (
            !enabledInput ||
            !enabledValue ||
            !focusSlider ||
            !focusValue ||
            !targetModelSelect ||
            !targetBoneSelect ||
            !focusOffsetSlider ||
            !focusOffsetValue ||
            !fStopSlider ||
            !fStopValue ||
            !lensSizeSlider ||
            !lensSizeValue ||
            !focalLengthSlider ||
            !focalLengthValue
        ) {
            return;
        }

        focusSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        fStopSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        focalLengthSlider.closest<HTMLElement>(".effect-row")?.setAttribute("hidden", "");
        lensSizeSlider.min = "1";
        lensSizeSlider.max = "4096";

        const refreshTargetControls = (): void => {
            const loadedModels = this.mmdManager.getLoadedModels();
            const targetModelPath = this.mmdManager.getDofFocusTargetModelPath();
            const targetBoneName = this.mmdManager.getDofFocusTargetBoneName();
            const resolvedModel = targetModelPath
                ? loadedModels.find((model) => model.path === targetModelPath) ?? null
                : null;

            targetModelSelect.innerHTML = "";
            const cameraOption = document.createElement("option");
            cameraOption.value = "";
            cameraOption.textContent = t("option.cameraTarget");
            targetModelSelect.appendChild(cameraOption);
            for (const model of loadedModels) {
                const option = document.createElement("option");
                option.value = String(model.index);
                option.textContent = model.name;
                targetModelSelect.appendChild(option);
            }
            targetModelSelect.value = resolvedModel ? String(resolvedModel.index) : "";
            targetModelSelect.disabled = loadedModels.length === 0;

            targetBoneSelect.innerHTML = "";
            if (!resolvedModel) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = t("option.none");
                targetBoneSelect.appendChild(option);
                targetBoneSelect.value = "";
                targetBoneSelect.disabled = true;
                return;
            }
            const boneNames = this.mmdManager.getModelBoneNames(resolvedModel.index);
            for (const boneName of boneNames) {
                const option = document.createElement("option");
                option.value = boneName;
                option.textContent = boneName;
                targetBoneSelect.appendChild(option);
            }
            const fallbackBoneName =
                targetBoneName && boneNames.includes(targetBoneName)
                    ? targetBoneName
                    : this.mmdManager.getPreferredDofFocusBoneName(resolvedModel.index);
            targetBoneSelect.value = fallbackBoneName && boneNames.includes(fallbackBoneName)
                ? fallbackBoneName
                : (boneNames[0] ?? "");
            targetBoneSelect.disabled = boneNames.length === 0;
        };

        const refreshValues = (): void => {
            this.applySimplifiedDofDefaults();
            enabledInput.checked = this.mmdManager.dofEnabled;
            enabledValue.textContent = this.mmdManager.dofEnabled ? t("status.on") : t("status.off");
            focusSlider.value = String(Math.round(this.mmdManager.dofFocusDistanceMm));
            focusValue.textContent = `${(this.mmdManager.dofFocusDistanceMm / 1000).toFixed(1)}m`;
            focusOffsetSlider.value = String(Math.round(this.mmdManager.dofAutoFocusNearOffsetMm));
            focusOffsetValue.textContent = `${(this.mmdManager.dofAutoFocusNearOffsetMm / 1000).toFixed(1)}m`;
            fStopSlider.value = String(Math.round(FIXED_DOF_FSTOP * 100));
            fStopValue.textContent = this.mmdManager.dofFStop.toFixed(2);
            lensSizeSlider.value = String(this.getDofLensSizeSliderValue());
            lensSizeValue.textContent = `${this.getDofLensSizeSliderValue()}`;
            focalLengthSlider.value = String(Math.round(this.mmdManager.dofFocalLength));
            focalLengthValue.textContent = `${Math.round(this.mmdManager.dofFocalLength)}`;
            focusSlider.disabled = this.mmdManager.dofAutoFocusEnabled;
            focalLengthSlider.disabled = this.mmdManager.dofFocalLengthLinkedToCameraFov;
            refreshTargetControls();
        };

        enabledInput.addEventListener("change", () => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofEnabled",
                source: "panel",
                enabled: enabledInput.checked,
            })) {
                this.mmdManager.dofEnabled = enabledInput.checked;
            }
            refreshValues();
        });
        focusSlider.addEventListener("input", () => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofFocusDistance",
                source: "panel",
                millimeters: Number(focusSlider.value),
            }) && !this.mmdManager.dofAutoFocusEnabled) {
                this.mmdManager.dofFocusDistanceMm = Number(focusSlider.value);
            }
            refreshValues();
        });
        targetModelSelect.addEventListener("change", () => {
            const modelIndex = Number.parseInt(targetModelSelect.value, 10);
            const resolvedIndex = Number.isNaN(modelIndex) ? null : modelIndex;
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofTargetModel",
                source: "panel",
                modelIndex: resolvedIndex,
            })) {
                if (resolvedIndex === null) {
                    this.mmdManager.setDofFocusTargetByIndex(null, null);
                } else {
                    this.mmdManager.setDofFocusTargetByIndex(
                        resolvedIndex,
                        this.mmdManager.getPreferredDofFocusBoneName(resolvedIndex),
                    );
                }
            }
            refreshValues();
        });
        targetBoneSelect.addEventListener("change", () => {
            const modelIndex = Number.parseInt(targetModelSelect.value, 10);
            const resolvedIndex = Number.isNaN(modelIndex) ? null : modelIndex;
            const boneName = targetBoneSelect.value || null;
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofTargetBone",
                source: "panel",
                modelIndex: resolvedIndex,
                boneName,
            })) {
                if (resolvedIndex === null) {
                    this.mmdManager.setDofFocusTargetByIndex(null, null);
                } else {
                    this.mmdManager.setDofFocusTargetByIndex(resolvedIndex, boneName);
                }
            }
            refreshValues();
        });
        focusOffsetSlider.addEventListener("input", () => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofFocusOffset",
                source: "panel",
                millimeters: Number(focusOffsetSlider.value),
            })) {
                this.mmdManager.dofAutoFocusNearOffsetMm = Number(focusOffsetSlider.value);
            }
            refreshValues();
        });
        fStopSlider.addEventListener("input", () => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofFStop",
                source: "panel",
                value: FIXED_DOF_FSTOP,
            })) {
                this.applySimplifiedDofDefaults();
            }
            refreshValues();
        });
        lensSizeSlider.addEventListener("input", () => {
            const lensSize = Number(lensSizeSlider.value);
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofLensSize",
                source: "panel",
                value: lensSize,
            })) {
                this.mmdManager.dofLensSize = lensSize;
            }
            refreshValues();
        });
        focalLengthSlider.addEventListener("input", () => {
            if (!this.actionDispatcher.dispatch({
                type: "effect.setFrameGraphDofFocalLength",
                source: "panel",
                value: Number(focalLengthSlider.value),
            }) && !this.mmdManager.dofFocalLengthLinkedToCameraFov) {
                this.mmdManager.dofFocalLength = Number(focalLengthSlider.value);
            }
            refreshValues();
        });
        refreshValues();
    }

    private applyPostEffectBackendPanelState(root: HTMLElement | null, backend: PostEffectBackend): void {
        if (!root) return;
        const classicPanels = Array.from(root.querySelectorAll<HTMLElement>('[data-postfx-backend-panel="classic"]'));
        const frameGraphPanel = root.querySelector<HTMLElement>('[data-postfx-backend-panel="frameGraph"]');
        const backendValue = root.querySelector<HTMLElement>('span[data-postfx-val="backend"]');
        const dofControls = root.querySelector<HTMLElement>(".shader-postfx-dof-controls");
        const classicOnlyRows = Array.from(root.querySelectorAll<HTMLElement>("[data-postfx-classic-only]"));
        const lutEnabledRow = root.querySelector<HTMLElement>('input[data-postfx-check="lut"]')?.closest<HTMLElement>(".effect-row") ?? null;
        const lutIntensityRow = root.querySelector<HTMLElement>('input[data-postfx="lut-intensity"]')?.closest<HTMLElement>(".effect-row") ?? null;
        const classicSsrRow = root.querySelector<HTMLElement>('input[data-postfx="ssr-strength"]')?.closest<HTMLElement>(".effect-row") ?? null;
        const frameGraphSsrRow = root.querySelector<HTMLElement>('input[data-frame-graph-ssr-check="enabled"]')?.closest<HTMLElement>(".effect-row") ?? null;
        const dofRowByControlId = (id: string): HTMLElement | null => {
            return root.querySelector<HTMLElement>(`#${id}`)?.closest<HTMLElement>(".effect-row") ?? null;
        };
        const moveLutRowsBefore = (anchor: HTMLElement | null): void => {
            if (!anchor || !anchor.parentElement || !lutEnabledRow || !lutIntensityRow) return;
            anchor.parentElement.insertBefore(lutEnabledRow, anchor);
            anchor.parentElement.insertBefore(lutIntensityRow, anchor);
        };
        const setFrameGraphDofRowState = (row: HTMLElement | null, visibleInFrameGraph: boolean): void => {
            if (!row) return;
            if (backend === "frameGraph") {
                if (row.dataset.frameGraphPrevHidden === undefined) {
                    row.dataset.frameGraphPrevHidden = row.hidden ? "true" : "false";
                    row.dataset.frameGraphPrevDisplay = row.style.display;
                }
                row.hidden = !visibleInFrameGraph;
                row.style.display = visibleInFrameGraph ? "grid" : "none";
                return;
            }
            if (row.dataset.frameGraphPrevHidden !== undefined) {
                row.hidden = row.dataset.frameGraphPrevHidden === "true";
                row.style.display = row.dataset.frameGraphPrevDisplay ?? "";
                delete row.dataset.frameGraphPrevHidden;
                delete row.dataset.frameGraphPrevDisplay;
            }
        };

        for (const classicPanel of classicPanels) {
            classicPanel.hidden = backend !== "classic";
        }
        if (frameGraphPanel) frameGraphPanel.hidden = backend !== "frameGraph";
        if (dofControls) {
            const visible = backend === "classic";
            dofControls.hidden = !visible;
            dofControls.style.display = visible ? "" : "none";
        }
        const frameGraphDofVisibleControls = new Set([
            "effect-dof-enabled",
            "effect-dof-target-model",
            "effect-dof-target-bone",
            "effect-dof-focus-offset",
            "effect-dof-lens-size",
        ]);
        const frameGraphDofControlledRows = [
            "effect-dof-enabled",
            "effect-dof-quality",
            "effect-dof-focus",
            "effect-dof-target-model",
            "effect-dof-target-bone",
            "effect-dof-focus-offset",
            "effect-dof-fstop",
            "effect-dof-near-suppression",
            "effect-dof-focal-invert",
            "effect-dof-lens-size",
            "effect-dof-lens-blur",
            "effect-fog-enabled",
            "effect-fog-mode",
            "effect-fog-start",
            "effect-fog-end",
            "effect-fog-density",
            "effect-fog-opacity",
            "effect-fog-color-r",
            "effect-fog-color-g",
            "effect-fog-color-b",
            "effect-dof-focal-length",
        ];
        for (const controlId of frameGraphDofControlledRows) {
            setFrameGraphDofRowState(
                dofRowByControlId(controlId),
                frameGraphDofVisibleControls.has(controlId),
            );
        }
        for (const row of classicOnlyRows) {
            row.hidden = backend !== "classic";
            row.style.display = backend === "classic" ? "" : "none";
        }
        moveLutRowsBefore(backend === "frameGraph" ? frameGraphSsrRow : classicSsrRow);
        if (backendValue) {
            backendValue.textContent = backend === "frameGraph" ? "Frame Graph" : "Classic";
        }
    }

    private refreshLightingUiFromRuntime(): void {
        const setSliderValue = (
            sliderId: string,
            valueId: string,
            rawValue: number,
            formatter: (value: number) => string,
        ): void => {
            const slider = document.getElementById(sliderId) as HTMLInputElement | null;
            const valueEl = document.getElementById(valueId);
            if (!slider || !valueEl) return;

            const normalized = this.normalizeRangeInputValue(slider, rawValue);
            slider.value = this.formatRangeInputValue(slider, normalized);
            valueEl.textContent = formatter(rawValue);
            this.syncRangeNumberInput(slider);
        };

        const lightDirection = this.mmdManager.getSerializedLightDirection();
        setSliderValue("light-direction-x", "light-direction-x-val", lightDirection.x, (value) => value.toFixed(2));
        setSliderValue("light-direction-y", "light-direction-y-val", lightDirection.y, (value) => value.toFixed(2));
        setSliderValue("light-direction-z", "light-direction-z-val", lightDirection.z, (value) => value.toFixed(2));
        setSliderValue("light-intensity", "light-intensity-val", this.mmdManager.lightIntensity * 100, (value) => (value / 100).toFixed(1));
        setSliderValue("light-ambient", "light-ambient-val", this.mmdManager.ambientIntensity * 100, (value) => (value / 100).toFixed(1));

        const lightColor = this.mmdManager.getLightColor();
        setSliderValue("light-color-r", "light-color-r-val", lightColor.r * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-color-g", "light-color-g-val", lightColor.g * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-color-b", "light-color-b-val", lightColor.b * 127.5, (value) => `${Math.round((value / 127.5) * 100)}%`);
        setSliderValue("light-flat-strength", "light-flat-strength-val", this.mmdManager.lightFlatStrength * 100, (value) => `${Math.round(value)}%`);
        setSliderValue(
            "light-flat-color-influence",
            "light-flat-color-influence-val",
            this.mmdManager.lightFlatColorInfluence * 100,
            (value) => `${Math.round(value)}%`,
        );

        const shadowColor = this.mmdManager.getShadowColor();
        setSliderValue("light-shadow", "light-shadow-val", this.mmdManager.shadowDarkness * 100, (value) => (value / 100).toFixed(2));
        setSliderValue("light-shadow-frustum-size", "light-shadow-frustum-size-val", this.mmdManager.shadowFrustumSize, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-max-z", "light-shadow-max-z-val", this.mmdManager.shadowMaxZ, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-filter-quality", "light-shadow-filter-quality-val", this.mmdManager.shadowFilteringQuality, (value) => {
            if (value <= 0) return "High";
            if (value >= 2) return "Low";
            return "Med";
        });
        setSliderValue("light-soft-transparent-shadow", "light-soft-transparent-shadow-val", this.mmdManager.softTransparentShadowEnabled ? 1 : 0, (value) => value > 0 ? "Soft" : "Hard");
        setSliderValue("light-ibl-shadows", "light-ibl-shadows-val", this.mmdManager.iblShadowsEnabled ? 1 : 0, (value) => value > 0 ? "On" : "Off");
        setSliderValue("light-ibl-shadow-opacity", "light-ibl-shadow-opacity-val", this.mmdManager.iblShadowOpacity * 100, (value) => `${Math.round(value)}%`);
        setSliderValue("light-ibl-shadow-range", "light-ibl-shadow-range-val", this.mmdManager.iblShadowDistanceScale * 100, (value) => (value / 100).toFixed(1));
        setSliderValue("light-character-contact-shadow", "light-character-contact-shadow-val", this.mmdManager.characterContactShadowEnabled ? 1 : 0, (value) => value > 0 ? "On" : "Off");
        setSliderValue("light-character-contact-shadow-opacity", "light-character-contact-shadow-opacity-val", this.mmdManager.characterContactShadowOpacity * 100, (value) => `${Math.round(value)}%`);
        setSliderValue("light-character-contact-shadow-scale", "light-character-contact-shadow-scale-val", this.mmdManager.characterContactShadowScale * 100, (value) => (value / 100).toFixed(2));
        setSliderValue("light-shadow-bias", "light-shadow-bias-val", this.mmdManager.shadowBias * 1_000_000, (value) => (value / 1_000_000).toFixed(5));
        setSliderValue("light-shadow-normal-bias", "light-shadow-normal-bias-val", this.mmdManager.shadowNormalBias * 100_000, (value) => (value / 100_000).toFixed(5));
        setSliderValue("light-shadow-color-r", "light-shadow-color-r-val", shadowColor.r * 255, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-color-g", "light-shadow-color-g-val", shadowColor.g * 255, (value) => String(Math.round(value)));
        setSliderValue("light-shadow-color-b", "light-shadow-color-b-val", shadowColor.b * 255, (value) => String(Math.round(value)));
        setSliderValue(
            "light-toon-shadow-influence",
            "light-toon-shadow-influence-val",
            this.mmdManager.toonShadowInfluence * 100,
            (value) => `${Math.round(value)}%`,
        );
        setSliderValue(
            "light-self-shadow-softness",
            "light-self-shadow-softness-val",
            this.mmdManager.selfShadowEdgeSoftness * 1000,
            (value) => (value / 1000).toFixed(3),
        );
        setSliderValue(
            "light-occlusion-shadow-softness",
            "light-occlusion-shadow-softness-val",
            this.mmdManager.occlusionShadowEdgeSoftness * 1000,
            (value) => (value / 1000).toFixed(3),
        );
    }

    private handleBoneTransformChanged(boneName: string | null, source: ActionSource): void {
        const poseSnapshot = source === "panel"
            ? this.bottomPanel.getSelectedBoneTransformSnapshot()
            : boneName
                ? this.mmdManager.getBoneTransform(boneName)
                : null;
        this.rememberEditedBonePoseSnapshot(boneName, poseSnapshot);
        this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(boneName));
        this.syncBottomPanelBoneFromEditedPose(boneName, source !== "panel");
        this.refreshCameraUiFromRuntime();
        this.refreshViewportBottomBar();
        this.updateSectionKeyframeButtons();
    }

    private beginBoneTransformCommand(boneName: string | null): void {
        if (!boneName || boneName === "Camera") return;
        if (this.pendingBoneTransformCommand?.boneName === boneName) return;

        const snapshot = this.captureBoneTransformCommandSnapshot(boneName);
        if (!snapshot) return;

        this.pendingBoneTransformCommand = {
            boneName,
            frame: this.mmdManager.currentFrame,
            before: snapshot,
        };
    }

    private commitBoneTransformCommand(boneName: string | null): void {
        const pending = this.pendingBoneTransformCommand;
        this.pendingBoneTransformCommand = null;
        if (!pending) return;
        if (!boneName || pending.boneName !== boneName) return;

        const after = this.captureBoneTransformCommandSnapshot(boneName);
        const command = buildBoneTransformCommand({
            boneName,
            frame: pending.frame,
            before: pending.before,
            after,
        });
        if (!command) return;

        this.commandHistory.push(command);
        this.registerAutoKeyForEditedBone(boneName);
    }

    private registerAutoKeyForEditedBone(boneName: string): void {
        if (!this.autoKeyEnabled || boneName === "Camera") return;
        this.registerBoneKeyframeForBoneAtCurrentFrame(boneName, "system");
    }

    private registerModelExternalParentKeyframe(
        childModelIndex: number,
        childBoneName: string,
        parentModelIndex: number | null,
        parentBoneName: string | null,
    ): boolean {
        const activeModel = this.mmdManager.getLoadedModels().find((model) => model.active) ?? null;
        if (!activeModel || activeModel.index !== childModelIndex) return false;
        const track = this.resolveBottomPanelBoneCommandTrack();
        if (!track || track.name !== childBoneName) return false;

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const currentPose = this.captureCurrentBonePoseSnapshot(childBoneName);
        if (!currentPose) return false;
        const pose = parentModelIndex === null
            ? currentPose
            : {
                ...currentPose,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
            };
        const parentModelPath = parentModelIndex === null
            ? null
            : this.mmdManager.getLoadedModels().find((model) => model.index === parentModelIndex)?.path ?? null;
        if (parentModelIndex !== null && (!parentModelPath || !parentBoneName)) return false;

        const externalParent: ModelExternalParentKeyframePayload = {
            childBoneName,
            parentModelPath,
            parentBoneName: parentModelPath ? parentBoneName : null,
        };
        const curves = this.captureInterpolationCurveSnapshot({ ...track, frames: new Uint32Array() }, frame);
        const before = this.mmdManager.readTimelineKeyframePayload(track, frame);
        const after = this.createBoneKeyframePayload(
            track,
            pose,
            curves,
            this.physicsKeyframeInputMode,
            externalParent,
        );
        const command = this.createKeyframePasteCommand(
            track,
            frame,
            before,
            after,
            `${parentModelPath ? "Register" : "Clear"} model external parent at frame ${frame}`,
        );
        const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!registered) return false;

        this.commandHistory.push(command);
        this.clearRegisteredKeySelection();
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        return true;
    }

    private registerAutoKeyForEditedMorph(morph: { frameIndex: number; name: string; value: number }): void {
        if (!this.autoKeyEnabled) return;
        this.registerSingleMorphKeyframeAtCurrentFrame(morph, { toast: false });
    }

    private setAutoKeyEnabled(enabled: boolean, options: { persist: boolean; toast: boolean }): void {
        this.autoKeyEnabled = enabled;
        this.btnAutoKey.setAttribute("aria-pressed", enabled ? "true" : "false");
        this.btnAutoKey.classList.toggle("is-active", enabled);
        if (options.persist) {
            try {
                localStorage.setItem(UIController.AUTO_KEY_STORAGE_KEY, enabled ? "1" : "0");
            } catch {
                // localStorage can be unavailable in restricted test/browser contexts.
            }
        }
        if (options.toast) {
            this.showToast(enabled ? "Auto Key: ON" : "Auto Key: OFF", "info");
        }
    }

    private applyBottomBarBoneTransform(
        boneName: string | null,
        position: { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
        beforeOverride?: BoneTransformCommandSnapshot,
    ): void {
        if (!boneName || boneName === "Camera") {
            this.refreshViewportBottomBar();
            return;
        }

        const before = beforeOverride ?? this.captureBoneTransformCommandSnapshot(boneName);
        const after: BoneTransformCommandSnapshot = {
            position: { ...position },
            rotation: { ...rotation },
        };
        const command = buildBoneTransformCommand({
            boneName,
            frame: this.mmdManager.currentFrame,
            before,
            after,
        });
        if (!command) {
            this.refreshViewportBottomBar();
            return;
        }

        const applied = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!applied) {
            this.refreshViewportBottomBar();
            this.showToast(`Bone edit failed: ${boneName}`, "error");
            return;
        }

        this.commandHistory.push(command);
    }

    private previewBottomBarBoneTransform(
        boneName: string | null,
        position: { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
    ): boolean {
        if (!boneName || boneName === "Camera") {
            this.refreshViewportBottomBar();
            return false;
        }
        return this.applyBoneTransformSnapshotFromCommand(boneName, { position, rotation });
    }

    private applyBottomBarCameraTransform(
        target: { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
        distance: number,
        fov: number,
        beforeOverride?: CameraTransformCommandSnapshot,
    ): void {
        const command = buildCameraTransformCommand({
            frame: this.mmdManager.currentFrame,
            before: beforeOverride ?? this.captureCameraTransformCommandSnapshot(),
            after: {
                target: { ...target },
                rotation: { ...rotation },
                distance,
                fov,
            },
        });
        if (!command) {
            this.refreshViewportBottomBar();
            return;
        }

        const applied = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!applied) {
            this.refreshViewportBottomBar();
            this.showToast("Camera edit failed", "error");
            return;
        }

        this.commandHistory.push(command);
    }

    private previewBottomBarCameraTransform(
        target: { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
        distance: number,
        fov: number,
    ): boolean {
        return this.applyCameraTransformSnapshotFromCommand({
            target,
            rotation,
            distance,
            fov,
        });
    }

    private previewTopBarCameraPan(
        before: ViewportTopBarCameraTransform,
        deltaX: number,
        deltaY: number,
    ): ViewportTopBarCameraTransform | null {
        if (!this.applyCameraTransformSnapshotFromCommand(before)) {
            return null;
        }
        this.mmdManager.panCameraByViewportDelta(deltaX, deltaY);
        return this.captureCameraTransformCommandSnapshot();
    }

    private captureBoneTransformCommandSnapshot(boneName: string): BoneTransformCommandSnapshot | null {
        const snapshot = this.captureCurrentBonePoseSnapshot(boneName);
        if (!snapshot) return null;
        return {
            position: { ...snapshot.position },
            rotation: { ...snapshot.rotation },
        };
    }

    private captureCameraTransformCommandSnapshot(): CameraTransformCommandSnapshot {
        const cameraPose = this.mmdManager.getCameraKeyframePose();
        return {
            target: cameraPose.target,
            rotation: cameraPose.rotation,
            distance: cameraPose.distance,
            fov: cameraPose.fov,
        };
    }

    private applyBoneTransformSnapshotFromCommand(
        boneName: string,
        snapshot: BoneTransformCommandSnapshot,
    ): boolean {
        if (!boneName || boneName === "Camera") return false;
        if (!this.mmdManager.getBoneTransform(boneName)) return false;

        this.mmdManager.setBoneTranslation(
            boneName,
            snapshot.position.x,
            snapshot.position.y,
            snapshot.position.z,
            false,
        );
        this.mmdManager.setBoneRotation(
            boneName,
            snapshot.rotation.x,
            snapshot.rotation.y,
            snapshot.rotation.z,
            false,
        );
        this.rememberEditedBonePoseSnapshot(boneName, snapshot);
        this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(boneName));
        this.syncBottomPanelBoneFromEditedPose(boneName);
        this.refreshSelectedTrackRotationOverlay();
        this.refreshViewportBottomBar();
        this.updateSectionKeyframeButtons();
        return true;
    }

    private applyCameraTransformSnapshotFromCommand(snapshot: CameraTransformCommandSnapshot): boolean {
        if (!Number.isFinite(snapshot.distance) || !Number.isFinite(snapshot.fov)) return false;

        this.mmdManager.applyCameraTrackPose(
            snapshot.target,
            snapshot.rotation,
            Math.max(0, snapshot.distance),
            Math.max(10, Math.min(120, snapshot.fov)),
        );
        this.rememberEditedBonePoseSnapshot("Camera", this.captureCurrentBonePoseSnapshot("Camera"));
        this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
        this.syncBottomPanelBoneFromEditedPose("Camera");
        this.handleCameraControlEdited();
        this.refreshCameraUiFromRuntime(true);
        this.refreshViewportBottomBar();
        this.updateSectionKeyframeButtons();
        return true;
    }

    private handleCameraControlEdited(): void {
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime();
        this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
        this.updateSectionKeyframeButtons();
        this.dofPanelController?.refreshAutoFocusReadout();
        this.refreshViewportBottomBar();
    }

    private handleCameraTransformChanged(source: ActionSource): void {
        if (source === "panel") {
            this.handleCameraControlEdited();
            return;
        }

        const cameraSelected = this.bottomPanel.getSelectedBone() === "Camera"
            || this.mmdManager.getTimelineTarget() === "camera";
        if (cameraSelected) {
            this.rememberEditedBonePoseSnapshot("Camera", this.captureCurrentBonePoseSnapshot("Camera"));
            this.markSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
            this.syncBottomPanelBoneFromEditedPose("Camera");
        }
        this.refreshCameraUiFromRuntime();
        this.refreshViewportBottomBar();
        this.updateSectionKeyframeButtons();
    }

    private refreshCameraUiFromRuntime(force = false): void {
        this.cameraPanelController?.refresh(force);
        this.lensEffectController?.refresh();
        this.fogPanelController?.refresh();
    }

    private getSelectedTimelineTrack(): KeyframeTrack | null {
        const track = this.timeline.getSelectedTrack();
        if (!track) return null;
        return track;
    }

    private hasMultiTrackKeySelection(selectedKeys: readonly TimelineKeySelectionRef[]): boolean {
        if (selectedKeys.length <= 1) return false;
        const first = selectedKeys[0];
        return selectedKeys.some((key) =>
            key.trackCategory !== first.trackCategory || key.trackName !== first.trackName
        );
    }

    private selectionRefToCommandTrack(ref: TimelineKeySelectionRef): CommandTrackRef {
        return { category: ref.trackCategory, name: ref.trackName };
    }

    private boneTrackSelectionRefToCommandTrack(ref: TimelineBoneTrackSelectionRef): CommandTrackRef {
        return { category: ref.trackCategory, name: ref.trackName };
    }

    private collectKeyframeCommandSnapshot(): KeyframeCommandSnapshot {
        const selectedTrack = this.getSelectedTimelineTrack();
        const framesByTrackKey: Record<string, number[]> = {};
        if (selectedTrack) {
            framesByTrackKey[createCommandTrackKey(selectedTrack)] = Array.from(selectedTrack.frames);
        }

        return {
            selectedTrack: selectedTrack
                ? { category: selectedTrack.category, name: selectedTrack.name }
                : null,
            selectedFrame: this.timeline.getSelectedFrame(),
            currentFrame: this.mmdManager.currentFrame,
            framesByTrackKey,
        };
    }

    private createCommandExecutionContext(options: { seekToFrame?: boolean } = {}): CommandExecutionContext {
        const seekToFrame = options.seekToFrame ?? true;
        let timelineEditBatchDepth = 0;
        let pendingRuntimeRefresh = false;
        const refreshAfterPayloadEdit = (): void => {
            if (timelineEditBatchDepth > 0) {
                pendingRuntimeRefresh = true;
                return;
            }
            this.refreshRuntimeAnimationForTrack();
        };
        return {
            beginTimelineEditBatch: () => {
                timelineEditBatchDepth += 1;
                this.mmdManager.beginTimelineEditBatch();
            },
            endTimelineEditBatch: () => {
                timelineEditBatchDepth = Math.max(0, timelineEditBatchDepth - 1);
                this.mmdManager.endTimelineEditBatch();
                if (timelineEditBatchDepth === 0 && pendingRuntimeRefresh) {
                    pendingRuntimeRefresh = false;
                    this.refreshRuntimeAnimationForTrack();
                }
            },
            addTimelineKeyframe: (track, frame) => this.mmdManager.addTimelineKeyframe(track, frame),
            removeTimelineKeyframe: (track, frame) => this.mmdManager.removeTimelineKeyframe(track, frame),
            removeTimelineKeyframePayloads: (track, frames) =>
                this.mmdManager.removeTimelineKeyframePayloads(track, frames),
            moveTimelineKeyframe: (track, fromFrame, toFrame) => this.mmdManager.moveTimelineKeyframe(
                track,
                fromFrame,
                toFrame,
            ),
            applyTimelineKeyframePayload: (track, frame, payload) => {
                const applied = this.mmdManager.applyTimelineKeyframePayload(track, frame, payload);
                if (applied) {
                    refreshAfterPayloadEdit();
                }
                return applied;
            },
            applyBoneTransform: (boneName, snapshot) => this.applyBoneTransformSnapshotFromCommand(boneName, snapshot),
            applyCameraTransform: (snapshot) => this.applyCameraTransformSnapshotFromCommand(snapshot),
            setSelectedFrame: (frame) => this.timeline.setSelectedFrame(frame),
            setSelectedKeys: (keys) => {
                this.timeline.setSelectedKeys(keys.map((key) => ({
                    trackCategory: key.track.category,
                    trackName: key.track.name,
                    frame: key.frame,
                })));
            },
            seekToBoundary: (frame) => {
                if (seekToFrame) this.mmdManager.seekToBoundary(frame);
            },
            refreshAfterKeyframeEdit: () => this.updateTimelineEditState(),
        };
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
        return track.category === "root" || track.category === "semi-standard" || track.category === "bone" || track.category === "camera";
    }

    private syncBottomBoneSelectionFromTimeline(track: KeyframeTrack | null): void {
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.syncingBoneSelection = true;
        try {
            const selectedBoneTracks = this.timeline.getSelectedBoneTracks();
            if (selectedBoneTracks.length > 1) {
                this.selectedBoneTrackCategory = null;
                this.bottomPanel.setMultipleSelectedBones(selectedBoneTracks.map((selectedTrack) => selectedTrack.trackName));
            } else if (this.isBoneTrackForEditor(track)) {
                this.selectedBoneTrackCategory = track.category;
                this.bottomPanel.setSelectedBone(track.name);
            } else {
                this.selectedBoneTrackCategory = null;
                this.bottomPanel.clearSelectedBone();
            }
        } finally {
            this.syncingBoneSelection = false;
        }
        this.refreshViewportBottomBar();
    }

    private syncTimelineBoneSelectionFromBottomPanel(boneName: string | null): void {
        if (!boneName) return;
        if (this.mmdManager.getTimelineTarget() !== "model") return;
        if (this.syncingBoneSelection) return;

        this.mmdManager.setBoneVisualizerSelectedBone(boneName);
        this.syncingBoneSelection = true;
        try {
            const fallbackCategories: TrackCategory[] = boneName === "Camera"
                ? ["camera", "bone", "semi-standard", "root"]
                : ["bone", "semi-standard", "root"];
            const preferredCategories: TrackCategory[] = this.selectedBoneTrackCategory
                ? [
                    this.selectedBoneTrackCategory,
                    ...fallbackCategories.filter((category) => category !== this.selectedBoneTrackCategory),
                ]
                : fallbackCategories;
            if (this.timeline.selectTrackByNameAndCategory(boneName, preferredCategories)) {
                const selectedTrack = this.timeline.getSelectedTrack();
                this.selectedBoneTrackCategory = this.isBoneTrackForEditor(selectedTrack) ? selectedTrack.category : null;
            }
        } finally {
            this.syncingBoneSelection = false;
        }
    }

    private syncBoneVisualizerSelection(track: KeyframeTrack | null): void {
        if (this.mmdManager.getTimelineTarget() !== "model") {
            this.selectedBoneTrackCategory = null;
            this.mmdManager.setBoneVisualizerSelectedBone(null);
            return;
        }

        if (this.timeline.hasMultipleSelectedBoneTracks()) {
            this.selectedBoneTrackCategory = null;
            this.mmdManager.setBoneVisualizerSelectedBones(
                this.timeline.getSelectedBoneTracks().map((selectedTrack) => selectedTrack.trackName),
            );
            return;
        }

        if (this.isBoneTrackForEditor(track)) {
            this.selectedBoneTrackCategory = track.category;
            this.mmdManager.setBoneVisualizerSelectedBone(track.name);
            return;
        }

        this.selectedBoneTrackCategory = null;
        this.mmdManager.setBoneVisualizerSelectedBone(null);
    }

    private refreshSelectedTrackRotationOverlay(): void {
        const track = this.getSelectedTimelineTrack();
        if (!this.isRotationOverlayTrack(track)) {
            this.timeline.setSelectedTrackRotationOverlay(null);
            return;
        }

        this.timeline.setSelectedTrackRotationOverlay(this.buildSelectedTrackRotationOverlay(track));
    }

    private isRotationOverlayTrack(track: KeyframeTrack | null): track is KeyframeTrack {
        if (!track) return false;
        return track.category === "root"
            || track.category === "semi-standard"
            || track.category === "bone"
            || track.category === "camera";
    }

    private buildSelectedTrackRotationOverlay(track: KeyframeTrack): TimelineRotationOverlay | null {
        if (track.frames.length === 0) return null;

        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (track.category === "camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrack) return null;

            const firstFrame = Math.max(0, Math.floor(track.frames[0] ?? 0));
            const lastFrame = Math.max(firstFrame, Math.floor(track.frames[track.frames.length - 1] ?? firstFrame));
            const sampleCount = lastFrame - firstFrame + 1;
            if (sampleCount <= 0) return null;

            const frames = new Uint32Array(sampleCount);
            const x = new Float32Array(sampleCount);
            const y = new Float32Array(sampleCount);
            const z = new Float32Array(sampleCount);
            let maxAbsValue = 0;

            for (let i = 0; i < sampleCount; i += 1) {
                const frame = firstFrame + i;
                const pose = this.sampleCameraPoseFromTrack(cameraTrack, frame);
                const rotation = pose?.rotation ?? { x: 0, y: 0, z: 0 };

                frames[i] = frame;
                x[i] = rotation.x;
                y[i] = rotation.y;
                z[i] = rotation.z;
                maxAbsValue = Math.max(maxAbsValue, Math.abs(rotation.x), Math.abs(rotation.y), Math.abs(rotation.z));
            }

            return {
                trackName: track.name,
                trackCategory: track.category,
                frames,
                x,
                y,
                z,
                maxAbsValue,
            };
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return null;

        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel as object);
        if (!modelAnimation) return null;

        const movableTrack = modelAnimation.movableBoneTracks.find((runtimeTrack) => runtimeTrack.name === track.name) ?? null;
        const boneTrack = modelAnimation.boneTracks.find((runtimeTrack) => runtimeTrack.name === track.name) ?? null;
        if (!movableTrack && !boneTrack) return null;

        const firstFrame = Math.max(0, Math.floor(track.frames[0] ?? 0));
        const lastFrame = Math.max(firstFrame, Math.floor(track.frames[track.frames.length - 1] ?? firstFrame));
        const sampleCount = lastFrame - firstFrame + 1;
        if (sampleCount <= 0) return null;

        const frames = new Uint32Array(sampleCount);
        const x = new Float32Array(sampleCount);
        const y = new Float32Array(sampleCount);
        const z = new Float32Array(sampleCount);
        let maxAbsValue = 0;

        for (let i = 0; i < sampleCount; i += 1) {
            const frame = firstFrame + i;
            const pose = movableTrack
                ? this.sampleMovableBonePoseFromTrack(movableTrack, frame)
                : this.sampleBonePoseFromTrack(boneTrack, frame);
            const rotation = pose?.rotation ?? { x: 0, y: 0, z: 0 };

            frames[i] = frame;
            x[i] = rotation.x;
            y[i] = rotation.y;
            z[i] = rotation.z;
            maxAbsValue = Math.max(maxAbsValue, Math.abs(rotation.x), Math.abs(rotation.y), Math.abs(rotation.z));
        }

        return {
            trackName: track.name,
            trackCategory: track.category,
            frames,
            x,
            y,
            z,
            maxAbsValue,
        };
    }

    private updateTimelineEditState(): void {
        const track = this.getSelectedTimelineTrack();
        const selectedFrame = this.timeline.getSelectedFrame();
        const selectedKeys = this.timeline.getSelectedKeys();
        const selectedBoneTracks = this.timeline.getSelectedBoneTracks();
        const currentFrame = this.mmdManager.currentFrame;

        if (!track) {
            if (this.timelineSelectionLabel) {
                this.timelineSelectionLabel.textContent = "No track selected";
            }
            this.interpolationTrackNameLabel.textContent = "-";
            this.interpolationFrameLabel.textContent = "-";
            this.resetInterpolationTypeSelect();
            this.interpolationStatusLabel.textContent = "No track selected";
            this.currentInterpolationPreview = null;
            this.renderInterpolationCurves(null);
            this.updateInterpolationActionButtons();
            this.btnKeyframeAdd.disabled = true;
            this.btnKeyframeCopy.disabled = true;
            this.btnKeyframePaste.disabled = true;
            this.btnKeyframeMirrorPaste.disabled = !this.canMirrorPasteKeyframeClipboard();
            this.btnKeyframeDelete.disabled = true;
            this.btnKeyframeNudgeLeft.disabled = false;
            this.btnKeyframeNudgeRight.disabled = false;
            this.updateSectionKeyframeButtons();
            return;
        }

        const frameLabel = selectedKeys.length > 1
            ? ` (${selectedKeys.length} keys)`
            : selectedFrame !== null ? ` @${selectedFrame}` : "";
        const trackTypeLabel = this.getTrackTypeLabel(track);
        if (this.timelineSelectionLabel) {
            this.timelineSelectionLabel.textContent = selectedBoneTracks.length > 1
                ? `[Bone] ${selectedBoneTracks.length} bones selected`
                : `[${trackTypeLabel}] ${track.name}${frameLabel}`;
        }
        const interpolationFrame = selectedKeys.length > 1 ? currentFrame : selectedFrame ?? currentFrame;
        this.interpolationTrackNameLabel.textContent = selectedBoneTracks.length > 1
            ? `Bone: ${selectedBoneTracks.length} selected`
            : `${trackTypeLabel}: ${track.name}`;
        this.interpolationFrameLabel.textContent = String(interpolationFrame);
        if (selectedBoneTracks.length > 1) {
            this.resetInterpolationTypeSelect();
            this.interpolationStatusLabel.textContent = "Multiple bones selected";
            this.currentInterpolationPreview = null;
            this.renderInterpolationCurves(null);
            this.updateInterpolationActionButtons();
        } else if (this.hasMultiTrackKeySelection(selectedKeys)) {
            this.resetInterpolationTypeSelect();
            this.interpolationStatusLabel.textContent = "Multiple tracks selected";
            this.currentInterpolationPreview = null;
            this.renderInterpolationCurves(null);
            this.updateInterpolationActionButtons();
        } else {
            this.updateInterpolationPreview(track, interpolationFrame);
        }
        this.btnKeyframeAdd.disabled = false;

        const hasCurrentFrameKey = this.mmdManager.hasTimelineKeyframe(track, currentFrame);
        const canDelete = selectedFrame !== null || hasCurrentFrameKey;
        const copyFrame = selectedFrame ?? currentFrame;
        const canCopy = this.mmdManager.hasTimelineKeyframe(track, copyFrame);
        this.btnKeyframeDelete.disabled = selectedKeys.length > 0 ? false : !canDelete;
        this.btnKeyframeCopy.disabled = selectedKeys.length > 0 ? false : !canCopy;
        this.btnKeyframePaste.disabled = !this.canPasteKeyframeClipboardToCurrentSelection();
        this.btnKeyframeMirrorPaste.disabled = !this.canMirrorPasteKeyframeClipboard();

        this.btnKeyframeNudgeLeft.disabled = false;
        this.btnKeyframeNudgeRight.disabled = false;
        this.updateSectionKeyframeButtons();
    }

    private canPasteKeyframeClipboardToCurrentSelection(): boolean {
        const clipboard = this.keyframeClipboard;
        if (!clipboard) return false;
        if (clipboard.mode === "batch") {
            return this.mmdManager.getTimelineTarget() === clipboard.sourceTarget && clipboard.items.length > 0;
        }
        return this.resolveKeyframePasteTarget(clipboard) !== null;
    }

    private canMirrorPasteKeyframeClipboard(): boolean {
        if (this.mmdManager.getTimelineTarget() !== "model") return false;
        const clipboardItems = this.getMirrorPasteClipboardItems();
        return clipboardItems.some((item) => item.payload.kind === "bone" || item.payload.kind === "movableBone");
    }

    private updateSectionKeyframeButtons(): void {
        this.setSectionKeyframeButtonState(this.btnInfoKeyframe, this.getInfoKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnInterpolationKeyframe, this.getInterpolationKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnBoneKeyframe, this.getBoneKeyframeButtonState());
        this.updatePhysicsKeyframeButtonState();
        this.setSectionKeyframeButtonState(this.btnMorphKeyframe, this.getMorphKeyframeButtonState());
        this.setSectionKeyframeButtonState(this.btnAccessoryKeyframe, this.getAccessoryKeyframeButtonState());
    }

    private updatePhysicsKeyframeButtonState(): void {
        if (!this.btnPhysicsKeyframe) return;
        this.btnPhysicsKeyframe.hidden = this.mmdManager.isPlaying;
        this.btnPhysicsKeyframe.setAttribute("aria-pressed", this.physicsKeyframeInputMode === 1 ? "true" : "false");
        if (this.mmdManager.isPlaying) {
            this.btnPhysicsKeyframe.disabled = true;
            return;
        }
        this.btnPhysicsKeyframe.disabled = this.mmdManager.getTimelineTarget() !== "model";
    }

    private clearRegisteredKeySelection(): void {
        this.timeline.clearSelectedKeys({ keepActiveTrack: true, clearActiveFrame: true });
        this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
    }

    private setSectionKeyframeButtonState(button: HTMLButtonElement | null, state: SectionKeyframeButtonState): void {
        if (!button) return;

        button.classList.remove("is-none", "is-empty", "is-registered");
        button.hidden = this.mmdManager.isPlaying;
        if (this.mmdManager.isPlaying) {
            button.disabled = true;
            button.textContent = "";
            return;
        }
        button.disabled = state === "none";
        button.textContent = state === "registered" ? "♦" : state === "dirty" ? "♢" : "";
        if (state === "none") {
            button.classList.add("is-none");
        } else if (state === "dirty") {
            button.classList.add("is-empty");
        } else {
            button.classList.add("is-registered");
        }
    }

    private markSectionKeyframeDirty(section: SectionKeyframeSection, contextKey: string | null): void {
        if (!contextKey) return;
        this.sectionKeyframeDirtyKeys[section].add(contextKey);
    }

    private clearSectionKeyframeDirty(section: SectionKeyframeSection, contextKey: string | null): void {
        if (!contextKey) return;
        this.sectionKeyframeDirtyKeys[section].delete(contextKey);
    }

    private clearTransientEditingStateForFrameChange(): void {
        for (const section of Object.keys(this.sectionKeyframeDirtyKeys) as SectionKeyframeSection[]) {
            this.sectionKeyframeDirtyKeys[section].clear();
        }
        this.pendingBonePoseSnapshots.clear();
        this.debugKeyframeFlow("cleared transient editing state for frame change");
        this.updateSectionKeyframeButtons();
    }

    private rememberEditedBonePoseSnapshot(
        boneName: string | null,
        snapshotOverride: SelectedBonePoseSnapshot | null = null,
    ): void {
        if (!boneName) return;
        const snapshot = snapshotOverride ?? this.captureCurrentBonePoseSnapshot(boneName);
        if (!snapshot) return;
        this.pendingBonePoseSnapshots.set(boneName, {
            frame: this.mmdManager.currentFrame,
            snapshot,
        });
        this.debugKeyframeFlow("remember edited bone pose", {
            boneName,
            frame: this.mmdManager.currentFrame,
            snapshot,
            snapshotText: this.formatPoseSnapshotText(snapshot),
        });
    }

    private captureCurrentBonePoseSnapshot(boneName: string): SelectedBonePoseSnapshot | null {
        if (boneName === "Camera") {
            const snapshot = this.mmdManager.getCameraKeyframePose();
            this.debugKeyframeFlow("capture camera pose snapshot", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(snapshot),
            });
            return snapshot;
        }

        const pendingSnapshot = this.getPendingBonePoseSnapshot(boneName);
        if (pendingSnapshot) {
            this.debugKeyframeFlow("capture bone pose snapshot from pending", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(pendingSnapshot),
            });
            return pendingSnapshot;
        }

        const panelSnapshot = this.bottomPanel.getSelectedBoneTransformSnapshot();
        if (panelSnapshot && this.bottomPanel.getSelectedBone() === boneName) {
            this.debugKeyframeFlow("capture bone pose snapshot from panel", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(panelSnapshot),
            });
            return panelSnapshot;
        }

        const managerSnapshot = this.mmdManager.getBoneTransform(boneName);
        if (managerSnapshot) {
            this.debugKeyframeFlow("capture bone pose snapshot from manager", {
                boneName,
                snapshot: this.formatBonePoseSnapshotForLog(managerSnapshot),
            });
            return managerSnapshot;
        }

        return null;
    }

    private getPendingBonePoseSnapshot(boneName: string | null, frame = this.mmdManager.currentFrame): SelectedBonePoseSnapshot | null {
        if (!boneName) return null;
        const entry = this.pendingBonePoseSnapshots.get(boneName);
        if (!entry) return null;
        const normalizedFrame = Math.max(0, Math.floor(frame));
        if (entry.frame !== normalizedFrame) {
            this.debugKeyframeFlow("pending bone pose miss by frame", { boneName, frame: normalizedFrame, pendingFrame: entry.frame });
            return null;
        }
        this.debugKeyframeFlow("pending bone pose hit", { boneName, frame: normalizedFrame, snapshot: entry.snapshot });
        return entry.snapshot;
    }

    private syncBottomPanelBoneFromEditedPose(boneName: string | null, force = true): void {
        if (!boneName) return;
        const snapshot = this.getPendingBonePoseSnapshot(boneName);
        if (snapshot) {
            this.debugKeyframeFlow("sync bottom panel from edited pose", { boneName, snapshot });
            this.bottomPanel.syncSelectedBoneSlidersFromSnapshot(snapshot, force);
            return;
        }
        this.debugKeyframeFlow("sync bottom panel from runtime pose", { boneName });
        this.bottomPanel.syncSelectedBoneSlidersFromRuntime(force);
    }

    private formatBonePoseSnapshotForLog(snapshot: SelectedBonePoseSnapshot): {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        target?: { x: number; y: number; z: number };
        distance?: number;
        fov?: number;
    } {
        const round = (value: number): number => Math.round(value * 1000) / 1000;
        return {
            position: {
                x: round(snapshot.position.x),
                y: round(snapshot.position.y),
                z: round(snapshot.position.z),
            },
            rotation: {
                x: round(snapshot.rotation.x),
                y: round(snapshot.rotation.y),
                z: round(snapshot.rotation.z),
            },
            ...(snapshot.target ? {
                target: {
                    x: round(snapshot.target.x),
                    y: round(snapshot.target.y),
                    z: round(snapshot.target.z),
                },
            } : {}),
            ...(typeof snapshot.distance === "number" ? { distance: round(snapshot.distance) } : {}),
            ...(typeof snapshot.fov === "number" ? { fov: round(snapshot.fov) } : {}),
        };
    }

    private formatNumberBlockForLog(values: ArrayLike<number> | readonly number[], precision = 3): string {
        const factor = 10 ** precision;
        return `[${Array.from(values, (value) => {
            const normalized = Number.isFinite(value) ? value : 0;
            return Math.round(normalized * factor) / factor;
        }).join(", ")}]`;
    }

    private formatPoseSnapshotText(snapshot: SelectedBonePoseSnapshot | null): string | null {
        if (!snapshot) return null;
        const formatted = this.formatBonePoseSnapshotForLog(snapshot);
        const parts = [
            `pos=${this.formatNumberBlockForLog([formatted.position.x, formatted.position.y, formatted.position.z])}`,
            `rot=${this.formatNumberBlockForLog([formatted.rotation.x, formatted.rotation.y, formatted.rotation.z])}`,
        ];
        if (formatted.distance !== undefined) {
            parts.push(`dist=${formatted.distance}`);
        }
        if (formatted.fov !== undefined) {
            parts.push(`fov=${formatted.fov}`);
        }
        return parts.join(" ");
    }

    private getDisplayBonePoseSnapshot(frame: number): SelectedBonePoseSnapshot | null {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) {
            const source = this.getSelectedBonePoseSnapshotFromSource(frame);
            this.debugKeyframeFlow("display pose from source (no selected bone)", { frame, source });
            return source;
        }

        const pendingSnapshot = this.getPendingBonePoseSnapshot(boneName, frame);
        if (pendingSnapshot) {
            this.debugKeyframeFlow("display pose from pending snapshot", { boneName, frame, snapshot: pendingSnapshot });
            return pendingSnapshot;
        }

        const source = this.getSelectedBonePoseSnapshotFromSource(frame);
        this.debugKeyframeFlow("display pose from source", { boneName, frame, source });
        return source;
    }

    private applySelectedBonePoseSnapshotToRuntime(frame: number, snapshot: SelectedBonePoseSnapshot | null): void {
        if (this.mmdManager.isPlaying) return;

        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName || !snapshot) return;

        if (boneName === "Camera") {
            const target = snapshot.target ?? this.computeCameraTargetFromViewportSnapshot(snapshot);
            this.mmdManager.applyCameraTrackPose(
                target,
                snapshot.rotation,
                snapshot.distance ?? this.mmdManager.getCameraDistance(),
                snapshot.fov,
            );
            return;
        }

        this.debugKeyframeFlow("apply sampled pose to runtime", {
            boneName,
            frame,
            snapshot,
            snapshotText: this.formatPoseSnapshotText(snapshot),
        });
        this.mmdManager.setBoneTranslation(
            boneName,
            snapshot.position.x,
            snapshot.position.y,
            snapshot.position.z,
            false,
        );
        this.mmdManager.setBoneRotation(
            boneName,
            snapshot.rotation.x,
            snapshot.rotation.y,
            snapshot.rotation.z,
            false,
        );
    }

    private getSectionKeyframeContextPrefix(section: SectionKeyframeSection): string {
        return section;
    }

    private getInfoKeyframeContextKey(): string | null {
        if (this.mmdManager.getTimelineTarget() !== "model") return null;
        const model = this.mmdManager.getLoadedModels().find((item) => item.active) ?? null;
        if (!model) return null;
        const modelKey = model.path || model.name || String(model.index);
        return `${this.getSectionKeyframeContextPrefix("info")}:${modelKey}:frame:${this.mmdManager.currentFrame}`;
    }

    private getInterpolationKeyframeContextKey(track: Pick<KeyframeTrack, "name" | "category"> | null = null): string | null {
        const selectedTrack = track ?? this.getSelectedTimelineTrack();
        if (!selectedTrack) return null;
        if (selectedTrack.category === "morph") return null;
        return `${this.getSectionKeyframeContextPrefix("interpolation")}:${selectedTrack.category}:${selectedTrack.name}:frame:${this.mmdManager.currentFrame}`;
    }

    private getBoneKeyframeContextKey(boneName: string | null = this.bottomPanel.getSelectedBone()): string | null {
        if (!boneName) return null;
        return `${this.getSectionKeyframeContextPrefix("bone")}:${boneName}:frame:${this.mmdManager.currentFrame}`;
    }

    private getMorphKeyframeContextKey(frameIndex: number | null = this.bottomPanel.getSelectedMorphFrameIndex()): string | null {
        if (frameIndex === null || frameIndex < 0) return null;
        return `${this.getSectionKeyframeContextPrefix("morph")}:frame:${frameIndex}:key:${this.mmdManager.currentFrame}`;
    }

    private getAccessoryKeyframeContextKey(
        accessoryIndex: number | null = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null,
    ): string | null {
        if (accessoryIndex === null || accessoryIndex < 0) return null;
        return `${this.getSectionKeyframeContextPrefix("accessory")}:${accessoryIndex}:frame:${this.mmdManager.currentFrame}`;
    }

    private getSelectedBonePoseSnapshotFromSource(frame: number): SelectedBonePoseSnapshot | null {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) return null;

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (boneName === "Camera") {
            const cameraTrack = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrack) return null;
            return this.sampleCameraPoseFromTrack(cameraTrack, normalizedFrame);
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return null;

        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel as object);
        if (!modelAnimation) {
            this.debugKeyframeFlow("source pose fallback to animated runtime (no model animation)", { boneName, frame });
            return this.mmdManager.getAnimatedBoneTransform(boneName);
        }

        const movableTrack = modelAnimation.movableBoneTracks.find((track) => track.name === boneName) ?? null;
        if (movableTrack) {
            const sampled = this.sampleMovableBonePoseFromTrack(movableTrack, normalizedFrame);
            if (sampled) {
                this.debugKeyframeFlow("source pose sampled from movable track", {
                    boneName,
                    frame: normalizedFrame,
                    trackFrameNumbers: Array.from(movableTrack.frameNumbers),
                    trackFrameNumbersText: this.formatNumberBlockForLog(movableTrack.frameNumbers, 0),
                    sampled: this.formatBonePoseSnapshotForLog(sampled),
                    sampledText: this.formatPoseSnapshotText(sampled),
                });
                return sampled;
            }
        }

        const boneTrack = modelAnimation.boneTracks.find((track) => track.name === boneName) ?? null;
        if (boneTrack) {
            const sampled = this.sampleBonePoseFromTrack(boneTrack, normalizedFrame);
            if (sampled) {
                this.debugKeyframeFlow("source pose sampled from bone track", {
                    boneName,
                    frame: normalizedFrame,
                    trackFrameNumbers: Array.from(boneTrack.frameNumbers),
                    trackFrameNumbersText: this.formatNumberBlockForLog(boneTrack.frameNumbers, 0),
                    sampled: this.formatBonePoseSnapshotForLog(sampled),
                    sampledText: this.formatPoseSnapshotText(sampled),
                });
                return sampled;
            }
        }

        this.debugKeyframeFlow("source pose fallback to animated runtime", { boneName, frame });
        return this.mmdManager.getAnimatedBoneTransform(boneName);
    }

    private computeCameraTargetFromViewportSnapshot(snapshot: SelectedBonePoseSnapshot): Vector3 {
        const xRad = (snapshot.rotation.x * Math.PI) / 180;
        const yRad = (snapshot.rotation.y * Math.PI) / 180;
        const zRad = (snapshot.rotation.z * Math.PI) / 180;
        const rotation = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const distance = Math.max(0.0001, snapshot.distance ?? this.mmdManager.getCameraDistance());
        const offset = Vector3.TransformNormal(new Vector3(0, 0, distance), rotation);
        return new Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z).add(offset);
    }

    private computeViewportCameraPositionFromTrackPose(
        target: Vector3,
        rotationDeg: { x: number; y: number; z: number },
        trackDistance: number,
    ): Vector3 {
        const xRad = (rotationDeg.x * Math.PI) / 180;
        const yRad = (rotationDeg.y * Math.PI) / 180;
        const zRad = (rotationDeg.z * Math.PI) / 180;
        const rotation = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const offset = Vector3.TransformNormal(new Vector3(0, 0, trackDistance), rotation);
        return target.add(offset);
    }

    private sampleCameraPoseFromTrack(track: RuntimeCameraTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);

        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];
        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const position = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
            const rotation = this.readFloatBlock(track.rotations, lowerIndex, 3, [0, 0, 0]);
            const distance = this.readFloatBlock(track.distances, lowerIndex, 1, [this.mmdManager.getCameraDistance()]);
            const fov = this.readFloatBlock(track.fovs, lowerIndex, 1, [this.mmdManager.getCameraFov()]);
            const rotationDeg = {
                x: rotation[0] * (180 / Math.PI),
                y: rotation[1] * (180 / Math.PI),
                z: rotation[2] * (180 / Math.PI),
            };
            const target = new Vector3(position[0], position[1], position[2]);
            const viewportPosition = this.computeViewportCameraPositionFromTrackPose(target, rotationDeg, distance[0]);
            return {
                position: { x: viewportPosition.x, y: viewportPosition.y, z: viewportPosition.z },
                rotation: rotationDeg,
                target: { x: target.x, y: target.y, z: target.z },
                distance: Math.abs(distance[0]),
                fov: fov[0],
            };
        }

        const gradient = (clampedFrame - lowerFrame) / (upperFrame - lowerFrame);
        const positionA = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
        const positionB = this.readFloatBlock(track.positions, upperBoundIndex, 3, positionA);
        const rotationA = this.readFloatBlock(track.rotations, lowerIndex, 3, [0, 0, 0]);
        const rotationB = this.readFloatBlock(track.rotations, upperBoundIndex, 3, rotationA);
        const distanceA = this.readFloatBlock(track.distances, lowerIndex, 1, [this.mmdManager.getCameraDistance()]);
        const distanceB = this.readFloatBlock(track.distances, upperBoundIndex, 1, distanceA);
        const fovA = this.readFloatBlock(track.fovs, lowerIndex, 1, [this.mmdManager.getCameraFov()]);
        const fovB = this.readFloatBlock(track.fovs, upperBoundIndex, 1, fovA);

        const positionInterpolation = this.readFloatBlock(
            track.positionInterpolations,
            upperBoundIndex,
            12,
            [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
        );
        const positionWeightX = this.bezierInterpolate(
            positionInterpolation[0] / 127,
            positionInterpolation[1] / 127,
            positionInterpolation[2] / 127,
            positionInterpolation[3] / 127,
            gradient,
        );
        const positionWeightY = this.bezierInterpolate(
            positionInterpolation[4] / 127,
            positionInterpolation[5] / 127,
            positionInterpolation[6] / 127,
            positionInterpolation[7] / 127,
            gradient,
        );
        const positionWeightZ = this.bezierInterpolate(
            positionInterpolation[8] / 127,
            positionInterpolation[9] / 127,
            positionInterpolation[10] / 127,
            positionInterpolation[11] / 127,
            gradient,
        );
        const rotationInterp = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const rotationWeight = this.bezierInterpolate(
            rotationInterp[0] / 127,
            rotationInterp[1] / 127,
            rotationInterp[2] / 127,
            rotationInterp[3] / 127,
            gradient,
        );
        const distanceInterp = this.readFloatBlock(track.distanceInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const distanceWeight = this.bezierInterpolate(
            distanceInterp[0] / 127,
            distanceInterp[1] / 127,
            distanceInterp[2] / 127,
            distanceInterp[3] / 127,
            gradient,
        );
        const fovInterp = this.readFloatBlock(track.fovInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const fovWeight = this.bezierInterpolate(
            fovInterp[0] / 127,
            fovInterp[1] / 127,
            fovInterp[2] / 127,
            fovInterp[3] / 127,
            gradient,
        );

        const target = new Vector3(
            positionA[0] + (positionB[0] - positionA[0]) * positionWeightX,
            positionA[1] + (positionB[1] - positionA[1]) * positionWeightY,
            positionA[2] + (positionB[2] - positionA[2]) * positionWeightZ,
        );
        const rotationDeg = {
            x: (rotationA[0] + (rotationB[0] - rotationA[0]) * rotationWeight) * (180 / Math.PI),
            y: (rotationA[1] + (rotationB[1] - rotationA[1]) * rotationWeight) * (180 / Math.PI),
            z: (rotationA[2] + (rotationB[2] - rotationA[2]) * rotationWeight) * (180 / Math.PI),
        };
        const trackDistance = distanceA[0] + (distanceB[0] - distanceA[0]) * distanceWeight;
        const viewportPosition = this.computeViewportCameraPositionFromTrackPose(target, rotationDeg, trackDistance);
        return {
            position: { x: viewportPosition.x, y: viewportPosition.y, z: viewportPosition.z },
            rotation: rotationDeg,
            target: { x: target.x, y: target.y, z: target.z },
            distance: Math.abs(trackDistance),
            fov: fovA[0] + (fovB[0] - fovA[0]) * fovWeight,
        };
    }

    private sampleMovableBonePoseFromTrack(track: RuntimeMovableBoneTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);
        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];

        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const position = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
            const rotationQuaternion = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
            const rotationEuler = rotationQuaternion.toEulerAngles();
            return {
                position: { x: position[0], y: position[1], z: position[2] },
                rotation: {
                    x: rotationEuler.x * (180 / Math.PI),
                    y: rotationEuler.y * (180 / Math.PI),
                    z: rotationEuler.z * (180 / Math.PI),
                },
            };
        }

        const gradient = (clampedFrame - lowerFrame) / (upperFrame - lowerFrame);
        const positionA = this.readFloatBlock(track.positions, lowerIndex, 3, [0, 0, 0]);
        const positionB = this.readFloatBlock(track.positions, upperBoundIndex, 3, positionA);
        const rotationA = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
        const rotationB = Quaternion.FromArray(this.readFloatBlock(track.rotations, upperBoundIndex, 4, [0, 0, 0, 1]));
        const positionInterpolation = this.readFloatBlock(track.positionInterpolations, upperBoundIndex, 12, [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107]);
        const rotationInterpolation = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);

        const positionWeightX = this.bezierInterpolate(positionInterpolation[0] / 127, positionInterpolation[1] / 127, positionInterpolation[2] / 127, positionInterpolation[3] / 127, gradient);
        const positionWeightY = this.bezierInterpolate(positionInterpolation[4] / 127, positionInterpolation[5] / 127, positionInterpolation[6] / 127, positionInterpolation[7] / 127, gradient);
        const positionWeightZ = this.bezierInterpolate(positionInterpolation[8] / 127, positionInterpolation[9] / 127, positionInterpolation[10] / 127, positionInterpolation[11] / 127, gradient);
        const rotationWeight = this.bezierInterpolate(rotationInterpolation[0] / 127, rotationInterpolation[1] / 127, rotationInterpolation[2] / 127, rotationInterpolation[3] / 127, gradient);

        Quaternion.SlerpToRef(rotationA, rotationB, rotationWeight, rotationA);
        const rotation = rotationA.toEulerAngles();
        return {
            position: {
                x: positionA[0] + (positionB[0] - positionA[0]) * positionWeightX,
                y: positionA[1] + (positionB[1] - positionA[1]) * positionWeightY,
                z: positionA[2] + (positionB[2] - positionA[2]) * positionWeightZ,
            },
            rotation: {
                x: rotation.x * (180 / Math.PI),
                y: rotation.y * (180 / Math.PI),
                z: rotation.z * (180 / Math.PI),
            },
        };
    }

    private sampleBonePoseFromTrack(track: RuntimeBoneTrackLike, frame: number): SelectedBonePoseSnapshot | null {
        const frameNumbers = track.frameNumbers;
        if (!frameNumbers || frameNumbers.length === 0) return null;

        const clampedFrame = this.clampFrameToTrackRange(frame, frameNumbers);
        const upperBoundIndex = this.findUpperBoundFrameIndex(frameNumbers, clampedFrame);
        const lowerIndex = Math.max(0, upperBoundIndex - 1);
        const lowerFrame = frameNumbers[lowerIndex] ?? frameNumbers[0] ?? clampedFrame;
        const upperFrame = frameNumbers[upperBoundIndex];

        if (upperFrame === undefined || lowerFrame + 1 === upperFrame) {
            const rotationQuaternion = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
            const rotationEuler = rotationQuaternion.toEulerAngles();
            return {
                position: { x: 0, y: 0, z: 0 },
                rotation: {
                    x: rotationEuler.x * (180 / Math.PI),
                    y: rotationEuler.y * (180 / Math.PI),
                    z: rotationEuler.z * (180 / Math.PI),
                },
            };
        }

        const rotationA = Quaternion.FromArray(this.readFloatBlock(track.rotations, lowerIndex, 4, [0, 0, 0, 1]));
        const rotationB = Quaternion.FromArray(this.readFloatBlock(track.rotations, upperBoundIndex, 4, [0, 0, 0, 1]));
        const rotationInterpolation = this.readFloatBlock(track.rotationInterpolations, upperBoundIndex, 4, [20, 107, 20, 107]);
        const rotationWeight = this.bezierInterpolate(rotationInterpolation[0] / 127, rotationInterpolation[1] / 127, rotationInterpolation[2] / 127, rotationInterpolation[3] / 127, (clampedFrame - lowerFrame) / (upperFrame - lowerFrame));
        Quaternion.SlerpToRef(rotationA, rotationB, rotationWeight, rotationA);
        const rotation = rotationA.toEulerAngles();
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: {
                x: rotation.x * (180 / Math.PI),
                y: rotation.y * (180 / Math.PI),
                z: rotation.z * (180 / Math.PI),
            },
        };
    }

    private clampFrameToTrackRange(frame: number, frames: NumericArrayLike): number {
        const normalizedFrame = Math.max(0, Math.floor(frame));
        if (!frames || frames.length === 0) return normalizedFrame;
        const first = frames[0] ?? normalizedFrame;
        const last = frames[frames.length - 1] ?? first;
        return Math.max(first, Math.min(last, normalizedFrame));
    }

    private findUpperBoundFrameIndex(frames: NumericArrayLike, frame: number): number {
        if (!frames || frames.length === 0) return 0;
        let lo = 0;
        let hi = frames.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frames[mid] <= frame) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private bezierInterpolate(x1: number, x2: number, y1: number, y2: number, x: number): number {
        let c = 0.5;
        let t = c;
        let s = 1.0 - t;
        const loop = 15;
        const eps = 1e-5;
        let sst3 = 0;
        let stt3 = 0;
        let ttt = 0;
        for (let i = 0; i < loop; ++i) {
            sst3 = 3.0 * s * s * t;
            stt3 = 3.0 * s * t * t;
            ttt = t * t * t;
            const ft = (sst3 * x1) + (stt3 * x2) + ttt - x;
            if (Math.abs(ft) < eps) break;
            c *= 0.5;
            t += ft < 0 ? c : -c;
            s = 1.0 - t;
        }
        return (sst3 * y1) + (stt3 * y2) + ttt;
    }

    private hasAccessoryTransformKeyframe(accessoryIndex: number, frame: number): boolean {
        const manager = this.mmdManager as unknown as {
            hasAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
        };
        return manager.hasAccessoryTransformKeyframe?.(accessoryIndex, frame) ?? false;
    }

    private addAccessoryTransformKeyframe(accessoryIndex: number, frame: number): boolean {
        const manager = this.mmdManager as unknown as {
            addAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
        };
        return manager.addAccessoryTransformKeyframe?.(accessoryIndex, frame) ?? false;
    }

    private getInfoKeyframeButtonState(): SectionKeyframeButtonState {
        const contextKey = this.getInfoKeyframeContextKey();
        if (!contextKey) return "none";
        if (this.sectionKeyframeDirtyKeys.info.has(contextKey)) return "dirty";
        return this.mmdManager.hasInfoKeyframe(this.mmdManager.currentFrame) ? "registered" : "none";
    }

    private getInterpolationKeyframeButtonState(): SectionKeyframeButtonState {
        const track = this.getSelectedTimelineTrack();
        const contextKey = this.getInterpolationKeyframeContextKey(track);
        if (!track || !contextKey) return "none";
        if (this.sectionKeyframeDirtyKeys.interpolation.has(contextKey)) return "dirty";
        if (this.mmdManager.hasTimelineKeyframe(track, this.mmdManager.currentFrame)) return "registered";
        return "none";
    }

    private getBoneKeyframeButtonState(): SectionKeyframeButtonState {
        const boneName = this.bottomPanel.getSelectedBone();
        const contextKey = this.getBoneKeyframeContextKey(boneName);
        if (!boneName || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.bone.has(contextKey)) return "dirty";

        if (boneName === "Camera") {
            return this.mmdManager.hasTimelineKeyframe({ name: boneName, category: "camera" }, this.mmdManager.currentFrame)
                ? "registered"
                : "none";
        }

        const track = this.getSelectedTimelineTrack();
        if (track && this.isBoneTrackForEditor(track) && track.name === boneName) {
            if (this.mmdManager.hasTimelineKeyframe(track, this.mmdManager.currentFrame)) return "registered";
            return "none";
        }

        if (this.selectedBoneTrackCategory) {
            const fallbackTrack = { name: boneName, category: this.selectedBoneTrackCategory };
            if (this.mmdManager.hasTimelineKeyframe(fallbackTrack, this.mmdManager.currentFrame)) return "registered";
        }
        return "none";
    }

    private getMorphKeyframeButtonState(): SectionKeyframeButtonState {
        const frameIndex = this.bottomPanel.getSelectedMorphFrameIndex();
        const contextKey = this.getMorphKeyframeContextKey(frameIndex);
        if (frameIndex === null || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.morph.has(contextKey)) return "dirty";

        const snapshot = this.bottomPanel.getSelectedMorphFrameSnapshot();
        if (!snapshot) return "none";
        if (snapshot.morphs.length === 0) return "none";
        const hasRegisteredMorphKeyframes = snapshot.morphs.every((morph) =>
            this.mmdManager.hasTimelineKeyframe({ name: morph.name, category: "morph" }, this.mmdManager.currentFrame)
        );
        return hasRegisteredMorphKeyframes ? "registered" : "none";
    }

    private getAccessoryKeyframeButtonState(): SectionKeyframeButtonState {
        const accessoryIndex = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null;
        const contextKey = this.getAccessoryKeyframeContextKey(accessoryIndex);
        if (accessoryIndex === null || !contextKey) return "none";

        if (this.sectionKeyframeDirtyKeys.accessory.has(contextKey)) return "dirty";
        if (this.hasAccessoryTransformKeyframe(accessoryIndex, this.mmdManager.currentFrame)) return "registered";
        return "none";
    }

    private updateInterpolationPreview(track: KeyframeTrack, frame: number): void {
        const preview = this.buildInterpolationPreviewFromRuntime(track, frame);
        this.currentInterpolationPreview = preview;
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
        this.updateInterpolationActionButtons();
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

        this.interpolationDragState = { channelId, pointIndex, changed: false, dirtyMarked: false };
        const onMove = (moveEvent: PointerEvent) => this.handleInterpolationCurveDragMove(moveEvent, svg);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const changed = this.interpolationDragState?.changed ?? false;
            this.interpolationDragState = null;
            this.actionDispatcher.dispatch({
                type: "interpolation.finishHandleDrag",
                source: "panel",
                changed,
            });
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
        const { width, height, left, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const viewX = ((event.clientX - rect.left) / rect.width) * width;
        const viewY = ((event.clientY - rect.top) / rect.height) * height;
        const x = this.clampInterpolationValue(((viewX - left) / innerWidth) * 127, 0);
        const y = this.clampInterpolationValue(((bottom - viewY) / innerHeight) * 127, 0);

        const updated = this.actionDispatcher.dispatch({
            type: "interpolation.updateHandle",
            source: "panel",
            channelId: dragState.channelId,
            pointIndex: dragState.pointIndex,
            x,
            y,
        });
        if (!updated) return;

        this.updateInterpolationCurveDragVisuals(svg, dragState.channelId);
    }

    private updateInterpolationCurveHandle(
        channelId: string,
        pointIndex: 1 | 2,
        x: number,
        y: number,
    ): void {
        const binding = this.interpolationChannelBindings.get(channelId);
        if (!binding) return;

        const oldX = pointIndex === 1 ? binding.values[binding.offset + 0] : binding.values[binding.offset + 1];
        const oldY = pointIndex === 1 ? binding.values[binding.offset + 2] : binding.values[binding.offset + 3];
        if (oldX === x && oldY === y) return;

        if (pointIndex === 1) {
            binding.values[binding.offset + 0] = x;
            binding.values[binding.offset + 2] = y;
        } else {
            binding.values[binding.offset + 1] = x;
            binding.values[binding.offset + 3] = y;
        }

        const dragState = this.interpolationDragState;
        if (dragState?.channelId === channelId && dragState.pointIndex === pointIndex) {
            dragState.changed = true;
            if (!dragState.dirtyMarked) {
                dragState.dirtyMarked = true;
                this.markSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey());
                this.updateSectionKeyframeButtons();
            }
            return;
        }

        this.markSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey());
        this.updateSectionKeyframeButtons();
    }

    private updateInterpolationCurveDragVisuals(svg: SVGSVGElement, channelId: string): void {
        const binding = this.interpolationChannelBindings.get(channelId);
        if (!binding) return;

        const x1 = binding.values[binding.offset + 0];
        const x2 = binding.values[binding.offset + 1];
        const y1 = binding.values[binding.offset + 2];
        const y2 = binding.values[binding.offset + 3];

        const { left, right, top, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const px1 = left + (x1 / 127) * innerWidth;
        const px2 = left + (x2 / 127) * innerWidth;
        const py1 = bottom - (y1 / 127) * innerHeight;
        const py2 = bottom - (y2 / 127) * innerHeight;

        const svgElements = Array.from(svg.querySelectorAll<SVGElement>("[data-channel-id]"));
        for (const element of svgElements) {
            if (element.dataset.channelId !== channelId) continue;
            switch (element.dataset.role) {
                case "handle-line-start":
                    element.setAttribute("x2", String(px1));
                    element.setAttribute("y2", String(py1));
                    break;
                case "handle-line-end":
                    element.setAttribute("x1", String(px2));
                    element.setAttribute("y1", String(py2));
                    break;
                case "curve-path":
                    element.setAttribute("d", `M ${left} ${bottom} C ${px1} ${py1}, ${px2} ${py2}, ${right} ${top}`);
                    break;
                case "point":
                case "hit-area":
                    if (element.dataset.pointIndex === "1") {
                        element.setAttribute("cx", String(px1));
                        element.setAttribute("cy", String(py1));
                    } else if (element.dataset.pointIndex === "2") {
                        element.setAttribute("cx", String(px2));
                        element.setAttribute("cy", String(py2));
                    }
                    break;
            }
        }

        const valueLabels = Array.from(this.interpolationCurveList.querySelectorAll<HTMLElement>(".interp-curve-value"));
        const valueLabel = valueLabels.find((element) => element.dataset.channelId === channelId);
        if (valueLabel) {
            valueLabel.textContent = `${x1},${x2},${y1},${y2}`;
        }
    }

    private refreshRuntimeAnimationFromInterpolationEdit(): void {
        const track = this.getSelectedTimelineTrack();
        if (!track || track.category === "morph") return;
        this.refreshRuntimeAnimationForTrack();
    }

    private refreshRuntimeAnimationForTrack(): void {
        this.mmdManager.refreshActiveRuntimeAnimationHandles();
        this.mmdManager.seekToBoundary(this.mmdManager.currentFrame);
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

    private updateInterpolationActionButtons(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        const hasTargetChannels = targetChannels.length > 0 && !this.mmdManager.isPlaying;
        if (this.btnInterpolationCopy) {
            this.btnInterpolationCopy.disabled = !hasTargetChannels;
        }
        if (this.btnInterpolationLinear) {
            this.btnInterpolationLinear.disabled = !hasTargetChannels;
        }
        if (this.btnInterpolationPaste) {
            this.btnInterpolationPaste.disabled = !hasTargetChannels || !this.interpolationCurveClipboard;
        }
    }

    private getActiveEditableInterpolationChannels(): InterpolationChannelPreview[] {
        const preview = this.currentInterpolationPreview;
        if (!preview) return [];
        return this.getInterpolationChannelsForRender(preview)
            .filter((channel) => channel.available && this.isInterpolationChannelEditable(channel.id));
    }

    private readCurrentInterpolationCurve(channel: InterpolationChannelPreview): InterpolationCurve {
        const binding = this.interpolationChannelBindings.get(channel.id);
        if (!binding) {
            return { ...channel.curve };
        }
        return {
            x1: binding.values[binding.offset + 0],
            x2: binding.values[binding.offset + 1],
            y1: binding.values[binding.offset + 2],
            y2: binding.values[binding.offset + 3],
        };
    }

    private writeInterpolationCurve(channelId: string, curve: InterpolationCurve): boolean {
        const binding = this.interpolationChannelBindings.get(channelId);
        if (!binding) return false;
        binding.values[binding.offset + 0] = this.clampInterpolationValue(curve.x1, 0);
        binding.values[binding.offset + 1] = this.clampInterpolationValue(curve.x2, 0);
        binding.values[binding.offset + 2] = this.clampInterpolationValue(curve.y1, 0);
        binding.values[binding.offset + 3] = this.clampInterpolationValue(curve.y2, 0);
        return true;
    }

    private copyInterpolationCurves(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to copy", "info");
            return;
        }

        this.interpolationCurveClipboard = {
            curves: targetChannels.map((channel) => this.readCurrentInterpolationCurve(channel)),
            sourceChannelCount: targetChannels.length,
        };
        this.updateInterpolationActionButtons();

        const label = targetChannels.length === 1
            ? `${targetChannels[0]?.label ?? "curve"}`
            : `${targetChannels.length} curves`;
        this.showToast(`Copied ${label}`, "success");
    }

    private pasteInterpolationCurves(): void {
        const clipboard = this.interpolationCurveClipboard;
        if (!clipboard || clipboard.curves.length === 0) {
            this.showToast("No copied interpolation curves", "info");
            return;
        }

        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to paste", "info");
            return;
        }

        let changed = false;
        if (clipboard.curves.length === 1) {
            const sourceCurve = clipboard.curves[0];
            for (const channel of targetChannels) {
                changed = this.writeInterpolationCurve(channel.id, sourceCurve) || changed;
            }
        } else {
            const count = Math.min(targetChannels.length, clipboard.curves.length);
            for (let i = 0; i < count; i += 1) {
                const channel = targetChannels[i];
                const curve = clipboard.curves[i];
                changed = this.writeInterpolationCurve(channel.id, curve) || changed;
            }
        }

        if (!changed) {
            this.showToast("Interpolation paste target is not editable", "info");
            return;
        }

        this.finalizeInterpolationCurveEdit(
            clipboard.curves.length === 1 && targetChannels.length > 1
                ? `Pasted to ${targetChannels.length} curves`
                : "Interpolation curves pasted",
        );
    }

    private resetInterpolationCurvesToLinear(): void {
        const targetChannels = this.getActiveEditableInterpolationChannels();
        if (targetChannels.length === 0) {
            this.showToast("No interpolation curves available to reset", "info");
            return;
        }

        const linear = this.createLinearCurve();
        let changed = false;
        for (const channel of targetChannels) {
            changed = this.writeInterpolationCurve(channel.id, linear) || changed;
        }
        if (!changed) {
            this.showToast("Interpolation reset target is not editable", "info");
            return;
        }

        this.finalizeInterpolationCurveEdit(
            targetChannels.length === 1 ? "Interpolation reset to linear" : `${targetChannels.length} curves reset to linear`,
        );
    }

    private finalizeInterpolationCurveEdit(message: string): void {
        this.markSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey());
        this.refreshRuntimeAnimationFromInterpolationEdit();
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(message, "success");
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
            value.dataset.channelId = channel.id;
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
        const { width, height, left, right, top, bottom, innerWidth, innerHeight } =
            this.getInterpolationCurveGeometry();

        const svgNs = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNs, "svg");
        svg.classList.add("interp-curve-svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

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
            const editable = channel.available && this.isInterpolationChannelEditable(channel.id);

            const handleLine1 = document.createElementNS(svgNs, "line");
            handleLine1.classList.add("interp-curve-handle-line");
            handleLine1.dataset.channelId = channel.id;
            handleLine1.dataset.role = "handle-line-start";
            handleLine1.setAttribute("x1", String(left));
            handleLine1.setAttribute("y1", String(bottom));
            handleLine1.setAttribute("x2", String(channelPx1));
            handleLine1.setAttribute("y2", String(channelPy1));
            handleLine1.style.stroke = color;

            const handleLine2 = document.createElementNS(svgNs, "line");
            handleLine2.classList.add("interp-curve-handle-line");
            handleLine2.dataset.channelId = channel.id;
            handleLine2.dataset.role = "handle-line-end";
            handleLine2.setAttribute("x1", String(channelPx2));
            handleLine2.setAttribute("y1", String(channelPy2));
            handleLine2.setAttribute("x2", String(right));
            handleLine2.setAttribute("y2", String(top));
            handleLine2.style.stroke = color;
            if (!channel.available) {
                handleLine1.classList.add("interp-curve-handle-line--muted");
                handleLine2.classList.add("interp-curve-handle-line--muted");
            }

            const path = document.createElementNS(svgNs, "path");
            path.classList.add("interp-curve-path");
            path.dataset.channelId = channel.id;
            path.dataset.role = "curve-path";
            path.setAttribute("d", `M ${left} ${bottom} C ${channelPx1} ${channelPy1}, ${channelPx2} ${channelPy2}, ${right} ${top}`);
            path.setAttribute("stroke", color);
            if (!channel.available) {
                path.setAttribute("stroke-dasharray", "3 2");
                path.setAttribute("opacity", "0.45");
            }

            const p1 = document.createElementNS(svgNs, "circle");
            p1.classList.add("interp-curve-point");
            p1.dataset.channelId = channel.id;
            p1.dataset.role = "point";
            p1.dataset.pointIndex = "1";
            p1.setAttribute("cx", String(channelPx1));
            p1.setAttribute("cy", String(channelPy1));
            p1.setAttribute("r", editable ? "3.3" : "2.7");
            if (!channel.available) {
                p1.setAttribute("opacity", "0.5");
            } else if (editable) {
                p1.classList.add("interp-curve-point--editable");
                p1.style.fill = color;
            }

            const p2 = document.createElementNS(svgNs, "circle");
            p2.classList.add("interp-curve-point");
            p2.dataset.channelId = channel.id;
            p2.dataset.role = "point";
            p2.dataset.pointIndex = "2";
            p2.setAttribute("cx", String(channelPx2));
            p2.setAttribute("cy", String(channelPy2));
            p2.setAttribute("r", editable ? "3.3" : "2.7");
            if (!channel.available) {
                p2.setAttribute("opacity", "0.5");
            } else if (editable) {
                p2.classList.add("interp-curve-point--editable");
                p2.style.fill = color;
            }

            const p1Hit = document.createElementNS(svgNs, "circle");
            p1Hit.classList.add("interp-curve-hit-area");
            p1Hit.dataset.channelId = channel.id;
            p1Hit.dataset.role = "hit-area";
            p1Hit.dataset.pointIndex = "1";
            p1Hit.setAttribute("cx", String(channelPx1));
            p1Hit.setAttribute("cy", String(channelPy1));
            p1Hit.setAttribute("r", editable ? "8" : "6");

            const p2Hit = document.createElementNS(svgNs, "circle");
            p2Hit.classList.add("interp-curve-hit-area");
            p2Hit.dataset.channelId = channel.id;
            p2Hit.dataset.role = "hit-area";
            p2Hit.dataset.pointIndex = "2";
            p2Hit.setAttribute("cx", String(channelPx2));
            p2Hit.setAttribute("cy", String(channelPy2));
            p2Hit.setAttribute("r", editable ? "8" : "6");

            if (editable) {
                p1.style.cursor = "grab";
                p2.style.cursor = "grab";
                p1Hit.style.cursor = "grab";
                p2Hit.style.cursor = "grab";
                p1Hit.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 1)
                );
                p2Hit.addEventListener("pointerdown", (event) =>
                    this.startInterpolationCurveDrag(event, channel.id, 2)
                );
            }

            svg.appendChild(handleLine1);
            svg.appendChild(handleLine2);
            svg.appendChild(path);
            svg.appendChild(p1);
            svg.appendChild(p2);
            svg.appendChild(p1Hit);
            svg.appendChild(p2Hit);
        }

        const startAnchor = document.createElementNS(svgNs, "circle");
        startAnchor.classList.add("interp-curve-anchor");
        startAnchor.setAttribute("cx", String(left));
        startAnchor.setAttribute("cy", String(bottom));
        startAnchor.setAttribute("r", "1.8");

        const endAnchor = document.createElementNS(svgNs, "circle");
        endAnchor.classList.add("interp-curve-anchor");
        endAnchor.setAttribute("cx", String(right));
        endAnchor.setAttribute("cy", String(top));
        endAnchor.setAttribute("r", "1.8");

        svg.appendChild(startAnchor);
        svg.appendChild(endAnchor);
        return svg;
    }

    private getInterpolationCurveGeometry(): {
        width: number;
        height: number;
        left: number;
        right: number;
        top: number;
        bottom: number;
        innerWidth: number;
        innerHeight: number;
    } {
        const padding = 8;
        const width = UIController.INTERP_CURVE_VIEWBOX_WIDTH;
        const height = UIController.INTERP_CURVE_VIEWBOX_HEIGHT;
        const left = padding;
        const right = width - padding;
        const top = padding;
        const bottom = height - padding;

        return {
            width,
            height,
            left,
            right,
            top,
            bottom,
            innerWidth: right - left,
            innerHeight: bottom - top,
        };
    }

    private addKeyframeAtCurrentFrame(
        poseSnapshotOverride: SelectedBonePoseSnapshot | null = null,
        source: ActionSource = "system",
    ): void {
        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        const poseSnapshot = poseSnapshotOverride
            ?? (track.category === "camera" || this.isBoneTrackForEditor(track)
                ? this.captureCurrentBonePoseSnapshot(track.name)
                : null);
        this.debugKeyframeFlow("add keyframe request", {
            frame,
            track,
            poseSnapshotOverride,
            poseSnapshot,
        });
        if (this.tryRegisterEditorCameraKeyframe(track, poseSnapshot)) {
            return;
        }
        if (this.tryRegisterEditorBoneKeyframe(track, poseSnapshot)) {
            return;
        }

        if (track.category === "camera" && !this.mmdManager.ensureCameraAnimationForEditing()) {
            this.showToast("Failed to prepare camera keyframe track", "error");
            return;
        }
        if (track.category !== "camera" && !this.mmdManager.ensureModelAnimationForEditing(track)) {
            this.showToast("Failed to prepare model keyframe track", "error");
            return;
        }

        const interpolationSnapshot = this.captureInterpolationCurveSnapshot(track, frame);
        const morphWeight = track.category === "morph" ? this.mmdManager.getMorphWeight(track.name) : 0;
        const command = track.category === "morph"
            ? this.createKeyframePasteCommand(
                track,
                frame,
                this.mmdManager.readTimelineKeyframePayload(track, frame),
                {
                    kind: "morph",
                    weights: [Number.isFinite(morphWeight) ? morphWeight : 0],
                },
                `Register ${track.name} morph keyframe at frame ${frame}`,
            )
            : buildKeyframeCommand(
                { type: "keyframe.addCurrent", source },
                this.collectKeyframeCommandSnapshot(),
            );
        const created = command
            ? executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }))
            : false;
        if (!created) {
            const overwritten = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot, poseSnapshot);
            if (overwritten) {
                this.refreshRuntimeAnimationForTrack();
                this.applyRegisteredKeyframePoseToViewport(track, poseSnapshot);
                this.clearRegisteredKeySelection();
                this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
                if (this.isBoneTrackForEditor(track) && this.bottomPanel.getSelectedBone() === track.name) {
                    this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(track.name));
                }
                this.refreshSelectedTrackRotationOverlay();
                this.updateTimelineEditState();
                this.updateSectionKeyframeButtons();
                this.showToast(`Frame ${frame} keyframe updated`, "success");
                return;
            }
            this.showToast(`Frame ${frame} already has a keyframe`, "info");
            return;
        }

        const persistedInterpolation = this.persistInterpolationForNewKeyframe(track, frame, interpolationSnapshot, poseSnapshot);
        if (persistedInterpolation) {
            this.refreshRuntimeAnimationForTrack();
            this.applyRegisteredKeyframePoseToViewport(track, poseSnapshot);
        }

        this.clearRegisteredKeySelection();
        this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
        if (this.isBoneTrackForEditor(track) && this.bottomPanel.getSelectedBone() === track.name) {
            this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(track.name));
        }
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.commandHistory.push(command);
        this.showToast(`Frame ${frame}: keyframe added`, "success");
    }

    private registerInfoKeyframe(): void {
        const contextKey = this.getInfoKeyframeContextKey();
        if (!contextKey) return;
        if (!this.mmdManager.addInfoKeyframe(this.mmdManager.currentFrame)) {
            this.showToast("Please select a model", "error");
            return;
        }
        this.clearSectionKeyframeDirty("info", contextKey);
        this.updateSectionKeyframeButtons();
        this.updateTimelineEditState();
        this.showToast(`Frame ${this.mmdManager.currentFrame}: info keyframe saved`, "success");
    }

    private registerBoneKeyframeAtCurrentFrame(): void {
        const selectedBoneTracks = this.timeline.getSelectedBoneTracks();
        if (selectedBoneTracks.length > 1) {
            this.registerSelectedBoneTracksKeyframesAtCurrentFrame(selectedBoneTracks);
            return;
        }

        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName) {
            this.showToast("Please select a bone", "error");
            return;
        }

        this.registerBoneKeyframeForBoneAtCurrentFrame(boneName, "button");
    }

    private resolveBottomPanelBoneCommandTrack(): { category: TrackCategory; name: string } | null {
        const boneName = this.bottomPanel.getSelectedBone();
        if (!boneName || boneName === "Camera") return null;
        const preferredCategories: TrackCategory[] = this.selectedBoneTrackCategory
            ? [
                this.selectedBoneTrackCategory,
                ...(["bone", "semi-standard", "root"] as TrackCategory[]).filter(
                    (category) => category !== this.selectedBoneTrackCategory,
                ),
            ]
            : ["bone", "semi-standard", "root"];
        if (this.timeline.selectTrackByNameAndCategory(boneName, preferredCategories)) {
            const track = this.timeline.getSelectedTrack();
            if (track && this.isBoneTrackForEditor(track) && track.name !== "Camera") {
                return { category: track.category, name: track.name };
            }
        }
        return {
            category: this.selectedBoneTrackCategory ?? "bone",
            name: boneName,
        };
    }

    private registerBoneKeyframeForBoneAtCurrentFrame(boneName: string, source: ActionSource): void {
        const poseSnapshot = this.captureCurrentBonePoseSnapshot(boneName);

        const preferredCategories: TrackCategory[] = boneName === "Camera"
            ? ["camera", "bone", "semi-standard", "root"]
            : this.selectedBoneTrackCategory
                ? [
                    this.selectedBoneTrackCategory,
                    ...(["bone", "semi-standard", "root"] as TrackCategory[]).filter(
                        (category) => category !== this.selectedBoneTrackCategory,
                    ),
                ]
                : ["bone", "semi-standard", "root"];

        if (!this.timeline.selectTrackByNameAndCategory(boneName, preferredCategories)) {
            this.showToast(`No timeline track available for ${boneName}`, "error");
            return;
        }

        this.syncBoneVisualizerSelection(this.timeline.getSelectedTrack());
        const selectedTrack = this.timeline.getSelectedTrack();
        if (selectedTrack) {
            if (this.tryRegisterEditorCameraKeyframe(selectedTrack, poseSnapshot)) {
                return;
            }
            if (this.tryRegisterEditorBoneKeyframe(selectedTrack, poseSnapshot)) {
                return;
            }
        }
        this.addKeyframeAtCurrentFrame(poseSnapshot, source);
    }

    private registerSelectedBoneTracksKeyframesAtCurrentFrame(
        selectedBoneTracks: readonly TimelineBoneTrackSelectionRef[],
    ): void {
        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const physicsToggle = this.physicsKeyframeInputMode;
        const items = selectedBoneTracks
            .map((selectedTrack) => {
                const track = this.boneTrackSelectionRefToCommandTrack(selectedTrack);
                const poseSnapshot = this.captureCurrentBonePoseSnapshot(track.name);
                if (!poseSnapshot) return null;
                const interpolationSnapshot = this.captureInterpolationCurveSnapshot({
                    name: track.name,
                    category: track.category,
                    frames: new Uint32Array(),
                }, frame);
                const after = this.createBoneKeyframePayload(track, poseSnapshot, interpolationSnapshot, physicsToggle);
                return {
                    track,
                    sourceFrame: frame,
                    targetFrame: frame,
                    before: this.mmdManager.readTimelineKeyframePayload(track, frame),
                    after,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        if (items.length === 0) {
            this.showToast("No compatible bones selected", "error");
            return;
        }

        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.boneBatch:${items.length}:${frame}:${nowMs}`,
            label: `Register ${items.length} bone keyframes at frame ${frame}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.batchPaste",
                pasteBaseFrame: frame,
                items,
            },
        };

        const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!registered) {
            this.showToast(`Frame ${frame}: bone keyframe registration failed`, "error");
            return;
        }

        this.commandHistory.push(command);
        for (const item of items) {
            this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(item.track.name));
            this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(item.track));
        }
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(`Frame ${frame}: ${items.length} bone keyframes registered`, "success");
    }

    private tryRegisterEditorCameraKeyframe(
        track: KeyframeTrack,
        poseSnapshot: SelectedBonePoseSnapshot | null,
        externalParentOverride?: CameraExternalParentKeyframePayload,
    ): boolean {
        if (track.category !== "camera") {
            return false;
        }

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const interpolationSnapshot = this.captureInterpolationCurveSnapshot(track, frame);
        const before = this.mmdManager.readTimelineKeyframePayload(track, frame);
        const after = this.createCameraKeyframePayload(
            poseSnapshot,
            interpolationSnapshot,
            externalParentOverride,
        );
        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.camera:${createCommandTrackKey(track)}:${frame}:${nowMs}`,
            label: `Register camera keyframe at frame ${frame}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.paste",
                track: { category: track.category, name: track.name },
                frame,
                before,
                after,
            },
        };

        const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!registered) {
            this.showToast(`Frame ${frame}: camera keyframe failed`, "error");
            return true;
        }

        this.commandHistory.push(command);
        this.clearRegisteredKeySelection();
        this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
        if (this.bottomPanel.getSelectedBone() === "Camera") {
            this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey("Camera"));
            this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
        }
        this.refreshCameraUiFromRuntime(true);
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(
            before
                ? `Frame ${frame} camera keyframe updated`
                : `Frame ${frame}: camera keyframe added`,
            "success",
        );
        return true;
    }

    private createCameraKeyframePayload(
        poseSnapshot: SelectedBonePoseSnapshot | null,
        curves: ReadonlyMap<string, InterpolationCurve>,
        externalParentOverride?: CameraExternalParentKeyframePayload,
    ): CameraKeyframePayload {
        const runtimePose = this.mmdManager.getCameraKeyframePose();
        const target = poseSnapshot?.target ?? runtimePose.target;
        const rotationDeg = poseSnapshot?.rotation ?? runtimePose.rotation;
        const externalParent = externalParentOverride
            ?? this.mmdManager.getCameraExternalParentPayload();
        const distance = externalParent.modelPath
            ? 0
            : Math.max(0.0001, poseSnapshot?.distance ?? runtimePose.distance);
        const fov = poseSnapshot?.fov ?? runtimePose.fov;
        const degToRad = Math.PI / 180;
        return {
            kind: "camera",
            positions: [target.x, target.y, target.z],
            positionInterpolations: this.composePositionInterpolationBlock(curves, "cam-x", "cam-y", "cam-z"),
            rotations: [
                rotationDeg.x * degToRad,
                rotationDeg.y * degToRad,
                rotationDeg.z * degToRad,
            ],
            rotationInterpolations: this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-rot")),
            distances: [-distance],
            distanceInterpolations: this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-dist")),
            fovs: [fov],
            fovInterpolations: this.curveToBlock(this.getCurveFromSnapshot(curves, "cam-fov")),
            externalParent,
        };
    }

    private createBoneKeyframePayload(
        track: Pick<KeyframeTrack, "name" | "category">,
        poseSnapshot: SelectedBonePoseSnapshot,
        curves: ReadonlyMap<string, InterpolationCurve>,
        physicsToggle: 0 | 1,
        externalParent: ModelExternalParentKeyframePayload | undefined = this.mmdManager.readModelExternalParentKeyframe(
            this.mmdManager.currentFrame,
            track.name,
        ) ?? undefined,
    ): BoneKeyframePayload | MovableBoneKeyframePayload {
        const rotations = this.rotationDegreesToQuaternionBlock(
            poseSnapshot.rotation.x,
            poseSnapshot.rotation.y,
            poseSnapshot.rotation.z,
        );
        const rotationInterpolations = this.curveToBlock(this.getCurveFromSnapshot(curves, "bone-rot"));
        if (this.shouldUseMovableBoneTrack(track)) {
            return {
                kind: "movableBone",
                positions: [poseSnapshot.position.x, poseSnapshot.position.y, poseSnapshot.position.z],
                positionInterpolations: this.composePositionInterpolationBlock(curves, "bone-x", "bone-y", "bone-z"),
                rotations,
                rotationInterpolations,
                physicsToggles: [physicsToggle],
                externalParent,
            };
        }
        return {
            kind: "bone",
            rotations,
            rotationInterpolations,
            physicsToggles: [physicsToggle],
            externalParent,
        };
    }

    private tryRegisterEditorBoneKeyframe(
        track: KeyframeTrack,
        poseSnapshot: SelectedBonePoseSnapshot | null,
    ): boolean {
        if (!poseSnapshot || !this.isBoneTrackForEditor(track) || track.name === "Camera") {
            return false;
        }

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const interpolationSnapshot = this.captureInterpolationCurveSnapshot(track, frame);
        const before = this.mmdManager.readTimelineKeyframePayload(track, frame);
        const after = this.createBoneKeyframePayload(track, poseSnapshot, interpolationSnapshot, this.physicsKeyframeInputMode);
        const command = this.createKeyframePasteCommand(
            track,
            frame,
            before,
            after,
            `Register ${track.name} keyframe at frame ${frame}`,
        );
        const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!registered) {
            this.showToast(`Frame ${frame}: ${track.name} keyframe failed`, "error");
            return true;
        }

        this.commandHistory.push(command);
        this.clearRegisteredKeySelection();
        this.clearSectionKeyframeDirty("interpolation", this.getInterpolationKeyframeContextKey(track));
        if (this.bottomPanel.getSelectedBone() === track.name) {
            this.clearSectionKeyframeDirty("bone", this.getBoneKeyframeContextKey(track.name));
        }
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(
            before
                ? `Frame ${frame} keyframe updated`
                : `Frame ${frame}: keyframe added`,
            "success",
        );
        return true;
    }

    private createMorphKeyframePayload(morph: { value: number }): TimelineKeyframePayload {
        return {
            kind: "morph",
            weights: [Number.isFinite(morph.value) ? morph.value : 0],
        };
    }

    private createKeyframePasteCommand(
        track: Pick<KeyframeTrack, "name" | "category">,
        frame: number,
        before: TimelineKeyframePayload | null,
        after: TimelineKeyframePayload,
        label: string,
    ): BuiltCommand {
        const nowMs = Date.now();
        return {
            id: `keyframe.paste:${createCommandTrackKey(track)}:${frame}:${nowMs}`,
            label,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.paste",
                track: { category: track.category, name: track.name },
                frame,
                before,
                after,
            },
        };
    }

    private registerMorphKeyframesAtCurrentFrame(): void {
        const snapshot = this.bottomPanel.getSelectedMorphFrameSnapshot();
        if (!snapshot) {
            this.showToast("Please select a morph frame", "error");
            return;
        }

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const items = snapshot.morphs.map((morph) => {
            const track = { name: morph.name, category: "morph" as const };
            return {
                track,
                sourceFrame: frame,
                targetFrame: frame,
                before: this.mmdManager.readTimelineKeyframePayload(track, frame),
                after: this.createMorphKeyframePayload(morph),
            };
        });

        if (items.length > 0) {
            const nowMs = Date.now();
            const command: BuiltCommand = {
                id: `keyframe.morphBatch:${items.length}:${frame}:${nowMs}`,
                label: `Register ${items.length} morph keyframes at frame ${frame}`,
                scope: "keyframe",
                createdAtMs: nowMs,
                diff: {
                    type: "keyframe.batchPaste",
                    pasteBaseFrame: frame,
                    items,
                },
            };
            const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
            if (!registered) {
                this.showToast(`Frame ${frame}: morph keyframes registration failed`, "error");
                return;
            }

            this.commandHistory.push(command);
            this.clearSectionKeyframeDirty("morph", this.getMorphKeyframeContextKey(snapshot.frameIndex));
            this.updateSectionKeyframeButtons();
            this.bottomPanel.updateMorphKeyframeButtonStates(frame);
            this.clearRegisteredKeySelection();
            this.updateTimelineEditState();
            this.showToast(
                items.some((item) => item.before)
                    ? `Frame ${frame}: morph keyframes updated`
                    : `Frame ${frame}: morph keyframes added`,
                "success",
            );
            return;
        }

        this.showToast("No morphs in the selected frame", "error");
    }

    private registerSingleMorphKeyframeAtCurrentFrame(morph: { frameIndex: number; name: string; value: number }, options: { toast: boolean } = { toast: true }): void {
        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const track = { name: morph.name, category: "morph" as const };
        const before = this.mmdManager.readTimelineKeyframePayload(track, frame);
        const command = this.createKeyframePasteCommand(
            track,
            frame,
            before,
            this.createMorphKeyframePayload(morph),
            `Register ${morph.name} morph keyframe at frame ${frame}`,
        );
        const registered = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!registered) {
            if (options.toast) {
                this.showToast(`Frame ${frame}: ${morph.name} morph keyframe failed`, "error");
            }
            return;
        }

        this.commandHistory.push(command);
        const frameSnapshot = this.bottomPanel.getSelectedMorphFrameSnapshot();
        const allFrameMorphsRegistered = frameSnapshot?.morphs.every((frameMorph) =>
            this.mmdManager.hasTimelineKeyframe({ category: "morph", name: frameMorph.name }, frame),
        ) ?? false;
        if (allFrameMorphsRegistered) {
            this.clearSectionKeyframeDirty("morph", this.getMorphKeyframeContextKey(morph.frameIndex));
        }
        this.updateSectionKeyframeButtons();
        this.bottomPanel.updateMorphKeyframeButtonStates(frame);
        this.clearRegisteredKeySelection();
        this.updateTimelineEditState();
        if (options.toast) {
            this.showToast(
                before
                    ? `Frame ${frame}: ${morph.name} morph keyframe updated`
                    : `Frame ${frame}: ${morph.name} morph keyframe added`,
                "success",
            );
        }
    }

    private registerAccessoryTransformKeyframe(): void {
        const accessoryIndex = this.accessoryPanelController?.getSelectedAccessoryIndex() ?? null;
        if (accessoryIndex === null) {
            this.showToast("Please select an accessory", "error");
            return;
        }

        const frame = this.mmdManager.currentFrame;
        const created = this.addAccessoryTransformKeyframe(accessoryIndex, frame);
        this.clearSectionKeyframeDirty("accessory", this.getAccessoryKeyframeContextKey(accessoryIndex));
        this.updateSectionKeyframeButtons();
        this.showToast(
            created ? `Frame ${frame}: accessory keyframe added` : `Frame ${frame}: accessory keyframe already registered`,
            "success",
        );
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
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        if (track.category === "morph") {
            return this.persistMorphKeyframeValue(track, frame);
        }

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const managerInternal = this.mmdManager as unknown as Partial<MmdManagerInternalView>;

        if (track.category === "camera") {
            const cameraTrackLike = managerInternal.cameraSourceAnimation?.cameraTrack;
            if (!cameraTrackLike) return false;
            return this.persistCameraKeyframeInterpolation(
                cameraTrackLike as RuntimeCameraTrackLike & RuntimeCameraTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        const currentModel = managerInternal.currentModel;
        if (!currentModel) return false;
        const modelAnimation = managerInternal.modelSourceAnimationsByModel?.get(currentModel);
        if (!modelAnimation) return false;

        const preferMovableTrack = this.shouldUseMovableBoneTrack(track);
        const movableTrackLike = modelAnimation.movableBoneTracks.find((candidate) => candidate.name === track.name);
        const boneTrackLike = modelAnimation.boneTracks.find((candidate) => candidate.name === track.name);
        if (preferMovableTrack && movableTrackLike) {
            return this.persistMovableBoneKeyframeInterpolation(
                track.name,
                movableTrackLike as RuntimeMovableBoneTrackLike & RuntimeMovableBoneTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        if (boneTrackLike) {
            return this.persistBoneKeyframeInterpolation(
                track.name,
                boneTrackLike as RuntimeBoneTrackLike & RuntimeBoneTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        if (movableTrackLike) {
            return this.persistMovableBoneKeyframeInterpolation(
                track.name,
                movableTrackLike as RuntimeMovableBoneTrackLike & RuntimeMovableBoneTrackMutable,
                normalizedFrame,
                curves,
                poseSnapshot,
            );
        }

        return false;
    }

    private shouldUseMovableBoneTrack(track: Pick<KeyframeTrack, "name" | "category">): boolean {
        if (track.category === "camera" || track.category === "morph") return false;
        const modelInfo = this.mmdManager.getActiveModelInfo();
        const boneControl = modelInfo?.boneControlInfos?.find((candidate) => candidate.name === track.name);
        if (boneControl) return boneControl.movable;
        return track.category === "root";
    }

    private persistMorphKeyframeValue(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        if (track.category !== "morph") return false;
        const weight = this.mmdManager.getMorphWeight(track.name);
        return this.mmdManager.applyTimelineKeyframePayload(track, frame, {
            kind: "morph",
            weights: [Number.isFinite(weight) ? weight : 0],
        });
    }

    private applyRegisteredKeyframePoseToViewport(
        track: Pick<KeyframeTrack, "name" | "category">,
        poseSnapshot: SelectedBonePoseSnapshot | null,
    ): void {
        if (!poseSnapshot || track.category === "morph") return;

        if (track.category === "camera") {
            const target = poseSnapshot.target ?? this.mmdManager.getCameraTarget();
            this.mmdManager.applyCameraTrackPose(
                target,
                poseSnapshot.rotation,
                poseSnapshot.distance ?? this.mmdManager.getCameraDistance(),
                poseSnapshot.fov,
            );
            return;
        }

        if (track.category !== "root" && track.category !== "semi-standard" && track.category !== "bone") return;
        this.mmdManager.setBoneTranslation(
            track.name,
            poseSnapshot.position.x,
            poseSnapshot.position.y,
            poseSnapshot.position.z,
            false,
        );
        this.mmdManager.setBoneRotation(
            track.name,
            poseSnapshot.rotation.x,
            poseSnapshot.rotation.y,
            poseSnapshot.rotation.z,
            false,
        );
    }

    private persistCameraKeyframeInterpolation(
        track: RuntimeCameraTrackMutable,
        frame: number,
        curves: ReadonlyMap<string, InterpolationCurve>,
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const runtimePose = this.mmdManager.getCameraKeyframePose();
        const cameraPosition = poseSnapshot?.position ?? runtimePose.position;
        const cameraRotationDeg = poseSnapshot?.rotation ?? runtimePose.rotation;
        const cameraDistance = this.mmdManager.getCameraExternalParent()
            ? 0
            : Math.max(0.0001, poseSnapshot?.distance ?? runtimePose.distance);
        const cameraFovDeg = poseSnapshot?.fov ?? runtimePose.fov;
        const cameraTarget = poseSnapshot?.target ?? runtimePose.target;
        const degToRad = Math.PI / 180;
        this.debugKeyframeFlow("persist camera keyframe", {
            frame,
            poseSnapshot,
            cameraPosition,
            cameraTarget,
            cameraRotationDeg,
            cameraDistance,
            cameraFovDeg,
        });

        track.positions = this.upsertFloatValues(track.positions, 3, frameEdit.index, frameEdit.exists, [
            cameraTarget.x,
            cameraTarget.y,
            cameraTarget.z,
        ]);
        track.rotations = this.upsertFloatValues(track.rotations, 3, frameEdit.index, frameEdit.exists, [
            cameraRotationDeg.x * degToRad,
            cameraRotationDeg.y * degToRad,
            cameraRotationDeg.z * degToRad,
        ]);
        track.distances = this.upsertFloatValues(track.distances, 1, frameEdit.index, frameEdit.exists, [-cameraDistance]);
        track.fovs = this.upsertFloatValues(track.fovs, 1, frameEdit.index, frameEdit.exists, [cameraFovDeg]);
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
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = poseSnapshot ?? this.getPendingBonePoseSnapshot(boneName, frame) ?? this.mmdManager.getBoneTransform(boneName);
        const fallbackPosition = this.readFloatBlock(track.positions, referenceIndex, 3, [0, 0, 0]);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);
        const positionBlock = transform
            ? [transform.position.x, transform.position.y, transform.position.z]
            : fallbackPosition;
        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;
        this.debugKeyframeFlow("persist movable bone keyframe", {
            boneName,
            frame,
            poseSnapshot,
            poseSnapshotText: this.formatPoseSnapshotText(poseSnapshot),
            resolvedTransform: transform,
            resolvedTransformText: this.formatPoseSnapshotText(transform),
            position: transform ? this.formatBonePoseSnapshotForLog(transform).position : null,
            rotation: transform ? this.formatBonePoseSnapshotForLog(transform).rotation : null,
            positionBlock: positionBlock.map((value) => Math.round(value * 1000) / 1000),
            rotationBlock: rotationBlock.map((value) => Math.round(value * 1000) / 1000),
            positionBlockText: this.formatNumberBlockForLog(positionBlock),
            rotationBlockText: this.formatNumberBlockForLog(rotationBlock),
            fallbackPosition,
            fallbackRotation,
            fallbackPositionText: this.formatNumberBlockForLog(fallbackPosition),
            fallbackRotationText: this.formatNumberBlockForLog(fallbackRotation),
            fallbackPhysicsToggle,
        });

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
        poseSnapshot: SelectedBonePoseSnapshot | null = null,
    ): boolean {
        const frameEdit = this.upsertFrameNumber(track.frameNumbers, frame);
        const referenceIndex = this.resolveInsertReferenceIndex(track.frameNumbers, frame);
        track.frameNumbers = frameEdit.frames;

        const transform = poseSnapshot ?? this.getPendingBonePoseSnapshot(boneName, frame) ?? this.mmdManager.getBoneTransform(boneName);
        const fallbackRotation = this.readFloatBlock(track.rotations, referenceIndex, 4, [0, 0, 0, 1]);
        const fallbackPhysicsToggle = this.readUint8Block(track.physicsToggles, referenceIndex, 1, [0]);
        const rotationBlock = transform
            ? this.rotationDegreesToQuaternionBlock(transform.rotation.x, transform.rotation.y, transform.rotation.z)
            : fallbackRotation;
        this.debugKeyframeFlow("persist bone keyframe", {
            boneName,
            frame,
            poseSnapshot,
            poseSnapshotText: this.formatPoseSnapshotText(poseSnapshot),
            resolvedTransform: transform,
            resolvedTransformText: this.formatPoseSnapshotText(transform),
            rotation: transform ? this.formatBonePoseSnapshotForLog(transform).rotation : null,
            rotationBlock: rotationBlock.map((value) => Math.round(value * 1000) / 1000),
            rotationBlockText: this.formatNumberBlockForLog(rotationBlock),
            fallbackRotation,
            fallbackRotationText: this.formatNumberBlockForLog(fallbackRotation),
            fallbackPhysicsToggle,
        });

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

    private copySelectedKeyframe(): void {
        const selectedKeys = this.timeline.getSelectedKeys();
        if (selectedKeys.length > 1) {
            this.copySelectedKeyframes(selectedKeys);
            return;
        }

        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.timeline.getSelectedFrame() ?? this.mmdManager.currentFrame;
        const payload = this.mmdManager.readTimelineKeyframePayload(track, frame);
        if (!payload) {
            this.showToast(`Frame ${frame}: no keyframe to copy`, "info");
            return;
        }

        this.keyframeClipboard = {
            version: 1,
            mode: "single",
            sourceTarget: this.mmdManager.getTimelineTarget(),
            sourceFrame: Math.max(0, Math.floor(frame)),
            track: { category: track.category, name: track.name },
            payload: this.cloneKeyframePayload(payload),
        };
        this.updateTimelineEditState();
        this.showToast(`Frame ${frame}: keyframe copied`, "success");
    }

    private copySelectedKeyframes(selectedKeys: readonly TimelineKeySelectionRef[]): void {
        const items: BatchKeyframeClipboard["items"] = [];
        let sourceBaseFrame = Number.MAX_SAFE_INTEGER;
        for (const selectedKey of selectedKeys) {
            const track = this.selectionRefToCommandTrack(selectedKey);
            const payload = this.mmdManager.readTimelineKeyframePayload(track, selectedKey.frame);
            if (!payload) continue;
            sourceBaseFrame = Math.min(sourceBaseFrame, selectedKey.frame);
            items.push({
                track,
                sourceFrame: selectedKey.frame,
                frameOffset: 0,
                payload: this.cloneKeyframePayload(payload),
            });
        }

        if (items.length === 0 || sourceBaseFrame === Number.MAX_SAFE_INTEGER) {
            this.showToast("No selected keyframes to copy", "info");
            return;
        }

        this.keyframeClipboard = {
            version: 2,
            mode: "batch",
            sourceTarget: this.mmdManager.getTimelineTarget(),
            sourceBaseFrame,
            items: items.map((item) => ({
                ...item,
                frameOffset: item.sourceFrame - sourceBaseFrame,
            })),
        };
        this.updateTimelineEditState();
        this.showToast(`${items.length} keyframes copied`, "success");
    }

    private pasteKeyframeClipboard(): void {
        const clipboard = this.keyframeClipboard;
        if (!clipboard) {
            this.showToast("No keyframe to paste", "info");
            return;
        }
        if (clipboard.mode === "batch") {
            this.pasteKeyframeBatchClipboard(clipboard);
            return;
        }

        const target = this.resolveKeyframePasteTarget(clipboard);
        if (!target) {
            this.showToast("No compatible paste target", "error");
            return;
        }

        const frame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const before = this.mmdManager.readTimelineKeyframePayload(target.track, frame);
        const after = this.cloneKeyframePayload(clipboard.payload);
        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.paste:${createCommandTrackKey(target.track)}:${frame}:${nowMs}`,
            label: `Paste keyframe at frame ${frame}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.paste",
                track: target.track,
                frame,
                before,
                after,
            },
        };

        const pasted = executeCommand(command, "apply", this.createCommandExecutionContext());
        if (!pasted) {
            this.showToast(`Frame ${frame}: keyframe paste failed`, "error");
            return;
        }

        this.commandHistory.push(command);
        this.timeline.setSelectedFrame(frame);
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(`Frame ${frame}: keyframe pasted`, "success");
    }

    private pasteKeyframeBatchClipboard(clipboard: BatchKeyframeClipboard): void {
        if (this.mmdManager.getTimelineTarget() !== clipboard.sourceTarget) {
            this.showToast("No compatible paste target", "error");
            return;
        }

        const pasteBaseFrame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const items = clipboard.items
            .map((item) => {
                const targetFrame = pasteBaseFrame + item.frameOffset;
                if (targetFrame < 0) return null;
                return {
                    track: item.track,
                    sourceFrame: item.sourceFrame,
                    targetFrame,
                    before: this.mmdManager.readTimelineKeyframePayload(item.track, targetFrame),
                    after: this.cloneKeyframePayload(item.payload),
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        if (items.length === 0) {
            this.showToast("No keyframes to paste", "info");
            return;
        }

        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.batchPaste:${items.length}:${pasteBaseFrame}:${nowMs}`,
            label: `Paste ${items.length} keyframes at frame ${pasteBaseFrame}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.batchPaste",
                pasteBaseFrame,
                items,
            },
        };

        const pasted = executeCommand(command, "apply", this.createCommandExecutionContext());
        if (!pasted) {
            this.showToast(`Frame ${pasteBaseFrame}: keyframe paste failed`, "error");
            return;
        }

        this.commandHistory.push(command);
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(`${items.length} keyframes pasted`, "success");
    }

    private pasteMirroredKeyframeClipboard(): void {
        if (this.mmdManager.getTimelineTarget() !== "model") {
            this.showToast("Mirror paste is available for model bone keyframes only", "info");
            return;
        }

        const clipboardItems = this.getMirrorPasteClipboardItems();
        if (clipboardItems.length === 0) {
            this.showToast("No bone keyframes to mirror paste", "info");
            return;
        }

        const activeModelInfo = this.mmdManager.getActiveModelInfo();
        const availableBoneNames = new Set(activeModelInfo?.boneNames ?? []);
        const pasteBaseFrame = Math.max(0, Math.floor(this.mmdManager.currentFrame));
        const mirroredItems = buildMirrorPasteItems(clipboardItems, pasteBaseFrame, availableBoneNames)
            .map((item) => ({
                ...item,
                before: this.mmdManager.readTimelineKeyframePayload(item.track, item.targetFrame),
            }));

        if (mirroredItems.length === 0) {
            this.showToast("No bone keyframes to mirror paste", "info");
            return;
        }

        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.mirrorPaste:${mirroredItems.length}:${pasteBaseFrame}:${nowMs}`,
            label: `Mirror paste ${mirroredItems.length} keyframes at frame ${pasteBaseFrame}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.batchPaste",
                pasteBaseFrame,
                items: mirroredItems,
            },
        };

        const pasted = executeCommand(command, "apply", this.createCommandExecutionContext());
        if (!pasted) {
            this.showToast(`Frame ${pasteBaseFrame}: mirror paste failed`, "error");
            return;
        }

        this.commandHistory.push(command);
        this.refreshSelectedTrackRotationOverlay();
        this.updateTimelineEditState();
        this.updateSectionKeyframeButtons();
        this.showToast(`${mirroredItems.length} bone keyframes mirror pasted`, "success");
    }

    private getMirrorPasteClipboardItems(): MirrorPasteClipboardItem[] {
        const clipboard = this.keyframeClipboard;
        if (!clipboard || clipboard.sourceTarget !== "model") return [];

        if (clipboard.mode === "batch") {
            return clipboard.items
                .filter((item) => item.payload.kind === "bone" || item.payload.kind === "movableBone")
                .map((item) => ({
                    track: item.track,
                    sourceFrame: item.sourceFrame,
                    frameOffset: item.frameOffset,
                    payload: this.cloneKeyframePayload(item.payload),
                }));
        }

        if (clipboard.payload.kind !== "bone" && clipboard.payload.kind !== "movableBone") {
            return [];
        }

        return [{
            track: clipboard.track,
            sourceFrame: clipboard.sourceFrame,
            frameOffset: 0,
            payload: this.cloneKeyframePayload(clipboard.payload),
        }];
    }

    private resolveKeyframePasteTarget(clipboard: SingleKeyframeClipboard): { track: CommandTrackRef } | null {
        const currentTarget = this.mmdManager.getTimelineTarget();
        if (currentTarget !== clipboard.sourceTarget) return null;

        const selectedTrack = this.getSelectedTimelineTrack();
        if (selectedTrack && this.isCompatibleKeyframePayloadTarget(selectedTrack, clipboard.payload)) {
            return { track: { category: selectedTrack.category, name: selectedTrack.name } };
        }
        return { track: clipboard.track };
    }

    private isCompatibleKeyframePayloadTarget(
        track: Pick<KeyframeTrack, "category">,
        payload: TimelineKeyframePayload,
    ): boolean {
        switch (payload.kind) {
            case "camera":
                return track.category === "camera";
            case "morph":
                return track.category === "morph";
            case "bone":
            case "movableBone":
                return track.category === "root" || track.category === "semi-standard" || track.category === "bone";
        }
    }

    private cloneKeyframePayload(payload: TimelineKeyframePayload): TimelineKeyframePayload {
        switch (payload.kind) {
            case "camera":
                return {
                    kind: "camera",
                    positions: [...payload.positions],
                    positionInterpolations: [...payload.positionInterpolations],
                    rotations: [...payload.rotations],
                    rotationInterpolations: [...payload.rotationInterpolations],
                    distances: [...payload.distances],
                    distanceInterpolations: [...payload.distanceInterpolations],
                    fovs: [...payload.fovs],
                    fovInterpolations: [...payload.fovInterpolations],
                    externalParent: {
                        modelPath: payload.externalParent.modelPath,
                        boneName: payload.externalParent.boneName,
                    },
                };
            case "movableBone":
                return {
                    kind: "movableBone",
                    positions: [...payload.positions],
                    positionInterpolations: [...payload.positionInterpolations],
                    rotations: [...payload.rotations],
                    rotationInterpolations: [...payload.rotationInterpolations],
                    physicsToggles: [...payload.physicsToggles],
                    externalParent: payload.externalParent ? { ...payload.externalParent } : undefined,
                };
            case "bone":
                return {
                    kind: "bone",
                    rotations: [...payload.rotations],
                    rotationInterpolations: [...payload.rotationInterpolations],
                    physicsToggles: [...payload.physicsToggles],
                    externalParent: payload.externalParent ? { ...payload.externalParent } : undefined,
                };
            case "morph":
                return {
                    kind: "morph",
                    weights: [...payload.weights],
                };
        }
    }

    private deleteSelectedKeyframe(source: ActionSource = "system"): void {
        const selectedKeys = this.timeline.getSelectedKeys();
        if (selectedKeys.length >= 1) {
            this.deleteSelectedKeyframes(selectedKeys);
            return;
        }

        const track = this.getSelectedTimelineTrack();
        if (!track) {
            this.showToast("Please select a track", "error");
            return;
        }

        const frame = this.timeline.getSelectedFrame() ?? this.mmdManager.currentFrame;
        const command = buildKeyframeCommand(
            { type: "keyframe.deleteSelected", source },
            this.collectKeyframeCommandSnapshot(),
        );
        const removed = command
            ? executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }))
            : false;
        if (!removed) {
            this.showToast(`Frame ${frame}: no keyframe`, "info");
            return;
        }

        this.updateTimelineEditState();
        this.commandHistory.push(command);
        this.showToast(`Frame ${frame}: keyframe deleted`, "success");
    }

    private deleteSelectedKeyframes(selectedKeys: readonly TimelineKeySelectionRef[]): void {
        const items = selectedKeys
            .map((selectedKey) => {
                const track = this.selectionRefToCommandTrack(selectedKey);
                const before = this.mmdManager.readTimelineKeyframePayload(track, selectedKey.frame);
                return before ? { track, frame: selectedKey.frame, before: this.cloneKeyframePayload(before) } : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        if (items.length === 0) {
            this.showToast("No selected keyframes to delete", "info");
            return;
        }

        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.batchDelete:${items.length}:${nowMs}`,
            label: `Delete ${items.length} keyframes`,
            scope: "keyframe",
            createdAtMs: nowMs,
            diff: {
                type: "keyframe.batchDelete",
                items,
            },
        };
        const removed = executeCommand(command, "apply", this.createCommandExecutionContext({ seekToFrame: false }));
        if (!removed) {
            this.showToast("Selected keyframes delete failed", "error");
            return;
        }

        this.updateTimelineEditState();
        this.commandHistory.push(command);
        this.showToast(`${items.length} keyframes deleted`, "success");
    }

    private undoLastCommand(): void {
        const command = this.commandHistory.undo();
        if (!command) {
            this.showToast("Nothing to undo", "info");
            return;
        }

        const reverted = executeCommand(
            command,
            "revert",
            this.createCommandExecutionContext({ seekToFrame: false }),
        );
        if (!reverted) {
            this.commandHistory.redo();
            this.showToast(`Undo failed: ${command.label}`, "error");
            return;
        }

        this.showToast(`Undo: ${command.label}`, "success");
    }

    private redoLastCommand(): void {
        const command = this.commandHistory.redo();
        if (!command) {
            this.showToast("Nothing to redo", "info");
            return;
        }

        const applied = executeCommand(
            command,
            "apply",
            this.createCommandExecutionContext({ seekToFrame: false }),
        );
        if (!applied) {
            this.commandHistory.undo();
            this.showToast(`Redo failed: ${command.label}`, "error");
            return;
        }

        this.showToast(`Redo: ${command.label}`, "success");
    }

    private nudgeSelectedKeyframe(deltaFrame: number): void {
        const seekByDelta = (): void => {
            const toFrame = Math.max(0, this.mmdManager.currentFrame + deltaFrame);
            this.mmdManager.seekToBoundary(toFrame);
            this.updateTimelineEditState();
        };

        const selectedKeys = this.timeline.getSelectedKeys();
        if (selectedKeys.length >= 1) {
            if (deltaFrame !== -1 && deltaFrame !== 1) {
                seekByDelta();
                return;
            }
            if (this.nudgeSelectedKeyframes(selectedKeys, deltaFrame)) return;
            seekByDelta();
            return;
        }

        const track = this.getSelectedTimelineTrack();
        const fromFrame = this.timeline.getSelectedFrame();
        if (!track || fromFrame === null) {
            seekByDelta();
            return;
        }

        if (deltaFrame !== -1 && deltaFrame !== 1) {
            seekByDelta();
            return;
        }

        const command = buildKeyframeCommand(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: deltaFrame },
            this.collectKeyframeCommandSnapshot(),
        );
        if (!command || command.diff.type !== "keyframe.move") {
            seekByDelta();
            return;
        }

        const moved = executeCommand(command, "apply", this.createCommandExecutionContext());
        if (!moved) {
            seekByDelta();
            return;
        }

        this.commandHistory.push(command);
        this.showToast(`Key moved: ${command.diff.fromFrame} -> ${command.diff.toFrame}`, "success");
    }

    private nudgeSelectedKeyframes(selectedKeys: readonly TimelineKeySelectionRef[], deltaFrame: -1 | 1): boolean {
        const selectedKeySet = new Set(selectedKeys.map((key) =>
            `${key.trackCategory}\u001f${key.trackName}\u001f${key.frame}`
        ));
        const items = selectedKeys.map((selectedKey) => {
            const toFrame = selectedKey.frame + deltaFrame;
            if (toFrame < 0) return null;
            const track = this.selectionRefToCommandTrack(selectedKey);
            const before = this.mmdManager.readTimelineKeyframePayload(track, selectedKey.frame);
            if (!before) return null;
            const targetKey = `${selectedKey.trackCategory}\u001f${selectedKey.trackName}\u001f${toFrame}`;
            const overwritten = selectedKeySet.has(targetKey)
                ? null
                : this.mmdManager.readTimelineKeyframePayload(track, toFrame);
            return {
                track,
                fromFrame: selectedKey.frame,
                toFrame,
                before: this.cloneKeyframePayload(before),
                overwritten: overwritten ? this.cloneKeyframePayload(overwritten) : null,
            };
        });

        if (items.some((item) => item === null)) {
            this.showToast("Selected keyframes move failed", "error");
            return false;
        }
        const moveItems = items.filter((item): item is NonNullable<typeof item> => item !== null);
        if (this.hasDuplicateBatchMoveTarget(moveItems)) {
            this.showToast("Selected keyframes move would collide", "error");
            return false;
        }

        const orderedItems = [...moveItems].sort((a, b) => {
            if (a.track.category !== b.track.category) return a.track.category.localeCompare(b.track.category);
            if (a.track.name !== b.track.name) return a.track.name.localeCompare(b.track.name);
            return deltaFrame > 0 ? b.fromFrame - a.fromFrame : a.fromFrame - b.fromFrame;
        });
        const nowMs = Date.now();
        const command: BuiltCommand = {
            id: `keyframe.batchMove:${orderedItems.length}:${deltaFrame}:${nowMs}`,
            label: `Move ${orderedItems.length} keyframes ${deltaFrame > 0 ? "right" : "left"}`,
            scope: "keyframe",
            createdAtMs: nowMs,
            mergeKey: "keyframe.batchMove",
            diff: {
                type: "keyframe.batchMove",
                deltaFrames: deltaFrame,
                items: orderedItems,
            },
        };

        const moved = executeCommand(command, "apply", this.createCommandExecutionContext());
        if (!moved) {
            this.showToast("Selected keyframes move failed", "error");
            return false;
        }

        this.commandHistory.push(command);
        this.showToast(`${orderedItems.length} keyframes moved`, "success");
        return true;
    }

    private hasDuplicateBatchMoveTarget(items: readonly {
        track: CommandTrackRef;
        toFrame: number;
    }[]): boolean {
        const targets = new Set<string>();
        for (const item of items) {
            const key = `${createCommandTrackKey(item.track)}\u001f${item.toFrame}`;
            if (targets.has(key)) return true;
            targets.add(key);
        }
        return false;
    }

    private getPlaybackFrameRange(): { startFrame: number; endFrame: number } {
        return this.exportUiController?.getPlaybackFrameRange() ?? {
            startFrame: 0,
            endFrame: Math.max(0, Math.floor(this.mmdManager.totalFrames)),
        };
    }

    private isPlaybackFrameStartEnabled(): boolean {
        return this.exportUiController?.isPlaybackFrameStartEnabled() ?? false;
    }

    private isPlaybackFrameStopEnabled(): boolean {
        return this.exportUiController?.isPlaybackFrameStopEnabled() ?? false;
    }

    private play(updateStatus = true): void {
        const { startFrame } = this.getPlaybackFrameRange();
        if (this.isPlaybackFrameStartEnabled()) {
            this.mmdManager.pause();
            this.mmdManager.seekTo(startFrame);
        }
        this.mmdManager.play();
        this.updateSectionKeyframeButtons();
        this.btnPlay.style.display = "none";
        this.btnPause.style.display = "flex";
        if (updateStatus) this.setStatus("Playing", false);
        this.refreshViewportBottomBar();
    }

    private pause(updateStatus = true): void {
        this.mmdManager.pause();
        this.timeline.refreshFrameContent();
        this.syncModelPanelFromRuntimeIfPlaybackIdle();
        this.updateTimelineEditState();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        if (updateStatus) this.setStatus("Paused", false);
        this.refreshViewportBottomBar();
    }

    private stop(): void {
        this.mmdManager.pause();
        this.timeline.refreshFrameContent();
        this.syncModelPanelFromRuntimeIfPlaybackIdle();
        if (!this.isPlaybackFrameStopEnabled()) {
            this.mmdManager.seekToBoundary(this.getPlaybackFrameRange().startFrame);
        }
        this.updateTimelineEditState();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
        this.refreshViewportBottomBar();
    }

    private stopAtPlaybackEnd(endFrame: number): void {
        this.mmdManager.pause();
        this.timeline.refreshFrameContent();
        this.syncModelPanelFromRuntimeIfPlaybackIdle();
        this.mmdManager.seekToBoundary(endFrame);
        this.updateTimelineEditState();
        this.btnPlay.style.display = "flex";
        this.btnPause.style.display = "none";
        this.setStatus("Stopped", false);
        this.refreshViewportBottomBar();
    }

    private syncModelPanelFromRuntimeIfPlaybackIdle(frame = this.mmdManager.currentFrame): void {
        if (this.mmdManager.isPlaying) return;

        const sourcePose = this.getDisplayBonePoseSnapshot(frame);
        if (sourcePose) {
            this.bottomPanel.syncSelectedBoneSlidersFromSnapshot(sourcePose, true);
        } else {
            this.bottomPanel.syncSelectedBoneSlidersFromRuntime(true);
        }
        this.syncMorphPanelFromRuntimeIfPlaybackIdle();
        this.cameraPanelController?.refresh(false, sourcePose?.distance ?? this.mmdManager.getCameraDistance());
        this.dofPanelController?.refreshAutoFocusReadout();
        this.lensEffectController?.refreshAutoReadout();
    }

    private syncMorphPanelFromRuntimeIfPlaybackIdle(): void {
        if (this.mmdManager.isPlaying) return;
        this.bottomPanel.syncSelectedMorphFrameSlidersFromRuntime(true);
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
