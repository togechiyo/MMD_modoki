import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server";
import { startAutomationListener, type AutomationListener } from "../../src/main/automation/mcp-server";
import { automationTools, AutomationError } from "../../src/automation/contracts";

const listeners: AutomationListener[] = [];
afterEach(async () => { await Promise.all(listeners.splice(0).map(listener => listener.close())); });

async function start(port = 0) {
    const token = randomBytes(32).toString("base64url");
    const listener = await startAutomationListener({ port, token, appVersion: "test", onError: () => undefined });
    listeners.push(listener);
    return { ...listener, token };
}

type TestConnection = Awaited<ReturnType<typeof start>>;
async function rpc(connection: TestConnection, method: string, params: Record<string, unknown> = {}, modern = true) {
    const response = await fetch(connection.endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
            ...(modern ? { "Mcp-Method": method, "MCP-Protocol-Version": "2026-07-28" } : {}),
            ...(modern && typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
            ...(modern && typeof params.uri === "string" ? { "Mcp-Name": params.uri } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: modern ? {
            ...params, _meta: {
                [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
                [CLIENT_CAPABILITIES_META_KEY]: {},
                [CLIENT_INFO_META_KEY]: { name: "integration-test", version: "1" },
            },
        } : params }),
    });
    const raw = await response.text();
    const json = raw.startsWith("event:") || raw.startsWith("data:")
        ? JSON.parse(raw.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? "null")
        : JSON.parse(raw);
    return { status: response.status, json };
}

