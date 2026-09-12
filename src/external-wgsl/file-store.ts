import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { canonicalEffectContent, parseEffectManifest, relativeEffectPath, validateEffectSources, type EffectAsset, type EffectAssetReference } from "./contract";
import { parseEffectFile } from "./single-file";

async function containedFile(directory: string, relative: string): Promise<string> {
    relativeEffectPath.parse(relative);
    const base = await fs.realpath(directory);
    const file = await fs.realpath(path.resolve(base, relative));
    const resolved = path.relative(base, file);
    if (resolved.startsWith(".." + path.sep) || resolved === ".." || path.isAbsolute(resolved)) throw new Error("Effect file is outside the package: " + relative);
    return file;
}
export function validateEffectAsset(value: EffectAsset): EffectAsset {
    const manifest = parseEffectManifest(value.manifest);
    validateEffectSources(manifest, value.sources);
    const revision = createHash("sha256").update(canonicalEffectContent({ manifest, sources: value.sources })).digest("hex");
    if (value.revision !== revision) throw new Error("Effect content hash mismatch");
    return { revision, manifest, sources: value.sources, ...(value.originPath ? { originPath: value.originPath } : {}) };
}
export async function readEffectPackage(filePath: string): Promise<EffectAsset> {
    if (path.extname(filePath).toLowerCase() !== ".wgsl") throw new Error("Select a .wgsl file with @modoki metadata; JSON import is no longer supported");
    const { manifest, sources } = parseEffectFile(await fs.readFile(filePath, "utf8"), path.basename(filePath));
    const revision = createHash("sha256").update(canonicalEffectContent({ manifest, sources })).digest("hex");
    return { revision, manifest, sources, originPath: filePath };
}
type ProjectWithEffects = { format: string; version: number; externalEffects: Array<EffectAsset | EffectAssetReference> };
function projectWithEffects(content: string): ProjectWithEffects | null {
    let value: ProjectWithEffects;
    try { value = JSON.parse(content); } catch { return null; }
    return value?.format === "mmd_modoki_project" && value.version === 1 && Array.isArray(value.externalEffects) && value.externalEffects.length ? value : null;
}
async function atomicWrite(file: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = file + "." + randomUUID() + ".tmp";
    try { await fs.writeFile(temp, content, { encoding: "utf8", flag: "wx" }); await fs.rename(temp, file); }
    finally { await fs.rm(temp, { force: true }); }
}
/** Assets are committed before the project. Ordinary text keeps its existing IO contract. */
export async function writeTextWithEffects(file: string, content: string): Promise<void> {
    const project = projectWithEffects(content);
    if (!project) { await fs.writeFile(file, content, "utf8"); return; }
    const refs: EffectAssetReference[] = [];
    for (const value of project.externalEffects) {
        if (!("manifest" in value)) throw new Error("Cannot save a portable project: unresolved WGSL asset " + value.revision);
        const asset = validateEffectAsset(value);
        const relative = `${path.basename(file)}.assets/effects/${asset.revision}/effect.json`;
        const target = path.join(path.dirname(file), relative);
        await atomicWrite(target, JSON.stringify(asset));
        refs.push({ revision: asset.revision, path: relative, ...(asset.originPath ? { originPath: asset.originPath } : {}) });
    }
    project.externalEffects = refs;
    await atomicWrite(file, JSON.stringify(project, null, 2));
}
/** Keep unresolved references; the renderer can report them and preserve assignments. */
export async function readTextWithEffects(file: string): Promise<string> {
    const content = await fs.readFile(file, "utf8");
    const project = projectWithEffects(content);
    if (!project) return content;
    project.externalEffects = await Promise.all(project.externalEffects.map(async value => {
        if ("manifest" in value) return value;
        try {
            const resolved = await containedFile(path.dirname(file), value.path);
            const asset = validateEffectAsset(JSON.parse(await fs.readFile(resolved, "utf8")));
            if (asset.revision !== value.revision) return value;
            return asset;
        } catch { return value; } // Unresolved is an explicit renderer state, not a successful load.
    }));
    return JSON.stringify(project);
}
