import { parseEffectManifest, type EffectAsset } from "./contract";
import { readAuthorDeclarations } from "./author-declarations";

/** The author source is the sole authority for constants, hooks and input layout. */
export function parseEffectFile(source: string, sourceName = "main.wgsl"): Pick<EffectAsset, "manifest" | "sources"> {
    const text = source.replace(/^\uFEFF/, "");
    const manifest = parseEffectManifest(readAuthorDeclarations(text, sourceName));
    return { manifest, sources: [{ path: sourceName, text }] };
}
