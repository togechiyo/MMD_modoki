import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { startAutomationListener, type AutomationListener } from "../../src/main/automation/mcp-server";
import { AutomationOperationNotifications, operationResourceScope } from "../../src/automation/operation-notifications";

const listeners: AutomationListener[] = [];
const streams: { close(): void }[] = [];
afterEach(async () => {
    streams.splice(0).forEach(stream => stream.close());
    await Promise.all(listeners.splice(0).map(listener => listener.close()));
});
const permission = { sessionId: "11111111-1111-4111-8111-111111111111", grant: 2 };
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";
const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "notification-test", version: "1" } };

async function start() {
    const store = new AutomationOperationNotifications();
    const first = store.register(permission, firstId);
    const second = store.register(permission, secondId);
    const token = randomBytes(32).toString("base64url");
    const listener = await startAutomationListener({ port: 0, token, appVersion: "test", onError: () => undefined,
        dispatch: async () => ({ data: {} }), readOperationResource: uri => store.read(uri) });
    listeners.push(listener);
    return { ...listener, token, store, first, second };
}
type Connection = Awaited<ReturnType<typeof start>>;
async function rpcResult(response: Response) {
    const body = await response.text();
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = body.split("\n").find(line => line.startsWith("data: "));
        if (!data) throw new Error("Missing legacy RPC response");
        return JSON.parse(data.slice(6));
    }
    return JSON.parse(body);
}
function send(connection: Connection, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal, modern = true, token = connection.token) {
    return fetch(connection.endpoint, { method: "POST", signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
            ...(modern ? { "Mcp-Method": method, "MCP-Protocol-Version": "2026-07-28" } : {}),
            ...(typeof params.uri === "string" ? { "Mcp-Name": params.uri } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method, params: modern ? { ...params, _meta: meta } : params }),
    });
}
async function listen(connection: Connection, uris: string[]) {
    const controller = new AbortController();
    const response = await send(connection, "subscriptions/listen", { notifications: { resourceSubscriptions: uris } }, controller.signal);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing subscription body");
    const decoder = new TextDecoder();
    let buffer = "";
    const stream = { close: () => controller.abort(), next: async () => {
        for (;;) {
            const end = buffer.indexOf("\n\n");
            if (end >= 0) {
                const packet = buffer.slice(0, end); buffer = buffer.slice(end + 2);
                const data = packet.split("\n").find(line => line.startsWith("data: "));
                if (data) return JSON.parse(data.slice(6));
                continue;
            }
            const chunk = await reader.read();
            if (chunk.done) throw new Error("Subscription closed");
            buffer += decoder.decode(chunk.value, { stream: true });
        }
    } };
    streams.push(stream);
    const ack = await stream.next();
    expect(ack).toMatchObject({ method: "notifications/subscriptions/acknowledged", params: {
        notifications: { resourceSubscriptions: uris }, _meta: { "io.modelcontextprotocol/subscriptionId": 99 },
    } });
    return stream;
}

describe("MCP completion subscriptions over HTTP", () => {
    it.each(["completed", "failed", "canceled"])("pushes a %s resource update after the tool exchange ended, scoped to the requested URI", async status => {
        const connection = await start();
        const discovery = await (await send(connection, "server/discover")).json();
        expect(discovery.result.capabilities.resources.subscribe).toBe(true);
        const templates = await (await send(connection, "resources/templates/list")).json();
        expect(templates.result.resourceTemplates).toContainEqual(expect.objectContaining({ uriTemplate: "mmd://operations/{sessionId}/{grant}/{operationId}" }));
        const stream = await listen(connection, [connection.first]);
        await (await send(connection, "tools/call", { name: "mmd_get_context", arguments: {} })).json();
        connection.resourceUpdated(connection.second);
        const uri = connection.store.complete(permission, { operationId: firstId, status: status as "completed" | "failed" | "canceled", completedAt: "2026-10-05T11:00:00.000Z" });
        connection.resourceUpdated(uri ?? "");
        const event = await stream.next();
        expect(event).toEqual({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: connection.first,
            _meta: { "io.modelcontextprotocol/subscriptionId": 99 } } });
        expect(JSON.stringify(event).length).toBeLessThan(300);
        const read = await (await send(connection, "resources/read", { uri: connection.first })).json();
        expect(read.result).toMatchObject({ ttlMs: 0, cacheScope: "private" });
        expect(JSON.parse(read.result.contents[0].text)).toMatchObject({ operationId: firstId, status });
        const legacy = await rpcResult(await send(connection, "resources/read", { uri: connection.first }, undefined, false));
        expect(JSON.parse(legacy.result.contents[0].text).status).toBe(status);
    });
    it("rejects invalid/authless subscriptions and closes scoped streams on revocation", async () => {
        const connection = await start();
        const invalid = await send(connection, "subscriptions/listen", { notifications: { resourceSubscriptions: ["file:///private.pmx"] } });
        expect(invalid.status).toBe(403);
        const denied = await send(connection, "subscriptions/listen", { notifications: { resourceSubscriptions: [connection.first] } }, undefined, true, "invalid");
        expect(denied.status).toBe(401);
        const stream = await listen(connection, [connection.first]);
        const closed = expect(stream.next()).rejects.toThrow();
        connection.store.clear();
        connection.invalidateResourceSubscriptions(operationResourceScope(permission));
        await closed;
        const stale = await (await send(connection, "resources/read", { uri: connection.first })).json();
        expect(stale.error.code).toBe(-32602);
        expect((await send(connection, "subscriptions/listen", { notifications: { resourceSubscriptions: [connection.first] } })).status).toBe(403);
    });
    it("limits subscription streams while leaving other MCP requests available", async () => {
        const connection = await start();
        for (let i = 0; i < 8; i++) await listen(connection, [connection.first]);
        const full = await (await send(connection, "subscriptions/listen", { notifications: { resourceSubscriptions: [connection.first] } })).json();
        expect(full.error.message).toContain("Subscription limit");
        expect((await send(connection, "tools/list")).status).toBe(200);
    });
});
