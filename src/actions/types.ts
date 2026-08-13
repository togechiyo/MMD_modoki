import type { KeyframeTrack } from "../types";
import type { BackgroundDisplayMode } from "../shared/background-display-mode";
import type { UiScalePercentage } from "../shared/ui-scale";

export type ActionSource =
    | "button"
    | "bottomBar"
    | "shortcut"
    | "timeline"
    | "viewport"
    | "menu"
    | "panel"
    | "drop"
    | "gamepad"
    | "midi"
    | "system";

export type PlaybackAction =
    | { type: "playback.play"; source: ActionSource }
    | { type: "playback.pause"; source: ActionSource }
    | { type: "playback.stop"; source: ActionSource }
    | { type: "playback.toggle"; source: ActionSource }
    | { type: "playback.seekFrame"; source: ActionSource; frame: number }
    | { type: "playback.stepFrame"; source: ActionSource; deltaFrames: number }
    | { type: "playback.seekStart"; source: ActionSource }
    | { type: "playback.seekEnd"; source: ActionSource }
    | { type: "playback.seekAdjacentKeyframe"; source: ActionSource; direction: -1 | 1 };

export type KeyframeAction =
    | { type: "keyframe.addCurrent"; source: ActionSource }
    | { type: "keyframe.copySelected"; source: ActionSource }
    | { type: "keyframe.paste"; source: ActionSource }
    | { type: "keyframe.mirrorPaste"; source: ActionSource }
    | { type: "keyframe.deleteSelected"; source: ActionSource }
    | { type: "keyframe.nudgeSelected"; source: ActionSource; deltaFrames: -1 | 1 }
    | { type: "keyframe.toggleAutoKey"; source: ActionSource }
    | { type: "keyframe.togglePhysicsInputMode"; source: ActionSource }
    | { type: "keyframe.registerInfo"; source: ActionSource }
    | { type: "keyframe.registerBone"; source: ActionSource }
    | { type: "keyframe.registerMorph"; source: ActionSource }
    | { type: "keyframe.registerAccessoryTransform"; source: ActionSource };

export type HistoryAction =
    | { type: "history.undo"; source: ActionSource }
    | { type: "history.redo"; source: ActionSource };

export type InterpolationAction =
    | { type: "interpolation.copy"; source: ActionSource }
    | { type: "interpolation.paste"; source: ActionSource }
    | { type: "interpolation.applyLinear"; source: ActionSource }
    | { type: "interpolation.updateHandle"; source: ActionSource; channelId: string; pointIndex: 1 | 2; x: number; y: number }
    | { type: "interpolation.finishHandleDrag"; source: ActionSource; changed: boolean };

export type SelectionAction =
    | { type: "selection.cycleActiveModel"; source: ActionSource; direction: -1 | 1 }
    | { type: "selection.pickBone"; source: ActionSource; boneName: string; additive?: boolean }
    | { type: "selection.setBone"; source: ActionSource; boneName: string | null }
    | { type: "selection.setMorphFrame"; source: ActionSource };

export type ViewportAction =
    | { type: "viewport.toggleGround"; source: ActionSource }
    | { type: "viewport.toggleEdge"; source: ActionSource }
    | { type: "viewport.toggleBackgroundMedia"; source: ActionSource }
    | { type: "viewport.toggleBackgroundBlack"; source: ActionSource }
    | { type: "viewport.setBackgroundDisplayMode"; source: ActionSource; mode: BackgroundDisplayMode }
    | { type: "viewport.toggleEnvironmentBackground"; source: ActionSource }
    | { type: "viewport.toggleSkydome"; source: ActionSource }
    | { type: "viewport.togglePhysicsBones"; source: ActionSource }
    | { type: "timeline.togglePhysicsBones"; source: ActionSource };

