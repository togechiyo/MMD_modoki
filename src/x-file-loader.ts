import { RegisterSceneLoaderPlugin } from "@babylonjs/core/Loading/sceneLoader";
import type {
    ISceneLoaderAsyncResult,
    ISceneLoaderPluginAsync,
    ISceneLoaderPluginFactory,
    SceneLoaderPluginOptions,
} from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

type Tok = { t: "id" | "num" | "str" | "sym"; v: string };
type XMat = {
    name: string;
    diffuse: Color4;
    power: number;
    specular: Color3;
    emissive: Color3;
    texture: string | null;
    textureUrl: string | null;
};
type XMesh = { name: string; pos: number[]; faces: number[][]; uvs: number[] | null; mats: XMat[]; faceMats: number[] };
type XFrame = { name: string; matrix: number[] | null; frames: XFrame[]; meshes: XMesh[] };
type XScene = { root: XFrame };

const META = { name: "xfile", extensions: { ".x": { isBinary: false } } } as const;
const HEADER = /^\s*xof\s+([0-9]{4})(txt|bin|tzip|bzip)\s+([0-9]{4})/i;
const NUM = /^[+-]?(?:\d+\.\d*|\d+|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?/;

function lex(s: string): Tok[] {
    const out: Tok[] = [];
    const syms = new Set(["{", "}", ";", ",", "<", ">", "[", "]", "(", ")"]);
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) {
            i += 1;
            continue;
        }
        if (c === "/" && s[i + 1] === "/") {
            i += 2;
            while (i < s.length && s[i] !== "\n") i += 1;
            continue;
        }
        if (c === "#") {
            while (i < s.length && s[i] !== "\n") i += 1;
            continue;
        }
        if (c === "\"") {
            i += 1;
            let v = "";
            while (i < s.length) {
                if (s[i] === "\\") {
                    const next = s[i + 1];
                    if (next === undefined) {
                        i += 1;
                        continue;
                    }
                    if (next === "\\" || next === "\"") {
                        v += next;
                    } else {
                        v += `\\${next}`;
                    }
                    i += 2;
                    continue;
                }
                if (s[i] === "\"") {
                    i += 1;
                    break;
                }
                v += s[i];
                i += 1;
            }
            out.push({ t: "str", v });
            continue;
        }
        if (syms.has(c)) {
            out.push({ t: "sym", v: c });
            i += 1;
            continue;
        }
        const nm = NUM.exec(s.slice(i));
        if (nm) {
            out.push({ t: "num", v: nm[0] });
            i += nm[0].length;
            continue;
        }
        const id = /^[^\s{};,()[\]<>"]+/.exec(s.slice(i));
        if (id) {
            out.push({ t: "id", v: id[0] });
            i += id[0].length;
            continue;
        }
        i += 1;
    }
    return out;
}

class P {
    private i = 0;
    private readonly mats = new Map<string, XMat>();
    public constructor(private readonly tk: Tok[]) {}

    public parse(): XScene {
        const root: XFrame = { name: "__x_root__", matrix: null, frames: [], meshes: [] };
        while (!this.eof()) {
            this.sep();
            const id = this.peekId();
            if (!id) {
                this.i += 1;
                continue;
            }
            if (id === "frame") root.frames.push(this.frame());
            else if (id === "mesh") root.meshes.push(this.mesh());
            else if (id === "material") this.material();
            else this.skipObj();
        }
        return { root };
    }

