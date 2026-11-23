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
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MmdPluginMaterialSphereTextureBlendMode } from "babylon-mmd/esm/Loader/mmdPluginMaterial";
import { resolveXMaterialRenderPolicy } from "./shared/x-material-render-policy";
import { findRedundantPackedXFaces } from "./shared/x-face-deduplication";
import { buildXMeshGeometry, splitXMeshGeometry } from "./shared/x-mesh-geometry";
import type { PackedXFaces } from "./shared/x-packed-faces";
import { XTextReader, X_TEXT_HEADER } from "./shared/x-text-reader";
import { localPathToFileUrl } from "./shared/local-asset-url";
import { createXTextureAlphaCache } from "./shared/x-texture-alpha";
import { inspectXTextureAlpha } from "./scene/x-texture-alpha-inspection";

type XMat = {
    name: string;
    diffuse: Color4;
    power: number;
    specular: Color3;
    emissive: Color3;
    texture: string | null;
    textureUrl: string | null;
    textureIsOpaque?: boolean;
    sphereTexture: string | null;
    sphereTextureUrl: string | null;
    sphereTextureMode: "multiply" | "add" | null;
};
type XMeshNormals = { values: Float64Array; faces: PackedXFaces };
type XMesh = {
    name: string;
    pos: Float64Array;
    faces: PackedXFaces;
    uvs: Float64Array | null;
    normals: XMeshNormals | null;
    mats: XMat[];
    faceMats: Int32Array;
};
type XFrame = { name: string; matrix: number[] | null; frames: XFrame[]; meshes: XMesh[] };
type XScene = { root: XFrame };

const META = { name: "xfile", extensions: { ".x": { isBinary: true } } } as const;
const NON_TOON_SHADOW_AMBIENT = new Color3(1, 1, 1);
const X_DEFAULT_TOON_TEXTURE_HEIGHT = 256;
const xDefaultToonTextureCache = new WeakMap<Scene, DynamicTexture>();

class XParser {
    private readonly mats = new Map<string, XMat>();
    public constructor(private readonly reader: XTextReader) {}

    public parse(): XScene {
        const root: XFrame = { name: "__x_root__", matrix: null, frames: [], meshes: [] };
        while (this.reader.peek()) {
            const id = this.peekId();
            if (!id) {
                this.reader.take();
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
        while (this.reader.peek()) {
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "frametransformmatrix") f.matrix = this.frameMatrix();
            else if (id === "frame") f.frames.push(this.frame());
            else if (id === "mesh") f.meshes.push(this.mesh());
            else this.skipObj();
        }
        return f;
    }

    private frameMatrix(): number[] {
        this.expectId("frametransformmatrix");
        this.optName();
        this.expectSym("{");
        const m: number[] = [];
        for (let k = 0; k < 16; k += 1) m.push(this.num());
        this.expectSym("}");
        return m;
    }

    private mesh(): XMesh {
        this.expectId("mesh");
        const name = this.optName();
        this.expectSym("{");
        const pos = this.vectors(3);
        const faces = this.faces(pos.length / 3);
        let uvs: Float64Array | null = null;
        let normals: XMeshNormals | null = null;
        let mats: XMat[] = [];
        let faceMats: Int32Array = new Int32Array(0);
        while (this.reader.peek()) {
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "meshtexturecoords") uvs = this.meshUv();
            else if (id === "meshmateriallist") ({ mats, faceMats } = this.meshMats());
            else if (id === "meshnormals") normals = this.meshNormals();
            else this.skipObj();
        }
        return { name: name || "Mesh", pos, faces, uvs, normals, mats, faceMats };
    }

    private vectors(size: number): Float64Array {
        const values = new Float64Array(this.reader.count(size) * size);
        for (let i = 0; i < values.length; i++) values[i] = this.num();
        return values;
    }

    private faces(vertexCount?: number): PackedXFaces {
        const count = this.reader.count();
        const offsets = new Uint32Array(count + 1);
        let indices = new Uint32Array(Math.min(count * 3, this.reader.remainingLength));
        let used = 0;
        for (let face = 0; face < count; face++) {
            const corners = this.reader.count();
            const end = used + corners;
            if (end > 0xffffffff) throw new Error("Too many X polygon corners");
            if (end > indices.length) {
                const expanded = new Uint32Array(Math.max(end, Math.ceil(indices.length * 1.5)));
                expanded.set(indices);
                indices = expanded;
            }
            while (used < end) {
                const index = this.num();
                if (vertexCount !== undefined && (!Number.isInteger(index) || index < 0 || index >= vertexCount)) {
                    throw new Error("Invalid X vertex index " + index);
                }
                // Some exporters leave a missing normal index. Its components default to zero.
                indices[used++] = index < 0 || index > 0xffffffff ? 0xffffffff : index;
            }
            offsets[face + 1] = used;
        }
        return { indices: indices.subarray(0, used), offsets };
    }

