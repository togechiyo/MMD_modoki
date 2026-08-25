import { t } from "../i18n";
import type { MmdManager } from "../mmd-manager";
import type { AutoKeyScope, EditorAction } from "../actions/types";
import { BackgroundSettingsDialogController } from "./background-settings-dialog-controller";
import { ContactShadowSettingsDialogController } from "./contact-shadow-settings-dialog-controller";
import { EdgeSettingsDialogController } from "./edge-settings-dialog-controller";
import { GravitySettingsDialogController } from "./gravity-settings-dialog-controller";
import { HdriSettingsDialogController } from "./hdri-settings-dialog-controller";
import { IblShadowSettingsDialogController } from "./ibl-shadow-settings-dialog-controller";
import { LightingShadowSettingsDialogController } from "./lighting-shadow-settings-dialog-controller";
import { MirrorFloorSettingsDialogController } from "./mirror-floor-settings-dialog-controller";
import { PhysicsSettingsDialogController } from "./physics-settings-dialog-controller";
import { RenderOrderSettingsDialogController } from "./render-order-settings-dialog-controller";
import { PngExportDialogController } from "./png-export-dialog-controller";
import { PopupDialogController } from "./popup-dialog-controller";
import type { WebmExportSettingsAdapter } from "./export-ui-controller";
import { WebmExportDialogController } from "./webm-export-dialog-controller";
import { parseUiScalePercentage, type UiScalePercentage } from "../shared/ui-scale";
import {
    createIdentityKeyframeValueCorrection,
    type KeyframeValueCorrection,
    type KeyframeValueCorrectionKind,
    type KeyframeValueCorrectionPreview,
} from "../editor/keyframe-value-correction";
import { KeyframeValueCorrectionDialogController } from "./keyframe-value-correction-dialog-controller";
import { ModelBodyMotionCorrectionDialogController } from "./model-body-motion-correction-dialog-controller";
import { VmdRetargetDialogController } from "./vmd-retarget-dialog-controller";
import type { ModelBodyMotionCorrectionPreview } from "../editor/model-body-motion-correction";
import type { TrackCategory } from "../types";

type ToastType = "success" | "error" | "info";

type AppMenuControllerDeps = {
    mmdManager: MmdManager;
    dispatchAction: (action: EditorAction) => boolean;
    setStatus: (text: string, loading?: boolean) => void;
    showToast: (message: string, type?: ToastType) => void;
    refreshEnvironmentUi: () => void;
    refreshCameraUi: () => void;
    refreshRuntimeUi: () => void;
    refreshModelEdgeUi: () => void;
    refreshLightingUi: () => void;
    refreshMaterialUi: () => void;
    createExportSettingsAdapter: () => WebmExportSettingsAdapter;
    isUiVisible: () => boolean;
    getUiScalePercentage: () => UiScalePercentage;
    getAutoKeyScope: () => AutoKeyScope;
    countTimelineKeysByCategories: (categories: readonly TrackCategory[]) => number;
    previewKeyframeCorrection: (correction: KeyframeValueCorrection) => KeyframeValueCorrectionPreview;
    previewBodyMotionCorrection: (sourceModelIndex: number) => ModelBodyMotionCorrectionPreview;
};

type DialogKind = "about" | "shortcuts" | "preferences";

type AppMenuElements = {
    root: HTMLElement | null;
    groups: HTMLElement[];
    triggers: HTMLButtonElement[];
    commandItems: HTMLButtonElement[];
    checkItems: HTMLButtonElement[];
};

function resolveElements(): AppMenuElements {
    const root = document.getElementById("app-menu-bar");
    return {
        root,
        groups: root ? Array.from(root.querySelectorAll<HTMLElement>(".app-menu-group")) : [],
        triggers: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-trigger")) : [],
        commandItems: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-item[data-menu-command]")) : [],
        checkItems: root ? Array.from(root.querySelectorAll<HTMLButtonElement>(".app-menu-item[data-menu-command][aria-checked]")) : [],
    };
}

export class AppMenuController {
    private readonly elements: AppMenuElements;
    private readonly mmdManager: MmdManager;
    private readonly dispatchAction: (action: EditorAction) => boolean;
    private readonly setStatus: (text: string, loading?: boolean) => void;
    private readonly showToast: (message: string, type?: ToastType) => void;
    private readonly refreshEnvironmentUi: () => void;
    private readonly refreshCameraUi: () => void;
    private readonly refreshRuntimeUi: () => void;
    private readonly refreshModelEdgeUi: () => void;
    private readonly refreshLightingUi: () => void;
    private readonly refreshMaterialUi: () => void;
    private readonly createExportSettingsAdapter: () => WebmExportSettingsAdapter;
    private readonly isUiVisible: () => boolean;
    private readonly getUiScalePercentage: () => UiScalePercentage;
    private readonly getAutoKeyScope: () => AutoKeyScope;
    private readonly countTimelineKeysByCategories: (categories: readonly TrackCategory[]) => number;
    private readonly previewKeyframeCorrection: (correction: KeyframeValueCorrection) => KeyframeValueCorrectionPreview;
    private readonly previewBodyMotionCorrection: (sourceModelIndex: number) => ModelBodyMotionCorrectionPreview;
    private readonly popupDialogController: PopupDialogController;
    private openGroup: HTMLElement | null = null;

