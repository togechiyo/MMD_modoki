import { parseEffectManifest, validateEffectSources, type EffectAsset } from "./contract";

/** Read the authoring format; project assets keep their existing normalized representation. */
export function parseEffectFile(source: string, sourceName = "main.wgsl"): Pick<EffectAsset, "manifest" | "sources"> {
    const text = source.replace(/^\uFEFF/, "");
    const opening = /^\s*\/\*\s*@modoki\b/.exec(text);
    if (!opening) throw new Error(sourceName + ": expected /* @modoki metadata at the start of the WGSL file");
    const end = text.indexOf("*/", opening[0].length);
    if (end < 0) throw new Error(sourceName + ": Unterminated @modoki metadata comment");
    const header = text.slice(opening[0].length, end);
    let metadata: unknown;
    try { metadata = JSON.parse(header); }
    catch (error) { throw new Error(sourceName + ": Invalid @modoki metadata JSON: " + (error instanceof Error ? error.message : String(error))); }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error(sourceName + ": metadata must be an object");
    if ("sources" in metadata) throw new Error(sourceName + ": sources is not supported; put all WGSL in this file");
    // Nested WGSL comment delimiters in JSON strings must use JSON's \/ escape.
    if (header.includes("/*")) throw new Error(sourceName + ": escape comment delimiters in metadata strings");
    const body = text.slice(end + 2);
    if (/\/\*\s*@modoki\b/.test(body)) throw new Error(sourceName + ": Duplicate @modoki metadata block");
    const manifest = parseEffectManifest({ ...metadata, sources: [sourceName] });
    const sources = [{ path: sourceName, text: text.slice(0, end + 2).replace(/[^\r\n]/g, " ") + body }];
    validateEffectSources(manifest, sources);
    return { manifest, sources };
}
