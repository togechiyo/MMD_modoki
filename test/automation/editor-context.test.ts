import { afterEach, describe, expect, it, vi } from "vitest";
import { connectAutomationEditor } from "../../src/automation/editor-bridge";
import type { MmdManager } from "../../src/mmd-manager";
import type { UIController } from "../../src/ui-controller";
import type { Timeline } from "../../src/timeline";
import type { AutomationReply, AutomationRequest, AutomationState } from "../../src/automation/contracts";

async function editorContext() {
    let state: AutomationState = { enabled: true, editable: true, detailedDiagnostics: false,
        sessionId: "11111111-1111-4111-8111-111111111111", grant: 1, endpoint: null };
    let onState: (value: AutomationState) => void = () => undefined;
    let onRequest: (value: AutomationRequest) => void = () => undefined;
    const reply = vi.fn<(value: AutomationReply) => void>();
    const pose = { target: { x: 0, y: 10, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, distance: 45, fov: 30 };
    const manager = {
        currentFrame: 0, isPlaying: false, getCameraKeyframePose: vi.fn(() => pose),
        getAutomationAssetReferences: () => [{ assetId: "model-1", kind: "model", recordedPath: "fixture.pmx" }],
        // A model without a recorded path is still loaded, but has no asset reference.
        getLoadedModelCount: vi.fn(() => 2),
        getLoadedModels: vi.fn(() => [
            { instanceId: "model-1", name: "PRIVATE_NAME", active: true, path: "fixture.pmx" },
            { instanceId: "model-2", name: "PATHLESS_NAME", active: false, path: "" },
        ]),
        getMmdMaterialPipelinePreset: () => "mmd-standard", getPostEffectBackend: () => "frameGraph",
        getTimelineTarget: () => "camera", isMaterialModeSwitching: () => false,
        isGroundVisible: () => true, isSkydomeVisible: () => true, isBackgroundMediaVisible: () => false,
        getBackgroundImagePath: () => null, getBackgroundVideoPath: () => null, antialiasEnabled: true,
        getPhysicsEnabled: () => true, isPhysicsAvailable: () => true, getShadowEnabled: () => true,
        isRigidBodyVisualizerEnabled: () => false, isRigidBodyVisualizerAvailable: () => true,
        postEffectContrast: 1, postEffectGamma: 1, postEffectExposure: 1, postEffectDitheringIntensity: 0,
        postEffectVignetteWeight: 0, postEffectGrainIntensity: 0, postEffectSharpenEdge: 0, postEffectColorCurvesSaturation: 0,
    };
    const reasons: string[] = [];
    const ui = { getAutomationHistoryState: () => ({ generation: 0, revision: 0, undoId: "undo", redoId: null }),
        getAutomationTimelineScope: () => ({ kind: "camera" }), getAutomationBusyReasons: vi.fn(() => reasons),
        onAutomationUserWaitingChanged: () => () => undefined };
    vi.stubGlobal("document", { addEventListener: () => undefined, removeEventListener: () => undefined, querySelectorAll: () => [] });
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined,
        electronAPI: { logError: vi.fn(), automation: {
            getState: async () => state,
            onState: (callback: typeof onState) => { onState = callback; return () => undefined; },
            onRequest: (callback: typeof onRequest) => { onRequest = callback; return () => undefined; }, reply,
        } } });
    connectAutomationEditor(manager as unknown as MmdManager, ui as unknown as UIController, {} as Timeline);
    await Promise.resolve();
    const request = (args: unknown = {}) => {
        reply.mockClear();
        onRequest({ requestId: "request", tool: "mmd_get_context", args, sessionId: state.sessionId, grant: state.grant });
        const result = reply.mock.calls[0]?.[0];
        if (!result) throw new Error("Missing context reply");
        return result;
    };
    const read = (args: unknown = {}) => {
        const response = request(args);
        if (!response.result) throw new Error(`Context failed: ${response.failure?.code}`);
        return response.result.data;
    };
    const update = (patch: Partial<AutomationState>) => { state = { ...state, ...patch }; onState(state); };
    return { manager, ui, pose, reasons, read, request, update, state };
}