    private frame(): XFrame {
        this.expectId("frame");
        const name = this.optName();
        this.expectSym("{");
        const f: XFrame = { name: name || "Frame", matrix: null, frames: [], meshes: [] };
        while (!this.eof()) {
            this.sep();
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "frametransformmatrix") f.matrix = this.frameMatrix();
            else if (id === "frame") f.frames.push(this.frame());
            else if (id === "mesh") f.meshes.push(this.mesh());
            else this.skipObj();
        }
        this.sep();
        return f;
    }

    private frameMatrix(): number[] {
        this.expectId("frametransformmatrix");
        this.optName();
        this.expectSym("{");
        const m: number[] = [];
        for (let k = 0; k < 16; k += 1) m.push(this.num());
        this.expectSym("}");
        this.sep();
        return m;
    }

    private mesh(): XMesh {
        this.expectId("mesh");
        const name = this.optName();
        this.expectSym("{");
        const vc = this.int();
        const pos: number[] = [];
        for (let k = 0; k < vc; k += 1) pos.push(this.num(), this.num(), this.num());
        const fc = this.int();
        const faces: number[][] = [];
        for (let k = 0; k < fc; k += 1) {
            const n = this.int();
            const f: number[] = [];
            for (let j = 0; j < n; j += 1) f.push(this.int());
            faces.push(f);
        }
        let uvs: number[] | null = null;
        let mats: XMat[] = [];
        let faceMats: number[] = [];
        while (!this.eof()) {
            this.sep();
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "meshtexturecoords") uvs = this.meshUv();
            else if (id === "meshmateriallist") ({ mats, faceMats } = this.meshMats());
            else if (id === "meshnormals") this.skipNormals();
            else this.skipObj();
        }
        this.sep();
        return { name: name || "Mesh", pos, faces, uvs, mats, faceMats };
    }

    private meshUv(): number[] {
        this.expectId("meshtexturecoords");
        this.optName();
        this.expectSym("{");
        const n = this.int();
        const uvs: number[] = [];
        for (let k = 0; k < n; k += 1) uvs.push(this.num(), this.num());
        this.expectSym("}");
        this.sep();
        return uvs;
    }

    private meshMats(): { mats: XMat[]; faceMats: number[] } {
        this.expectId("meshmateriallist");
        this.optName();
        this.expectSym("{");
        const nMat = this.int();
        const nFace = this.int();
        const faceMats: number[] = [];
        for (let k = 0; k < nFace; k += 1) faceMats.push(this.int());
        const mats: XMat[] = [];
        while (!this.eof()) {
            this.sep();
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "material") {
                mats.push(this.material());
                continue;
            }
            if (this.takeSym("{")) {
                const ref = this.take();
                while (!this.eof() && !this.takeSym("}")) this.i += 1;
                const v = ref && (ref.t === "id" || ref.t === "str") ? ref.v : "";
                if (v) {
                    const found = this.mats.get(v);
                    if (found) mats.push(found);
                }
                continue;
            }
            this.skipObj();
        }
        while (mats.length < nMat) mats.push(this.defaultMat(`material_${mats.length}`));
        this.sep();
        return { mats, faceMats };
    }

    private material(): XMat {
        this.expectId("material");
        const name = this.optName();
        this.expectSym("{");
        const diffuse = new Color4(this.num(), this.num(), this.num(), this.num());
        const power = this.num();
        const specular = new Color3(this.num(), this.num(), this.num());
        const emissive = new Color3(this.num(), this.num(), this.num());
        let texture: string | null = null;
        while (!this.eof()) {
            this.sep();
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "texturefilename") {
                texture = this.textureName();
                continue;
            }
            this.skipObj();
        }
        const mat: XMat = {
            name: name || `Material_${this.mats.size}`,
            diffuse,
            power,
            specular,
            emissive,
            texture,
            textureUrl: null,
        };
        if (name) this.mats.set(name, mat);
        this.sep();
        return mat;
    }

    private textureName(): string {
        this.expectId("texturefilename");
        this.optName();
        this.expectSym("{");
        const t = this.take();
        const v = t && (t.t === "str" || t.t === "id") ? t.v : "";
        this.expectSym("}");
        this.sep();
        return v;
    }

    private skipNormals(): void {
        this.expectId("meshnormals");
        this.optName();
        this.expectSym("{");
        const n = this.int();
        for (let i = 0; i < n; i += 1) {
            this.num();
            this.num();
            this.num();
        }
        const fn = this.int();
        for (let i = 0; i < fn; i += 1) {
            const c = this.int();
            for (let j = 0; j < c; j += 1) this.int();
        }
        this.expectSym("}");
        this.sep();
    }

    private skipObj(): void {
        this.take();
        this.optName();
        this.sep();
        if (!this.takeSym("{")) return;
        let d = 1;
        while (!this.eof() && d > 0) {
            const t = this.take();
            if (!t || t.t !== "sym") continue;
            if (t.v === "{") d += 1;
            if (t.v === "}") d -= 1;
        }
        this.sep();
    }

    private defaultMat(name: string): XMat {
        return {
            name,
            diffuse: new Color4(0.8, 0.8, 0.8, 1),
            power: 16,
            specular: new Color3(0.1, 0.1, 0.1),
            emissive: new Color3(0, 0, 0),
            texture: null,
            textureUrl: null,
        };
    }

    private optName(): string {
        this.sep();
        const t = this.peek();
        if (!t || (t.t !== "id" && t.t !== "str")) return "";
        const n = this.peekNext(1);
        if (!n || n.t !== "sym" || n.v !== "{") return "";
        this.i += 1;
        return t.v;
    }

    private expectId(v: string): void {
        this.sep();
        const t = this.take();
        if (!t || t.t !== "id" || t.v.toLowerCase() !== v) throw new Error(`Expected ${v}`);
    }

    private expectSym(v: string): void {
        this.sep();
        const t = this.take();
        if (!t || t.t !== "sym" || t.v !== v) throw new Error(`Expected '${v}'`);
    }

    private takeSym(v: string): boolean {
        this.sep();
        const t = this.peek();
        if (!t || t.t !== "sym" || t.v !== v) return false;
        this.i += 1;
        return true;
    }

    private int(): number {
        return Math.trunc(this.num());
    }

    private num(): number {
        this.sep();
        const t = this.take();
        if (!t || (t.t !== "num" && t.t !== "id")) throw new Error("Expected number");
        const n = Number(t.v.replace(/[fFdD]$/, ""));
        if (!Number.isFinite(n)) throw new Error(`Invalid number '${t.v}'`);
        return n;
    }

    private peekId(): string | null {
        this.sep();
        const t = this.peek();
        return t && t.t === "id" ? t.v.toLowerCase() : null;
    }

    private sep(): void {
        while (!this.eof()) {
            const t = this.peek();
            if (!t || t.t !== "sym" || (t.v !== ";" && t.v !== ",")) break;
            this.i += 1;
        }
    }

    private peek(): Tok | null {
        return this.tk[this.i] ?? null;
    }

    private take(): Tok | null {
        const t = this.tk[this.i] ?? null;
        if (t) this.i += 1;
        return t;
    }

    private peekNext(offset: number): Tok | null {
        let idx = this.i;
        while (idx < this.tk.length && this.tk[idx].t === "sym" && (this.tk[idx].v === ";" || this.tk[idx].v === ",")) idx += 1;
        while (offset > 0) {
            idx += 1;
            while (idx < this.tk.length && this.tk[idx].t === "sym" && (this.tk[idx].v === ";" || this.tk[idx].v === ",")) idx += 1;
            offset -= 1;
        }
        return this.tk[idx] ?? null;
    }

    private eof(): boolean {
        return this.i >= this.tk.length;
    }
}

