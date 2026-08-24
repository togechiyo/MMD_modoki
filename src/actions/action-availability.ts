import type { EditorAction } from "./types";
import { isUiScalePercentage } from "../shared/ui-scale";
import {
    isKeyframeValueCorrectionIdentity,
    isKeyframeValueCorrectionValid,
} from "../editor/keyframe-value-correction";

export type EditorActionAvailabilitySnapshot = {
    hasSelectedTimelineTrack: boolean;
    hasSelectedFrame: boolean;
    selectedTrackKeyframeCount: number;
    hasEditableInterpolationChannels: boolean;
    hasInterpolationClipboard: boolean;
    hasKeyframeClipboard?: boolean;
    selectedKeyCount?: number;
    hasLoadedModels?: boolean;
    hasModelVmdExportKeys?: boolean;
    hasCameraVmdExportKeys?: boolean;
    hasModelVpdExportBones?: boolean;
    hasInfoKeyframeTarget?: boolean;
    hasSelectedBone?: boolean;
    hasSelectedMorphFrame?: boolean;
    hasSelectedAccessory?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
};

const hasFiniteFrame = (frame: number): boolean => Number.isFinite(frame) && frame >= 0;

export function canExecuteEditorAction(
    action: EditorAction,
    snapshot: EditorActionAvailabilitySnapshot,
): boolean {
    switch (action.type) {
        case "keyframe.addCurrent":
        case "keyframe.deleteSelected":
            return snapshot.hasSelectedTimelineTrack;
        case "keyframe.copySelected":
            return snapshot.hasSelectedTimelineTrack;
        case "keyframe.paste":
            return snapshot.hasSelectedTimelineTrack && (snapshot.hasKeyframeClipboard ?? false);
        case "keyframe.mirrorPaste":
            return snapshot.hasKeyframeClipboard ?? false;
        case "keyframe.nudgeSelected":
            return snapshot.hasSelectedTimelineTrack && snapshot.hasSelectedFrame;
        case "keyframe.correctSelected":
            return (snapshot.selectedKeyCount ?? 0) > 0
                && isKeyframeValueCorrectionValid(action.correction)
                && !isKeyframeValueCorrectionIdentity(action.correction);
        case "keyframe.correctBodyScale":
            return (snapshot.hasModelVmdExportKeys ?? false)
                && Number.isInteger(action.sourceModelIndex)
                && action.sourceModelIndex >= 0;
        case "keyframe.registerInfo":
            return snapshot.hasInfoKeyframeTarget ?? true;
        case "keyframe.registerBone":
            return snapshot.hasSelectedBone ?? true;
        case "keyframe.registerMorph":
            return snapshot.hasSelectedMorphFrame ?? true;
        case "keyframe.registerAccessoryTransform":
            return snapshot.hasSelectedAccessory ?? true;
        case "keyframe.registerLight":
        case "keyframe.registerShadow":
        case "keyframe.registerGravity":
            return true;
        case "keyframe.toggleAutoKey":
        case "keyframe.setAutoKeyScope":
        case "keyframe.insertEmptyFrame":
        case "keyframe.deleteFrameColumn":
            return true;
        case "history.undo":
            return snapshot.canUndo ?? true;
        case "history.redo":
            return snapshot.canRedo ?? true;
        case "project.exportModelVmd":
            return snapshot.hasModelVmdExportKeys ?? false;
        case "project.exportCameraVmd":
            return snapshot.hasCameraVmdExportKeys ?? false;
        case "project.exportModelVpd":
            return snapshot.hasModelVpdExportBones ?? false;
        case "selection.pickBone":
            return action.boneName.length > 0;
        case "playback.seekAdjacentKeyframe":
            return snapshot.hasSelectedTimelineTrack && snapshot.selectedTrackKeyframeCount > 0;
        case "interpolation.copy":
        case "interpolation.applyLinear":
            return snapshot.hasEditableInterpolationChannels;
        case "interpolation.updateHandle":
            return snapshot.hasEditableInterpolationChannels
                && (action.pointIndex === 1 || action.pointIndex === 2)
                && Number.isFinite(action.x)
                && Number.isFinite(action.y);
        case "interpolation.paste":
            return snapshot.hasEditableInterpolationChannels && snapshot.hasInterpolationClipboard;
        case "playback.seekFrame":
        case "timeline.seekFrame":
            return hasFiniteFrame(action.frame);
        case "playback.stepFrame":
            return Number.isFinite(action.deltaFrames) && action.deltaFrames !== 0;
        case "layout.uiScale.set":
            return isUiScalePercentage(action.percentage);
        case "playback.play":
        case "playback.pause":
        case "playback.stop":
        case "playback.toggle":
        case "playback.seekStart":
        case "playback.seekEnd":
        case "viewport.toggleGround":
        case "viewport.toggleEdge":
        case "viewport.toggleBackgroundMedia":
        case "viewport.toggleBackgroundBlack":
        case "viewport.setBackgroundDisplayMode":
        case "viewport.toggleEnvironmentBackground":
        case "viewport.toggleSkydome":
        case "viewport.togglePhysicsBones":
        case "project.openFile":
        case "project.openEnvironmentHdr":
        case "project.openModel":
        case "project.openMotion":
        case "project.openCameraMotion":
        case "project.openAudio":
        case "project.save":
        case "project.load":
        case "project.exportPng":
        case "project.exportPngSequence":
        case "project.exportWebm":
        case "layout.fullscreen.toggle":
        case "layout.fullscreen.exit":
        case "layout.shaderPanel.toggle":
        case "runtime.toggleAntialias":
        case "runtime.togglePhysics":
        case "runtime.toggleShadow":
        case "runtime.toggleEnvironmentLighting":
        case "runtime.toggleFloorCollision":
        case "runtime.toggleRigidBodies":
        case "runtime.toggleGlobalIllumination":
        case "model.selectTimelineTarget":
        case "model.toggleActiveVisibility":
        case "model.setActiveShadow":
        case "model.deleteActive":
        case "model.setExternalParent":
        case "shader.selectModelTarget":
        case "shader.applySelected":
        case "shader.applyAll":
        case "shader.reset":
        case "accessory.select":
        case "accessory.setParentModel":
        case "accessory.setParentBone":
        case "accessory.setVisibility":
        case "accessory.setShadow":
        case "accessory.deleteSelected":
        case "camera.setViewPreset":
        case "camera.setExternalParent":
        case "camera.setMirroringFloorEnabled":
        case "camera.setMirroringFloorResolution":
        case "output.applyPreset":
        case "output.syncDimension":
        case "output.setLockAspect":
        case "output.markFrameRangeCustomized":
        case "output.sanitizeFrameRange":
        case "timeline.selectionChanged":
        case "timeline.selectAllKeysByCategories":
        case "interpolation.finishHandleDrag":
        case "edit.boneTransformChanged":
        case "edit.setBoneTransformFromBottomBar":
        case "edit.setCameraTransformFromBottomBar":
        case "edit.cameraTransformChanged":
        case "edit.morphValueChanged":
        case "effect.setModelEdgeWidth":
        case "effect.setModelEdgeColorOverride":
        case "effect.setModelEdgeColor":
        case "effect.setContrastOffset":
        case "effect.setGammaOffset":
        case "effect.setExposure":
        case "effect.setDitheringIntensity":
        case "effect.setVignetteWeight":
        case "effect.setGrainIntensity":
        case "effect.setSharpenEdge":
        case "effect.setColorCurvesSaturation":
        case "effect.setToneMappingType":
        case "effect.setBloom":
        case "effect.setGlowIntensity":
        case "effect.setDofEnabled":
        case "effect.setDofQuality":
        case "effect.setDofFocusDistance":
        case "effect.setDofFocusOffset":
        case "effect.setDofFStop":
        case "effect.setDofNearSuppression":
        case "effect.setDofFocalInvert":
        case "effect.setDofLensBlur":
        case "effect.setDofLensSize":
        case "effect.setDofFocalLength":
        case "effect.setDofTargetModel":
        case "effect.setDofTargetBone":
        case "effect.setMotionBlurStrength":
        case "effect.setSsrStrength":
        case "effect.setVlsExposure":
        case "effect.setFrameGraphSsao":
        case "effect.setFrameGraphSsr":
        case "effect.setFrameGraphDofEnabled":
        case "effect.setFrameGraphDofFocusDistance":
        case "effect.setFrameGraphDofFocusOffset":
        case "effect.setFrameGraphDofFStop":
        case "effect.setFrameGraphDofLensSize":
        case "effect.setFrameGraphDofFocalLength":
        case "effect.setFrameGraphDofTargetModel":
        case "effect.setFrameGraphDofTargetBone":
        case "effect.setLightDirection":
        case "effect.setLightIntensity":
        case "effect.setAmbientIntensity":
        case "effect.setLightColor":
        case "effect.setLightFlatStrength":
        case "effect.setLightFlatColorInfluence":
        case "effect.setShadowMode":
        case "effect.setShadowDarkness":
        case "effect.setShadowFrustumSize":
        case "effect.setShadowMaxZ":
        case "effect.setShadowDistanceMultiplier":
        case "effect.setShadowFilteringQuality":
        case "effect.setShadowBlurKernel":
        case "effect.setShadowBlurScale":
        case "effect.setShadowBlurBoxOffset":
        case "effect.setShadowPenumbra":
        case "effect.setShadowPenumbraSize":
        case "effect.setTransparentShadow":
        case "effect.setSoftTransparentShadow":
        case "effect.setIblShadows":
        case "effect.setIblShadowOpacity":
        case "effect.setIblShadowDistanceScale":
        case "effect.setCharacterContactShadow":
        case "effect.setCharacterContactShadowOpacity":
        case "effect.setCharacterContactShadowScale":
        case "effect.setShadowBias":
        case "effect.setShadowNormalBias":
        case "effect.setShadowColor":
        case "effect.setToonShadowInfluence":
        case "effect.setSelfShadowSoftness":
        case "effect.setOcclusionShadowSoftness":
        case "effect.setLightColorTemperature":
        case "effect.setFogEnabled":
        case "effect.setFogStart":
        case "effect.setFogEnd":
        case "effect.setFogDensity":
        case "effect.setFogOpacity":
        case "effect.setFogColor":
        case "effect.setChromaticAberration":
        case "effect.setLensDistortion":
        case "effect.setLensDistortionInfluence":
        case "effect.setLensEdgeBlur":
        case "effect.applyLut":
        case "effect.chooseExternalLut":
            return true;
        case "project.dropFiles":
            return action.filePaths.length > 0;
        case "selection.cycleActiveModel":
            return snapshot.hasLoadedModels ?? true;
        case "selection.setBone":
        case "selection.setMorphFrame":
            return true;
        default:
            return false;
    }
}