afterEach(() => vi.unstubAllGlobals());

describe("renderer context observation", () => {
    it("reads summary counts without building full model descriptions and observes blockers once", async () => {
        const editor = await editorContext();
        editor.reasons.push("model_comment_confirmation");
        const summary = editor.read({ detail: "summary" });
        expect(summary).toMatchObject({ modelCount: 2, assetCount: 1, materialMode: "mmd-standard", backend: "frameGraph",
            busy: true, frame: 0, undoId: "undo", redoId: null, status: { editPermission: true,
                busy: true, busyReasons: ["model_comment_confirmation"], userAction: { kind: "model_comment_confirmation" } } });
        expect(summary).not.toHaveProperty("models");
        expect(summary).not.toHaveProperty("camera");
        expect(JSON.stringify(summary)).not.toContain("PRIVATE_NAME");
        expect(editor.manager.getLoadedModels).not.toHaveBeenCalled();
        expect(editor.manager.getLoadedModelCount).toHaveBeenCalledOnce();
        expect(editor.ui.getAutomationBusyReasons).toHaveBeenCalledOnce();
    });

    it("preserves full default fields and camera values without exposing model paths", async () => {
        const editor = await editorContext();
        const full = editor.read();
        expect(full).toMatchObject({ camera: editor.pose, materialMode: "mmd-standard", backend: "frameGraph",
            helpUri: "mmd://help/getting-started", models: [
                { instanceId: "model-1", name: "PRIVATE_NAME", active: true },
                { instanceId: "model-2", name: "PATHLESS_NAME", active: false },
            ] });
        expect(JSON.stringify(full)).not.toContain("fixture.pmx");
        expect(full).not.toHaveProperty("modelCount");
        expect(editor.manager.getLoadedModels).toHaveBeenCalledOnce();
    });

    it("keeps stopped camera revisions and skips playback-only camera observations for summary", async () => {
        const editor = await editorContext();
        const first = editor.read({ detail: "summary" });
        editor.pose.distance = 50;
        const edited = editor.read({ detail: "summary" });
        expect(edited.editRevision).not.toBe(first.editRevision);
        editor.manager.isPlaying = true;
        const playing = editor.read({ detail: "summary" });
        editor.manager.getCameraKeyframePose.mockClear();
        editor.manager.currentFrame = 20;
        editor.pose.distance = 60;
        const later = editor.read({ detail: "summary" });
        expect(later).toMatchObject({ editRevision: playing.editRevision, playing: true, frame: 20 });
        expect(editor.manager.getCameraKeyframePose).not.toHaveBeenCalled();
        expect(editor.read()).toMatchObject({ editRevision: later.editRevision, camera: { distance: 60 } });
    });

    it("observes current permissions and rejects revoked access or a different editor session", async () => {
        const editor = await editorContext();
        editor.update({ editable: false, detailedDiagnostics: true });
        const summary = editor.read({ detail: "summary", target: { editorSessionId: editor.state.sessionId, sceneGeneration: 999 } });
        expect(summary).toMatchObject({ status: { editPermission: false, detailedDiagnostics: true, editBlockers: ["read_only"] } });
        expect(editor.request({ detail: "summary", target: { editorSessionId: "22222222-2222-4222-8222-222222222222", sceneGeneration: 0 } })).toMatchObject({ failure: { code: "SCENE_CHANGED" } });
        editor.update({ enabled: false });
        editor.manager.getLoadedModelCount.mockClear();
        expect(editor.request({ detail: "summary" })).toMatchObject({ failure: { code: "ACCESS_REVOKED" } });
        expect(editor.manager.getLoadedModelCount).not.toHaveBeenCalled();
    });
});