describe("MCP HTTP foundation", () => {
    it.each([true, false])("returns structured recoverable failures without raw exception data (modern=%s)", async modern => {
        const token = randomBytes(32).toString("base64url");
        let unexpected = false;
        const connection = await startAutomationListener({ port: 0, token, appVersion: "test", onError: () => undefined,
            dispatch: async () => { throw unexpected ? new Error("SECRET_MODEL_BYTES") : new AutomationError("KEY_COLLISION", { operationIndex: 2, frame: 30 }); },
        });
        listeners.push(connection);
        const connected = { ...connection, token };
        for (unexpected of [false, true]) {
            const result = await rpc(connected, "tools/call", { name: "mmd_get_context", arguments: {} }, modern);
            expect(result.json.result.isError).toBe(true);
            expect(result.json.result.structuredContent.effects.state).toBe(unexpected ? "unknown" : "none");
            expect(result.json.result.structuredContent.error.code).toBe(unexpected ? "OPERATION_FAILED" : "KEY_COLLISION");
            expect(JSON.parse(result.json.result.content[0].text)).toEqual(result.json.result.structuredContent);
            expect(JSON.stringify(result.json)).not.toContain("SECRET_MODEL_BYTES");
        }
    });
    it("registers only explicit editor operations and rejects model/file payload requests before dispatch", async () => {
        let calls = 0;
        const token = randomBytes(32).toString("base64url");
        const connection = await startAutomationListener({ port: 0, token, appVersion: "test", onError: () => undefined,
            dispatch: async () => { calls++; return { data: { modelContentShared: false } }; },
        });
        listeners.push(connection);
        const connected = { ...connection, token };
        const list = await rpc(connected, "tools/list");
        expect(list.json.result.tools.map((item: { name: string }) => item.name).sort()).toEqual(["mmd_help", ...Object.keys(automationTools)].sort());
        const target = { editorSessionId: "38b81a97-d939-4efa-8a10-aefc4ce5bdba", sceneGeneration: 1 };
        for (const request of [
            { name: "file:readBinary", arguments: { path: "fixture.pmx" } },
            { name: "mmd_list_assets", arguments: { target, includeModel: true } },
            { name: "mmd_inspect", arguments: { target, kind: "vertices" } },
            { name: "mmd_inspect", arguments: { target, kind: "keyframes", filePath: "fixture.pmx" } },
        ]) {
            const result = await rpc(connected, "tools/call", request);
            expect(result.json.error ?? result.json.result?.isError).toBeTruthy();
        }
        expect(calls).toBe(0);
        const resource = await rpc(connected, "resources/read", { uri: "file:///fixture.pmx" });
        expect(resource.json.error).toBeTruthy();
        expect(calls).toBe(0);
        const allowed = await rpc(connected, "tools/call", { name: "mmd_list_assets", arguments: { target } });
        expect(allowed.json.result.structuredContent.modelContentShared).toBe(false);
        expect(calls).toBe(1);
    });
    it.each([true, false])("serves help and resources through the SDK (modern=%s)", async modern => {
        const connection = await start();
        if (modern) {
            const discovery = await rpc(connection, "server/discover");
            expect(discovery.status, JSON.stringify(discovery.json)).toBe(200);
            expect(discovery.json.error).toBeUndefined();
        } else {
            const initialized = await rpc(connection, "initialize", {
                protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "integration-test", version: "1" },
            }, false);
            expect(initialized.json.result.protocolVersion).toBe("2025-11-25");
        }
        const listed = await rpc(connection, "tools/list", {}, modern);
        expect(listed.json.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["mmd_help"]);
        const help = await rpc(connection, "tools/call", { name: "mmd_help", arguments: { query: "材質を消す" } }, modern);
        expect(help.json.result.structuredContent.topics).toEqual([
            expect.objectContaining({ id: "materials", status: "partial" }),
        ]);
        const resource = await rpc(connection, "resources/read", { uri: "mmd://help/materials" }, modern);
        expect(resource.json.error).toBeUndefined();
        expect(resource.json.result.contents[0].text).toContain("[partial]");
        expect(resource.json.result.contents[0].text).toContain("mmd_set_material_visibility");
        const unavailable = await rpc(connection, "tools/call", { name: "mmd_set_camera", arguments: {} }, modern);
        expect(unavailable.json.error ?? unavailable.json.result?.isError).toBeTruthy();
    });

    it("rejects conflicting help inputs and exposes no scene data", async () => {
        const connection = await start();
        const result = await rpc(connection, "tools/call", {
            name: "mmd_help", arguments: { query: "camera", topicId: "pose" },
        });
        expect(result.json.error ?? result.json.result?.isError).toBeTruthy();
        const unknown = await rpc(connection, "tools/call", { name: "mmd_help", arguments: { topicId: "missing" } });
        expect(unknown.json.result.isError).toBe(true);
        const started = await rpc(connection, "tools/call", { name: "mmd_help", arguments: {} });
        expect(started.json.result.structuredContent.body).toContain("モデル本体");
    });

    it("rejects missing credentials, cross-origin requests and oversized bodies", async () => {
        const connection = await start();
        for (const headers of [{}, { Authorization: "Bearer wrong" }]) {
            const response = await fetch(connection.endpoint, { method: "POST", headers });
            expect(response.status).toBe(401);
            expect(await response.text()).not.toContain(connection.token);
        }
        const headers = { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" };
        const origin = await fetch(connection.endpoint, { method: "POST", headers: { ...headers, Origin: "http://localhost:1234" } });
        expect(origin.status).toBe(403);
        const oversized = await fetch(connection.endpoint, { method: "POST", headers, body: " ".repeat(65 * 1024) });
        expect(oversized.status).toBe(413);
        const malformed = await fetch(connection.endpoint, { method: "POST", headers, body: "{" });
        expect(malformed.status).toBe(400);
        const hostStatus = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(connection.endpoint, { method: "POST", headers: { ...headers, Host: "attacker.invalid" } }, response => {
                response.resume();
                resolve(response.statusCode ?? 0);
            });
            request.on("error", reject);
            request.end("{}");
        });
        expect(hostStatus).toBe(403);
    });

    it("closes idempotently and can restart at the same port with the same registration", async () => {
        const connection = await start();
        const port = Number(new URL(connection.endpoint).port);
        await Promise.all([connection.close(), connection.close()]);
        await expect(fetch(connection.endpoint)).rejects.toThrow();
        const restarted = await startAutomationListener({ port, token: connection.token, appVersion: "test", onError: () => undefined });
        listeners.push(restarted);
        const result = await rpc({ ...restarted, token: connection.token }, "tools/list");
        expect(result.json.result.tools[0].name).toBe("mmd_help");
    });

    it("reports a port conflict instead of silently choosing a different endpoint", async () => {
        const connection = await start();
        await expect(start(Number(new URL(connection.endpoint).port))).rejects.toMatchObject({ code: "EADDRINUSE" });
    });
});