    constructor(deps: AppMenuControllerDeps) {
        this.elements = resolveElements();
        this.mmdManager = deps.mmdManager;
        this.dispatchAction = deps.dispatchAction;
        this.setStatus = deps.setStatus;
        this.showToast = deps.showToast;
        this.refreshEnvironmentUi = deps.refreshEnvironmentUi;
        this.refreshCameraUi = deps.refreshCameraUi;
        this.refreshRuntimeUi = deps.refreshRuntimeUi;
        this.refreshModelEdgeUi = deps.refreshModelEdgeUi;
        this.refreshLightingUi = deps.refreshLightingUi;
        this.refreshMaterialUi = deps.refreshMaterialUi;
        this.createExportSettingsAdapter = deps.createExportSettingsAdapter;
        this.isUiVisible = deps.isUiVisible;
        this.getUiScalePercentage = deps.getUiScalePercentage;
        this.getAutoKeyScope = deps.getAutoKeyScope;
        this.countTimelineKeysByCategories = deps.countTimelineKeysByCategories;
        this.previewKeyframeCorrection = deps.previewKeyframeCorrection;
        this.previewBodyMotionCorrection = deps.previewBodyMotionCorrection;
        this.popupDialogController = new PopupDialogController();
        this.setupMenuEvents();
    }

    public closeAll(): void {
        this.setOpenGroup(null);
        this.popupDialogController.close();
    }

    public refresh(): void {
        this.refreshMenuItems();
    }

    private setupMenuEvents(): void {
        if (!this.elements.root) return;

        this.elements.triggers.forEach((trigger, index) => {
            trigger.addEventListener("click", () => {
                const group = this.elements.groups[index] ?? null;
                this.setOpenGroup(this.openGroup === group ? null : group);
            });
            trigger.addEventListener("mouseenter", () => {
                if (!this.openGroup) return;
                this.setOpenGroup(this.elements.groups[index] ?? null);
            });
        });

        this.elements.root.addEventListener("click", (event) => {
            const item = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-menu-command]");
            if (!item || item.disabled) return;
            const command = item.dataset.menuCommand;
            if (!command) return;
            this.executeCommand(command, item);
            this.refreshMenuItems();
            this.setOpenGroup(null);
        });

        document.addEventListener("pointerdown", (event) => {
            if (!this.openGroup) return;
            if (this.elements.root?.contains(event.target as Node)) return;
            this.setOpenGroup(null);
        });

