import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { AutomationRequest, AutomationState } from "../../src/automation/contracts";
import { installAutomationAppBridge } from "../../src/main/automation/app-bridge";
import type { AutomationListenerOptions } from "../../src/main/automation/mcp-server";

const mocks = vi.hoisted(() => ({
    handles: new Map<string, (...args: unknown[]) => unknown>(),
    events: new Map<string, (...args: unknown[]) => unknown>(),
    enabled: false,
    read: vi.fn<() => Promise<boolean>>(), write: vi.fn<(enabled: boolean) => Promise<void>>(),
    start: vi.fn<(options: AutomationListenerOptions) => Promise<unknown>>(), close: vi.fn(),
    report: vi.fn(), invalidate: vi.fn(), options: undefined as AutomationListenerOptions | undefined,
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
vi.mock("../../src/main/automation/enabled-preference", () => ({
    AutomationEnabledPreference: class { read = mocks.read; write = mocks.write; },
}));
vi.mock("../../src/main/automation/mcp-server", () => ({ startAutomationListener: mocks.start }));

function processBridge() {
    const bridge = installAutomationAppBridge(mocks.report);
    let nextId = 1;
    return (navigate = true) => {
        const states: AutomationState[] = [];
        const requests: AutomationRequest[] = [];
        const contents = Object.assign(new EventEmitter(), { id: nextId++, mainFrame: {}, send: (channel: string, value: AutomationState | AutomationRequest) => {
            if (channel === "automation:state") states.push({ ...value } as AutomationState);
            if (channel === "automation:request") requests.push(value as AutomationRequest);
        } });
        const window = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false });
        bridge.register(window as unknown as BrowserWindow);
        const event = { sender: contents, senderFrame: contents.mainFrame };
        const invoke = async (name: string, ...args: unknown[]) => mocks.handles.get(`automation:${name}`)?.(event, ...args) as Promise<AutomationState>;
        const navigation = () => contents.emit("did-start-navigation", {}, "file:///editor", false, true);
        if (navigate) navigation();
        return { contents, states, requests, event, window, navigation, state: () => invoke("getState"), configure: (enabled: boolean, editable = false, detailed = false) => invoke("configure", enabled, editable, detailed),
            canEdit: (state: AutomationState) => bridge.canEdit(contents.id, { sessionId: state.sessionId, grant: state.grant }) };
    };
}

describe("MCP startup intent and session boundary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.handles.clear(); mocks.events.clear(); mocks.enabled = false;
        mocks.read.mockImplementation(async () => mocks.enabled);
        mocks.write.mockImplementation(async enabled => { mocks.enabled = enabled; });
        mocks.close.mockResolvedValue(undefined);
        mocks.start.mockImplementation(async options => {
            mocks.options = options;
            return { endpoint: "http://127.0.0.1:12345/mcp", close: mocks.close, invalidateResourceSubscriptions: mocks.invalidate, resourceUpdated: vi.fn() };
        });
    });

    it("keeps a new installation off without starting a listener or writing settings", async () => {
        const editor = processBridge()();
        expect(await editor.state()).toMatchObject({ enabled: false, editable: false, detailedDiagnostics: false });
        expect(mocks.start).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
        await editor.state();
        expect(mocks.read).toHaveBeenCalledTimes(1);
    });

    it("restores only the first ready editor and starts with fresh permissions and session", async () => {
        const previous = processBridge()();
        await previous.state();
        const old = await previous.configure(true, true, true);
        expect(previous.canEdit(old)).toBe(true);
        const register = processBridge();
        const editor = register();
        const child = register();
        const [current, concurrentRead, childState] = await Promise.all([editor.state(), editor.state(), child.state()]);
        expect(current).toMatchObject({ enabled: true, editable: false, detailedDiagnostics: false });
        expect(concurrentRead).toEqual(current);
        expect(current.sessionId).not.toBe(old.sessionId);
        expect(editor.canEdit(old)).toBe(false);
        expect(childState).toMatchObject({ enabled: false, editable: false, detailedDiagnostics: false });
        expect(mocks.write).toHaveBeenCalledTimes(1);
        expect(mocks.start).toHaveBeenCalledTimes(2);
    });

    it.each(["reload", "crash"])("revokes on %s without erasing intent, old requests or jobs cannot return", async reason => {
        mocks.enabled = true;
        const editor = processBridge()();
        const original = await editor.state();
        const editable = await editor.configure(true, true, true);
        const pending = mocks.options?.dispatch("mmd_get_context", { target: { editorSessionId: editable.sessionId, sceneGeneration: 0 } });
        const rejected = expect(pending).rejects.toMatchObject({ code: "ACCESS_REVOKED" });
        if (reason === "reload") editor.navigation();
        else editor.contents.emit("render-process-gone");
        await rejected;
        mocks.events.get("automation:reply")?.(editor.event, { requestId: editor.requests[0].requestId, result: { data: { stale: true } } });
        expect(await editor.state()).toMatchObject({ enabled: false, editable: false, detailedDiagnostics: false });
        expect(editor.canEdit(editable)).toBe(false);
        expect(mocks.enabled).toBe(true);
        expect(mocks.write).toHaveBeenCalledTimes(1);
        const restarted = await processBridge()().state();
        expect(restarted.enabled).toBe(true);
        expect(restarted.sessionId).not.toBe(original.sessionId);
    });

    it("persists explicit off and clears editing and detail permission", async () => {
        mocks.enabled = true;
        const editor = processBridge()();
        await editor.state();
        await editor.configure(true, true, true);
        expect(await editor.configure(false, true, true)).toMatchObject({ enabled: false, editable: false, detailedDiagnostics: false });
        expect(mocks.enabled).toBe(false);
        expect((await processBridge()().state()).enabled).toBe(false);
    });

    it("does not let a delayed startup read undo an explicit off", async () => {
        let resolveRead: (enabled: boolean) => void = () => undefined;
        mocks.read.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
        const editor = processBridge()();
        const restore = editor.state();
        await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
        const off = editor.configure(false);
        resolveRead(true);
        await Promise.all([restore, off]);
        expect((await editor.state()).enabled).toBe(false);
        expect(mocks.enabled).toBe(false);
        expect(mocks.start).not.toHaveBeenCalled();
    });

    it("does not restore after an early renderer reload or crash before readiness", async () => {
        mocks.enabled = true;
        const editor = processBridge()();
        editor.navigation();
        expect((await editor.state()).enabled).toBe(false);
        const crashed = processBridge()();
        crashed.contents.emit("render-process-gone");
        expect((await crashed.state()).enabled).toBe(false);
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it("reports startup read failure without silently rewriting the saved file", async () => {
        mocks.read.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
        const editor = processBridge()();
        expect(await editor.state()).toMatchObject({ enabled: false, error: "MCP_CONFIGURATION_FAILED" });
        expect(mocks.report).toHaveBeenCalledWith("MCP_CONFIGURATION_FAILED", { stage: "preference-read", code: "EACCES" });
        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.start).not.toHaveBeenCalled();
    });

    it.each([true, false])("does not report enabled=%s as successful when persistence fails", async enabled => {
        const editor = processBridge()();
        await editor.state();
        if (!enabled) await editor.configure(true, true, true);
        mocks.write.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
        expect(await editor.configure(enabled)).toMatchObject({ enabled: false, editable: false, error: "MCP_CONFIGURATION_FAILED" });
        expect(mocks.report).toHaveBeenCalledWith("MCP_CONFIGURATION_FAILED", { stage: "preference-write", code: "EACCES" });
    });

    it("keeps saved intent for retry when the listener cannot start", async () => {
        const editor = processBridge()();
        await editor.state();
        mocks.start.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
        expect(await editor.configure(true)).toMatchObject({ enabled: false, error: "MCP_CONFIGURATION_FAILED" });
        expect(mocks.enabled).toBe(true);
        expect((await processBridge()().state()).enabled).toBe(true);
    });
});
