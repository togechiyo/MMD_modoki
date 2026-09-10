import type { MmdManager } from "../mmd-manager";
import type { UIController } from "../ui-controller";
import type { Timeline } from "../timeline";
import { automationTools, AutomationError, type AutomationRequest, type AutomationResult, type AutomationState } from "./contracts";
import { keyframeValuesEqual } from "../actions/keyframe-transaction";
import { buildAutomationKeyframeEdit } from "./keyframe-edit";
import { validateAutomationKeyframes } from "./keyframe-validation";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import { getAutomationSettings } from "./settings";

export function connectAutomationEditor(manager: MmdManager, ui: UIController, timeline: Timeline): void {
    let state: AutomationState | null = null;
    let inputRevision = 0;
    let pointers = 0;
    let sceneGeneration = 0;
    let revision = 0;
    let assetRevision = 0;
    let lastAssets = "";
    let lastSignature = "";
    let lastHistoryGeneration = -1;
    const operations = new Map<string, { input: string; result: Record<string, unknown> }>();
    const disposers: (() => void)[] = [];
    const listen = (name: string, callback: EventListener): void => {
        document.addEventListener(name, callback, true);
        disposers.push(() => document.removeEventListener(name, callback, true));
    };
    listen("pointerdown", () => { pointers++; inputRevision++; });
    listen("pointerup", () => { pointers = Math.max(0, pointers - 1); inputRevision++; });
    listen("pointercancel", () => { pointers = 0; });
    const resetPointers = (): void => { pointers = 0; };
    window.addEventListener("blur", resetPointers);
    disposers.push(() => window.removeEventListener("blur", resetPointers));
    for (const name of ["input", "change", "keydown", "wheel"]) listen(name, () => { inputRevision++; });
    const updateState = (next: AutomationState): void => {
        if (state?.sessionId === next.sessionId && state.grant > next.grant) return;
        if (state && (state.grant !== next.grant || state.sessionId !== next.sessionId)) {
            sceneGeneration++; revision++; operations.clear();
        }
        state = next;
    };
    disposers.push(window.electronAPI.automation.onState(updateState));
    void window.electronAPI.automation.getState().then(updateState).catch(() => {
        window.electronAPI.logError("ui", "MCP state initialization failed", {});
    });
    const busy = (): boolean => pointers > 0 || manager.isMaterialModeSwitching() || ui.isAutomationBusy()
        || Array.from(document.querySelectorAll('[aria-modal="true"]')).some(element => element.getClientRects().length > 0);
    function context(): Record<string, unknown> {
        const assets = manager.getAutomationAssetReferences();
        const assetsSignature = JSON.stringify(assets);
        const history = ui.getAutomationHistoryState();
        if (lastAssets !== assetsSignature || history.generation !== lastHistoryGeneration) {
            lastAssets = assetsSignature;
            lastHistoryGeneration = history.generation;
            sceneGeneration++;
            assetRevision++;
            operations.clear();
        }
        const pose = manager.getCameraKeyframePose();
        const camera = { target: { ...pose.target }, rotation: { ...pose.rotation }, distance: pose.distance, fov: pose.fov };
        // Playback evaluation is not a user edit; otherwise even pause would race every rendered frame.
        const signature = JSON.stringify([manager.isPlaying ? null : camera, manager.isPlaying ? null : manager.currentFrame, manager.isPlaying, history.revision, inputRevision, sceneGeneration, manager.getMmdMaterialPipelinePreset(), ui.getAutomationTimelineScope(), getAutomationSettings(manager)]);
        if (signature !== lastSignature) { lastSignature = signature; revision++; }
        return { target: { editorSessionId: state?.sessionId, sceneGeneration }, editRevision: revision, assetRevision,
            frame: manager.currentFrame, playing: manager.isPlaying, camera, busy: busy(),
            materialMode: manager.getMmdMaterialPipelinePreset(), backend: manager.getPostEffectBackend(),
            models: manager.getLoadedModels().map(({ instanceId, name, active }) => ({ instanceId, name, active })),
            timelineTarget: manager.getTimelineTarget(), timelineScope: ui.getAutomationTimelineScope(), undoId: history.undoId, assetCount: assets.length,
            helpUri: "mmd://help/getting-started", modelContentShared: false };
    }
    function execute(request: AutomationRequest): AutomationResult {
        if (!state?.enabled || state.sessionId !== request.sessionId || state.grant !== request.grant) throw new AutomationError("ACCESS_REVOKED");
        const definition = automationTools[request.tool];
        if (!definition) throw new AutomationError("UNKNOWN_TOOL");
        const args = definition.schema.parse(request.args);
        const before = context();
        if (args.target && (args.target.editorSessionId !== state.sessionId || (request.tool !== "mmd_get_context" && args.target.sceneGeneration !== sceneGeneration))) throw new AutomationError("SCENE_CHANGED");
        if (request.tool === "mmd_get_context") return { data: before };
        if (!args.target) throw new AutomationError("TARGET_REQUIRED");
        if (request.tool === "mmd_get_settings") return { data: { settings: getAutomationSettings(manager), editRevision: revision, undoable: false } };
        if (request.tool === "mmd_list_assets") {
            const input = automationTools.mmd_list_assets.schema.parse(args);
            if ((input.offset > 0 && input.expectedAssetRevision === undefined) || (input.expectedAssetRevision !== undefined && input.expectedAssetRevision !== assetRevision)) throw new AutomationError("CURSOR_STALE");
            const all = manager.getAutomationAssetReferences();
            return { data: { assets: all.slice(input.offset, input.offset + input.limit), assetRevision, nextOffset: input.offset + input.limit < all.length ? input.offset + input.limit : null, modelContentShared: false } };
        }
        if (request.tool === "mmd_capture_viewport") {
            const rect = document.getElementById("render-canvas")?.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1 || busy()) throw new AutomationError("CAPTURE_UNAVAILABLE");
            return { data: { ...before, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } };
        }
        if (request.tool === "mmd_inspect") {
            const input = automationTools.mmd_inspect.schema.parse(args);
            if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
            if (input.kind === "materials") {
                const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
                if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                const materials = manager.getWgslModelShaderStates().find(item => item.modelIndex === model.index)?.materials ?? [];
                return { data: { items: materials.slice(input.offset, input.offset + input.limit).map(({ key, name, visible, presetId, pbrPresetId }) => ({ key, name, visible, presetId, pbrPresetId })), modelInstanceId: model.instanceId, editRevision: revision, nextOffset: input.offset + input.limit < materials.length ? input.offset + input.limit : null } };
            }
            if (input.kind === "bones") {
                const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
                if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                const names = manager.getModelBoneNames(model.index);
                const items = names.slice(input.offset, input.offset + input.limit).map(name => {
                    const controls = manager.getAutomationBoneControls(model.instanceId, name);
                    return { name, transform: manager.getBoneTransformForModelInstance(model.instanceId, name), ...controls, editable: (controls.movable || controls.rotatable) && names.filter(item => item === name).length === 1 };
                });
                return { data: { items, editRevision: revision, nextOffset: input.offset + input.limit < names.length ? input.offset + input.limit : null } };
            }
            if (input.kind === "tracks") {
                const all = timeline.getKeyframeTracks();
                return { data: { items: all.slice(input.offset, input.offset + input.limit).map(({ category, name, frames }) => {
                    const bone = ["root", "semi-standard", "bone"].includes(category);
                    const movable = manager.getActiveModelInfo()?.boneControlInfos?.find(control => control.name === name)?.movable ?? category === "root";
                    return { category, name, keyCount: frames.length, payloadKind: bone ? (movable ? "movableBone" : "bone") : category,
                        ...(category === "property" ? { ikStates: manager.getActiveModelIkStates() } : {}) };
                }), editRevision: revision, scope: ui.getAutomationTimelineScope(), nextOffset: input.offset + input.limit < all.length ? input.offset + input.limit : null } };
            }
            // Explicit source animation key DTOs only, never model/animation object serialization.
            const items: { category: string; name: string; frame: number; payload: TimelineKeyframePayload | null }[] = [];
            let index = 0;
            let more = false;
            outer: for (const track of timeline.getKeyframeTracks()) for (const frame of track.frames) {
                if (index++ < input.offset) continue;
                if (items.length === input.limit) { more = true; break outer; }
                items.push({ category: track.category, name: track.name, frame, payload: manager.readTimelineKeyframePayload(track, frame) });
            }
            return { data: { items, editRevision: revision, timelineTarget: manager.getTimelineTarget(), scope: ui.getAutomationTimelineScope(), nextOffset: more ? input.offset + input.limit : null } };
        }
        if (request.tool === "mmd_get_operation") {
            const input = automationTools.mmd_get_operation.schema.parse(args);
            return { data: operations.get(input.operationId)?.result ?? { status: "unknown", operationId: input.operationId } };
        }
        if (!state.editable) throw new AutomationError("READ_ONLY");
        if (!("operationId" in args) || typeof args.operationId !== "string" || !("expectedEditRevision" in args)) throw new AutomationError("INVALID_EDIT");
        const inputKey = JSON.stringify([request.tool, args]);
        const prior = operations.get(args.operationId);
        if (prior) {
            if (prior.input !== inputKey) throw new AutomationError("OPERATION_ID_REUSED");
            return { data: prior.result };
        }
        if (busy()) throw new AutomationError("EDITOR_BUSY");
        if (args.expectedEditRevision !== revision) throw new AutomationError("REVISION_CONFLICT");
        const editId = `ai:${args.operationId}`;
        let changed = true;
        if (request.tool === "mmd_set_bone") {
            const input = automationTools.mmd_set_bone.schema.parse(args);
            const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
            if (!model || manager.getModelBoneNames(model.index).filter(name => name === input.boneName).length !== 1) throw new AutomationError("BONE_NOT_UNIQUE");
            const controls = manager.getAutomationBoneControls(input.modelInstanceId, input.boneName);
            const current = manager.getBoneTransformForModelInstance(input.modelInstanceId, input.boneName);
            if (!current) throw new AutomationError("BONE_NOT_FOUND");
            const differs = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) > 0.0001;
            if ((!controls.movable && differs(current.position, input.position)) || (!controls.rotatable && differs(current.rotation, input.rotation))) throw new AutomationError("BONE_CONTROL_LOCKED");
        }
        if ("playbackPolicy" in args && manager.isPlaying) {
            if (args.playbackPolicy === "reject") throw new AutomationError("PLAYING");
            manager.pause();
        }
        if (request.tool === "mmd_set_material_visibility") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_set_material_visibility.schema.parse(args);
            const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
            if (!model) throw new AutomationError("MODEL_NOT_FOUND");
            const material = manager.getWgslModelShaderStates().find(item => item.modelIndex === model.index)?.materials.find(item => item.key === input.materialKey);
            if (!material) throw new AutomationError("MATERIAL_NOT_FOUND");
            changed = material.visible !== input.visible;
            if (changed && !manager.setModelMaterialVisibility(model.index, input.materialKey, input.visible)) throw new AutomationError("OPERATION_FAILED");
            const afterMaterial = manager.getWgslModelShaderStates().find(item => item.modelIndex === model.index)?.materials.find(item => item.key === input.materialKey);
            if (afterMaterial?.visible !== input.visible) throw new AutomationError("OPERATION_FAILED");
        } else if (request.tool === "mmd_set_setting") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_set_setting.schema.parse(args);
            if (!getAutomationSettings(manager)[input.setting.id].available) throw new AutomationError("SETTING_UNAVAILABLE");
            changed = ui.setAutomationSetting(input.setting);
        } else if (request.tool === "mmd_edit_keyframes") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_edit_keyframes.schema.parse(args);
            if (!keyframeValuesEqual(input.scope, ui.getAutomationTimelineScope())) throw new AutomationError("TIMELINE_TARGET_CHANGED");
            const diff = buildAutomationKeyframeEdit(input.scope, input.operations, input.collision, (track, frame) => manager.readTimelineKeyframePayload(track, frame));
            validateAutomationKeyframes(manager, timeline, diff);
            changed = ui.applyAutomationKeyframes(diff, editId);
        } else if (request.tool === "mmd_select_timeline") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_select_timeline.schema.parse(args);
            changed = !keyframeValuesEqual(input.scope, ui.getAutomationTimelineScope());
            if (changed && !ui.selectAutomationTimeline(input.scope)) throw new AutomationError("TARGET_NOT_FOUND");
        } else if (request.tool === "mmd_set_camera") {
            const input = automationTools.mmd_set_camera.schema.parse(args);
            changed = ui.applyAutomationCamera(input.camera, editId);
        } else if (request.tool === "mmd_set_bone") {
            const input = automationTools.mmd_set_bone.schema.parse(args);
            changed = ui.applyAutomationBone(input.modelInstanceId, input.boneName, { position: input.position, rotation: input.rotation }, editId);
        } else if (request.tool === "mmd_set_playback") {
            const input = automationTools.mmd_set_playback.schema.parse(args);
            if (input.action === "play") manager.play();
            if (input.action === "pause") manager.pause();
            if (input.action === "seek") { manager.pause(); manager.seekToBoundary(input.frame ?? 0); }
        } else if (request.tool === "mmd_undo") {
            const input = automationTools.mmd_undo.schema.parse(args);
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            if (!ui.undoAutomationEdit(input.editId)) throw new AutomationError("UNDO_CONFLICT");
        } else throw new AutomationError("UNKNOWN_TOOL");
        if (changed) inputRevision++;
        const after = context();
        const result = { operationId: args.operationId, status: changed ? "applied" : "no-change", beforeRevision: before.editRevision, afterRevision: after.editRevision,
            editId: changed && (request.tool === "mmd_set_camera" || request.tool === "mmd_set_bone" || request.tool === "mmd_edit_keyframes") ? editId : null, frame: manager.currentFrame, playing: manager.isPlaying };
        operations.set(args.operationId, { input: inputKey, result });
        if (operations.size > 100) { const oldest = operations.keys().next().value; if (oldest) operations.delete(oldest); }
        return { data: result };
    }
    disposers.push(window.electronAPI.automation.onRequest(request => {
        const run = async (): Promise<void> => {
            try {
                if (request.tool === "mmd_capture_viewport") {
                    // Validate before waiting, then revalidate the grant/scene after actual engine frames.
                    execute(request);
                    try { await manager.waitForAutomationRender(); }
                    catch { throw new AutomationError("CAPTURE_UNAVAILABLE"); }
                }
                window.electronAPI.automation.reply({ requestId: request.requestId, result: execute(request) });
            } catch (error) {
                window.electronAPI.automation.reply({ requestId: request.requestId, error: error instanceof AutomationError ? error.code : "OPERATION_FAILED" });
            }
        };
        void run();
    }));
    window.addEventListener("beforeunload", () => disposers.forEach(dispose => dispose()), { once: true });
}
