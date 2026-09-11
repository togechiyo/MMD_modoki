import type { MmdManager } from "../mmd-manager";
import type { UIController } from "../ui-controller";
import type { Timeline } from "../timeline";
import { automationTools, AutomationError, type AutomationRequest, type AutomationResult, type AutomationState } from "./contracts";
import { keyframeValuesEqual } from "../actions/keyframe-transaction";
import { buildAutomationKeyframeEdit } from "./keyframe-edit";
import { validateAutomationKeyframes } from "./keyframe-validation";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import { getAutomationSettings } from "./settings";
import { buildAutomationTimelineTransform } from "./timeline-transform";
import { toAutomationFailure } from "./diagnostics";
import { requiresDetailedDiagnostics } from "./model-detail";
import { readAutomationControls } from "./controls";
import { AutomationUiJobs } from "./ui-jobs";
import { cameraRevisionValues } from "./camera-revision";
import { assetRemovalInfo } from "./asset-removal";
import { buildExternalParentEdit } from "./external-parent-edit";

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
    const uiJobs = new AutomationUiJobs();
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
            uiJobs.clear();
        }
        state = next;
    };
    disposers.push(window.electronAPI.automation.onState(updateState));
    void window.electronAPI.automation.getState().then(updateState).catch(() => {
        window.electronAPI.logError("ui", "MCP state initialization failed", {});
    });
    const busyReasons = (): string[] => [
        ...(uiJobs.busy ? ["ui_operation"] : []),
        ...(pointers > 0 ? ["user_interaction"] : []),
        ...(manager.isMaterialModeSwitching() ? ["switching_material_mode"] : []),
        ...ui.getAutomationBusyReasons(),
        ...(Array.from(document.querySelectorAll('[aria-modal="true"]')).some(element => element.getClientRects().length > 0) ? ["modal"] : []),
    ];
    const busy = (): boolean => busyReasons().length > 0;
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
        const signature = JSON.stringify([manager.isPlaying ? null : cameraRevisionValues(camera), manager.isPlaying ? null : manager.currentFrame, manager.isPlaying, history.revision, inputRevision, sceneGeneration, manager.getMmdMaterialPipelinePreset(), ui.getAutomationTimelineScope(), getAutomationSettings(manager)]);
        if (signature !== lastSignature) { lastSignature = signature; revision++; }
        const reasons = busyReasons();
        return { target: { editorSessionId: state?.sessionId, sceneGeneration }, editRevision: revision, assetRevision,
            frame: manager.currentFrame, playing: manager.isPlaying, camera, busy: busy(),
            status: { busy: reasons.length > 0, busyReasons: reasons, editPermission: Boolean(state?.editable),
                detailedDiagnostics: Boolean(state?.detailedDiagnostics),
                editBlockers: [...(!state?.editable ? ["read_only"] : []), ...reasons], playing: manager.isPlaying,
                playbackPolicyRequired: manager.isPlaying, observedAt: new Date().toISOString(), renderCompletion: "not_observed" },
            materialMode: manager.getMmdMaterialPipelinePreset(), backend: manager.getPostEffectBackend(),
            models: manager.getLoadedModels().map(({ instanceId, name, active }) => ({ instanceId, name, active })),
            timelineTarget: manager.getTimelineTarget(), timelineScope: ui.getAutomationTimelineScope(), undoId: history.undoId, redoId: history.redoId, assetCount: assets.length,
            helpUri: "mmd://help/getting-started", modelContentShared: false };
    }
    function execute(request: AutomationRequest): AutomationResult {
        if (!state?.enabled || state.sessionId !== request.sessionId || state.grant !== request.grant) throw new AutomationError("ACCESS_REVOKED");
        const definition = automationTools[request.tool];
        if (!definition) throw new AutomationError("UNKNOWN_TOOL");
        const args = definition.schema.parse(request.args);
        const before = context();
        if (args.target && args.target.editorSessionId !== state.sessionId) throw new AutomationError("SCENE_CHANGED");
        // File load can replace the scene. Replay/query its grant-local result without requiring the old scene to still exist.
        if (request.tool === "mmd_get_operation") {
            const input = automationTools.mmd_get_operation.schema.parse(args);
            const job = uiJobs.get(input.operationId);
            if (job) return { data: { ...job, ...(job.status === "running" ? { phase: busyReasons().includes("modal") ? "waiting_for_user" : "working", busyReasons: busyReasons() } : {}) } };
        }
        if (definition.edit && state.editable && "operationId" in args && typeof args.operationId === "string") {
            const prior = uiJobs.replay(args.operationId, JSON.stringify([request.tool, args]));
            if (prior) return { data: prior };
        }
        if (args.target && (args.target.editorSessionId !== state.sessionId || (request.tool !== "mmd_get_context" && args.target.sceneGeneration !== sceneGeneration))) throw new AutomationError("SCENE_CHANGED");
        if (request.tool === "mmd_get_context") return { data: before };
        if (!args.target) throw new AutomationError("TARGET_REQUIRED");
        if (request.tool === "mmd_list_material_presets") {
            const input = automationTools.mmd_list_material_presets.schema.parse(args);
            if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
            const catalog = ui.getAutomationMaterialPresets(input.subject);
            return { data: { ...catalog, materials: catalog.materials.slice(input.offset, input.offset + input.limit), totalCount: catalog.materials.length,
                nextOffset: input.offset + input.limit < catalog.materials.length ? input.offset + input.limit : null, editRevision: revision, modelContentShared: false } };
        }
        if (request.tool === "mmd_get_editor_options") return { data: { ...ui.getAutomationEditorOptions(), editRevision: revision } };
        if (request.tool === "mmd_get_external_parent") {
            const input = automationTools.mmd_get_external_parent.schema.parse(args);
            if (busy()) throw new AutomationError("EDITOR_BUSY");
            if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
            const value = manager.getExternalParentEditingState(input.scope.kind === "model" ? input.scope.modelInstanceId : undefined);
            if (!value) throw new AutomationError("MODEL_NOT_FOUND");
            return { data: { scope: input.scope, frame: manager.currentFrame, effective: value.effective,
                items: value.keys.slice(input.offset, input.offset + input.limit), totalCount: value.keys.length,
                nextOffset: input.offset + input.limit < value.keys.length ? input.offset + input.limit : null,
                editRevision: revision, modelContentShared: false, helpUri: "mmd://help/external-parent" } };
        }
        if (request.tool === "mmd_list_controls") {
            const input = automationTools.mmd_list_controls.schema.parse(args);
            if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
            return { data: { ...readAutomationControls(manager, input.query, input.offset, input.limit), editRevision: revision, backend: manager.getPostEffectBackend(), values: "configured", renderCompletion: "not_observed" } };
        }
        if (requiresDetailedDiagnostics(request.tool)) {
            if (!state.detailedDiagnostics) throw new AutomationError("DETAILED_DIAGNOSTICS_DISABLED");
            if (busy()) throw new AutomationError("EDITOR_BUSY");
            if (request.tool === "mmd_list_diagnostic_targets") {
                const input = automationTools.mmd_list_diagnostic_targets.schema.parse(args);
                if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
                const result = manager.getDiagnosticModelTargets(input.modelInstanceId, input.kind, input.offset, input.limit);
                if (!result) throw new AutomationError("MODEL_NOT_FOUND");
                return { data: { ...result, modelInstanceId: input.modelInstanceId, target: before.target, editRevision: revision, modelContentShared: false } };
            }
            const input = automationTools.mmd_inspect_detail.schema.parse(args);
            if (input.expectedEditRevision !== revision) throw new AutomationError("REVISION_CONFLICT", { expected: input.expectedEditRevision, actual: revision });
            const result = manager.getDiagnosticModelDetail(input.modelInstanceId, input.subject);
            if (!result) throw new AutomationError("DETAIL_TARGET_NOT_FOUND");
            return { data: { ...result, modelInstanceId: input.modelInstanceId, target: before.target, editRevision: revision, frame: manager.currentFrame,
                materialMode: manager.getMmdMaterialPipelinePreset(), physicsBackend: manager.getPhysicsBackendLabel(), modelContentShared: false } };
        }
        if (request.tool === "mmd_get_diagnostics") return { data: {
            target: before.target, editRevision: revision, frame: manager.currentFrame, status: before.status,
            runtime: { engine: manager.getEngineType(), backend: manager.getPostEffectBackend(), materialMode: manager.getMmdMaterialPipelinePreset(),
                physicsEnabled: manager.getPhysicsEnabled(), physicsBackend: manager.getPhysicsBackendLabel(), physicsEvaluation: manager.getPhysicsEvaluationTypeLabel(),
                webGpuValidationErrorCount: manager.getWebGpuValidationDiagnostics().count },
            history: ui.getAutomationHistoryState(), modelContentShared: false,
            coverage: "MCP failures and observed runtime status; no full application log or motion-quality analysis",
        } };
        if (request.tool === "mmd_get_settings") return { data: { settings: getAutomationSettings(manager), editRevision: revision, undoable: false } };
        if (request.tool === "mmd_list_assets") {
            const input = automationTools.mmd_list_assets.schema.parse(args);
            if ((input.offset > 0 && input.expectedAssetRevision === undefined) || (input.expectedAssetRevision !== undefined && input.expectedAssetRevision !== assetRevision)) throw new AutomationError("CURSOR_STALE");
            const all = manager.getAutomationAssetReferences();
            return { data: { assets: all.slice(input.offset, input.offset + input.limit).map(asset => ({ ...asset, removal: assetRemovalInfo(asset.kind) })), assetRevision, nextOffset: input.offset + input.limit < all.length ? input.offset + input.limit : null, modelContentShared: false } };
        }
        if (request.tool === "mmd_capture_viewport") {
            const rect = document.getElementById("render-canvas")?.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1 || busy()) throw new AutomationError("CAPTURE_UNAVAILABLE");
            return { data: { ...before, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } };
        }
        if (request.tool === "mmd_inspect") {
            const input = automationTools.mmd_inspect.schema.parse(args);
            if ((input.offset > 0 && input.expectedEditRevision === undefined) || (input.expectedEditRevision !== undefined && input.expectedEditRevision !== revision)) throw new AutomationError("REVISION_CONFLICT");
            if (input.kind === "morphs") {
                const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
                if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                const scope = ui.getAutomationTimelineScope();
                const selected = scope?.kind === "model" && scope.modelInstanceId === model.instanceId;
                const names = manager.getModelMorphNames(model.index);
                return { data: { items: names.slice(input.offset, input.offset + input.limit).map((name, index) => {
                    const nameUnique = names.filter(item => item === name).length === 1;
                    const weight = manager.getAutomationModelMorphWeight(model.instanceId, name);
                    return { index: input.offset + index, name, weight, nameUnique,
                        editable: selected && nameUnique && weight !== null,
                        editBlockedReason: !nameUnique ? "name_not_unique" : !selected ? "model_not_selected" : weight === null ? "runtime_unavailable" : null };
                }), modelInstanceId: model.instanceId, totalCount: names.length, modelContentShared: false, scope, editRevision: revision, nextOffset: input.offset + input.limit < names.length ? input.offset + input.limit : null } };
            }
            if (input.kind === "materials") {
                const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
                if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                const materials = manager.getWgslModelShaderStates().find(item => item.modelIndex === model.index)?.materials ?? [];
                return { data: { items: materials.slice(input.offset, input.offset + input.limit).map(({ key, name, visible, presetId, pbrPresetId }, index) => ({ index: input.offset + index, key, name, visible, presetId, pbrPresetId })), modelInstanceId: model.instanceId, totalCount: materials.length, modelContentShared: false, editRevision: revision, nextOffset: input.offset + input.limit < materials.length ? input.offset + input.limit : null } };
            }
            if (input.kind === "bones") {
                const model = manager.getLoadedModels().find(item => item.instanceId === input.modelInstanceId);
                if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                const names = manager.getModelBoneNames(model.index);
                const items = names.slice(input.offset, input.offset + input.limit).map((name, index) => {
                    const controls = manager.getAutomationBoneControls(model.instanceId, name);
                    const nameUnique = names.filter(item => item === name).length === 1;
                    return { index: input.offset + index, name, nameUnique, transform: nameUnique ? manager.getBoneTransformForModelInstance(model.instanceId, name) : null, ...controls, editable: (controls.movable || controls.rotatable) && nameUnique };
                });
                return { data: { items, modelInstanceId: model.instanceId, totalCount: names.length, modelContentShared: false, editRevision: revision, nextOffset: input.offset + input.limit < names.length ? input.offset + input.limit : null } };
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
        if (request.tool === "mmd_cancel_operation") {
            const input = automationTools.mmd_cancel_operation.schema.parse(args);
            if (input.expectedEditRevision !== revision) throw new AutomationError("REVISION_CONFLICT");
            const result = { status: "cancel_requested", accepted: uiJobs.cancel(input.jobOperationId), jobOperationId: input.jobOperationId };
            operations.set(input.operationId, { input: inputKey, result });
            if (operations.size > 100) { const oldest = operations.keys().next().value; if (oldest) operations.delete(oldest); }
            return { data: result };
        }
        if (busy()) throw new AutomationError("EDITOR_BUSY");
        if (typeof args.expectedEditRevision !== "number") throw new AutomationError("INVALID_EDIT");
        if (args.expectedEditRevision !== revision) throw new AutomationError("REVISION_CONFLICT", { field: "expectedEditRevision", expected: args.expectedEditRevision, actual: revision });
        if (request.tool === "mmd_start_ui_operation") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_start_ui_operation.schema.parse(args);
            const grant = state.grant;
            const sessionId = state.sessionId;
            return { data: uiJobs.start(input.operationId, inputKey, async jobContext => {
                const output = await ui.runAutomationUiOperation(input.operation, { sessionId, grant }, jobContext);
                inputRevision++;
                const current = context();
                return { ...output, target: current.target, editRevision: current.editRevision, modelContentShared: false };
            }, () => Boolean(state?.enabled && state.editable && state.grant === grant && state.sessionId === sessionId), input.operation.kind === "exportWebm") };
        }
        const editId = `ai:${args.operationId}`;
        let changed = true;
        let controlResult: Record<string, unknown> | undefined;
        if (request.tool === "mmd_set_morph") {
            const input = automationTools.mmd_set_morph.schema.parse(args);
            const scope = ui.getAutomationTimelineScope();
            if (scope?.kind !== "model" || scope.modelInstanceId !== input.modelInstanceId) throw new AutomationError("TIMELINE_TARGET_CHANGED");
            if (manager.getActiveModelInfo()?.morphNames.filter(name => name === input.morphName).length !== 1) throw new AutomationError("MORPH_NOT_UNIQUE");
        }
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
        if (request.tool === "mmd_edit_external_parent") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_edit_external_parent.schema.parse(args);
            const scope = input.subject.kind === "camera" ? { kind: "camera" as const } : { kind: "model" as const, modelInstanceId: input.subject.modelInstanceId };
            if (!keyframeValuesEqual(scope, ui.getAutomationTimelineScope())) throw new AutomationError("TIMELINE_TARGET_CHANGED");
            const subject = input.subject;
            const tracks = timeline.getKeyframeTracks().filter(track => subject.kind === "camera" ? track.category === "camera" : ["root", "semi-standard", "bone"].includes(track.category) && track.name === subject.boneName);
            if (tracks.length !== 1) throw new AutomationError("TRACK_NOT_UNIQUE");
            const track = { category: tracks[0].category, name: tracks[0].name };
            const diff = buildExternalParentEdit({ scope, track, operations: input.operations, collision: input.collision,
                currentFrame: manager.currentFrame, read: frame => manager.readTimelineKeyframePayload(track, frame), capture: () => ui.captureAutomationKeyframe(track),
                resolveParent: (instanceId, boneName) => {
                    const model = manager.getLoadedModels().find(item => item.instanceId === instanceId);
                    if (!model) throw new AutomationError("MODEL_NOT_FOUND");
                    if (manager.getModelBoneNames(model.index).filter(name => name === boneName).length !== 1) throw new AutomationError("BONE_NOT_UNIQUE");
                    return model;
                },
            });
            validateAutomationKeyframes(manager, timeline, diff);
            const plan = { subject: input.subject, changes: diff.items, changedKeyCount: diff.items.length,
                poseModes: input.operations.filter(operation => operation.action === "set").map(operation => ({ frame: operation.frame, poseMode: operation.poseMode })),
                worldPosePreserved: false, modelContentShared: false };
            if (input.dryRun) {
                const result = { status: "validated", operationId: input.operationId, editId: null, editRevision: revision, plan };
                operations.set(input.operationId, { input: inputKey, result });
                if (operations.size > 100) { const oldest = operations.keys().next().value; if (oldest) operations.delete(oldest); }
                return { data: result };
            }
            changed = ui.applyAutomationKeyframes(diff, editId);
            ui.finishAutomationKeyframeRegistration([track]);
            controlResult = plan;
        } else if (request.tool === "mmd_set_material_preset") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_set_material_preset.schema.parse(args);
            controlResult = ui.setAutomationMaterialPreset(input.subject, input.materialKey, input.presetId);
        } else if (request.tool === "mmd_set_editor_options") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_set_editor_options.schema.parse(args);
            const previous = ui.getAutomationEditorOptions();
            controlResult = ui.setAutomationEditorOptions(input.options);
            changed = !keyframeValuesEqual(previous, controlResult);
        } else if (request.tool === "mmd_select_bones") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_select_bones.schema.parse(args);
            ui.selectAutomationBones(input.modelInstanceId, input.boneNames);
        } else if (request.tool === "mmd_set_control") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_set_control.schema.parse(args);
            const result = ui.setAutomationControl(input.control);
            changed = result.changed;
            controlResult = result;
        } else if (request.tool === "mmd_set_material_visibility") {
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
        } else if (request.tool === "mmd_register_keyframes") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_register_keyframes.schema.parse(args);
            if (!keyframeValuesEqual(input.scope, ui.getAutomationTimelineScope())) throw new AutomationError("TIMELINE_TARGET_CHANGED");
            const operations = input.tracks.map(track => {
                const payload = ui.captureAutomationKeyframe(track);
                if (!payload) throw new AutomationError("TRACK_NOT_UNIQUE");
                return { action: "set" as const, track, frame: Math.max(0, Math.floor(manager.currentFrame)), payload };
            });
            const diff = buildAutomationKeyframeEdit(input.scope, operations, input.collision, (track, frame) => manager.readTimelineKeyframePayload(track, frame));
            validateAutomationKeyframes(manager, timeline, diff);
            changed = ui.applyAutomationKeyframes(diff, editId);
            ui.finishAutomationKeyframeRegistration(input.tracks);
        } else if (request.tool === "mmd_transform_keyframes") {
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            const input = automationTools.mmd_transform_keyframes.schema.parse(args);
            if (!keyframeValuesEqual(input.scope, ui.getAutomationTimelineScope())) throw new AutomationError("TIMELINE_TARGET_CHANGED");
            const diff = buildAutomationTimelineTransform(input.scope, input.operation, timeline.getKeyframeTracks(), (track, frame) => manager.readTimelineKeyframePayload(track, frame));
            validateAutomationKeyframes(manager, timeline, diff);
            changed = ui.applyAutomationKeyframes(diff, editId);
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
        } else if (request.tool === "mmd_set_morph") {
            const input = automationTools.mmd_set_morph.schema.parse(args);
            changed = ui.applyAutomationMorph(input.modelInstanceId, input.morphName, input.weight, editId);
        } else if (request.tool === "mmd_set_playback") {
            const input = automationTools.mmd_set_playback.schema.parse(args);
            if (input.action === "play") manager.play();
            if (input.action === "pause") manager.pause();
            if (input.action === "seek") { manager.pause(); manager.seekToBoundary(input.frame ?? 0); }
        } else if (request.tool === "mmd_undo") {
            const input = automationTools.mmd_undo.schema.parse(args);
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            if (!ui.undoAutomationEdit(input.editId)) throw new AutomationError("UNDO_CONFLICT");
        } else if (request.tool === "mmd_redo") {
            const input = automationTools.mmd_redo.schema.parse(args);
            if (manager.isPlaying) throw new AutomationError("PLAYING");
            if (!ui.redoAutomationEdit(input.editId)) throw new AutomationError("REDO_CONFLICT");
        } else throw new AutomationError("UNKNOWN_TOOL");
        if (changed) inputRevision++;
        const after = context();
        const result = { operationId: args.operationId, status: changed ? "applied" : "no-change", beforeRevision: before.editRevision, afterRevision: after.editRevision,
            ...(controlResult ? { control: controlResult } : {}),
            editId: request.tool === "mmd_redo" && "editId" in args ? args.editId : changed && ["mmd_set_camera", "mmd_set_bone", "mmd_set_morph", "mmd_edit_keyframes", "mmd_transform_keyframes", "mmd_register_keyframes", "mmd_edit_external_parent"].includes(request.tool) ? editId : null, frame: manager.currentFrame, playing: manager.isPlaying };
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
                window.electronAPI.automation.reply({ requestId: request.requestId, failure: toAutomationFailure(error) });
            }
        };
        void run();
    }));
    window.addEventListener("beforeunload", () => disposers.forEach(dispose => dispose()), { once: true });
}