export type ProjectAction =
    | { type: "project.openFile"; source: ActionSource }
    | { type: "project.openEnvironmentHdr"; source: ActionSource }
    | { type: "project.dropFiles"; source: ActionSource; filePaths: string[] }
    | { type: "project.openModel"; source: ActionSource }
    | { type: "project.openMotion"; source: ActionSource }
    | { type: "project.openCameraMotion"; source: ActionSource }
    | { type: "project.openAudio"; source: ActionSource }
    | { type: "project.save"; source: ActionSource; forceChoosePath?: boolean }
    | { type: "project.load"; source: ActionSource }
    | { type: "project.exportPng"; source: ActionSource; renderMode?: "viewport" | "detached" }
    | { type: "project.exportPngSequence"; source: ActionSource }
    | { type: "project.exportWebm"; source: ActionSource };

export type LayoutAction =
    | { type: "layout.fullscreen.toggle"; source: ActionSource }
    | { type: "layout.fullscreen.exit"; source: ActionSource }
    | { type: "layout.uiScale.set"; source: ActionSource; percentage: UiScalePercentage }
    | { type: "layout.shaderPanel.toggle"; source: ActionSource };

export type RuntimeAction =
    | { type: "runtime.toggleAntialias"; source: ActionSource }
    | { type: "runtime.togglePhysics"; source: ActionSource }
    | { type: "runtime.toggleShadow"; source: ActionSource }
    | { type: "runtime.toggleEnvironmentLighting"; source: ActionSource }
    | { type: "runtime.toggleFloorCollision"; source: ActionSource }
    | { type: "runtime.toggleRigidBodies"; source: ActionSource }
    | { type: "runtime.toggleGlobalIllumination"; source: ActionSource }
    | { type: "runtime.setRenderFpsLimit"; source: ActionSource; limit: number };

export type ModelAction =
    | { type: "model.selectTimelineTarget"; source: ActionSource; value: string; showToast: boolean }
    | { type: "model.toggleActiveVisibility"; source: ActionSource }
    | { type: "model.setActiveShadow"; source: ActionSource; castShadow: boolean }
    | { type: "model.deleteActive"; source: ActionSource }
    | { type: "model.setExternalParent"; source: ActionSource };

export type ShaderAction =
    | { type: "shader.selectModelTarget"; source: ActionSource; value: string; showToast: boolean }
    | { type: "shader.applySelected"; source: ActionSource }
    | { type: "shader.applyAll"; source: ActionSource }
    | { type: "shader.reset"; source: ActionSource };

export type AccessoryAction =
    | { type: "accessory.select"; source: ActionSource }
    | { type: "accessory.setParentModel"; source: ActionSource }
    | { type: "accessory.setParentBone"; source: ActionSource }
    | { type: "accessory.toggleVisibility"; source: ActionSource }
    | { type: "accessory.deleteSelected"; source: ActionSource };

export type CameraAction =
    | { type: "camera.setViewPreset"; source: ActionSource; view: "left" | "front" | "right" | "top" | "back" | "bottom" }
    | { type: "camera.setExternalParent"; source: ActionSource }
    | { type: "camera.setMirroringFloorEnabled"; source: ActionSource; enabled: boolean }
    | { type: "camera.setMirroringFloorResolution"; source: ActionSource; resolution: number };

export type OutputAction =
    | { type: "output.applyPreset"; source: ActionSource }
    | { type: "output.syncDimension"; source: ActionSource; dimension: "width" | "height" }
    | { type: "output.setLockAspect"; source: ActionSource; locked: boolean }
    | { type: "output.markFrameRangeCustomized"; source: ActionSource }
    | { type: "output.sanitizeFrameRange"; source: ActionSource; boundary: "start" | "end" };

export type TimelineSeekPhase = "jump" | "dragStart" | "dragMove" | "dragEnd";

export type TimelineAction =
    | { type: "timeline.seekFrame"; source: ActionSource; frame: number; phase: TimelineSeekPhase }
    | { type: "timeline.selectionChanged"; source: ActionSource; track: KeyframeTrack | null; frame: number | null };

export type EditAction =
    | { type: "edit.boneTransformChanged"; source: ActionSource; boneName: string | null }
    | {
        type: "edit.setBoneTransformFromBottomBar";
        source: ActionSource;
        boneName: string | null;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        before?: {
            position: { x: number; y: number; z: number };
            rotation: { x: number; y: number; z: number };
        };
    }
    | {
        type: "edit.setCameraTransformFromBottomBar";
        source: ActionSource;
        target: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        distance: number;
        fov: number;
        before?: {
            target: { x: number; y: number; z: number };
            rotation: { x: number; y: number; z: number };
            distance: number;
            fov: number;
        };
    }
    | { type: "edit.cameraTransformChanged"; source: ActionSource }
    | { type: "edit.morphValueChanged"; source: ActionSource; frameIndex: number | null };