    private meshUv(): Float64Array {
        this.expectId("meshtexturecoords");
        this.optName();
        this.expectSym("{");
        const uvs = this.vectors(2);
        // Map DirectX-style V orientation to Babylon UV space.
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1 - uvs[i];
        this.expectSym("}");
        return uvs;
    }

    private meshMats(): { mats: XMat[]; faceMats: Int32Array } {
        this.expectId("meshmateriallist");
        this.optName();
        this.expectSym("{");
        const nMat = this.reader.count();
        const faceMats = new Int32Array(this.reader.count());
        for (let i = 0; i < faceMats.length; i++) faceMats[i] = this.num();
        const mats: XMat[] = [];
        while (this.reader.peek()) {
            if (this.takeSym("}")) break;
            const id = this.peekId();
            if (id === "material") {
                mats.push(this.material());
                continue;
            }
            if (this.takeSym("{")) {
                const ref = this.reader.take();
                while (this.reader.peek() && !this.takeSym("}")) this.reader.take();
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
        while (this.reader.peek()) {
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
            sphereTexture: null,
            sphereTextureUrl: null,
            sphereTextureMode: null,
        };
        if (name) this.mats.set(name, mat);
        return mat;
    }

    private textureName(): string {
        this.expectId("texturefilename");
        this.optName();
        this.expectSym("{");
        const t = this.reader.take();
        const v = t && (t.t === "str" || t.t === "id") ? t.v : "";
        this.expectSym("}");
        return v;
    }

    private meshNormals(): XMeshNormals {
        this.expectId("meshnormals");
        this.optName();
        this.expectSym("{");
        const values = this.vectors(3);
        const faces = this.faces();
        this.expectSym("}");
        return { values, faces };
    }

    private skipObj(): void {
        this.reader.take();
        this.optName();
        if (!this.takeSym("{")) return;
        let d = 1;
        while (this.reader.peek() && d > 0) {
            const t = this.reader.take();
            if (!t || t.t !== "sym") continue;
            if (t.v === "{") d += 1;
            if (t.v === "}") d -= 1;
        }
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
            sphereTexture: null,
            sphereTextureUrl: null,
            sphereTextureMode: null,
        };
    }

    private optName(): string {
        const t = this.reader.peek();
        if (!t || (t.t !== "id" && t.t !== "str")) return "";
        const n = this.reader.peek(1);
        if (!n || n.t !== "sym" || n.v !== "{") return "";
        this.reader.take();
        return t.v;
    }

    private expectId(v: string): void {
        const t = this.reader.take();
        if (!t || t.t !== "id" || t.v.toLowerCase() !== v) throw new Error(`Expected ${v}`);
    }

    private expectSym(v: string): void {
        const t = this.reader.take();
        if (!t || t.t !== "sym" || t.v !== v) throw new Error(`Expected '${v}'`);
    }

    private takeSym(v: string): boolean {
        const t = this.reader.peek();
        if (!t || t.t !== "sym" || t.v !== v) return false;
        this.reader.take();
        return true;
    }

    private num(): number {
        return this.reader.number();
    }

    private peekId(): string | null {
        const t = this.reader.peek();
        return t?.t === "id" ? t.v.toLowerCase() : null;
    }
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

function isAlphaCapableTextureUrl(url: string): boolean {
    const normalized = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
    return normalized.endsWith(".png")
        || normalized.endsWith(".bmp")
        || normalized.endsWith(".tga")
        || normalized.endsWith(".webp");
}

function fileUrlToLocalPath(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "file:") return null;
        let p = decodeURIComponent(parsed.pathname);
        if (parsed.hostname) return "//" + parsed.hostname + p;
        if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
        return p;
    } catch {
        return null;
    }
}

