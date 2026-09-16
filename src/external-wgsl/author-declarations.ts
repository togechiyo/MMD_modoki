import type { EffectManifest } from "./contract";
import { effectInputRegistry } from "./input-registry";
import { checkTextBudget, WGSL_SOURCE_BYTES } from "./limits";

/** Mask comments without moving the original source locations. WGSL permits nested comments. */
export function maskWgslComments(source: string): string {
    let depth = 0; let line = false; let output = "";
    for (let i = 0; i < source.length; i++) {
        const pair = source.slice(i, i + 2);
        if (!line && pair === "/*") { depth++; output += "  "; i++; }
        else if (!line && depth > 0 && pair === "*/") { depth--; output += "  "; i++; }
        else if (!depth && pair === "//") { line = true; output += "  "; i++; }
        else if (source[i] === "\n") { line = false; output += "\n"; }
        else output += depth || line ? " " : source[i];
    }
    if (depth) throw new Error("Unterminated WGSL block comment");
    return output;
}

type Token = { text: string; offset: number };
const reserved = new Set(["EffectInputs", "effectInputs", "effectSurface", "effectFinalColor",
    "MODOKI_API_VERSION", "MODOKI_EFFECT_VERSION", "MODOKI_REQUIRE_UV0"]);
const normalizeType = (value: string) => value.replace(/vec([234])<f32>/g, "vec$1f").replace("mat4x4<f32>", "mat4x4f").replace("vec3<u32>", "vec3u");