export type EffectAction =
    | { type: "effect.setModelEdgeWidth"; source: ActionSource; percent: number }
    | { type: "effect.setModelEdgeColorOverride"; source: ActionSource; enabled: boolean }
    | { type: "effect.setModelEdgeColor"; source: ActionSource; r: number; g: number; b: number }
    | { type: "effect.setContrastOffset"; source: ActionSource; offsetPercent: number }
    | { type: "effect.setGammaOffset"; source: ActionSource; offsetPercent: number }
    | { type: "effect.setExposure"; source: ActionSource; value: number }
    | { type: "effect.setDitheringIntensity"; source: ActionSource; value: number }
    | { type: "effect.setVignetteWeight"; source: ActionSource; value: number }
    | { type: "effect.setGrainIntensity"; source: ActionSource; value: number }
    | { type: "effect.setSharpenEdge"; source: ActionSource; percent: number }
    | { type: "effect.setColorCurvesSaturation"; source: ActionSource; value: number }
    | { type: "effect.setToneMappingType"; source: ActionSource; value: number }
    | { type: "effect.setBloom"; source: ActionSource; enabled: boolean; weightPercent: number; thresholdSlider: number; kernel: number }
    | { type: "effect.setGlowIntensity"; source: ActionSource; percent: number }
    | { type: "effect.setDofEnabled"; source: ActionSource; enabled: boolean }
    | { type: "effect.setDofQuality"; source: ActionSource; level: number }
    | { type: "effect.setDofFocusDistance"; source: ActionSource; millimeters: number }
    | { type: "effect.setDofFocusOffset"; source: ActionSource; millimeters: number }
    | { type: "effect.setDofFStop"; source: ActionSource; value: number }
    | { type: "effect.setDofNearSuppression"; source: ActionSource; percent: number }
    | { type: "effect.setDofFocalInvert"; source: ActionSource; enabled: boolean }
    | { type: "effect.setDofLensBlur"; source: ActionSource; percent: number }
    | { type: "effect.setDofLensSize"; source: ActionSource; value: number }
    | { type: "effect.setDofFocalLength"; source: ActionSource; value: number }
    | { type: "effect.setDofTargetModel"; source: ActionSource; modelIndex: number | null }
    | { type: "effect.setDofTargetBone"; source: ActionSource; modelIndex: number | null; boneName: string | null }
    | { type: "effect.setMotionBlurStrength"; source: ActionSource; percent: number }
    | { type: "effect.setSsrStrength"; source: ActionSource; percent: number }
    | { type: "effect.setVlsExposure"; source: ActionSource; percent: number }
    | { type: "effect.setFrameGraphSsao"; source: ActionSource; enabled: boolean; strengthPercent: number; radiusPercent: number }
    | { type: "effect.setFrameGraphSsr"; source: ActionSource; enabled: boolean; strengthPercent: number }
    | { type: "effect.setFrameGraphDofEnabled"; source: ActionSource; enabled: boolean }
    | { type: "effect.setFrameGraphDofFocusDistance"; source: ActionSource; millimeters: number }
    | { type: "effect.setFrameGraphDofFocusOffset"; source: ActionSource; millimeters: number }
    | { type: "effect.setFrameGraphDofFStop"; source: ActionSource; value: number }
    | { type: "effect.setFrameGraphDofLensSize"; source: ActionSource; value: number }
    | { type: "effect.setFrameGraphDofFocalLength"; source: ActionSource; value: number }
    | { type: "effect.setFrameGraphDofTargetModel"; source: ActionSource; modelIndex: number | null }
    | { type: "effect.setFrameGraphDofTargetBone"; source: ActionSource; modelIndex: number | null; boneName: string | null }
    | { type: "effect.setLightDirection"; source: ActionSource; x: number; y: number; z: number }
    | { type: "effect.setLightIntensity"; source: ActionSource; value: number }
    | { type: "effect.setAmbientIntensity"; source: ActionSource; value: number }
    | { type: "effect.setLightColor"; source: ActionSource; r: number; g: number; b: number }
    | { type: "effect.setLightFlatStrength"; source: ActionSource; value: number }
    | { type: "effect.setLightFlatColorInfluence"; source: ActionSource; value: number }
    | { type: "effect.setShadowMode"; source: ActionSource; mode: "cascaded" | "standard" }
    | { type: "effect.setShadowDarkness"; source: ActionSource; value: number }
    | { type: "effect.setShadowFrustumSize"; source: ActionSource; value: number }
    | { type: "effect.setShadowMaxZ"; source: ActionSource; value: number }
    | { type: "effect.setShadowFilteringQuality"; source: ActionSource; value: number }
    | { type: "effect.setShadowBlurKernel"; source: ActionSource; value: number }
    | { type: "effect.setShadowBlurScale"; source: ActionSource; value: number }
    | { type: "effect.setShadowBlurBoxOffset"; source: ActionSource; value: number }
    | { type: "effect.setShadowPenumbra"; source: ActionSource; enabled: boolean }
    | { type: "effect.setShadowPenumbraSize"; source: ActionSource; value: number }
    | { type: "effect.setTransparentShadow"; source: ActionSource; enabled: boolean }
    | { type: "effect.setSoftTransparentShadow"; source: ActionSource; enabled: boolean }
    | { type: "effect.setIblShadows"; source: ActionSource; enabled: boolean }
    | { type: "effect.setIblShadowOpacity"; source: ActionSource; value: number }
    | { type: "effect.setIblShadowDistanceScale"; source: ActionSource; value: number }
    | { type: "effect.setCharacterContactShadow"; source: ActionSource; enabled: boolean }
    | { type: "effect.setCharacterContactShadowOpacity"; source: ActionSource; value: number }
    | { type: "effect.setCharacterContactShadowScale"; source: ActionSource; value: number }
    | { type: "effect.setShadowBias"; source: ActionSource; value: number }
    | { type: "effect.setShadowNormalBias"; source: ActionSource; value: number }
    | { type: "effect.setShadowColor"; source: ActionSource; r: number; g: number; b: number }
    | { type: "effect.setToonShadowInfluence"; source: ActionSource; value: number }
    | { type: "effect.setSelfShadowSoftness"; source: ActionSource; value: number }
    | { type: "effect.setOcclusionShadowSoftness"; source: ActionSource; value: number }
    | { type: "effect.setLightColorTemperature"; source: ActionSource; kelvin: number }
    | { type: "effect.setFogEnabled"; source: ActionSource; enabled: boolean }
    | { type: "effect.setFogStart"; source: ActionSource; value: number }
    | { type: "effect.setFogEnd"; source: ActionSource; value: number }
    | { type: "effect.setFogDensity"; source: ActionSource; value: number }
    | { type: "effect.setFogOpacity"; source: ActionSource; value: number }
    | { type: "effect.setFogColor"; source: ActionSource; r: number; g: number; b: number }
    | { type: "effect.setChromaticAberration"; source: ActionSource; value: number }
    | { type: "effect.setLensDistortion"; source: ActionSource; percent: number }
    | { type: "effect.setLensDistortionInfluence"; source: ActionSource; percent: number }
    | { type: "effect.setLensEdgeBlur"; source: ActionSource; percent: number }
    | { type: "effect.applyLut"; source: ActionSource }
    | { type: "effect.chooseExternalLut"; source: ActionSource };

export type EditorAction =
    | PlaybackAction
    | KeyframeAction
    | HistoryAction
    | InterpolationAction
    | SelectionAction
    | ViewportAction
    | ProjectAction
    | LayoutAction
    | RuntimeAction
    | ModelAction
    | ShaderAction
    | AccessoryAction
    | CameraAction
    | OutputAction
    | TimelineAction
    | EditAction
    | EffectAction;

export type EditorActionType = EditorAction["type"];
