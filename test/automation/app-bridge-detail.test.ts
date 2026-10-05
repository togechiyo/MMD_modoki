import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { AutomationRequest, AutomationResult, AutomationState, AutomationToolName } from "../../src/automation/contracts";
import { installAutomationAppBridge } from "../../src/main/automation/app-bridge";
import type { AutomationListenerOptions } from "../../src/main/automation/mcp-server";

const mocks = vi.hoisted(() => ({
    handles: new Map<string, (...args: unknown[]) => unknown>(),
    events: new Map<string, (...args: unknown[]) => unknown>(),
    dispatch: undefined as ((tool: AutomationToolName, args: unknown) => Promise<AutomationResult>) | undefined,
    readOperationResource: undefined as AutomationListenerOptions["readOperationResource"],
    resourceUpdated: vi.fn(), invalidateResourceSubscriptions: vi.fn(),
}));
vi.mock("electron", () => ({
    app: { getPath: () => "virtual-user-data", getVersion: () => "test" },
    ipcMain: {
        handle: (name: string, fn: (...args: unknown[]) => unknown) => mocks.handles.set(name, fn),
        on: (name: string, fn: (...args: unknown[]) => unknown) => mocks.events.set(name, fn),
    },
    safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "test", encryptString: (text: string) => Buffer.from(text) },
}));
vi.mock("node:fs/promises", () => ({
    readFile: async () => { throw Object.assign(new Error("absent"), { code: "ENOENT" }); },
    mkdir: async () => undefined, writeFile: async () => undefined,
}));
vi.mock("../../src/main/automation/mcp-server", () => ({
    startAutomationListener: async (options: AutomationListenerOptions) => {
        mocks.dispatch = options.dispatch;
        mocks.readOperationResource = options.readOperationResource;
        return { endpoint: "http://127.0.0.1:12345/mcp", close: async () => undefined,
            resourceUpdated: mocks.resourceUpdated, invalidateResourceSubscriptions: mocks.invalidateResourceSubscriptions };
    },
}));

function editor() {
    const requests: AutomationRequest[] = [];
    const contents = Object.assign(new EventEmitter(), { id: 1, mainFrame: {}, send: (channel: string, payload: AutomationRequest) => {
        if (channel === "automation:request") requests.push(payload);
    } });
    const window = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false });
    installAutomationAppBridge(() => undefined).register(window as unknown as BrowserWindow);
    const event = { sender: contents, senderFrame: contents.mainFrame };
    const invoke = (name: string, ...args: unknown[]) => {
        const fn = mocks.handles.get(`automation:${name}`);
        if (!fn) throw new Error(`Missing handler ${name}`);
        return fn(event, ...args);
    };
    const reply = (request: AutomationRequest, data: Record<string, unknown>) => mocks.events.get("automation:reply")?.(event, { requestId: request.requestId, result: { data } });
    const configure = async (enabled: boolean, detailed: boolean) => await invoke("configure", enabled, false, detailed) as AutomationState;
    const dispatch = (state: AutomationState) => {
        if (!mocks.dispatch) throw new Error("Listener not started");
        return mocks.dispatch("mmd_inspect_detail", { target: { editorSessionId: state.sessionId, sceneGeneration: 0 },
            modelInstanceId: "model-1", expectedEditRevision: 0, subject: { kind: "bone", index: 0 } });
    };
    return { contents, window, requests, invoke, reply, configure, dispatch, event };
}