function parseX(data: string): XScene {
    const m = HEADER.exec(data);
    if (!m) throw new Error("Invalid X header");
    const format = m[2].toLowerCase();
    if (format !== "txt") throw new Error(`Unsupported X format '${format}'`);
    return new P(lex(data.slice(m.index + m[0].length))).parse();
}

function dataToText(data: unknown): string {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder("utf-8").decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) {
        return new TextDecoder("utf-8").decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }
    throw new Error("X loader expects text data");
}

function tri(faces: number[][]): { idx: number[]; faceId: number[] } {
    const idx: number[] = [];
    const faceId: number[] = [];
    for (let fi = 0; fi < faces.length; fi += 1) {
        const f = faces[fi];
        if (!f || f.length < 3) continue;
        for (let i = 1; i < f.length - 1; i += 1) {
            idx.push(f[0], f[i], f[i + 1]);
            faceId.push(fi);
        }
    }
    return { idx, faceId };
}

function textureUrl(rootUrl: string, name: string): string {
    const n = name.replace(/\\/g, "/");
    if (/^data:/i.test(n)) return n;
    if (/^[a-z]+:/i.test(n)) return n;
    if (/^[A-Za-z]:\//.test(n)) return `file:///${n}`;
    try {
        return new URL(n, rootUrl).toString();
    } catch {
        return rootUrl + n;
    }
}

function fileUrlToLocalPath(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "file:") return null;
        let p = decodeURIComponent(parsed.pathname);
        if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
        return p;
    } catch {
        return null;
    }
}

function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized)) return `file:///${normalized}`;
    return `file://${normalized}`;
}

function texturePathCandidates(rawName: string): string[] {
    const normalized = rawName.replace(/\\/g, "/");
    const out = new Set<string>();
    out.add(normalized);

    const dot = normalized.lastIndexOf(".");
    if (dot > 0) {
        const base = normalized.slice(0, dot);
        const originalExt = normalized.slice(dot).toLowerCase();
        const exts = [originalExt, ".png", ".bmp", ".tga", ".jpg", ".jpeg", ".webp"];
        for (const ext of exts) out.add(base + ext);
    }

    return Array.from(out);
}

