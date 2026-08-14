import { describe, expect, it } from "vitest";

import {
    canExecuteEditorAction,
    type EditorActionAvailabilitySnapshot,
} from "../../src/actions/action-availability";

const readySnapshot: EditorActionAvailabilitySnapshot = {
    hasSelectedTimelineTrack: true,
    hasSelectedFrame: true,
    selectedTrackKeyframeCount: 2,
    hasEditableInterpolationChannels: true,
    hasInterpolationClipboard: true,
};

describe("canExecuteEditorAction", () => {
    it("allows keyframe add and delete only when a timeline track is selected", () => {
        expect(canExecuteEditorAction(
            { type: "keyframe.addCurrent", source: "shortcut" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.deleteSelected", source: "button" },
            { ...readySnapshot, hasSelectedTimelineTrack: false },
        )).toBe(false);
    });

    it("requires a selected frame for selected keyframe nudge", () => {
        expect(canExecuteEditorAction(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.nudgeSelected", source: "shortcut", deltaFrames: -1 },
            { ...readySnapshot, hasSelectedFrame: false },
        )).toBe(false);
    });

    it("allows mirror paste when a keyframe clipboard exists", () => {
        expect(canExecuteEditorAction(
            { type: "keyframe.mirrorPaste", source: "button" },
            { ...readySnapshot, hasSelectedTimelineTrack: false, hasKeyframeClipboard: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.mirrorPaste", source: "button" },
            { ...readySnapshot, hasKeyframeClipboard: false },
        )).toBe(false);
    });

    it("uses history availability for undo and redo", () => {
        expect(canExecuteEditorAction(
            { type: "history.undo", source: "shortcut" },
            { ...readySnapshot, canUndo: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "history.undo", source: "shortcut" },
            { ...readySnapshot, canUndo: false },
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "history.redo", source: "shortcut" },
            { ...readySnapshot, canRedo: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "history.redo", source: "shortcut" },
            { ...readySnapshot, canRedo: false },
        )).toBe(false);
    });

    it("requires keyframes on the selected track for adjacent keyframe seek", () => {
        expect(canExecuteEditorAction(
            { type: "playback.seekAdjacentKeyframe", source: "shortcut", direction: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "playback.seekAdjacentKeyframe", source: "button", direction: -1 },
            { ...readySnapshot, selectedTrackKeyframeCount: 0 },
        )).toBe(false);
    });

    it("validates seek and step payloads", () => {
        expect(canExecuteEditorAction(
            { type: "playback.seekFrame", source: "button", frame: 0 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "playback.seekFrame", source: "button", frame: -1 },
            readySnapshot,
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "timeline.seekFrame", source: "timeline", frame: 12, phase: "dragMove" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "timeline.seekFrame", source: "timeline", frame: -1, phase: "dragStart" },
            readySnapshot,
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "playback.stepFrame", source: "shortcut", deltaFrames: 10 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "playback.stepFrame", source: "shortcut", deltaFrames: 0 },
            readySnapshot,
        )).toBe(false);
    });

    it("allows basic playback controls without timeline selection", () => {
        const noSelection: EditorActionAvailabilitySnapshot = {
            hasSelectedTimelineTrack: false,
            hasSelectedFrame: false,
            selectedTrackKeyframeCount: 0,
            hasEditableInterpolationChannels: false,
            hasInterpolationClipboard: false,
        };

        expect(canExecuteEditorAction({ type: "playback.toggle", source: "shortcut" }, noSelection)).toBe(true);
        expect(canExecuteEditorAction({ type: "playback.play", source: "button" }, noSelection)).toBe(true);
        expect(canExecuteEditorAction({ type: "playback.pause", source: "button" }, noSelection)).toBe(true);
    });

    it("accepts only supported UI scale actions", () => {
        expect(canExecuteEditorAction(
            { type: "layout.uiScale.set", source: "menu", percentage: 125 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "layout.uiScale.set", source: "menu", percentage: 110 as 100 },
            readySnapshot,
        )).toBe(false);
    });

    it("allows interpolation copy and linear reset only when editable channels exist", () => {
        expect(canExecuteEditorAction({ type: "interpolation.copy", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "interpolation.applyLinear", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "interpolation.copy", source: "button" },
            { ...readySnapshot, hasEditableInterpolationChannels: false },
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "interpolation.applyLinear", source: "button" },
            { ...readySnapshot, hasEditableInterpolationChannels: false },
        )).toBe(false);
    });

    it("allows interpolation paste only when editable channels and clipboard exist", () => {
        expect(canExecuteEditorAction({ type: "interpolation.paste", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "interpolation.paste", source: "button" },
            { ...readySnapshot, hasInterpolationClipboard: false },
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "interpolation.paste", source: "button" },
            { ...readySnapshot, hasEditableInterpolationChannels: false },
        )).toBe(false);
    });

    it("allows interpolation handle updates only for editable channels with finite coordinates", () => {
        expect(canExecuteEditorAction(
            { type: "interpolation.updateHandle", source: "panel", channelId: "bone-x", pointIndex: 1, x: 20, y: 30 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "interpolation.updateHandle", source: "panel", channelId: "bone-x", pointIndex: 2, x: 80, y: 90 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "interpolation.updateHandle", source: "panel", channelId: "bone-x", pointIndex: 1, x: NaN, y: 30 },
            readySnapshot,
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "interpolation.updateHandle", source: "panel", channelId: "bone-x", pointIndex: 1, x: 20, y: 30 },
            { ...readySnapshot, hasEditableInterpolationChannels: false },
        )).toBe(false);
    });

    it("allows interpolation drag finish notifications", () => {
        expect(canExecuteEditorAction(
            { type: "interpolation.finishHandleDrag", source: "panel", changed: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "interpolation.finishHandleDrag", source: "panel", changed: false },
            readySnapshot,
        )).toBe(true);
    });

    it("allows section keyframe registration when each section has a target", () => {
        expect(canExecuteEditorAction(
            { type: "keyframe.registerInfo", source: "button" },
            { ...readySnapshot, hasInfoKeyframeTarget: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.registerInfo", source: "button" },
            { ...readySnapshot, hasInfoKeyframeTarget: false },
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "keyframe.registerBone", source: "button" },
            { ...readySnapshot, hasSelectedBone: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.registerMorph", source: "button" },
            { ...readySnapshot, hasSelectedMorphFrame: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "keyframe.registerAccessoryTransform", source: "button" },
            { ...readySnapshot, hasSelectedAccessory: true },
        )).toBe(true);
    });

    it("allows model cycling only when models are loaded", () => {
        expect(canExecuteEditorAction(
            { type: "selection.cycleActiveModel", source: "shortcut", direction: 1 },
            { ...readySnapshot, hasLoadedModels: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "selection.cycleActiveModel", source: "shortcut", direction: -1 },
            { ...readySnapshot, hasLoadedModels: false },
        )).toBe(false);
    });

    it("allows panel selection actions", () => {
        expect(canExecuteEditorAction(
            { type: "selection.pickBone", source: "viewport", boneName: "center" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "selection.pickBone", source: "viewport", boneName: "" },
            readySnapshot,
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "selection.setBone", source: "panel", boneName: "センター" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "selection.setBone", source: "panel", boneName: null },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "selection.setMorphFrame", source: "panel" },
            readySnapshot,
        )).toBe(true);
    });

    it("allows viewport display toggles", () => {
        expect(canExecuteEditorAction({ type: "viewport.toggleGround", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "viewport.toggleEdge", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "viewport.toggleBackgroundMedia", source: "button" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "viewport.toggleBackgroundBlack", source: "shortcut" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "viewport.toggleSkydome", source: "button" }, readySnapshot)).toBe(true);
    });

    it("allows project file and export actions", () => {
        expect(canExecuteEditorAction({ type: "project.openFile", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "project.dropFiles", source: "drop", filePaths: ["model.pmx"] },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "project.dropFiles", source: "drop", filePaths: [] },
            readySnapshot,
        )).toBe(false);
        expect(canExecuteEditorAction({ type: "project.openModel", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.openMotion", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.openCameraMotion", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.openAudio", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "project.save", source: "button", forceChoosePath: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "project.load", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.exportPng", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.exportPngSequence", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "project.exportWebm", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "project.exportModelVmd", source: "menu" },
            { ...readySnapshot, hasModelVmdExportKeys: true },
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "project.exportModelVmd", source: "menu" },
            { ...readySnapshot, hasModelVmdExportKeys: false },
        )).toBe(false);
        expect(canExecuteEditorAction(
            { type: "project.exportCameraVmd", source: "menu" },
            { ...readySnapshot, hasCameraVmdExportKeys: true },
        )).toBe(true);
    });

    it("allows layout fullscreen actions", () => {
        expect(canExecuteEditorAction({ type: "layout.fullscreen.toggle", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "layout.fullscreen.exit", source: "shortcut" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "layout.shaderPanel.toggle", source: "button" }, readySnapshot)).toBe(true);
    });

    it("allows runtime feature toggles", () => {
        expect(canExecuteEditorAction({ type: "runtime.toggleAntialias", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "runtime.togglePhysics", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "runtime.toggleShadow", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "runtime.toggleEnvironmentLighting", source: "menu" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "runtime.toggleRigidBodies", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "runtime.toggleGlobalIllumination", source: "button" },
            readySnapshot,
        )).toBe(true);
    });

    it("allows model, shader, and accessory panel actions", () => {
        expect(canExecuteEditorAction(
            { type: "model.selectTimelineTarget", source: "panel", value: "0", showToast: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "model.toggleActiveVisibility", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "model.setActiveShadow", source: "button", castShadow: false },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "model.deleteActive", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "shader.selectModelTarget", source: "panel", value: "0", showToast: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "shader.applySelected", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "shader.applyAll", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "shader.reset", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "accessory.select", source: "panel" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "accessory.setParentModel", source: "panel" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "accessory.setParentBone", source: "panel" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "accessory.toggleVisibility", source: "button" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "accessory.deleteSelected", source: "button" }, readySnapshot)).toBe(true);
    });

    it("allows camera panel actions", () => {
        expect(canExecuteEditorAction(
            { type: "camera.setViewPreset", source: "button", view: "front" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "camera.setMirroringFloorEnabled", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "camera.setMirroringFloorResolution", source: "panel", resolution: 1024 },
            readySnapshot,
        )).toBe(true);
    });

    it("allows output setting actions", () => {
        expect(canExecuteEditorAction({ type: "output.applyPreset", source: "panel" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "output.syncDimension", source: "panel", dimension: "width" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "output.setLockAspect", source: "panel", locked: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "output.markFrameRangeCustomized", source: "panel" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "output.sanitizeFrameRange", source: "panel", boundary: "start" },
            readySnapshot,
        )).toBe(true);
    });

    it("allows timeline selection notifications", () => {
        expect(canExecuteEditorAction(
            { type: "timeline.selectionChanged", source: "timeline", track: null, frame: null },
            readySnapshot,
        )).toBe(true);
    });

    it("allows edit change notifications", () => {
        expect(canExecuteEditorAction(
            { type: "edit.boneTransformChanged", source: "panel", boneName: "center" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "edit.cameraTransformChanged", source: "viewport" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "edit.morphValueChanged", source: "panel", frameIndex: 0 },
            readySnapshot,
        )).toBe(true);
    });

    it("allows effect panel actions", () => {
        expect(canExecuteEditorAction(
            { type: "effect.setModelEdgeWidth", source: "panel", percent: 100 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setContrastOffset", source: "panel", offsetPercent: 10 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setGammaOffset", source: "panel", offsetPercent: -10 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setExposure", source: "panel", value: 1 }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDitheringIntensity", source: "panel", value: 0.01 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setVignetteWeight", source: "panel", value: 0.25 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setGrainIntensity", source: "panel", value: 10 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setSharpenEdge", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setColorCurvesSaturation", source: "panel", value: 20 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setToneMappingType", source: "panel", value: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setBloom", source: "panel", enabled: true, weightPercent: 80, thresholdSlider: 100, kernel: 64 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setGlowIntensity", source: "panel", percent: 25 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofEnabled", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofQuality", source: "panel", level: 2 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofFocusDistance", source: "panel", millimeters: 1200 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofFocusOffset", source: "panel", millimeters: 100 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofFStop", source: "panel", value: 2.8 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofNearSuppression", source: "panel", percent: 80 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofFocalInvert", source: "panel", enabled: false },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofLensBlur", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofLensSize", source: "panel", value: 35 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofFocalLength", source: "panel", value: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofTargetModel", source: "panel", modelIndex: null },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setDofTargetBone", source: "panel", modelIndex: 0, boneName: "center" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setMotionBlurStrength", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setSsrStrength", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setVlsExposure", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphSsao", source: "panel", enabled: true, strengthPercent: 100, radiusPercent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphSsr", source: "panel", enabled: true, strengthPercent: 30 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofEnabled", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofFocusDistance", source: "panel", millimeters: 55000 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofFocusOffset", source: "panel", millimeters: 0 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofFStop", source: "panel", value: 2.8 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofLensSize", source: "panel", value: 30 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofFocalLength", source: "panel", value: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofTargetModel", source: "panel", modelIndex: null },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFrameGraphDofTargetBone", source: "panel", modelIndex: 0, boneName: "center" },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightDirection", source: "panel", x: 0, y: -1, z: 0 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightIntensity", source: "panel", value: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setAmbientIntensity", source: "panel", value: 0.5 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightColor", source: "panel", r: 1, g: 1, b: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightFlatStrength", source: "panel", value: 0.25 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightFlatColorInfluence", source: "panel", value: 0.25 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowDarkness", source: "panel", value: 0.5 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowFrustumSize", source: "panel", value: 80 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowMaxZ", source: "panel", value: 100 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowFilteringQuality", source: "panel", value: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setSoftTransparentShadow", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setIblShadows", source: "panel", enabled: false },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setIblShadowOpacity", source: "panel", value: 0.5 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setIblShadowDistanceScale", source: "panel", value: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setCharacterContactShadow", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setCharacterContactShadowOpacity", source: "panel", value: 0.5 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setCharacterContactShadowScale", source: "panel", value: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowBias", source: "panel", value: 0.00001 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowNormalBias", source: "panel", value: 0.0001 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setShadowColor", source: "panel", r: 0, g: 0, b: 0 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setToonShadowInfluence", source: "panel", value: 0.5 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setSelfShadowSoftness", source: "panel", value: 0.02 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setOcclusionShadowSoftness", source: "panel", value: 0.02 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLightColorTemperature", source: "panel", kelvin: 6500 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFogEnabled", source: "panel", enabled: true },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setFogStart", source: "panel", value: 10 }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setFogEnd", source: "panel", value: 100 }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setFogDensity", source: "panel", value: 0.01 }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setFogOpacity", source: "panel", value: 0.5 }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setFogColor", source: "panel", r: 1, g: 1, b: 1 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setChromaticAberration", source: "panel", value: 20 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLensDistortion", source: "panel", percent: 50 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLensDistortionInfluence", source: "panel", percent: 75 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction(
            { type: "effect.setLensEdgeBlur", source: "panel", percent: 10 },
            readySnapshot,
        )).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.applyLut", source: "panel" }, readySnapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.chooseExternalLut", source: "button" }, readySnapshot)).toBe(true);
    });
});