export function getDefaultAccessoryToonTexture(scene: Scene): DynamicTexture {
    const cached = xDefaultToonTextureCache.get(scene);
    if (cached) return cached;

    const texture = new DynamicTexture(
        "xAccessoryDefaultToon",
        { width: 1, height: X_DEFAULT_TOON_TEXTURE_HEIGHT },
        scene,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
    );
    const context = texture.getContext();
    const gradient = context.createLinearGradient(0, 0, 0, X_DEFAULT_TOON_TEXTURE_HEIGHT);
    gradient.addColorStop(0, "#a8a8a8");
    gradient.addColorStop(0.45, "#cdcdcd");
    gradient.addColorStop(1, "#f1f1f1");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1, X_DEFAULT_TOON_TEXTURE_HEIGHT);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
    texture.update(false);
    xDefaultToonTextureCache.set(scene, texture);
    return texture;
}

function configureAlphaBlendXMaterial(mat: MmdStandardMaterial): void {
    mat.needDepthPrePass = true;
    mat.separateCullingPass = true;
    mat.useSpecularOverAlpha = false;
    mat.forceDepthWrite = false;
    mat.alphaCutOff = 0;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
}

function configureAlphaCutoutXMaterial(mat: MmdStandardMaterial): void {
    mat.needDepthPrePass = false;
    mat.separateCullingPass = false;
    mat.useSpecularOverAlpha = false;
    mat.forceDepthWrite = false;
    mat.alphaCutOff = 0.5;
    mat.transparencyMode = Material.MATERIAL_ALPHATEST;
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

function parseCompositeTextureReference(rawName: string): {
    diffuse: string | null;
    sphere: string | null;
    sphereMode: "multiply" | "add" | null;
} {
    const normalized = rawName.replace(/\\/g, "/").trim();
    const composite = /^(.*?\.(?:png|bmp|tga|jpg|jpeg|webp))(?:[*?])([^*?]+\.(?:sph|spa))$/i.exec(normalized);
    if (composite) {
        const diffuse = composite[1]?.trim() || null;
        const sphere = composite[2]?.trim() || null;
        const sphereMode = sphere?.toLowerCase().endsWith(".spa") ? "add" : "multiply";
        return { diffuse, sphere, sphereMode };
    }
    if (/\.(?:sph|spa)$/i.test(normalized)) {
        return {
            diffuse: null,
            sphere: normalized,
            sphereMode: normalized.toLowerCase().endsWith(".spa") ? "add" : "multiply",
        };
    }
    return { diffuse: normalized, sphere: null, sphereMode: null };
}

async function resolveSingleTextureUrl(rootUrl: string, rawName: string): Promise<string | null> {
    if (!rawName || rawName.trim().length === 0) return null;

    const original = rawName.replace(/\\/g, "/");
    if (/^data:/i.test(original)) return original;
    if (/^[a-z]+:/i.test(original)) return original;

    const fileInfoApi = (typeof window !== "undefined" && window.electronAPI?.getFileInfo)
        ? window.electronAPI.getFileInfo
        : null;
    const nearbyFileApi = (typeof window !== "undefined" && window.electronAPI?.findNearbyFile)
        ? window.electronAPI.findNearbyFile
        : null;

    if (fileInfoApi) {
        const candidates = texturePathCandidates(original);
        const rootDirectoryPath = fileUrlToLocalPath(rootUrl);
        for (const candidate of candidates) {
            const url = textureUrl(rootUrl, candidate);
            const localPath = fileUrlToLocalPath(url);
            if (!localPath) continue;
            const info = await fileInfoApi(localPath);
            if (info) return localPathToFileUrl(localPath);

            if (nearbyFileApi && rootDirectoryPath) {
                const nearbyPath = await nearbyFileApi(rootDirectoryPath, candidate);
                if (nearbyPath) {
                    return localPathToFileUrl(nearbyPath);
                }
            }
        }
        return null;
    }

    return textureUrl(rootUrl, original);
}

async function resolveTextureUrlForMaterial(rootUrl: string, material: XMat): Promise<void> {
    if (!material.texture || material.texture.trim().length === 0) {
        material.textureUrl = null;
        material.sphereTexture = null;
        material.sphereTextureUrl = null;
        material.sphereTextureMode = null;
        return;
    }

    const parsed = parseCompositeTextureReference(material.texture);
    material.texture = parsed.diffuse;
    material.sphereTexture = parsed.sphere;
    material.sphereTextureMode = parsed.sphereMode;

    material.textureUrl = parsed.diffuse
        ? await resolveSingleTextureUrl(rootUrl, parsed.diffuse)
        : null;
    material.sphereTextureUrl = parsed.sphere
        ? await resolveSingleTextureUrl(rootUrl, parsed.sphere)
        : null;

    if (!material.textureUrl && parsed.diffuse) {
        console.warn(`[X] Texture not found: ${parsed.diffuse}`);
    }
    if (!material.sphereTextureUrl && parsed.sphere) {
        console.warn(`[X] Sphere texture not found: ${parsed.sphere}`);
    }
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

async function resolveSceneTextureUrls(scene: Scene, rootUrl: string, parsed: XScene): Promise<void> {
    const materials = gatherMaterials(parsed);
    const inspectAlpha = createXTextureAlphaCache(url => inspectXTextureAlpha(url, scene));
    for (const material of materials) {
        await resolveTextureUrlForMaterial(rootUrl, material);
        // Complete before building materials: preset defaults must capture the final alpha mode.
        // Unknown BMP layouts, TGA/WebP and explicit material translucency keep their established policy.
        if (material.textureUrl && /\.(?:png|bmp)(?:[?#]|$)/i.test(material.textureUrl)
            && resolveXMaterialRenderPolicy(material.diffuse.a, false) !== "blend") {
            material.textureIsOpaque = await inspectAlpha(material.textureUrl) === "opaque";
        }
    }
}

type XBuild = {
    meshes: Mesh[];
    nodes: TransformNode[];
    materials: Material[];
    cache: Map<XMat, MmdStandardMaterial>;
};

function buildMat(scene: Scene, m: XMat, build: XBuild): MmdStandardMaterial {
    const c = build.cache.get(m);
    if (c) return c;
    const mat = new MmdStandardMaterial(m.name || "x_material", scene);
    build.materials.push(mat);
    mat.toonTexture = getDefaultAccessoryToonTexture(scene);
    mat.ignoreDiffuseWhenToonTextureIsNull = true;
    mat.diffuseColor = new Color3(m.diffuse.r, m.diffuse.g, m.diffuse.b);
    mat.ambientColor = NON_TOON_SHADOW_AMBIENT.clone();
    mat.alpha = m.diffuse.a;
    mat.specularPower = m.power;
    mat.specularColor = m.specular.clone();
    mat.emissiveColor = m.emissive.clone();
    mat.backFaceCulling = false;
    const hasAlphaCapableTexture = Boolean(m.textureUrl && isAlphaCapableTextureUrl(m.textureUrl) && !m.textureIsOpaque);
    const renderPolicy = resolveXMaterialRenderPolicy(m.diffuse.a, hasAlphaCapableTexture);
    if (m.textureUrl) {
        const diffuseTexture = new Texture(m.textureUrl, scene, false, true);
        mat.diffuseTexture = diffuseTexture;

        // .x accessories bypass babylon-mmd's PMX alpha evaluation path, so
        // enable alpha usage for confirmed/unknown alpha, except verified opaque textures.
        // Opaque .x materials use alpha test for texture cutouts so foliage and
        // fences participate in the depth buffer instead of unstable mesh-level
        // alpha blending. Explicit material translucency remains alpha blended.
        if (hasAlphaCapableTexture) {
            diffuseTexture.hasAlpha = true;
            mat.useAlphaFromDiffuseTexture = true;
        }
    }
    if (renderPolicy === "cutout") {
        configureAlphaCutoutXMaterial(mat);
    } else if (renderPolicy === "blend") {
        configureAlphaBlendXMaterial(mat);
    }
    if (m.sphereTextureUrl) {
        const sphereTex = new Texture(m.sphereTextureUrl, scene, false, true);
        mat.sphereTexture = sphereTex;
        mat.sphereTextureBlendMode = m.sphereTextureMode === "add"
            ? MmdPluginMaterialSphereTextureBlendMode.Add
            : MmdPluginMaterialSphereTextureBlendMode.Multiply;
    }
    build.cache.set(m, mat);
    return mat;
}

function buildMesh(scene: Scene, x: XMesh, parent: TransformNode | null, build: XBuild): void {
    if (x.pos.length < 3 || x.faces.indices.length === 0) return;
    const redundant = findRedundantPackedXFaces({
        positions: x.pos,
        uvs: x.uvs,
        faces: x.faces,
        faceMaterials: x.faceMats,
    });
    const geometry = buildXMeshGeometry(x, redundant);
    if (!geometry.indices.length) return;
    if (!geometry.normals) {
        geometry.normals = new Float32Array(geometry.positions.length);
        VertexData.ComputeNormals(geometry.positions, geometry.indices, geometry.normals);
    }

    const name = x.name || "x_mesh";
    let material: Material;
    const materialSlots = new Map<number, number>();
    if (x.mats.length === 0) {
        const mat = new MmdStandardMaterial(`${name}_mat`, scene);
        build.materials.push(mat);
        mat.toonTexture = getDefaultAccessoryToonTexture(scene);
        mat.ignoreDiffuseWhenToonTextureIsNull = true;
        mat.diffuseColor = new Color3(0.8, 0.8, 0.8);
        mat.ambientColor = NON_TOON_SHADOW_AMBIENT.clone();
        mat.backFaceCulling = false;
        material = mat;
    } else if (geometry.ranges.length === 1) {
        material = buildMat(scene, x.mats[geometry.ranges[0].material], build);
    } else {
        const multi = new MultiMaterial(`${name}_multi`, scene);
        build.materials.push(multi);
        for (const range of geometry.ranges) {
            materialSlots.set(range.material, multi.subMaterials.length);
            multi.subMaterials.push(buildMat(scene, x.mats[range.material], build));
        }
        material = multi;
    }

    const engine = scene.getEngine() as { currentLimits?: { maxBufferSize: number } };
    const maxBufferBytes = engine.currentLimits?.maxBufferSize ?? 256 * 1024 * 1024;
    let partNumber = 0;
    const redundantFaceCount = redundant.reduce((sum, value) => sum + value, 0);
    for (const part of splitXMeshGeometry(geometry, maxBufferBytes)) {
        partNumber++;
        const mesh = new Mesh(partNumber === 1 ? name : `${name}_part${partNumber}`, scene);
        build.meshes.push(mesh);
        mesh.parent = parent;
        mesh.metadata = { mmdModokiXRedundantFaceCount: partNumber === 1 ? redundantFaceCount : 0 };
        const vd = new VertexData();
        vd.positions = part.positions;
        vd.indices = part.indices;
        vd.normals = part.normals;
        if (part.uvs) vd.uvs = part.uvs;
        vd.applyToMesh(mesh, true);
        mesh.material = material;
        if (material instanceof MultiMaterial) {
            mesh.releaseSubMeshes();
            for (const range of part.ranges) {
                new SubMesh(materialSlots.get(range.material) ?? 0, 0, part.positions.length / 3, range.start, range.count, mesh);
            }
        }
    }
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

function buildFrame(scene: Scene, f: XFrame, parent: TransformNode | null, build: XBuild): void {
    const node = new TransformNode(f.name || `x_frame_${build.nodes.length}`, scene);
    build.nodes.push(node);
    node.parent = parent;
    if (f.matrix && f.matrix.length === 16) applyMatrix(node, f.matrix);
    for (const m of f.meshes) buildMesh(scene, m, node, build);
    for (const c of f.frames) buildFrame(scene, c, node, build);
}

function buildScene(scene: Scene, parsed: XScene): { meshes: Mesh[]; nodes: TransformNode[] } {
    const build: XBuild = { meshes: [], nodes: [], materials: [], cache: new Map() };
    try {
        for (const m of parsed.root.meshes) buildMesh(scene, m, null, build);
        for (const f of parsed.root.frames) buildFrame(scene, f, null, build);
        return { meshes: build.meshes, nodes: build.nodes };
    } catch (error) {
        for (const mesh of build.meshes) mesh.dispose(true, false);
        for (const node of build.nodes) node.dispose(true);
        for (const mat of build.materials) {
            if (mat instanceof MmdStandardMaterial) {
                mat.diffuseTexture?.dispose();
                mat.sphereTexture?.dispose();
            }
            mat.dispose(false, false);
        }
        throw error;
    }
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

export async function loadXIntoScene(
    scene: Scene,
    data: unknown,
    rootUrl: string,
): Promise<ISceneLoaderAsyncResult> {
    const parsed = new XParser(new XTextReader(data)).parse();
    await resolveSceneTextureUrls(scene, rootUrl, parsed);
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
}

export class XFileLoader implements ISceneLoaderPluginAsync, ISceneLoaderPluginFactory {
    public readonly name = META.name;
    public readonly extensions = META.extensions;

    public createPlugin(options: SceneLoaderPluginOptions): ISceneLoaderPluginAsync {
        void options;
        return new XFileLoader();
    }

    public canDirectLoad(data: string): boolean {
        return X_TEXT_HEADER.test(data);
    }

    public importMeshAsync(
        _meshesNames: string | readonly string[] | null | undefined,
        scene: Scene,
        data: unknown,
        rootUrl: string,
    ): Promise<ISceneLoaderAsyncResult> {
        return loadXIntoScene(scene, data, rootUrl);
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