async function resolveTextureUrlForMaterial(rootUrl: string, material: XMat): Promise<string | null> {
    if (!material.texture || material.texture.trim().length === 0) return null;

    const original = material.texture.replace(/\\/g, "/");
    if (/^data:/i.test(original)) return original;
    if (/^[a-z]+:/i.test(original)) return original;

    const fileInfoApi = (typeof window !== "undefined" && window.electronAPI?.getFileInfo)
        ? window.electronAPI.getFileInfo
        : null;

    if (fileInfoApi) {
        const candidates = texturePathCandidates(original);
        for (const candidate of candidates) {
            const url = textureUrl(rootUrl, candidate);
            const localPath = fileUrlToLocalPath(url);
            if (!localPath) continue;
            const info = await fileInfoApi(localPath);
            if (info) return localPathToFileUrl(localPath);
        }
        console.warn(`[X] Texture not found: ${original}`);
        return null;
    }

    return textureUrl(rootUrl, original);
}

function gatherMaterials(parsed: XScene): XMat[] {
    const set = new Set<XMat>();
    const walkFrame = (frame: XFrame): void => {
        for (const mesh of frame.meshes) {
            for (const material of mesh.mats) set.add(material);
        }
        for (const child of frame.frames) walkFrame(child);
    };

    for (const mesh of parsed.root.meshes) {
        for (const material of mesh.mats) set.add(material);
    }
    for (const frame of parsed.root.frames) walkFrame(frame);
    return Array.from(set);
}

async function resolveSceneTextureUrls(rootUrl: string, parsed: XScene): Promise<void> {
    const materials = gatherMaterials(parsed);
    for (const material of materials) {
        material.textureUrl = await resolveTextureUrlForMaterial(rootUrl, material);
    }
}

function buildMat(scene: Scene, m: XMat, cache: Map<XMat, StandardMaterial>): StandardMaterial {
    const c = cache.get(m);
    if (c) return c;
    const mat = new StandardMaterial(m.name || "x_material", scene);
    mat.diffuseColor = new Color3(m.diffuse.r, m.diffuse.g, m.diffuse.b);
    mat.alpha = m.diffuse.a;
    mat.specularPower = m.power;
    mat.specularColor = m.specular.clone();
    mat.emissiveColor = m.emissive.clone();
    mat.backFaceCulling = false;
    if (m.textureUrl) mat.diffuseTexture = new Texture(m.textureUrl, scene, false, true);
    cache.set(m, mat);
    return mat;
}

function buildMesh(scene: Scene, x: XMesh, parent: TransformNode | null, cache: Map<XMat, StandardMaterial>): Mesh | null {
    if (x.pos.length < 3 || x.faces.length === 0) return null;
    const { idx, faceId } = tri(x.faces);
    if (idx.length === 0) return null;

    const mesh = new Mesh(x.name || "x_mesh", scene);
    if (parent) mesh.parent = parent;

    const vd = new VertexData();
    vd.positions = x.pos.slice();
    vd.indices = idx.slice();
    if (x.uvs && x.uvs.length === (x.pos.length / 3) * 2) vd.uvs = x.uvs.slice();
    const normals: number[] = [];
    VertexData.ComputeNormals(vd.positions, vd.indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, true);

    if (x.mats.length > 0) {
        const groups = new Map<number, number[]>();
        for (let tri = 0; tri < faceId.length; tri += 1) {
            const sourceFace = faceId[tri];
            const rawMatIndex = x.faceMats[sourceFace] ?? 0;
            const matIndex = Math.max(0, Math.min(x.mats.length - 1, rawMatIndex));
            const g = groups.get(matIndex) ?? [];
            const base = tri * 3;
            g.push(idx[base], idx[base + 1], idx[base + 2]);
            groups.set(matIndex, g);
        }

        if (groups.size <= 1) {
            const matIndex = groups.size === 1 ? Array.from(groups.keys())[0] : 0;
            const mat = x.mats[Math.max(0, Math.min(x.mats.length - 1, matIndex))] ?? x.mats[0];
            mesh.material = buildMat(scene, mat, cache);
        } else {
            const multi = new MultiMaterial(`${mesh.name}_multi`, scene);
            const sorted = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);

            const rebuilt: number[] = [];
            const ranges: Array<{ sub: number; start: number; count: number }> = [];

            for (let si = 0; si < sorted.length; si += 1) {
                const [matIndex, triIndices] = sorted[si];
                if (triIndices.length === 0) continue;
                const mat = x.mats[Math.max(0, Math.min(x.mats.length - 1, matIndex))] ?? x.mats[0];
                const sub = buildMat(scene, mat, cache);
                const subIndex = multi.subMaterials.length;
                multi.subMaterials.push(sub);

                const start = rebuilt.length;
                rebuilt.push(...triIndices);
                ranges.push({ sub: subIndex, start, count: triIndices.length });
            }

            if (rebuilt.length > 0) {
                mesh.setIndices(rebuilt);
                mesh.releaseSubMeshes();
                const vertexCount = x.pos.length / 3;
                for (const r of ranges) {
                    new SubMesh(r.sub, 0, vertexCount, r.start, r.count, mesh);
                }
                mesh.material = multi;
            } else {
                const mat = x.mats[0];
                mesh.material = buildMat(scene, mat, cache);
            }
        }
    } else {
        const mat = new StandardMaterial(`${mesh.name}_mat`, scene);
        mat.diffuseColor = new Color3(0.8, 0.8, 0.8);
        mat.backFaceCulling = false;
        mesh.material = mat;
    }

    return mesh;
}