/** Inspect the bounded material contract, not arbitrary WGSL expressions or function bodies. */
export function readAuthorDeclarations(source: string, sourceName: string): EffectManifest {
    checkTextBudget(source, WGSL_SOURCE_BYTES, sourceName);
    const fail = (message: string, token?: Token): never => {
        const prefix = source.slice(0, token?.offset ?? source.length);
        throw new Error(sourceName + ":" + prefix.split("\n").length + ":" + (prefix.length - prefix.lastIndexOf("\n")) + ": " + message);
    };
    let masked: string;
    try { masked = maskWgslComments(source); }
    catch { return fail("Unterminated WGSL block comment"); }
    const tokens: Token[] = Array.from(masked.matchAll(/[A-Za-z_][A-Za-z0-9_]*|[0-9][A-Za-z0-9_.]*|->|[^\s]/g),
        match => ({ text: match[0], offset: match.index }));
    const manifest: EffectManifest = { apiVersion: 2, kind: "mmd-material", name: sourceName.split("/").pop()?.replace(/\.wgsl$/i, "") || sourceName,
        sources: [sourceName], hooks: {}, inputs: {}, inputOrder: [] };
    let i = 0; let version = false; let inputStruct = false; let inputVariable = false;
    const seen = new Set<string>();
    const current = () => tokens[i]?.text;
    const expect = (value: string) => { if (current() !== value) fail("Expected " + value, tokens[i]); i++; };
    const until = (end: string) => {
        const start = i;
        while (i < tokens.length && current() !== end) i++;
        if (i === tokens.length) fail("Expected " + end, tokens[start]);
        return tokens.slice(start, i).map(token => token.text).join("");
    };
    const declarationName = (index: number): Token | undefined => {
        if (tokens[index]?.text === "var" && tokens[index + 1]?.text === "<") {
            index += 2;
            while (index < tokens.length && tokens[index]?.text !== ">") index++;
        }
        return tokens[index + 1];
    };
    // Profile restrictions apply inside functions too. GPU compilation handles general WGSL validity.
    for (let n = 0; n < tokens.length; n++) {
        const token = tokens[n];
        if (token.text === "#" || token.text === "discard" ||
            (token.text === "@" && ["vertex", "fragment", "compute", "group", "binding"].includes(tokens[n + 1]?.text))) fail("Unsupported declaration in material profile", token);
        if (token.text === "uniform") {
            if (tokens[n - 1]?.text !== "<" || tokens[n - 2]?.text !== "var" ||
                tokens[n + 1]?.text !== ">" || tokens[n + 2]?.text !== "effectInputs") fail("Only var<uniform> effectInputs: EffectInputs is supported", token);
        }
        if (token.text === "var" && tokens[n + 1]?.text === "<" &&
            ["storage", "workgroup"].includes(tokens[n + 2]?.text)) fail("Unsupported resource declaration", token);
        if (["fn", "struct", "alias", "var", "let", "const", "override"].includes(token.text)) {
            const name = declarationName(n);
            if (name && /^(modoki|Modoki|fx_|__)/.test(name.text)) fail("Reserved identifier " + name.text, name);
        }
    }
    while (i < tokens.length) {
        if (current() === ";") { i++; continue; }
        const start = i;
        const kind = current(); i++;
        if (!["const", "override", "var", "alias", "struct", "fn"].includes(kind)) fail("Unsupported module declaration", tokens[start]);
        if (kind === "var" && current() === "<") { i++; until(">"); i++; }
        const nameToken = tokens[i++]; const name = nameToken?.text ?? "";
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail("Expected declaration name", nameToken);
        if (seen.has(name)) fail("Duplicate declaration " + name, nameToken);
        seen.add(name);
        if (name.startsWith("MODOKI_") && !reserved.has(name)) fail("Unknown reserved declaration " + name, nameToken);
        if (reserved.has(name)) {
            if (name.startsWith("MODOKI_")) {
                if (kind !== "const") fail(name + " must be a module const", nameToken);
                expect(":"); const type = normalizeType(until("=")); i++;
                const value = until(";"); i++;
                if (name === "MODOKI_API_VERSION") {
                    if (type !== "u32" || value !== "2u") fail("MODOKI_API_VERSION must be u32 = 2u; old WGSL formats are unsupported", nameToken);
                    version = true;
                } else if (name === "MODOKI_REQUIRE_UV0") {
                    if (type !== "bool" || !["true", "false"].includes(value)) fail("MODOKI_REQUIRE_UV0 requires a bool literal", nameToken);
                    if (value === "true") manifest.requires = ["uv0"];
                } else {
                    const match = /^vec3(?:u|<u32>)\(([0-9]+)u,([0-9]+)u,([0-9]+)u,?\)$/.exec(value);
                    if (type !== "vec3u" || !match || match.slice(1).some(v => Number(v) > 4294967295)) fail("MODOKI_EFFECT_VERSION requires vec3u(majoru, minoru, patchu)", nameToken);
                    manifest.effectVersion = match.slice(1).map(Number);
                }
                continue;
            }
            if (name === "EffectInputs") {
                if (kind !== "struct") fail("EffectInputs must be a struct", nameToken);
                expect("{");
                while (current() !== "}") {
                    const field = tokens[i++]; const fieldName = field?.text ?? "";
                    const input = Object.hasOwn(effectInputRegistry, fieldName) ? effectInputRegistry[fieldName] : undefined;
                    if (!input) fail("Unknown EffectInputs field " + fieldName, field);
                    if (manifest.inputOrder.includes(fieldName)) fail("Duplicate input " + fieldName, field);
                    expect(":");
                    const typeStart = i; let depth = 0;
                    while (i < tokens.length) {
                        if (!depth && [",", "}"].includes(current())) break;
                        if (current() === "<") depth++;
                        if (current() === ">") depth--;
                        i++;
                    }
                    const type = normalizeType(tokens.slice(typeStart, i).map(t => t.text).join(""));
                    if (type !== input.type) fail(fieldName + " requires " + input.type + "; input aliases, attributes and nested types are unsupported", field);
                    manifest.inputs[fieldName] = structuredClone(input); manifest.inputOrder.push(fieldName);
                    if (current() === ",") i++;
                }
                if (!manifest.inputOrder.length) fail("EffectInputs must not be empty; omit it when unused", nameToken);
                i++; if (current() === ";") i++;
                inputStruct = true; continue;
            }
            if (name === "effectInputs") {
                const head = tokens.slice(start, i).map(t => t.text).join("");
                if (head !== "var<uniform>effectInputs") fail("Expected var<uniform> effectInputs", nameToken);
                expect(":"); expect("EffectInputs"); expect(";");
                inputVariable = true; continue;
            }
            if (kind !== "fn") fail(name + " must be a function", nameToken);
        }
        if (kind === "fn" || kind === "struct") {
            const header = until("{"); i++;
            if (name === "effectSurface" || name === "effectFinalColor") {
                const argument = name === "effectSurface" ? "ModokiSurface" : "ModokiFinalColor";
                const result = name === "effectSurface" ? "ModokiSurfaceOutput" : "vec3f";
                const signature = new RegExp("^\\([A-Za-z_][A-Za-z0-9_]*:" + argument + ",?\\)->" + result + "$");
                if (!signature.test(normalizeType(header))) fail("Invalid signature for " + name, nameToken);
                if (name === "effectSurface") manifest.hooks.surface = name;
                else manifest.hooks.finalColor = name;
            }
            let depth = 1;
            while (i < tokens.length && depth) {
                const token = tokens[i];
                if (token.text === "{") depth++;
                if (token.text === "}") depth--;
                if (["var", "let", "const", "fn", "struct", "alias", "override"].includes(token.text)) {
                    const local = declarationName(i);
                    if (local && (reserved.has(local.text) || local.text.startsWith("MODOKI_"))) fail("Reserved declaration must be at module scope: " + local.text, local);
                }
                i++;
            }
            if (depth) fail("Unclosed declaration " + name, nameToken);
        } else { until(";"); i++; }
    }
    if (!version) fail("Missing const MODOKI_API_VERSION: u32 = 2u; old WGSL formats are unsupported", tokens[0]);
    if (inputStruct !== inputVariable) fail("EffectInputs and var<uniform> effectInputs must be declared together", tokens[0]);
    if (!manifest.hooks.surface && !manifest.hooks.finalColor) fail("At least one material hook is required: effectSurface or effectFinalColor", tokens[0]);
    return manifest;
}