        document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            if (this.openGroup) {
                event.preventDefault();
                this.setOpenGroup(null);
            }
            return;
        }

        if (!this.elements.root) return;
        const activeElement = document.activeElement as HTMLElement | null;
        const isInsideMenu = activeElement ? this.elements.root.contains(activeElement) : false;
        if (!isInsideMenu && !this.openGroup) return;

        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const activeGroup = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            const currentIndex = Math.max(0, this.elements.groups.indexOf(activeGroup as HTMLElement));
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const nextIndex = (currentIndex + direction + this.elements.groups.length) % this.elements.groups.length;
            const nextGroup = this.elements.groups[nextIndex] ?? null;
            this.setOpenGroup(nextGroup);
            this.elements.triggers[nextIndex]?.focus();
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const group = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            this.setOpenGroup(group);
            this.focusMenuItem(group, 0);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            const group = this.openGroup ?? activeElement?.closest<HTMLElement>(".app-menu-group") ?? null;
            this.setOpenGroup(group);
            this.focusMenuItem(group, -1);
        }
    }

    private focusMenuItem(group: HTMLElement | null, index: number): void {
        const items = group
            ? Array.from(group.querySelectorAll<HTMLButtonElement>(".app-menu-item:not(:disabled)"))
            : [];
        if (items.length === 0) return;
        const targetIndex = index < 0 ? items.length - 1 : Math.min(index, items.length - 1);
        items[targetIndex]?.focus();
    }

    private setOpenGroup(group: HTMLElement | null): void {
        if (group) {
            this.refreshMenuItems();
        }
        this.elements.groups.forEach((item) => {
            item.classList.toggle("menu-open", item === group);
        });
        this.openGroup = group;
    }

    private refreshMenuItems(): void {
        this.refreshCommandItems();
        this.refreshCheckItems();
    }

    private refreshCommandItems(): void {
        this.elements.commandItems.forEach((item) => {
            const command = item.dataset.menuCommand ?? "";
            const disabled = this.resolveCommandDisabled(command);
            if (disabled === null) return;
            item.disabled = disabled;
        });
    }

    private refreshCheckItems(): void {
        this.elements.checkItems.forEach((item) => {
            const command = item.dataset.menuCommand ?? "";
            const state = this.resolveCheckState(command);
            if (!state) return;
            item.setAttribute("aria-checked", state.checked ? "true" : "false");
            item.disabled = state.disabled;
        });
    }

    private resolveCommandDisabled(command: string): boolean | null {
        const timelineTarget = this.mmdManager.getTimelineTarget();
        switch (command) {
            case "edit.selectAllCameraKeys":
                return timelineTarget !== "camera" || this.countTimelineKeysByCategories(["camera"]) === 0;
            case "edit.selectAllLightKeys":
                return timelineTarget !== "camera" || this.countTimelineKeysByCategories(["light"]) === 0;
            case "edit.selectAllSelfShadowKeys":
                return timelineTarget !== "camera" || this.countTimelineKeysByCategories(["shadow"]) === 0;
            case "edit.selectAllGravityKeys":
                return timelineTarget !== "camera" || this.countTimelineKeysByCategories(["gravity"]) === 0;
            case "edit.selectAllBoneKeys":
                return timelineTarget !== "model"
                    || this.countTimelineKeysByCategories(["root", "semi-standard", "bone"]) === 0;
            case "edit.selectAllMorphKeys":
                return timelineTarget !== "model" || this.countTimelineKeysByCategories(["morph"]) === 0;
            case "edit.correctBonePosition":
                return this.previewKeyframeCorrection(createIdentityKeyframeValueCorrection("bone")).compatibleKeyCount === 0;
            case "edit.correctCamera":
                return this.previewKeyframeCorrection(createIdentityKeyframeValueCorrection("camera")).compatibleKeyCount === 0;
            case "edit.correctMorph":
                return this.previewKeyframeCorrection(createIdentityKeyframeValueCorrection("morph")).compatibleKeyCount === 0;
            case "edit.correctMotionForBody":
                return this.mmdManager.getTimelineTarget() !== "model"
                    || !this.mmdManager.hasActiveModelVmdExportKeys()
                    || this.mmdManager.getModelBodyCorrectionModels().filter((model) => !model.active).length === 0;
            case "file.exportModelVmd":
                return !this.mmdManager.hasActiveModelVmdExportKeys();
            case "file.exportCameraVmd":
                return !this.mmdManager.hasCameraVmdExportKeys();
            case "file.exportModelVpd":
                return !this.mmdManager.hasSelectedModelVpdExportBones();
            default:
                return null;
        }
    }

    private resolveCheckState(command: string): { checked: boolean; disabled: boolean } | null {
        const uiScalePercentage = this.resolveUiScaleCommand(command);
        if (uiScalePercentage !== null) {
            return { checked: this.getUiScalePercentage() === uiScalePercentage, disabled: false };
        }

        switch (command) {
            case "edit.autoKeyScope.all":
            case "edit.autoKeyScope.bone":
            case "edit.autoKeyScope.morph":
            case "edit.autoKeyScope.camera":
                return {
                    checked: command.endsWith(this.getAutoKeyScope()),
                    disabled: false,
                };
            case "window.toggleUi":
                return { checked: this.isUiVisible(), disabled: false };
            case "view.toggleGround":
                return { checked: this.mmdManager.isGroundVisible(), disabled: false };
            case "view.toggleEdge":
                return { checked: this.mmdManager.modelEdgeWidth > 0.001, disabled: false };
            case "view.toggleSkydome":
                return { checked: this.mmdManager.isSkydomeVisible(), disabled: false };
            case "view.toggleAntialias":
                return { checked: this.mmdManager.antialiasEnabled, disabled: false };
            case "view.toggleShadow":
                return { checked: this.mmdManager.getShadowEnabled(), disabled: false };
            case "view.toggleCharacterContactShadow":
                return { checked: this.mmdManager.characterContactShadowEnabled, disabled: false };
            case "view.toggleMirrorFloor":
                return { checked: this.mmdManager.mirroringFloorEnabled, disabled: false };
            case "view.toggleGi":
                return { checked: this.mmdManager.isGlobalIlluminationEnabled(), disabled: this.mmdManager.isGlobalIlluminationPending() };
            case "view.toggleFxPanel":
                return { checked: this.isShaderPanelVisible(), disabled: false };
            case "view.toggleTimelinePhysicsBones":
                return {
                    checked: this.mmdManager.getShowPhysicsBonesInTimeline(),
                    disabled: this.mmdManager.getTimelineTarget() !== "model",
                };
            case "view.toggleViewportPhysicsBones":
                return {
                    checked: this.mmdManager.getShowPhysicsBonesInViewport(),
                    disabled: this.mmdManager.getTimelineTarget() !== "model" || !this.hasActiveModel(),
                };
            case "view.fpsUnlimited":
                return { checked: this.mmdManager.getRenderFpsLimit() === 0, disabled: false };
            case "view.fps60":
                return { checked: this.mmdManager.getRenderFpsLimit() === 60, disabled: false };
            case "view.fps30":
                return { checked: this.mmdManager.getRenderFpsLimit() === 30, disabled: false };
            case "view.toggleActiveModel":
                return { checked: this.isActiveModelVisible(), disabled: !this.hasActiveModel() };
            case "background.toggleMedia":
                return { checked: this.mmdManager.isBackgroundMediaVisible(), disabled: !this.mmdManager.hasBackgroundMedia() };
            case "background.setDefault":
                return { checked: this.mmdManager.getBackgroundDisplayMode() === "default", disabled: false };
            case "background.setWhite":
                return { checked: this.mmdManager.getBackgroundDisplayMode() === "white", disabled: false };
            case "background.toggleBlack":
                return { checked: this.mmdManager.isBackgroundBlack(), disabled: false };
            case "background.setChecker":
                return { checked: this.mmdManager.getBackgroundDisplayMode() === "checker", disabled: false };
            case "background.toggleEnvironmentLighting":
                return { checked: this.mmdManager.isEnvironmentLightingEnabled(), disabled: false };
            case "background.toggleHdriBackground":
                return {
                    checked: this.mmdManager.isEnvironmentBackgroundVisible(),
                    disabled: !this.mmdManager.canShowEnvironmentBackground(),
                };
            case "physics.togglePhysics":
                return { checked: this.mmdManager.getPhysicsEnabled(), disabled: !this.mmdManager.isPhysicsAvailable() };
            case "physics.toggleFloorCollision":
                return {
                    checked: this.mmdManager.isPhysicsFloorCollisionAvailable()
                        && this.mmdManager.getPhysicsFloorCollisionEnabled(),
                    disabled: !this.mmdManager.isPhysicsFloorCollisionAvailable(),
                };
            case "physics.toggleRigidBodies":
                return {
                    checked: this.mmdManager.isRigidBodyVisualizerAvailable() && this.mmdManager.isRigidBodyVisualizerEnabled(),
                    disabled: !this.mmdManager.isRigidBodyVisualizerAvailable(),
                };
            default:
                return null;
        }
    }

    private executeCommand(command: string, invoker?: HTMLElement | null): void {
        const uiScalePercentage = this.resolveUiScaleCommand(command);
        if (uiScalePercentage !== null) {
            this.dispatchAction({
                type: "layout.uiScale.set",
                source: "menu",
                percentage: uiScalePercentage,
            });
            return;
        }

        switch (command) {
            case "file.openFile":
                this.dispatchAction({ type: "project.openFile", source: "menu" });
                return;
            case "file.openModel":
                this.dispatchAction({ type: "project.openModel", source: "menu" });
                return;
            case "file.openMotion":
                this.dispatchAction({ type: "project.openMotion", source: "menu" });
                return;
            case "file.openCameraMotion":
                this.dispatchAction({ type: "project.openCameraMotion", source: "menu" });
                return;
            case "file.openAudio":
                this.dispatchAction({ type: "project.openAudio", source: "menu" });
                return;
            case "file.loadProject":
                this.dispatchAction({ type: "project.load", source: "menu" });
                return;
            case "file.saveProject":
                this.dispatchAction({ type: "project.save", source: "menu", forceChoosePath: true });
                return;
            case "file.exportModelVmd":
                this.dispatchAction({ type: "project.exportModelVmd", source: "menu" });
                return;
            case "file.exportCameraVmd":
                this.dispatchAction({ type: "project.exportCameraVmd", source: "menu" });
                return;
            case "file.exportModelVpd":
                this.dispatchAction({ type: "project.exportModelVpd", source: "menu" });
                return;
            case "file.exportPng":
                this.openPngExportDialog(invoker ?? null);
                return;
            case "file.exportPngSequence":
                this.openPngSequenceExportDialog(invoker ?? null);
                return;
            case "file.webmExportSettings":
                this.openWebmExportDialog(invoker ?? null);
                return;
            case "edit.undo":
                this.dispatchAction({ type: "history.undo", source: "menu" });
                return;
            case "edit.redo":
                this.dispatchAction({ type: "history.redo", source: "menu" });
                return;
            case "edit.copyKeyframe":
                this.dispatchAction({ type: "keyframe.copySelected", source: "menu" });
                return;
            case "edit.pasteKeyframe":
                this.dispatchAction({ type: "keyframe.paste", source: "menu" });
                return;
            case "edit.mirrorPasteKeyframe":
                this.dispatchAction({ type: "keyframe.mirrorPaste", source: "menu" });
                return;
            case "edit.addKeyframe":
                this.dispatchAction({ type: "keyframe.addCurrent", source: "menu" });
                return;
            case "edit.deleteKeyframe":
                this.dispatchAction({ type: "keyframe.deleteSelected", source: "menu" });
                return;
            case "edit.insertEmptyFrame":
                this.dispatchAction({ type: "keyframe.insertEmptyFrame", source: "menu" });
                return;
            case "edit.deleteFrameColumn":
                this.dispatchAction({ type: "keyframe.deleteFrameColumn", source: "menu" });
                return;
            case "edit.autoKeyScope.all":
            case "edit.autoKeyScope.bone":
            case "edit.autoKeyScope.morph":
            case "edit.autoKeyScope.camera":
                this.dispatchAction({
                    type: "keyframe.setAutoKeyScope",
                    source: "menu",
                    scope: command.slice("edit.autoKeyScope.".length) as AutoKeyScope,
                });
                return;
            case "edit.prevKeyframe":
                this.dispatchAction({ type: "playback.seekAdjacentKeyframe", source: "menu", direction: -1 });
                return;
            case "edit.nextKeyframe":
                this.dispatchAction({ type: "playback.seekAdjacentKeyframe", source: "menu", direction: 1 });
                return;
            case "edit.selectAllCameraKeys":
                this.dispatchAction({ type: "timeline.selectAllKeysByCategories", source: "menu", categories: ["camera"] });
                return;
            case "edit.selectAllLightKeys":
                this.dispatchAction({ type: "timeline.selectAllKeysByCategories", source: "menu", categories: ["light"] });
                return;
            case "edit.selectAllSelfShadowKeys":
                this.dispatchAction({ type: "timeline.selectAllKeysByCategories", source: "menu", categories: ["shadow"] });
                return;
            case "edit.selectAllGravityKeys":
                this.dispatchAction({ type: "timeline.selectAllKeysByCategories", source: "menu", categories: ["gravity"] });
                return;
            case "edit.selectAllBoneKeys":
                this.dispatchAction({
                    type: "timeline.selectAllKeysByCategories",
                    source: "menu",
                    categories: ["root", "semi-standard", "bone"],
                });
                return;
            case "edit.selectAllMorphKeys":
                this.dispatchAction({ type: "timeline.selectAllKeysByCategories", source: "menu", categories: ["morph"] });
                return;
            case "edit.correctBonePosition":
                this.openKeyframeCorrectionDialog("bone", invoker ?? null);
                return;
            case "edit.correctCamera":
                this.openKeyframeCorrectionDialog("camera", invoker ?? null);
                return;
            case "edit.correctMorph":
                this.openKeyframeCorrectionDialog("morph", invoker ?? null);
                return;
            case "edit.correctMotionForBody":
                this.openBodyMotionCorrectionDialog(invoker ?? null);
                return;
            case "edit.deleteActiveModel":
                this.dispatchAction({ type: "model.deleteActive", source: "menu" });
                return;
            case "view.toggleGround":
                this.dispatchAction({ type: "viewport.toggleGround", source: "menu" });
                return;
            case "view.toggleEdge":
                this.dispatchAction({ type: "viewport.toggleEdge", source: "menu" });
                return;
            case "view.edgeSettings":
                this.openEdgeSettingsDialog(invoker ?? null);
                return;
            case "view.renderOrderSettings":
                this.openRenderOrderSettingsDialog(invoker ?? null);
                return;
            case "view.toggleSkydome":
                this.dispatchAction({ type: "viewport.toggleSkydome", source: "menu" });
                return;
            case "view.toggleAntialias":
                this.dispatchAction({ type: "runtime.toggleAntialias", source: "menu" });
                return;
            case "view.toggleShadow":
                this.dispatchAction({ type: "runtime.toggleShadow", source: "menu" });
                return;
            case "view.toggleCharacterContactShadow":
                this.dispatchAction({
                    type: "effect.setCharacterContactShadow",
                    source: "menu",
                    enabled: !this.mmdManager.characterContactShadowEnabled,
                });
                this.refreshLightingUi();
                return;
            case "view.toggleMirrorFloor":
                this.dispatchAction({
                    type: "camera.setMirroringFloorEnabled",
                    source: "menu",
                    enabled: !this.isMirroringFloorEnabled(),
                });
                return;
            case "view.mirrorFloorSettings":
                this.openMirrorFloorSettingsDialog(invoker ?? null);
                return;
            case "view.toggleGi":
                this.dispatchAction({ type: "runtime.toggleGlobalIllumination", source: "menu" });
                return;
            case "view.lightShadowSettings":
                this.openLightingShadowSettingsDialog(invoker ?? null);
                return;
            case "view.iblShadowSettings":
                this.openIblShadowSettingsDialog(invoker ?? null);
                return;
            case "view.toggleFxPanel":
                this.dispatchAction({ type: "layout.shaderPanel.toggle", source: "menu" });
                return;
            case "view.toggleTimelinePhysicsBones":
                this.dispatchAction({ type: "timeline.togglePhysicsBones", source: "menu" });
                return;
            case "view.toggleViewportPhysicsBones":
                this.dispatchAction({ type: "viewport.togglePhysicsBones", source: "menu" });
                return;
            case "view.fpsUnlimited":
                this.dispatchAction({ type: "runtime.setRenderFpsLimit", source: "menu", limit: 0 });
                return;
            case "view.fps60":
                this.dispatchAction({ type: "runtime.setRenderFpsLimit", source: "menu", limit: 60 });
                return;
            case "view.fps30":
                this.dispatchAction({ type: "runtime.setRenderFpsLimit", source: "menu", limit: 30 });
                return;
            case "view.contactShadowSettings":
                this.openContactShadowSettingsDialog(invoker ?? null);
                return;
            case "view.camera.front":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "front" });
                return;
            case "view.camera.back":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "back" });
                return;
            case "view.camera.left":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "left" });
                return;
            case "view.camera.right":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "right" });
                return;
            case "view.camera.top":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "top" });
                return;
            case "view.camera.bottom":
                this.dispatchAction({ type: "camera.setViewPreset", source: "menu", view: "bottom" });
                return;
            case "view.toggleActiveModel":
                this.dispatchAction({ type: "model.toggleActiveVisibility", source: "menu" });
                return;
            case "window.toggleUi":
                this.dispatchAction({ type: "layout.fullscreen.toggle", source: "menu" });
                return;
            case "background.toggleMedia":
                this.dispatchAction({ type: "viewport.toggleBackgroundMedia", source: "menu" });
                return;
            case "background.toggleBlack":
                this.dispatchAction({ type: "viewport.setBackgroundDisplayMode", source: "menu", mode: "black" });
                return;
            case "background.setDefault":
                this.dispatchAction({ type: "viewport.setBackgroundDisplayMode", source: "menu", mode: "default" });
                return;
            case "background.setWhite":
                this.dispatchAction({ type: "viewport.setBackgroundDisplayMode", source: "menu", mode: "white" });
                return;
            case "background.setChecker":
                this.dispatchAction({ type: "viewport.setBackgroundDisplayMode", source: "menu", mode: "checker" });
                return;
            case "background.toggleEnvironmentLighting":
                this.dispatchAction({ type: "runtime.toggleEnvironmentLighting", source: "menu" });
                return;
            case "background.loadHdri":
                this.dispatchAction({ type: "project.openEnvironmentHdr", source: "menu" });
                return;
            case "background.toggleHdriBackground":
                this.dispatchAction({ type: "viewport.toggleEnvironmentBackground", source: "menu" });
                return;
            case "expression.addKeyframe":
                this.dispatchAction({ type: "keyframe.addCurrent", source: "menu" });
                return;
            case "expression.registerMorph":
                this.dispatchAction({ type: "keyframe.registerMorph", source: "menu" });
                return;
            case "physics.togglePhysics":
                this.dispatchAction({ type: "runtime.togglePhysics", source: "menu" });
                return;
            case "physics.toggleFloorCollision":
                this.dispatchAction({ type: "runtime.toggleFloorCollision", source: "menu" });
                return;
            case "physics.toggleRigidBodies":
                this.dispatchAction({ type: "runtime.toggleRigidBodies", source: "menu" });
                return;
            case "physics.settings":
                this.openPhysicsSettingsDialog(invoker ?? null);
                return;
            case "tools.vmdRetarget":
                this.openVmdRetargetDialog(invoker ?? null);
                return;
            case "dialog.preferences":
                this.openDialog("preferences", invoker ?? null);
                return;
            case "background.settings":
                this.openBackgroundSettingsDialog(invoker ?? null);
                return;
            case "background.hdriSettings":
                this.openHdriSettingsDialog(invoker ?? null);
                return;
            case "physics.gravitySettings":
                this.openGravitySettingsDialog(invoker ?? null);
                return;
            case "dialog.shortcuts":
                this.openDialog("shortcuts", invoker ?? null);
                return;
            case "dialog.about":
                this.openDialog("about", invoker ?? null);
                return;
            case "runtime.classic":
                this.setRuntimeMode("classic");
                return;
            case "runtime.wasm":
                this.setRuntimeMode("wasm");
                return;
            case "help.openLogFolder":
                void this.openLogFolder();
                return;
            default:
                this.showToast(t("menu.toast.unhandled"), "info");
        }
    }

    private openDialog(kind: DialogKind, invoker: HTMLElement | null): void {
        const content = this.createDialogContent(kind);
        this.popupDialogController.open({
            id: kind,
            surface: "modal",
            title: content.title,
            size: kind === "shortcuts" ? "lg" : "md",
            restoreFocusTo: invoker,
            content: (container) => {
                container.innerHTML = content.body;
            },
        });
    }

    private createDialogContent(kind: DialogKind): { title: string; body: string } {
        switch (kind) {
            case "about":
                return {
                    title: t("dialog.about.title"),
                    body: `<p>${t("dialog.about.body")}</p>`,
                };
            case "shortcuts":
                return {
                    title: t("dialog.shortcuts.title"),
                    body: `
                        <dl>
                            <dt>Space / P</dt><dd>${t("dialog.shortcuts.playback")}</dd>
                            <dt>Ctrl+Z</dt><dd>${t("dialog.shortcuts.undo")}</dd>
                            <dt>Ctrl+Y</dt><dd>${t("dialog.shortcuts.redo")}</dd>
                            <dt>Home / End</dt><dd>${t("dialog.shortcuts.range")}</dd>
                            <dt>Esc</dt><dd>${t("dialog.shortcuts.escape")}</dd>
                        </dl>
                    `,
                };
            case "preferences":
                return {
                    title: t("dialog.preferences.title"),
                    body: `<p>${t("dialog.preferences.body")}</p>`,
                };
        }
    }

    private openBackgroundSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "background-settings",
            surface: "modal",
            title: t("dialog.background.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new BackgroundSettingsDialogController({
                mmdManager: this.mmdManager,
                showToast: this.showToast,
            }),
        });
    }

    private openEdgeSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "edge-settings",
            surface: "modal",
            title: t("dialog.edge.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new EdgeSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshModelEdgeUi(),
            }),
        });
    }

    private openGravitySettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "gravity-settings",
            surface: "modal",
            title: t("dialog.gravity.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new GravitySettingsDialogController({
                mmdManager: this.mmdManager,
                refreshUi: () => this.refreshRuntimeUi(),
            }),
        });
    }

    private resolveUiScaleCommand(command: string): UiScalePercentage | null {
        const match = /^window\.uiScale\.(75|100|125|150)$/.exec(command);
        return match ? parseUiScalePercentage(match[1]) : null;
    }

    private openRenderOrderSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "render-order-settings",
            surface: "modal",
            title: t("dialog.renderOrder.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new RenderOrderSettingsDialogController(this.mmdManager),
        });
    }

    private openHdriSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "hdri-settings",
            surface: "modal",
            title: t("dialog.hdri.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new HdriSettingsDialogController({
                mmdManager: this.mmdManager,
                setStatus: this.setStatus,
                showToast: this.showToast,
                refreshUi: () => {
                    this.refreshMaterialUi();
                    this.refreshLightingUi();
                    this.refreshMenuItems();
                },
            }),
        });
    }

    private openPhysicsSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "physics-settings",
            surface: "modal",
            title: t("dialog.physics.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new PhysicsSettingsDialogController({
                mmdManager: this.mmdManager,
                getRuntimeMode: () => this.getRuntimeMode(),
                setRuntimeMode: (mode) => this.setRuntimeMode(mode),
                showToast: (message, type) => this.showToast(message, type),
            }),
        });
    }

    private openLightingShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "lighting-shadow-settings",
            surface: "modal",
            title: t("dialog.lightShadow.title"),
            size: "md",
            restoreFocusTo: invoker,
            content: new LightingShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openIblShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "ibl-shadow-settings",
            surface: "modal",
            title: t("dialog.iblShadow.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new IblShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openContactShadowSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "contact-shadow-settings",
            surface: "modal",
            title: t("dialog.contactShadow.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new ContactShadowSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshLightingUi(),
            }),
        });
    }

    private openMirrorFloorSettingsDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "mirror-floor-settings",
            surface: "modal",
            title: t("dialog.mirrorFloor.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new MirrorFloorSettingsDialogController({
                mmdManager: this.mmdManager,
                dispatchAction: (action) => this.dispatchAction(action),
                refreshUi: () => this.refreshCameraUi(),
            }),
        });
    }

    private openWebmExportDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "webm-export",
            surface: "modal",
            title: t("dialog.webmExport.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new WebmExportDialogController({
                dispatchAction: (action) => this.dispatchAction(action),
                output: this.createExportSettingsAdapter(),
                close: () => {
                    this.popupDialogController.close();
                },
            }),
        });
    }

    private openKeyframeCorrectionDialog(kind: KeyframeValueCorrectionKind, invoker: HTMLElement | null): void {
        const titleKey = kind === "bone"
            ? "dialog.keyCorrection.bonePositionTitle"
            : kind === "camera"
                ? "dialog.keyCorrection.cameraTitle"
                : "dialog.keyCorrection.morphTitle";
        this.popupDialogController.open({
            id: `keyframe-correction-${kind}`,
            surface: "modal",
            title: t(titleKey),
            size: "sm",
            restoreFocusTo: invoker,
            content: new KeyframeValueCorrectionDialogController({
                kind,
                dispatchAction: (action) => this.dispatchAction(action),
                previewCorrection: (correction) => this.previewKeyframeCorrection(correction),
                close: () => this.popupDialogController.close(),
            }),
        });
    }

    private openBodyMotionCorrectionDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "model-body-motion-correction",
            surface: "modal",
            title: t("dialog.bodyMotionCorrection.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new ModelBodyMotionCorrectionDialogController({
                models: this.mmdManager.getModelBodyCorrectionModels(),
                dispatchAction: (action) => this.dispatchAction(action),
                previewCorrection: (sourceModelIndex) => this.previewBodyMotionCorrection(sourceModelIndex),
                close: () => this.popupDialogController.close(),
            }),
        });
    }

    private openVmdRetargetDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "vmd-retarget",
            surface: "modal",
            title: t("dialog.vmdRetarget.title"),
            size: "lg",
            restoreFocusTo: invoker,
            content: new VmdRetargetDialogController({
                fileApi: window.electronAPI,
                setStatus: this.setStatus,
                showToast: this.showToast,
                close: () => this.popupDialogController.close(),
            }),
        });
    }

    private openPngExportDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "png-export",
            surface: "modal",
            title: t("dialog.pngExport.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new PngExportDialogController({
                dispatchAction: (action) => this.dispatchAction(action),
                output: this.createExportSettingsAdapter(),
                kind: "single",
                close: () => {
                    this.popupDialogController.close();
                },
            }),
        });
    }

    private openPngSequenceExportDialog(invoker: HTMLElement | null): void {
        this.popupDialogController.open({
            id: "png-sequence-export",
            surface: "modal",
            title: t("dialog.pngSequenceExport.title"),
            size: "sm",
            restoreFocusTo: invoker,
            content: new PngExportDialogController({
                dispatchAction: (action) => this.dispatchAction(action),
                output: this.createExportSettingsAdapter(),
                kind: "sequence",
                close: () => {
                    this.popupDialogController.close();
                },
            }),
        });
    }

    private async openLogFolder(): Promise<void> {
        const opened = await window.electronAPI.openLogFolder();
        this.showToast(opened ? t("menu.toast.logFolderOpened") : t("menu.toast.logFolderFailed"), opened ? "success" : "error");
    }

    private setRuntimeMode(mode: "classic" | "wasm"): void {
        const select = document.getElementById("toolbar-runtime-mode-select") as HTMLSelectElement | null;
        if (!select) return;
        if (select.value === mode) {
            this.showToast(t("menu.toast.runtimeAlreadySelected"), "info");
            return;
        }
        select.value = mode;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private getRuntimeMode(): "classic" | "wasm" {
        const select = document.getElementById("toolbar-runtime-mode-select") as HTMLSelectElement | null;
        return select?.value === "wasm" ? "wasm" : "classic";
    }

    private isMirroringFloorEnabled(): boolean {
        return this.mmdManager.mirroringFloorEnabled;
    }

    private hasActiveModel(): boolean {
        return this.mmdManager.getActiveModelInfo() !== null;
    }

    private isActiveModelVisible(): boolean {
        return this.hasActiveModel() && this.mmdManager.getActiveModelVisibility();
    }

    private isShaderPanelVisible(): boolean {
        return !document.getElementById("main-content")?.classList.contains("shader-panel-collapsed");
    }
}
