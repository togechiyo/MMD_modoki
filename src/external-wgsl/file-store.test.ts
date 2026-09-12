import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readEffectPackage, readTextWithEffects, writeTextWithEffects } from "./file-store";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function fixture() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "modoki-effect-test-")); directories.push(directory);
    const manifest = { apiVersion: 1, kind: "mmd-material", name: "色", hooks: { finalColor: "shade" } };
    const file = path.join(directory, "effect.wgsl");
    await fs.writeFile(file, `/* @modoki\n${JSON.stringify(manifest)}\n*/\nfn shade(s: ModokiFinalColor) -> vec3f { return s.color; }`);
    return { directory, file, manifest };
}
describe("WGSL package and project IO", () => {
    it("rejects the old JSON import even when the file contains valid metadata", async () => {
        const f = await fixture();
        const oldPath = path.join(f.directory, "effect.modoki.json");
        await fs.writeFile(oldPath, JSON.stringify({ ...f.manifest, sources: ["effect.wgsl"] }));
        await expect(readEffectPackage(oldPath)).rejects.toThrow("JSON import is no longer supported");
    });
    it("saves one shared asset and restores it after original source removal", async () => {
        const f = await fixture(); const asset = await readEffectPackage(f.file);
        const project = { format: "mmd_modoki_project", version: 1, externalEffects: [asset], scene: { models: [] } };
        const target = path.join(f.directory, "scene.mmdproj");
        await writeTextWithEffects(target, JSON.stringify(project));
        const saved = JSON.parse(await fs.readFile(target, "utf8"));
        expect(saved.externalEffects[0].manifest).toBeUndefined();
        expect(saved.externalEffects[0].path).toContain(asset.revision);
        await fs.unlink(f.file);
        expect(JSON.parse(await readTextWithEffects(target)).externalEffects[0]).toEqual(asset);
        await writeTextWithEffects(target, JSON.stringify(project));
        expect(await fs.readdir(path.join(f.directory, "scene.mmdproj.assets/effects"))).toHaveLength(1);
    });
    it("preserves the old project if an asset is unresolved or corrupted", async () => {
        const f = await fixture(); const asset = await readEffectPackage(f.file);
        const target = path.join(f.directory, "scene.mmdproj"); await fs.writeFile(target, "previous");
        const project = { format: "mmd_modoki_project", version: 1, externalEffects: [{ ...asset, revision: "wrong" }] };
        await expect(writeTextWithEffects(target, JSON.stringify(project))).rejects.toThrow("hash");
        expect(await fs.readFile(target, "utf8")).toBe("previous");
    });
    it("keeps missing sidecar references for diagnosis", async () => {
        const f = await fixture(); const target = path.join(f.directory, "missing.mmdproj");
        const ref = { revision: "abc", path: "missing/effect.json" };
        await fs.writeFile(target, JSON.stringify({ format: "mmd_modoki_project", version: 1, externalEffects: [ref] }));
        expect(JSON.parse(await readTextWithEffects(target)).externalEffects).toEqual([ref]);
    });
});
