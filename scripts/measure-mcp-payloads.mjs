import { build } from "esbuild";
import { Module } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

// Development-only measurement: temporary loopback listener, synthetic context, no app/assets/credentials.
const root = resolve(import.meta.dirname, "..");
const baselineRef = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${process.argv[2] ?? "HEAD"}^{commit}`],
    { cwd: root, encoding: "utf8" }).trim();
const baseFiles = ["src/automation/keyframe-schema.ts", "src/automation/contracts.ts", "src/main/automation/mcp-server.ts"];
async function load(baseline) {
    const previous = baseline ? new Map(baseFiles.map(file => [resolve(root, file).toLowerCase(),
        execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root, encoding: "utf8" })])) : new Map();
    const bundled = await build({ stdin: { contents: 'export { startAutomationListener } from "./src/main/automation/mcp-server"; export { summarizeAutomationContext } from "./src/automation/context-summary";',
        resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
        plugins: [{ name: "baseline", setup(plugin) { plugin.onLoad({ filter: /\.ts$/ }, args => {
            const contents = previous.get(args.path.toLowerCase());
            return contents === undefined ? undefined : { contents, loader: "ts" };
        }); } }],
    });
    const loaded = new Module(resolve(root, "mcp-measurement.cjs"));
    loaded.filename = resolve(root, "mcp-measurement.cjs");
    loaded.paths = Module._nodeModulePaths(root);
    loaded._compile(bundled.outputFiles[0].text, loaded.filename);
    return loaded.exports;
}
function fixture(modelCount) {
    return { target: { editorSessionId: "11111111-1111-4111-8111-111111111111", sceneGeneration: 1 },
        editRevision: 4, assetRevision: 1, frame: 0, playing: false, busy: false,
        camera: { target: { x: 0, y: 10, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, distance: 45, fov: 30 },
        status: { busy: false, busyReasons: [], userAction: null, editPermission: true, detailedDiagnostics: false,
            editBlockers: [], playing: false, playbackPolicyRequired: false, observedAt: "2026-10-06T00:00:00.000Z", renderCompletion: "not_observed" },
        materialMode: "mmd-standard", backend: "frameGraph", models: Array.from({ length: modelCount }, (_, i) =>
            ({ instanceId: `synthetic-${i}`, name: `測定用モデル${i}`, active: i === 0 })),
        timelineTarget: "camera", timelineScope: { kind: "camera" }, undoId: null, redoId: null, assetCount: modelCount,
        helpUri: "mmd://help/getting-started", modelContentShared: false };
}
async function measure(baseline) {
    const api = await load(baseline);
    const token = randomBytes(32).toString("base64url");
    let context = fixture(0);
    const listener = await api.startAutomationListener({ port: 0, token, appVersion: "test", onError: () => undefined,
        dispatch: async (_tool, args) => ({ data: args.detail === "summary" ? api.summarizeAutomationContext(context) : context }),
        readOperationResource: () => undefined });
    const rpc = async (method, params = {}) => {
        const response = await fetch(listener.endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`,
            "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Method": method,
            "MCP-Protocol-Version": "2026-07-28", ...(params.name ? { "Mcp-Name": params.name } : {}) },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {},
                "io.modelcontextprotocol/clientInfo": { name: "payload-measurement", version: "1" },
            } } }) });
        const raw = await response.text();
        const result = JSON.parse(raw);
        if (!response.ok || result.error || result.result?.isError) throw new Error("Measurement RPC failed");
        return { bytes: Buffer.byteLength(raw), result: result.result };
    };
    try {
        const list = await rpc("tools/list");
        const toolSchemas = Object.fromEntries(list.result.tools.filter(tool => ["mmd_set_control", "mmd_edit_keyframes", "mmd_transform_keyframes", "mmd_start_ui_operation", "mmd_get_context"].includes(tool.name))
            .map(tool => [tool.name, Buffer.byteLength(JSON.stringify(tool.inputSchema))]));
        const contexts = [];
        if (!baseline) for (const count of [0, 20]) {
            context = fixture(count);
            contexts.push({ models: count, fullBytes: (await rpc("tools/call", { name: "mmd_get_context", arguments: {} })).bytes,
                summaryBytes: (await rpc("tools/call", { name: "mmd_get_context", arguments: { detail: "summary" } })).bytes });
        }
        return { toolsListBytes: list.bytes, toolCount: list.result.tools.length, toolSchemas, contexts };
    } finally { await listener.close(); }
}
console.log(JSON.stringify({ baselineRef, baseline: await measure(true), current: await measure(false) }, null, 2));
