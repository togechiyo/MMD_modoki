import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import { automationHelpTopics, searchAutomationHelp } from "../../automation/help/catalog";
import { automationTools, type AutomationToolName, type AutomationResult, AutomationError } from "../../automation/contracts";

export const helpInputSchema = z.object({
    query: z.string().trim().min(1).max(200).optional(),
    topicId: z.string().min(1).max(80).optional(),
    limit: z.number().int().min(1).max(20).default(5),
}).strict().refine(value => !(value.query && value.topicId), {
    message: "queryとtopicIdは同時指定できません。",
});

function createHelpServer(version: string, dispatch?: AutomationListenerOptions["dispatch"]): McpServer {
    const server = new McpServer({ name: "mmd-modoki", version }, {
        instructions: dispatch ? "Use mmd_get_context first, then explicit target and revision for editing. Model files, textures, geometry and arbitrary file reads are NEVER available. Only metadata, keyframe information and viewport screenshots are shared. Preview edits do not register keys. Read mmd_help for limits." : "Only mmd_help is connected. Scene operations are unavailable.",
    });
    server.registerTool("mmd_help", {
        title: "MMD_modokiの機能ヘルプ",
        description: "引数なしで開始ガイド、queryで検索、topicIdで本文を取得。plannedは実行不可。Search bundled Japanese/English help.",
        inputSchema: helpInputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, ({ query, topicId, limit }) => {
        if (query) {
            const topics = searchAutomationHelp(query, limit).map(({ id, title, status, summary }) => ({
                id, title, status, summary, uri: `mmd://help/${id}`,
            }));
            const result = { topics };
            return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
        }
        const topic = automationHelpTopics.find(item => item.id === (topicId ?? "getting-started"));
        if (!topic) return { isError: true, content: [{ type: "text", text: "HELP_NOT_FOUND: queryで項目を検索してください。" }] };
        const result = { ...topic, aliases: [...topic.aliases], uri: `mmd://help/${topic.id}` };
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    });
    for (const topic of automationHelpTopics) {
        server.registerResource(topic.id, `mmd://help/${topic.id}`, {
            title: topic.title, description: topic.summary, mimeType: "text/plain",
        }, uri => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: `[${topic.status}] ${topic.title}\n${topic.body}` }] }));
    }
    if (dispatch) for (const [name, definition] of Object.entries(automationTools)) {
        server.registerTool(name, {
            description: definition.description, inputSchema: definition.schema,
            annotations: { readOnlyHint: !definition.edit, destructiveHint: false, openWorldHint: false },
        }, async args => {
            try {
                const result = await dispatch(name as AutomationToolName, args);
                return { structuredContent: result.data, content: [
                    { type: "text" as const, text: JSON.stringify(result.data) },
                    ...(result.image ? [{ type: "image" as const, ...result.image }] : []),
                ] };
            } catch (error) {
                const code = error instanceof AutomationError ? error.code : "OPERATION_FAILED";
                return { isError: true, content: [{ type: "text" as const, text: `${code}: contextを再取得するかmmd_helpを参照してください。` }] };
            }
        });
    }
    return server;
}

export type AutomationListenerOptions = {
    port: number;
    token: string;
    appVersion: string;
    onError: (code: "MCP_TRANSPORT_ERROR") => void;
    dispatch?: (tool: AutomationToolName, args: unknown) => Promise<AutomationResult>;
};

export type AutomationListener = {
    endpoint: string;
    close(): Promise<void>;
};

/** Explicitly started by its owner; importing this module never opens a listener. */
export async function startAutomationListener(options: AutomationListenerOptions): Promise<AutomationListener> {
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("INVALID_PORT");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(options.token)) throw new Error("INVALID_TOKEN");
    const expected = Buffer.from(`Bearer ${options.token}`);
    let enabled = true;
    const reportError = (): void => options.onError("MCP_TRANSPORT_ERROR");
    const handler = createMcpHandler(() => createHelpServer(options.appVersion, options.dispatch), {
        legacy: "stateless", responseMode: "auto", maxSubscriptions: 0, onerror: reportError,
    });
    const serve = toNodeHandler(handler, { onerror: reportError });
    const http = createServer((request, response) => {
        void acceptRequest(request, response).catch(() => {
            reportError();
            if (!response.headersSent) reject(response, 500);
            else response.destroy();
        });
    });
    http.requestTimeout = 10_000;
    http.headersTimeout = 5_000;
    http.maxConnections = 16;
    let endpoint = "";
    async function acceptRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (!enabled) return reject(response, 503);
        if (request.url !== "/mcp") return reject(response, 404);
        // Exact host including the bound port; browser origins are not supported by this local API.
        if (request.headers.host !== endpoint.slice("http://".length, -"/mcp".length)
            || request.headers.origin !== undefined) return reject(response, 403);
        const supplied = Buffer.from(request.headers.authorization ?? "");
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reject(response, 401);
        if (request.method !== "POST") return reject(response, 405);
        if (!request.headers["content-type"]?.split(";")[0].trim().match(/^application\/json$/i)) return reject(response, 415);
        // Bound memory even for chunked requests before the SDK adapter consumes the JSON body.
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of request) {
            length += chunk.length;
            if (length > 64 * 1024) return reject(response, 413);
            chunks.push(Buffer.from(chunk));
        }
        if (!enabled) return reject(response, 503);
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { return reject(response, 400); }
        await serve(request, response, body);
    }
    try {
        await new Promise<void>((resolve, rejectStart) => {
            http.once("error", rejectStart);
            http.listen(options.port, "127.0.0.1", () => {
                http.removeListener("error", rejectStart);
                resolve();
            });
        });
    } catch (error) {
        enabled = false;
        await handler.close();
        throw error;
    }
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("MCP_LISTENER_UNAVAILABLE");
    endpoint = `http://127.0.0.1:${address.port}/mcp`;
    http.on("error", reportError);
    let closing: Promise<void> | undefined;
    return {
        endpoint,
        close: () => {
            enabled = false;
            closing ??= Promise.all([handler.close(), closeHttp(http)]).then(() => undefined);
            return closing;
        },
    };
}

function reject(response: ServerResponse, status: number): void {
    response.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store", Connection: "close" });
    response.end("MCP request rejected");
}

function closeHttp(http: HttpServer): Promise<void> {
    return new Promise((resolve, rejectClose) => {
        http.close(error => error ? rejectClose(error) : resolve());
        http.closeAllConnections();
    });
}