describe("detailed diagnostics main permission boundary", () => {
    beforeEach(() => {
        mocks.handles.clear(); mocks.events.clear(); mocks.dispatch = undefined;
        mocks.readOperationResource = undefined; mocks.resourceUpdated.mockClear(); mocks.invalidateResourceSubscriptions.mockClear();
    });

    it.each(["completed", "failed", "canceled"])("publishes a grant-checked %s summary even when completion precedes the start reply", async status => {
        const app = editor();
        const state = await app.invoke("configure", true, true, false) as AutomationState;
        const operationId = "22222222-2222-4222-8222-222222222222";
        const notice = { sessionId: state.sessionId, grant: state.grant, operationId, status, completedAt: "2026-10-05T11:00:00.000Z" };
        const result = mocks.dispatch?.("mmd_start_ui_operation", { target: { editorSessionId: state.sessionId, sceneGeneration: 0 },
            expectedEditRevision: 0, operationId, operation: { kind: "materialMode", pbr: false } });
        mocks.events.get("automation:operationCompleted")?.(app.event, notice);
        expect(mocks.resourceUpdated).toHaveBeenCalledTimes(1);
        app.reply(app.requests[0], { operationId, status: "running" });
        const uri = (await result)?.data.completionUri as string;
        expect(mocks.readOperationResource?.(uri)).toMatchObject({ operationId, status });
        mocks.events.get("automation:operationCompleted")?.(app.event, notice);
        expect(mocks.resourceUpdated).toHaveBeenCalledTimes(1);
        for (const invalid of [{ ...notice, grant: state.grant - 1 }, { ...notice, sessionId: "33333333-3333-4333-8333-333333333333" }, { ...notice, output: "SECRET" }]) {
            mocks.events.get("automation:operationCompleted")?.(app.event, invalid);
        }
        mocks.events.get("automation:operationCompleted")?.({ ...app.event, senderFrame: {} }, notice);
        expect(mocks.resourceUpdated).toHaveBeenCalledTimes(1);
        await app.invoke("configure", true, false, false);
        expect(mocks.readOperationResource?.(uri)).toBeUndefined();
        expect(mocks.invalidateResourceSubscriptions).toHaveBeenCalledWith(`mmd://operations/${state.sessionId}/${state.grant}/`);
        mocks.events.get("automation:operationCompleted")?.(app.event, notice);
        expect(mocks.resourceUpdated).toHaveBeenCalledTimes(1);
    });

    it.each(["navigation", "renderer-exit", "window-close"])("invalidates operation resources and ignores late completion on %s", async reason => {
        const app = editor();
        const state = await app.invoke("configure", true, true, false) as AutomationState;
        const operationId = "22222222-2222-4222-8222-222222222222";
        const result = mocks.dispatch?.("mmd_start_ui_operation", { target: { editorSessionId: state.sessionId, sceneGeneration: 0 },
            expectedEditRevision: 0, operationId, operation: { kind: "materialMode", pbr: false } });
        app.reply(app.requests[0], { operationId, status: "running" });
        const uri = (await result)?.data.completionUri as string;
        expect(mocks.readOperationResource?.(uri)?.status).toBe("running");
        if (reason === "navigation") app.contents.emit("did-start-navigation", {}, "file:///editor", false, true);
        else if (reason === "renderer-exit") app.contents.emit("render-process-gone");
        else app.window.emit("closed");
        expect(mocks.readOperationResource?.(uri)).toBeUndefined();
        expect(mocks.invalidateResourceSubscriptions).toHaveBeenCalledWith(`mmd://operations/${state.sessionId}/${state.grant}/`);
        mocks.events.get("automation:operationCompleted")?.(app.event, { sessionId: state.sessionId, grant: state.grant,
            operationId, status: "completed", completedAt: "2026-10-05T11:00:00.000Z" });
        expect(mocks.resourceUpdated).not.toHaveBeenCalled();
    });

    it("denies before renderer dispatch and allows detail independently of edit permission", async () => {
        const app = editor();
        const denied = await app.configure(true, false);
        await expect(app.dispatch(denied)).rejects.toMatchObject({ code: "DETAILED_DIAGNOSTICS_DISABLED" });
        expect(app.requests).toHaveLength(0);
        const allowed = await app.configure(true, true);
        expect(allowed.editable).toBe(false);
        const result = app.dispatch(allowed);
        app.reply(app.requests[0], { modelName: "Model", detail: { name: "Bone", bindPosition: [0, 1, 0] } });
        await expect(result).resolves.toMatchObject({ data: { detail: { bindPosition: [0, 1, 0] } } });
        const history = app.invoke("getDetailAccessHistory");
        expect(history).toEqual([expect.objectContaining({ modelInstanceId: "model-1", modelName: "Model", kind: "bone", index: 0, name: "Bone" })]);
        expect(JSON.stringify(history)).not.toContain("bindPosition");
        await app.configure(false, false);
        expect(app.invoke("getDetailAccessHistory")).toEqual(history);
        app.contents.emit("did-start-navigation", {}, "file:///editor", false, true);
        expect(app.invoke("getDetailAccessHistory")).toEqual([]);
    });

    it.each([false, true])("drops results when permission is revoked (renderer already replied=%s)", async alreadyReplied => {
        const app = editor();
        const state = await app.configure(true, true);
        const result = app.dispatch(state);
        const rejected = expect(result).rejects.toMatchObject({ code: "ACCESS_REVOKED" });
        if (alreadyReplied) app.reply(app.requests[0], { detail: { name: "Bone", bindPosition: [0, 1, 0] } });
        // configure revokes synchronously, including replies resolved before the dispatch continuation runs.
        const off = app.configure(true, false);
        if (!alreadyReplied) app.reply(app.requests[0], { detail: { name: "Late bone" } });
        await rejected;
        await off;
        expect(app.invoke("getDetailAccessHistory")).toEqual([]);
        await app.configure(false, false);
    });

    it("bounds the local history to the most recent 50 targets", async () => {
        const app = editor();
        const state = await app.configure(true, true);
        for (let index = 0; index < 52; index++) {
            const result = app.dispatch(state);
            app.reply(app.requests[index], { detail: { name: `Bone-${index}` } });
            await result;
        }
        const history = app.invoke("getDetailAccessHistory");
        expect(history).toHaveLength(50);
        expect(history).toMatchObject([{ name: "Bone-51" }, ...Array.from({ length: 49 }, (_, index) => ({ name: `Bone-${50 - index}` }))]);
        await app.configure(false, false);
    });
});
