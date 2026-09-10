import { app, ipcMain, safeStorage, type BrowserWindow } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { automationTools, AutomationError, type AutomationState, type AutomationReply, type AutomationResult, type AutomationToolName } from "../../automation/contracts";
import { startAutomationListener, type AutomationListener } from "./mcp-server";
import { AutomationDiagnosticHistory, automationFailureSchema, createAutomationDiagnostic, toAutomationFailure } from "../../automation/diagnostics";
import { requiresDetailedDiagnostics, type DetailAccessRecord } from "../../automation/model-detail";
import { writeAutomationOutput } from "./output-file";
import type { AutomationOutput, AutomationPermission } from "../../automation/ui-operation-schema";
import { serializeVmd } from "../../export/vmd-serializer";
import { serializeVpd } from "../../export/vpd-serializer";

type PublishedWindow = { window: BrowserWindow; state: AutomationState; diagnostics: AutomationDiagnosticHistory; detailAccess: DetailAccessRecord[] };
export function installAutomationAppBridge(report: (code: string, data?: Record<string, string>) => void): { register(window: BrowserWindow): void } {
    const windows = new Map<number, PublishedWindow>();
    const pending = new Map<string, { owner: number; resolve: (result: AutomationResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let listener: AutomationListener | undefined;
    let registration: { token: string; port: number } | undefined;
    let controlQueue: Promise<unknown> = Promise.resolve();
    const publishState = (entry: PublishedWindow): AutomationState => {
        if (!entry.window.isDestroyed()) entry.window.webContents.send("automation:state", entry.state);
        return { ...entry.state };
    };
    const requireEditor = (event: Electron.IpcMainInvokeEvent): PublishedWindow => {
        const entry = windows.get(event.sender.id);
        if (!entry || event.senderFrame !== event.sender.mainFrame) throw new Error("EDITOR_REQUIRED");
        return entry;
    };
    function revoke(entry: PublishedWindow): void {
        entry.diagnostics.clear();
        entry.state.enabled = false;
        entry.state.detailedDiagnostics = false;
        entry.state.grant++;
        entry.state.endpoint = null;
        for (const [id, item] of pending) if (item.owner === entry.window.webContents.id) {
            clearTimeout(item.timer); pending.delete(id); item.reject(new AutomationError("ACCESS_REVOKED"));
        }
        publishState(entry);
    }
    async function closeIfUnused(): Promise<void> {
        if ([...windows.values()].some(entry => entry.state.enabled)) return;
        const previous = listener;
        listener = undefined;
        await previous?.close();
    }
    async function credentials(): Promise<{ token: string; port: number }> {
        if (registration) return registration;
        if (!safeStorage.isEncryptionAvailable()) throw new Error("CREDENTIAL_STORAGE_UNAVAILABLE");
        if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") throw new Error("CREDENTIAL_STORAGE_UNAVAILABLE");
        const location = path.join(app.getPath("userData"), "mcp-registration.json");
        try {
            const saved = JSON.parse(await readFile(location, "utf8"));
            const token = safeStorage.decryptString(Buffer.from(saved.encryptedToken, "base64"));
            if (!/^[A-Za-z0-9_-]{43,128}$/.test(token) || !Number.isInteger(saved.port) || saved.port < 1 || saved.port > 65535) throw new Error("INVALID_REGISTRATION");
            registration = { token, port: saved.port };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            registration = { token: randomBytes(32).toString("base64url"), port: 0 };
        }
        return registration;
    }
    function requestEditor(entry: PublishedWindow, tool: AutomationToolName, args: unknown): Promise<AutomationResult> {
        if (!entry.state.enabled || entry.window.isDestroyed()) return Promise.reject(new AutomationError("MCP_DISABLED"));
        const requestId = randomUUID();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(requestId); reject(new AutomationError("EDITOR_TIMEOUT")); }, 10_000);
            pending.set(requestId, { owner: entry.window.webContents.id, resolve, reject, timer });
            entry.window.webContents.send("automation:request", { requestId, sessionId: entry.state.sessionId, grant: entry.state.grant, tool, args });
        });
    }
    const capturing = new Set<number>();
    async function dispatchRequest(tool: AutomationToolName, rawArgs: unknown): Promise<AutomationResult> {
        const args = automationTools[tool].schema.parse(rawArgs);
        const published = [...windows.values()].filter(entry => entry.state.enabled);
        const targetId = args.target?.editorSessionId;
        if (!targetId && published.length !== 1) return { data: { windows: published.map(entry => ({ editorSessionId: entry.state.sessionId })), selectTarget: true } };
        const entry = targetId ? published.find(entry => entry.state.sessionId === targetId) : published[0];
        if (!entry) throw new AutomationError("TARGET_UNAVAILABLE");
        if (requiresDetailedDiagnostics(tool) && !entry.state.detailedDiagnostics) throw new AutomationError("DETAILED_DIAGNOSTICS_DISABLED");
        if (automationTools[tool].edit && !entry.state.editable) throw new AutomationError("READ_ONLY");
        const grant = entry.state.grant;
        if (tool !== "mmd_capture_viewport") return requestEditor(entry, tool, args);
        const owner = entry.window.webContents.id;
        if (capturing.has(owner)) throw new AutomationError("CAPTURE_BUSY");
        capturing.add(owner);
        try {
            if (entry.window.isMinimized() || !entry.window.isVisible()) throw new AutomationError("CAPTURE_UNAVAILABLE");
            const before = await requestEditor(entry, tool, args);
            const rect = before.data.rect as { x: number; y: number; width: number; height: number };
            const zoom = entry.window.webContents.getZoomFactor();
            const [width, height] = entry.window.getContentSize();
            const x = Math.max(0, Math.round(rect.x * zoom));
            const y = Math.max(0, Math.round(rect.y * zoom));
            const w = Math.min(width - x, Math.round(rect.width * zoom));
            const h = Math.min(height - y, Math.round(rect.height * zoom));
            if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1) throw new AutomationError("CAPTURE_UNAVAILABLE");
            await new Promise<void>((resolve, reject) => {
                const contents = entry.window.webContents;
                const timer = setTimeout(() => {
                    if (!contents.isDestroyed()) contents.endFrameSubscription();
                    reject(new AutomationError("CAPTURE_UNAVAILABLE"));
                }, 2500);
                try {
                    contents.beginFrameSubscription(false, () => {
                        clearTimeout(timer);
                        contents.endFrameSubscription();
                        resolve();
                    });
                } catch {
                    clearTimeout(timer);
                    reject(new AutomationError("CAPTURE_UNAVAILABLE"));
                }
            });
            if (!entry.state.enabled || entry.state.grant !== grant) throw new AutomationError("ACCESS_REVOKED");
            let picture = await entry.window.webContents.capturePage({ x, y, width: w, height: h });
            if (picture.isEmpty()) throw new AutomationError("CAPTURE_UNAVAILABLE");
            const dimensions = picture.getSize();
            if (Math.max(dimensions.width, dimensions.height) > 1280) picture = picture.resize(dimensions.width >= dimensions.height ? { width: 1280 } : { height: 1280 });
            const png = picture.toPNG();
            if (png.length > 4 * 1024 * 1024) throw new AutomationError("CAPTURE_TOO_LARGE");
            const after = await requestEditor(entry, "mmd_get_context", args);
            if (!entry.state.enabled || entry.state.grant !== grant) throw new AutomationError("ACCESS_REVOKED");
            return { data: { target: after.data.target, source: "viewport", consistency: "observed", capturedAt: new Date().toISOString(),
                frameBefore: before.data.frame, frameAfter: after.data.frame, editRevisionBefore: before.data.editRevision, editRevisionAfter: after.data.editRevision,
                ...picture.getSize(), materialMode: after.data.materialMode, backend: after.data.backend }, image: { data: png.toString("base64"), mimeType: "image/png" } };
        } finally { capturing.delete(owner); }
    }
    async function dispatch(tool: AutomationToolName, rawArgs: unknown): Promise<AutomationResult> {
        const args = automationTools[tool].schema.parse(rawArgs);
        const published = [...windows.values()].filter(entry => entry.state.enabled);
        const entry = args.target ? published.find(candidate => candidate.state.sessionId === args.target?.editorSessionId) : published.length === 1 ? published[0] : undefined;
        const grant = entry?.state.grant;
        const operationId = "operationId" in args && typeof args.operationId === "string" ? args.operationId : null;
        try {
            const result = await dispatchRequest(tool, args);
            if (requiresDetailedDiagnostics(tool)) {
                if (!entry?.state.enabled || !entry.state.detailedDiagnostics || entry.state.grant !== grant) throw new AutomationError("ACCESS_REVOKED");
                if (tool === "mmd_inspect_detail") {
                    const input = automationTools.mmd_inspect_detail.schema.parse(args);
                    const detail = result.data.detail as { name?: unknown } | undefined;
                    entry.detailAccess.push({ timestamp: new Date().toISOString(), modelInstanceId: input.modelInstanceId,
                        modelName: typeof result.data.modelName === "string" ? result.data.modelName.slice(0, 200) : input.modelInstanceId,
                        kind: input.subject.kind, index: input.subject.index, name: typeof detail?.name === "string" ? detail.name.slice(0, 200) : null });
                    if (entry.detailAccess.length > 50) entry.detailAccess.shift();
                }
            }
            if (entry && args.target && tool === "mmd_get_diagnostics") {
                const input = automationTools.mmd_get_diagnostics.schema.parse(args);
                result.data.recentFailures = entry.diagnostics.read(args.target.sceneGeneration, input.limit, input.operationId);
            }
            if (entry && args.target && tool === "mmd_get_operation" && result.data.status === "unknown" && operationId) {
                const latest = entry.diagnostics.read(args.target.sceneGeneration, 1, operationId).items[0];
                if (latest) result.data = { status: latest.effects.state === "none" ? "failed" : "uncertain", operationId, diagnostic: latest };
            }
            return result;
        } catch (error) {
            const failure = toAutomationFailure(error);
            const diagnostic = createAutomationDiagnostic(error, { diagnosticId: randomUUID(), tool, operationId, timestamp: new Date().toISOString() });
            if (["OPERATION_FAILED", "EDITOR_TIMEOUT", "INVALID_REPLY"].includes(failure.code)) {
                // Unexpected failures go to the local structured log; input errors stay in the bounded MCP history.
                report("MCP_OPERATION_FAILED", { code: failure.code, diagnosticId: diagnostic.diagnosticId, tool, ...(operationId ? { operationId } : {}) });
            }
            if (entry?.state.enabled && entry.state.grant === grant && args.target) entry.diagnostics.add(args.target.sceneGeneration, diagnostic);
            const raised = new AutomationError(failure.code, failure.details);
            raised.diagnostic = diagnostic;
            throw raised;
        }
    }
    ipcMain.handle("automation:getState", event => ({ ...requireEditor(event).state }));
    const hasPermission = (entry: PublishedWindow, permission: AutomationPermission): boolean => Boolean(permission && entry.state.enabled && entry.state.editable && entry.state.sessionId === permission.sessionId && entry.state.grant === permission.grant);
    ipcMain.handle("automation:saveMotion", async (event, input: { filePath: string; overwrite: boolean; format: "vmd" | "vpd"; document: unknown }, permission: AutomationPermission) => {
        const entry = requireEditor(event);
        if (!entry.state.enabled || !entry.state.editable) throw new AutomationError("READ_ONLY");
        if (!hasPermission(entry, permission)) throw new AutomationError("ACCESS_REVOKED");
        if (!input || !["vmd", "vpd"].includes(input.format)) return { status: "failed", code: "INVALID_OUTPUT" };
        const serialized = input.format === "vmd" ? serializeVmd(input.document) : serializeVpd(input.document);
        if (!serialized.ok) return { status: "failed", code: "INVALID_OUTPUT" };
        const result = await writeAutomationOutput({ filePath: input.filePath, overwrite: input.overwrite, format: input.format, bytes: serialized.bytes }, () => hasPermission(entry, permission));
        return { ...result, warningCodes: serialized.warnings.map(warning => warning.code) };
    });
    ipcMain.handle("automation:writeOutput", (event, input: AutomationOutput, permission: AutomationPermission) => {
        const entry = requireEditor(event);
        if (!entry.state.enabled || !entry.state.editable) throw new AutomationError("READ_ONLY");
        return writeAutomationOutput(input, () => hasPermission(entry, permission));
    });
    ipcMain.handle("automation:getDetailAccessHistory", event => [...requireEditor(event).detailAccess].reverse());
    ipcMain.handle("automation:configure", (event, enabled: unknown, editable: unknown, detailedDiagnostics: unknown = false) => {
        const entry = requireEditor(event);
        if (typeof enabled !== "boolean" || typeof editable !== "boolean" || typeof detailedDiagnostics !== "boolean") throw new Error("INVALID_SETTINGS");
        // Revoke immediately, even when listener teardown/startup is still queued.
        revoke(entry);
        entry.state.editable = editable;
        const epoch = entry.state.grant;
        const work = async (): Promise<AutomationState> => {
            try {
                await closeIfUnused();
                if (enabled && epoch === entry.state.grant && !entry.window.isDestroyed()) {
                    const saved = await credentials();
                    if (!listener) {
                        listener = await startAutomationListener({ port: saved.port, token: saved.token, appVersion: app.getVersion(), onError: report, dispatch });
                        saved.port = Number(new URL(listener.endpoint).port);
                        await mkdir(app.getPath("userData"), { recursive: true });
                        await writeFile(path.join(app.getPath("userData"), "mcp-registration.json"), JSON.stringify({ port: saved.port, encryptedToken: safeStorage.encryptString(saved.token).toString("base64") }), { mode: 0o600 });
                    }
                    if (epoch === entry.state.grant && !entry.window.isDestroyed()) {
                        entry.state.enabled = true;
                        entry.state.detailedDiagnostics = detailedDiagnostics;
                        entry.state.endpoint = listener.endpoint;
                    }
                }
                entry.state.error = undefined;
            } catch {
                report("MCP_CONFIGURATION_FAILED");
                entry.state.error = "MCP設定に失敗しました。ポート競合または資格情報の保存状態を確認してください。";
            }
            await closeIfUnused();
            return publishState(entry);
        };
        const result = controlQueue.then(work, work);
        controlQueue = result;
        return result;
    });
    ipcMain.handle("automation:getConnection", event => {
        const entry = requireEditor(event);
        if (!entry.state.enabled || !registration || !listener) throw new Error("MCP_DISABLED");
        return { endpoint: listener.endpoint, token: registration.token };
    });
    ipcMain.on("automation:reply", (event, reply: AutomationReply) => {
        const item = pending.get(reply?.requestId);
        if (!item || item.owner !== event.sender.id || event.senderFrame !== event.sender.mainFrame) return;
        pending.delete(reply.requestId); clearTimeout(item.timer);
        if (reply.failure) {
            const parsed = automationFailureSchema.safeParse(reply.failure);
            item.reject(parsed.success ? new AutomationError(parsed.data.code, parsed.data.details) : new AutomationError("INVALID_REPLY"));
        } else if (reply.error) item.reject(new AutomationError(/^[A-Z_]+$/.test(reply.error) ? reply.error : "OPERATION_FAILED"));
        else if (reply.result && JSON.stringify(reply.result).length < 2 * 1024 * 1024) item.resolve(reply.result);
        else item.reject(new AutomationError("INVALID_REPLY"));
    });
    return { register(window) {
        const owner = window.webContents.id;
        const entry: PublishedWindow = { window, diagnostics: new AutomationDiagnosticHistory(), detailAccess: [], state: { enabled: false, editable: false, detailedDiagnostics: false, sessionId: randomUUID(), grant: 0, endpoint: null } };
        windows.set(owner, entry);
        window.webContents.on("render-process-gone", () => {
            revoke(entry);
            controlQueue = controlQueue.then(closeIfUnused, closeIfUnused).catch(() => report("MCP_CLOSE_FAILED"));
        });
        window.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
            if (!isMainFrame) return;
            revoke(entry);
            entry.state.sessionId = randomUUID();
            entry.detailAccess = [];
            controlQueue = controlQueue.then(closeIfUnused, closeIfUnused).catch(() => report("MCP_CLOSE_FAILED"));
        });
        window.on("closed", () => {
            windows.delete(owner);
            for (const [id, item] of pending) if (item.owner === owner) { clearTimeout(item.timer); pending.delete(id); item.reject(new AutomationError("TARGET_UNAVAILABLE")); }
            controlQueue = controlQueue.then(closeIfUnused, closeIfUnused).catch(() => report("MCP_CLOSE_FAILED"));
        });
    } };
}