function applyMatrix(node: TransformNode, m: number[]): void {
    const mat = Matrix.FromArray(m);
    const s = new Vector3(1, 1, 1);
    const r = Quaternion.Identity();
    const p = new Vector3(0, 0, 0);
    mat.decompose(s, r, p);
    node.scaling.copyFrom(s);
    node.rotationQuaternion = r;
    node.position.copyFrom(p);
}

function buildFrame(scene: Scene, f: XFrame, parent: TransformNode | null, meshes: Mesh[], nodes: TransformNode[], cache: Map<XMat, StandardMaterial>): void {
    const node = new TransformNode(f.name || `x_frame_${nodes.length}`, scene);
    node.parent = parent;
    nodes.push(node);
    if (f.matrix && f.matrix.length === 16) applyMatrix(node, f.matrix);
    for (const m of f.meshes) {
        const mesh = buildMesh(scene, m, node, cache);
        if (mesh) meshes.push(mesh);
    }
    for (const c of f.frames) buildFrame(scene, c, node, meshes, nodes, cache);
}

function buildScene(scene: Scene, parsed: XScene): { meshes: Mesh[]; nodes: TransformNode[] } {
    const meshes: Mesh[] = [];
    const nodes: TransformNode[] = [];
    const cache = new Map<XMat, StandardMaterial>();
    for (const m of parsed.root.meshes) {
        const mesh = buildMesh(scene, m, null, cache);
        if (mesh) meshes.push(mesh);
    }
    for (const f of parsed.root.frames) buildFrame(scene, f, null, meshes, nodes, cache);
    return { meshes, nodes };
}

function collectMats(meshes: Mesh[]): StandardMaterial[] {
    const out = new Set<StandardMaterial>();
    for (const mesh of meshes) {
        const material = mesh.material;
        if (material instanceof StandardMaterial) {
            out.add(material);
            continue;
        }
        if (material instanceof MultiMaterial) {
            for (const sub of material.subMaterials) {
                if (sub instanceof StandardMaterial) out.add(sub);
            }
        }
    }
    return Array.from(out);
}

export class XFileLoader implements ISceneLoaderPluginAsync, ISceneLoaderPluginFactory {
    public readonly name = META.name;
    public readonly extensions = META.extensions;

    public createPlugin(options: SceneLoaderPluginOptions): ISceneLoaderPluginAsync {
        void options;
        return new XFileLoader();
    }

    public canDirectLoad(data: string): boolean {
        return HEADER.test(data);
    }

    public importMeshAsync(
        _meshesNames: string | readonly string[] | null | undefined,
        scene: Scene,
        data: unknown,
        rootUrl: string,
    ): Promise<ISceneLoaderAsyncResult> {
        try {
            const parsed = parseX(dataToText(data));
            return resolveSceneTextureUrls(rootUrl, parsed).then(() => {
                const built = buildScene(scene, parsed);
                return {
                    meshes: built.meshes,
                    particleSystems: [],
                    skeletons: [],
                    animationGroups: [],
                    transformNodes: built.nodes,
                    geometries: [],
                    lights: [],
                    spriteManagers: [],
                } as ISceneLoaderAsyncResult;
            });
        } catch (e) {
            return Promise.reject(e);
        }
    }

    public loadAsync(scene: Scene, data: unknown, rootUrl: string): Promise<void> {
        return this.importMeshAsync(null, scene, data, rootUrl).then(() => undefined);
    }

    public loadAssetContainerAsync(scene: Scene, data: unknown, rootUrl: string): Promise<AssetContainer> {
        return this.importMeshAsync(null, scene, data, rootUrl).then((r) => {
            const c = new AssetContainer(scene);
            c.meshes.push(...r.meshes);
            c.transformNodes.push(...r.transformNodes);
            const mats = collectMats(r.meshes as Mesh[]);
            c.materials.push(...mats);
            const tx = new Set<Texture>();
            for (const m of mats) for (const t of m.getActiveTextures()) if (t instanceof Texture) tx.add(t);
            c.textures.push(...Array.from(tx));
            return c;
        });
    }
}

RegisterSceneLoaderPlugin(new XFileLoader());
