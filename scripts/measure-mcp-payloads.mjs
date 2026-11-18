import { build } from "esbuild";
import { Module } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Development-only measurement: temporary loopback listener, synthetic context, no app/assets/credentials.
const root = resolve(import.meta.dirname, "..");
// Both source variants use the installed SDK. Dependency comparisons require a run before and after installation.
const installedSdk = Object.fromEntries(["server", "node", "core"].map(name => [name,
    JSON.parse(readFileSync(resolve(root, `node_modules/@modelcontextprotocol/${name}/package.json`), "utf8")).version]));
const requestSamples = Number(process.env.MMD_MCP_REQUEST_SAMPLES ?? "0");
if (!Number.isInteger(requestSamples) || requestSamples < 0 || requestSamples > 500) throw new Error("MMD_MCP_REQUEST_SAMPLES must be an integer in 0..500");
const baselineRef = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${process.argv[2] ?? "HEAD"}^{commit}`],
    { cwd: root, encoding: "utf8" }).trim();
const baseFiles = ["src/automation/keyframe-schema.ts", "src/automation/contracts.ts", "src/main/automation/mcp-server.ts",
    "src/automation/editor-bridge.ts", "src/automation/context-summary.ts"];
async function load(baseline) {
    // Older comparison commits can predate context-summary.ts; retain their supported tool modes.
    const existingFiles = baseline ? execFileSync("git", ["ls-tree", "-r", "--name-only", baselineRef, "--", ...baseFiles],
        { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean) : [];
    const previous = new Map(existingFiles.map(file => [resolve(root, file).toLowerCase(),
        execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root, encoding: "utf8" })]));
    const bundled = await build({ stdin: { contents: 'export { startAutomationListener } from "./src/main/automation/mcp-server"; export { summarizeAutomationContext } from "./src/automation/context-summary"; export { connectAutomationEditor } from "./src/automation/editor-bridge"; export { automationTools } from "./src/automation/contracts";',
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
async function measureContextGeneration(api, modelCount, detail, playing) {
    const sample = fixture(modelCount);
    const calls = { modelListReads: 0, modelDescriptionRows: 0, modelCountReads: 0, cameraPoseReads: 0, busyReads: 0 };
    const state = { enabled: true, editable: true, detailedDiagnostics: false, sessionId: sample.target.editorSessionId, grant: 1, endpoint: null };
    let onRequest;
    let response;
    const manager = { currentFrame: sample.frame, isPlaying: playing,
        getAutomationAssetReferences: () => sample.models.map(model => ({ assetId: model.instanceId, kind: "model", recordedPath: "synthetic.pmx" })),
        getLoadedModels: () => { calls.modelListReads++; calls.modelDescriptionRows += modelCount; return sample.models.map(model => ({ ...model })); },
        getLoadedModelCount: () => { calls.modelCountReads++; return modelCount; },
        getCameraKeyframePose: () => { calls.cameraPoseReads++; return sample.camera; },
        getMmdMaterialPipelinePreset: () => sample.materialMode, getPostEffectBackend: () => sample.backend,
        getTimelineTarget: () => sample.timelineTarget, isMaterialModeSwitching: () => false,
        isGroundVisible: () => true, isSkydomeVisible: () => true, isBackgroundMediaVisible: () => false,
        getBackgroundImagePath: () => null, getBackgroundVideoPath: () => null, antialiasEnabled: true,
        getPhysicsEnabled: () => true, isPhysicsAvailable: () => true, getShadowEnabled: () => true,
        isRigidBodyVisualizerEnabled: () => false, isRigidBodyVisualizerAvailable: () => true,
        postEffectContrast: 1, postEffectGamma: 1, postEffectExposure: 1, postEffectDitheringIntensity: 0,
        postEffectVignetteWeight: 0, postEffectGrainIntensity: 0, postEffectSharpenEdge: 0, postEffectColorCurvesSaturation: 0,
    };
    const ui = { getAutomationHistoryState: () => ({ generation: 0, revision: 0, undoId: null, redoId: null }),
        getAutomationTimelineScope: () => sample.timelineScope, getAutomationBusyReasons: () => { calls.busyReads++; return []; },
        onAutomationUserWaitingChanged: () => () => undefined };
    const globals = { document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        window: { addEventListener() {}, removeEventListener() {}, electronAPI: { logError() {}, automation: {
            getState: async () => state, onState: () => () => undefined,
            onRequest: callback => { onRequest = callback; return () => undefined; }, reply: value => { response = value; },
        } } } };
    const previousGlobals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    try {
        for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        api.connectAutomationEditor(manager, ui, {});
        await Promise.resolve();
        onRequest({ requestId: "measure", tool: "mmd_get_context", sessionId: state.sessionId, grant: state.grant, args: { detail } });
        if (!response?.result) throw new Error(`Context generation failed: ${response?.failure?.code ?? "no reply"}`);
        const data = response.result.data;
        const observedModelCount = detail === "summary" ? data.modelCount : data.models.length;
        if (observedModelCount !== modelCount) throw new Error("Context generation lost model count");
        return { models: modelCount, detail, playing, ...calls };
    } finally {
        for (const [key, descriptor] of Object.entries(previousGlobals)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
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
        const contextGeneration = [];
        for (const count of [0, 20]) for (const playing of [false, true]) for (const detail of ["full", "summary"]) {
            if (api.automationTools.mmd_get_context.schema.safeParse({ detail }).success) {
                contextGeneration.push(await measureContextGeneration(api, count, detail, playing));
            }
        }
        let requestCost;
        if (requestSamples > 0) {
            // Synthetic dispatch isolates HTTP/SDK overhead; it does not measure renderer work.
            context = fixture(20);
            const call = () => rpc("tools/call", { name: "mmd_get_context", arguments: { detail: "summary" } });
            for (let i = 0; i < 10; i++) await call();
            const cpuBefore = process.cpuUsage();
            const times = [];
            for (let i = 0; i < requestSamples; i++) {
                const started = performance.now();
                await call();
                times.push(performance.now() - started);
            }
            const cpu = process.cpuUsage(cpuBefore);
            times.sort((a, b) => a - b);
            requestCost = { samples: requestSamples, warmup: 10,
                meanMs: times.reduce((a, b) => a + b, 0) / times.length,
                medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * 0.95) - 1],
                processCpuMsPerRequest: (cpu.user + cpu.system) / 1000 / requestSamples };
        }
        return { toolsListBytes: list.bytes, toolCount: list.result.tools.length, toolSchemas, contexts, contextGeneration, requestCost };
    } finally { await listener.close(); }
}
console.log(JSON.stringify({ baselineRef, installedSdk, baseline: await measure(true), current: await measure(false) }, null, 2));
