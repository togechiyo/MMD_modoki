import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MmdManager } from "./mmd-manager";
import { isDebugLogEnabled, logDebugIfEnabled, logError, logInfo, logWarn, toLogErrorData } from "./app-logger";
import { applyWgslShaderPresetToMaterials } from "./scene/material-shader-service";
import { stabilizeLargeThinLoadedMesh } from "./scene/mesh-render-stability";
import { applyAccessoryCoplanarMaterialDepthBias } from "./scene/accessory-coplanar-depth-bias";
import { loadXIntoScene } from "./x-file-loader";
import type { ProjectSerializedAccessoryTransformTrack } from "./types";
import { copyProjectArrayToFloat32, copyProjectArrayToUint32, packFloat32Array, packFrameNumbers } from "./project/project-codec";
import { createObjLoaderForLocalMaterialData, prepareLocalObjMaterialBundle } from "./shared/obj-local-materials";

export type AccessoryKind = "x" | "glb" | "obj";

export type AccessoryState = {
    index: number;
    name: string;
    path: string;
    visible: boolean;
    castsShadow: boolean;
    kind: AccessoryKind;
};

export type AccessoryTransformState = {
    position: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    scale: number;
};

export type AccessoryParentState = {
    modelIndex: number | null;
    modelName: string | null;
    boneName: string | null;
};

type AccessoryTransformKeyframeState = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    rotations: Float32Array;
    scales: Float32Array;
};

declare module "./mmd-manager" {
    interface MmdManager {
        loadX(filePath: string): Promise<boolean>;
        loadGlb(filePath: string): Promise<boolean>;
        loadObj(filePath: string): Promise<boolean>;
        getLoadedAccessories(): AccessoryState[];
        clearAccessories(): void;
        setAccessoryVisibility(index: number, visible: boolean): boolean;
        toggleAccessoryVisibility(index: number): boolean;
        setAccessoryCastsShadow(index: number, castsShadow: boolean): boolean;
        refreshAccessoryShadowCasters(): void;
        removeAccessory(index: number): boolean;
        getAccessoryTransform(index: number): AccessoryTransformState | null;
        setAccessoryTransform(index: number, transform: Partial<AccessoryTransformState>): boolean;
        getAccessoryParent(index: number): AccessoryParentState | null;
        setAccessoryParent(index: number, modelIndex: number | null, boneName: string | null): boolean;
        hasAccessoryTransformKeyframe(index: number, frame: number): boolean;
        addAccessoryTransformKeyframe(index: number, frame: number): boolean;
        getAccessoryTransformKeyframes(index: number): ProjectSerializedAccessoryTransformTrack | null;
        setAccessoryTransformKeyframes(index: number, track: ProjectSerializedAccessoryTransformTrack | null): boolean;
        getModelBoneNames(modelIndex: number): string[];
        getAccessoryMeshes(): AbstractMesh[];
        getIblShadowAccessoryMeshes(): AbstractMesh[];
        refreshAccessoryCoplanarMaterialDepthBiasCorrection(strength: unknown): number;
    }
}

type XLoadHost = {
    scene: Scene;
    shadowGenerator: Pick<ShadowGenerator, "addShadowCaster" | "removeShadowCaster">;
    onError: ((message: string) => void) | null;
    onWarning?: ((message: string) => void) | null;
    applyToonShadowInfluenceToMeshes?: (meshes: Mesh[]) => void;
    getLoadedModels?: () => ArrayLike<unknown>;
    setCameraTarget?: (x: number, y: number, z: number) => void;
    setCameraDistance?: (distance: number) => void;
    syncIblShadowsScene?: () => void;
    refreshShadowAfterSceneContentChanged?: () => void;
    getShadowEnabled?: () => boolean;
    refreshMmdCoplanarMaterialDepthBiasCorrection?: () => number;
};

type AccessoryEntry = {
    kind: AccessoryKind;
    name: string;
    path: string;
    root: TransformNode;
    offset: TransformNode;
    baseScale: number;
    meshes: AbstractMesh[];
    castsShadow: boolean;
    parentModelRef: object | null;
    parentModelName: string | null;
    parentBoneName: string | null;
    parentBoneUseMeshWorldMatrix: boolean;
    transformKeyframes: AccessoryTransformKeyframeState;
};

const accessoryStore = new WeakMap<object, AccessoryEntry[]>();
const accessoryUpdateObserverRegistered = new WeakSet<object>();
const tempBoneMatrix = Matrix.Identity();
const tempScale = new Vector3(1, 1, 1);
const tempPosition = new Vector3();
const tempPosition2 = new Vector3();
const tempPosition3 = new Vector3();
const tempRotation = Quaternion.Identity();
const tempRotation2 = Quaternion.Identity();
const X_ACCESSORY_IMPORT_SCALE = 10;
const GLB_ACCESSORY_IMPORT_SCALE = 25;
const OBJ_ACCESSORY_IMPORT_SCALE = 10;
const GLB_ACCESSORY_MIN_VISIBLE_SIZE = 60;
const GLB_ACCESSORY_MAX_AUTO_SCALE = 400;
const GLB_DEBUG_FORCE_NEON_MATERIAL = false;
const GLB_DEBUG_SHOW_BOUNDING_BOX = false;
const GLB_DEBUG_SHOW_EDGES = false;

function getAccessoryEntries(host: object): AccessoryEntry[] {
    let entries = accessoryStore.get(host);
    if (!entries) {
        entries = [];
        accessoryStore.set(host, entries);
    }
    return entries;
}

function createEmptyAccessoryTransformKeyframes(): AccessoryTransformKeyframeState {
    return {
        frameNumbers: new Uint32Array(0),
        positions: new Float32Array(0),
        rotations: new Float32Array(0),
        scales: new Float32Array(0),
    };
}

function splitFilePath(filePath: string): { dir: string; fileName: string; fileUrl: string } {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const dir = normalizedPath.substring(0, lastSlash + 1);
    const fileName = normalizedPath.substring(lastSlash + 1);
    return {
        dir,
        fileName,
        fileUrl: `file:///${dir}`,
    };
}

function attachImportedNodesToAccessoryRoot(
    result: { transformNodes: TransformNode[]; meshes: AbstractMesh[] },
    offset: TransformNode,
): void {
    const importedNodes = new Set<object>();
    for (const node of result.transformNodes) importedNodes.add(node);
    for (const mesh of result.meshes) importedNodes.add(mesh);

    for (const node of result.transformNodes) {
        const parent = node.parent;
        if (!parent || !importedNodes.has(parent)) {
            node.parent = offset;
        }
    }
    for (const mesh of result.meshes) {
        const parent = mesh.parent;
        if (!parent || !importedNodes.has(parent)) {
            mesh.parent = offset;
        }
    }
}

function configureImportedAccessoryMeshes(host: XLoadHost, meshes: AbstractMesh[], managedMeshes: readonly AbstractMesh[]): void {
    const managedMeshSet = new Set(managedMeshes);

    for (const mesh of meshes) {
        const managed = managedMeshSet.has(mesh);
        mesh.setEnabled(true);
        mesh.isVisible = true;
        mesh.visibility = managed ? 1 : 0;
        mesh.receiveShadows = managed;
    }
}

function configureImportedGlbSourceMeshes(meshes: AbstractMesh[], sourceManagedMeshes: readonly AbstractMesh[]): void {
    const sourceManagedSet = new Set(sourceManagedMeshes);

    for (const mesh of meshes) {
        const isSourceManaged = sourceManagedSet.has(mesh);
        mesh.setEnabled(!isSourceManaged);
        mesh.isVisible = !isSourceManaged;
        mesh.visibility = isSourceManaged ? 0 : 1;
        mesh.receiveShadows = false;
    }
}

function configureImportedAccessoryTransformNodes(
    transformNodes: TransformNode[],
): void {
    for (const node of transformNodes) {
        node.setEnabled(true);
    }
}

function forceAccessoryHierarchyEnabled(nodes: readonly (AbstractMesh | TransformNode)[]): void {
    const visited = new Set<object>();

    for (const startNode of nodes) {
        let current: object | null = startNode;
        while (current && !visited.has(current)) {
            visited.add(current);

            if (current instanceof TransformNode) {
                current.setEnabled(true);
            }

            if (current instanceof Mesh) {
                current.setEnabled(true);
                current.isVisible = true;
            }

            const parent = (current as { parent?: object | null }).parent ?? null;
            current = parent;
        }
    }
}

function getAccessoryRenderableVertexCount(mesh: AbstractMesh): number {
    if (mesh instanceof Mesh) {
        const directVertexCount = mesh.getTotalVertices();
        if ((directVertexCount ?? 0) > 0) return directVertexCount;
    }

    const sourceMesh = (mesh as AbstractMesh & { sourceMesh?: Mesh | null }).sourceMesh;
    if (sourceMesh instanceof Mesh) {
        const sourceVertexCount = sourceMesh.getTotalVertices();
        if ((sourceVertexCount ?? 0) > 0) return sourceVertexCount;
    }

    const positions = mesh.getVerticesData?.(VertexBuffer.PositionKind);
    if (positions && positions.length >= 3) return Math.floor(positions.length / 3);

    const sourcePositions = sourceMesh?.getVerticesData(VertexBuffer.PositionKind);
    if (sourcePositions && sourcePositions.length >= 3) return Math.floor(sourcePositions.length / 3);

    return 0;
}

function getAccessoryRenderableIndexCount(mesh: AbstractMesh): number {
    if (mesh instanceof Mesh) {
        const directIndexCount = mesh.getTotalIndices();
        if ((directIndexCount ?? 0) > 0) return directIndexCount;
    }

    const sourceMesh = (mesh as AbstractMesh & { sourceMesh?: Mesh | null }).sourceMesh;
    if (sourceMesh instanceof Mesh) {
        const sourceIndexCount = sourceMesh.getTotalIndices();
        if ((sourceIndexCount ?? 0) > 0) return sourceIndexCount;
    }

    const indices = mesh.getIndices?.();
    if (indices && indices.length > 0) return indices.length;

    const sourceIndices = sourceMesh?.getIndices();
    if (sourceIndices && sourceIndices.length > 0) return sourceIndices.length;

    return 0;
}

function getManagedAccessoryMeshes(meshes: AbstractMesh[]): AbstractMesh[] {
    const managedMeshes: AbstractMesh[] = [];
    for (const mesh of meshes) {
        if ((mesh.subMeshes?.length ?? 0) === 0) continue;
        const vertexCount = getAccessoryRenderableVertexCount(mesh);
        const indexCount = getAccessoryRenderableIndexCount(mesh);
        if (vertexCount <= 0 || indexCount <= 0) continue;

        managedMeshes.push(mesh);
    }
    return managedMeshes;
}

function toFloat32VertexData(
    data: ArrayLike<number> | null,
    expectedStride: number,
    vertexCount: number,
): Float32Array | null {
    if (!data || vertexCount <= 0) return null;
    if (data.length !== vertexCount * expectedStride) return null;
    return Float32Array.from(data);
}

function toColor4VertexData(
    data: ArrayLike<number> | null,
    vertexCount: number,
): Float32Array | null {
    if (!data || vertexCount <= 0) return null;
    if (data.length === vertexCount * 4) {
        return Float32Array.from(data);
    }
    if (data.length !== vertexCount * 3) return null;

    const colors = new Float32Array(vertexCount * 4);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const sourceOffset = vertexIndex * 3;
        const targetOffset = vertexIndex * 4;
        colors[targetOffset + 0] = Number(data[sourceOffset + 0] ?? 0);
        colors[targetOffset + 1] = Number(data[sourceOffset + 1] ?? 0);
        colors[targetOffset + 2] = Number(data[sourceOffset + 2] ?? 0);
        colors[targetOffset + 3] = 1;
    }
    return colors;
}

function copyAbstractMeshWorldTransform(source: AbstractMesh, target: Mesh): void {
    const worldMatrix = source.computeWorldMatrix(true).clone();
    const scaling = new Vector3();
    const rotation = Quaternion.Identity();
    const position = new Vector3();
    worldMatrix.decompose(scaling, rotation, position);

    target.parent = null;
    target.position.copyFrom(position);
    target.scaling.copyFrom(scaling);
    target.rotationQuaternion = rotation.clone();
    target.rotation.set(0, 0, 0);
}

function createGlbReplacementMeshes(scene: Scene, offset: TransformNode, meshes: readonly AbstractMesh[]): Mesh[] {
    const replacements: Mesh[] = [];

    for (const abstractMesh of meshes) {
        if (!(abstractMesh instanceof Mesh)) continue;

        const sourceMesh = (abstractMesh as Mesh & { sourceMesh?: Mesh | null }).sourceMesh;
        const extracted = VertexData.ExtractFromMesh(abstractMesh, true, true)
            ?? (sourceMesh instanceof Mesh ? VertexData.ExtractFromMesh(sourceMesh, true, true) : null);
        const positions = extracted?.positions ?? null;
        const indices = extracted?.indices ?? null;
        if (!positions || positions.length < 3 || !indices || indices.length === 0) {
            logDebugIfEnabled("accessoryLoad", "asset", "glb replacement skipped", {
                meshName: abstractMesh.name,
                hasExtracted: Boolean(extracted),
                positions: positions?.length ?? 0,
                indices: indices?.length ?? 0,
                sourceMesh: sourceMesh?.name ?? null,
            });
            continue;
        }

        const vertexCount = Math.floor(positions.length / 3);
        if (vertexCount <= 0) continue;

        const safePositions = toFloat32VertexData(positions, 3, vertexCount);
        if (!safePositions) continue;

        const vertexData = new VertexData();
        vertexData.positions = safePositions;
        vertexData.indices = Uint32Array.from(indices);

        const normals = toFloat32VertexData(extracted.normals ?? null, 3, vertexCount);
        if (normals) {
            vertexData.normals = normals;
        } else {
            const computedNormals = new Float32Array(vertexCount * 3);
            VertexData.ComputeNormals(safePositions, vertexData.indices, computedNormals);
            vertexData.normals = computedNormals;
        }

        const tangents = toFloat32VertexData(extracted.tangents ?? null, 4, vertexCount);
        if (tangents) vertexData.tangents = tangents;

        const uvs = toFloat32VertexData(extracted.uvs ?? null, 2, vertexCount);
        if (uvs) vertexData.uvs = uvs;

        const uv2 = toFloat32VertexData(extracted.uvs2 ?? null, 2, vertexCount);
        if (uv2) vertexData.uvs2 = uv2;

        const colors = toColor4VertexData(extracted.colors ?? null, vertexCount);
        if (colors) vertexData.colors = colors;

        const replacement = new Mesh(`${abstractMesh.name}__glb_rebuilt`, scene);
        copyAbstractMeshWorldTransform(abstractMesh, replacement);
        replacement.setParent(offset, true);
        replacement.material = abstractMesh.material;
        replacement.renderingGroupId = abstractMesh.renderingGroupId;
        replacement.alphaIndex = abstractMesh.alphaIndex;
        replacement.isPickable = abstractMesh.isPickable;
        replacement.alwaysSelectAsActiveMesh = true;
        replacement.skeleton = null;

        vertexData.applyToMesh(replacement, false);
        stabilizeLargeThinLoadedMesh(replacement);
        replacements.push(replacement);
    }

    return replacements;
}

function normalizeAccessoryMaterialVisibility(material: Material | null): void {
    if (!material) return;
    const candidate = material as Material & Record<string, unknown>;
    const diffuseTextureHasAlpha = Boolean(candidate.diffuseTexture && typeof candidate.diffuseTexture === "object" && "hasAlpha" in candidate.diffuseTexture && candidate.diffuseTexture.hasAlpha);
    const albedoTextureHasAlpha = Boolean(candidate.albedoTexture && typeof candidate.albedoTexture === "object" && "hasAlpha" in candidate.albedoTexture && candidate.albedoTexture.hasAlpha);
    const hasOpacityTexture = Boolean(candidate.opacityTexture);
    const usesTextureAlpha = Boolean(candidate.useAlphaFromDiffuseTexture || candidate.useAlphaFromAlbedoTexture);
    const isTransparencyModeEnabled = typeof candidate.transparencyMode === "number" && candidate.transparencyMode !== 0;
    const hasTransparentTexturePath = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled;

    if (candidate.alpha === 0 && !hasTransparentTexturePath && !isTransparencyModeEnabled) {
        candidate.alpha = 1;
    }

    if ("disableLighting" in candidate && typeof candidate.disableLighting === "boolean" && candidate.disableLighting) {
        candidate.disableLighting = false;
    }
}

function collectAccessoryMaterials(meshes: readonly AbstractMesh[]): Material[] {
    const materials: Material[] = [];
    const seen = new Set<object>();

    const register = (material: Material | null | undefined): void => {
        if (!(material instanceof Material)) return;
        if (seen.has(material as object)) return;
        seen.add(material as object);
        materials.push(material);
    };

    for (const mesh of meshes) {
        const material = mesh.material;
        if (material instanceof MultiMaterial) {
            for (const subMaterial of material.subMaterials) {
                register(subMaterial ?? null);
            }
            continue;
        }

        register(material ?? null);
    }

    return materials;
}

function prepareManagedAccessoryMeshes(host: XLoadHost, meshes: AbstractMesh[], castShadows: boolean): AbstractMesh[] {
    for (const mesh of meshes) {
        mesh.visibility = 1;
        mesh.isVisible = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.receiveShadows = true;
        mesh.showBoundingBox = GLB_DEBUG_SHOW_BOUNDING_BOX;
        stabilizeLargeThinLoadedMesh(mesh);
        normalizeAccessoryMaterialVisibility(mesh.material);
        if (GLB_DEBUG_SHOW_EDGES && mesh instanceof Mesh) {
            mesh.enableEdgesRendering();
            mesh.edgesWidth = 6;
            mesh.edgesColor = new Color4(1, 0, 0.2, 1);
        }
        if (castShadows) {
            host.shadowGenerator.addShadowCaster(mesh, false);
        }
    }
    return meshes;
}

function excludeGlbAccessoryMeshesFromDepthAndShadow(host: XLoadHost, meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
        mesh.receiveShadows = false;

        if (typeof host.shadowGenerator.removeShadowCaster === "function") {
            host.shadowGenerator.removeShadowCaster(mesh, false);
        }

        const material = mesh.material;
        if (!material) continue;

        material.disableDepthWrite = true;
        material.needDepthPrePass = false;
    }
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function readColor3Like(value: unknown, fallback: Color3): Color3 {
    if (value && typeof value === "object") {
        const source = value as { r?: unknown; g?: unknown; b?: unknown };
        if (Number.isFinite(source.r) && Number.isFinite(source.g) && Number.isFinite(source.b)) {
            return new Color3(Number(source.r), Number(source.g), Number(source.b));
        }
    }
    return fallback.clone();
}

function copyCommonMaterialFlags(source: Record<string, unknown>, target: StandardMaterial): void {
    if (Number.isFinite(source.alpha)) target.alpha = Number(source.alpha);
    if (Number.isFinite(source.alphaCutOff)) target.alphaCutOff = Number(source.alphaCutOff);
    if (typeof source.backFaceCulling === "boolean") target.backFaceCulling = source.backFaceCulling;
    if (typeof source.sideOrientation === "number") target.sideOrientation = source.sideOrientation;
    if (typeof source.disableLighting === "boolean") target.disableLighting = source.disableLighting;
    if (typeof source.useAlphaFromAlbedoTexture === "boolean") target.useAlphaFromDiffuseTexture = source.useAlphaFromAlbedoTexture;
    if (typeof source.useAlphaFromBaseColorTexture === "boolean") target.useAlphaFromDiffuseTexture = source.useAlphaFromBaseColorTexture;
    if (typeof source.useAlphaFromDiffuseTexture === "boolean") target.useAlphaFromDiffuseTexture = source.useAlphaFromDiffuseTexture;
    if (typeof source.transparencyMode === "number") target.transparencyMode = source.transparencyMode;
}

function applyGlbDebugVisibilityMaterialTuning(target: StandardMaterial): void {
    if (!GLB_DEBUG_FORCE_NEON_MATERIAL) return;

    target.diffuseTexture = null;
    target.opacityTexture = null;
    target.emissiveTexture = null;
    target.ambientTexture = null;
    target.bumpTexture = null;
    target.alpha = 1;
    target.disableLighting = true;
    target.backFaceCulling = false;
    target.specularColor = Color3.Black();
    target.diffuseColor = new Color3(0.05, 0.95, 0.3);
    target.emissiveColor = new Color3(0.2, 1.0, 0.45);
    target.ambientColor = Color3.Black();
}

function convertAccessoryMaterialToStandard(
    sourceMaterial: Material,
    scene: Scene,
    cache: Map<Material, Material>,
): Material {
    const cached = cache.get(sourceMaterial);
    if (cached) return cached;

    if (sourceMaterial instanceof MultiMaterial) {
        const converted = new MultiMaterial(`${sourceMaterial.name}_glbMulti`, scene);
        cache.set(sourceMaterial, converted);
        converted.subMaterials = sourceMaterial.subMaterials.map((subMaterial) => (
            subMaterial ? convertAccessoryMaterialToStandard(subMaterial, scene, cache) : null
        ));
        return converted;
    }

    if (sourceMaterial instanceof StandardMaterial) {
        applyGlbDebugVisibilityMaterialTuning(sourceMaterial);
        cache.set(sourceMaterial, sourceMaterial);
        return sourceMaterial;
    }

    const source = sourceMaterial as Material & Record<string, unknown>;
    const converted = new StandardMaterial(`${sourceMaterial.name || "glb"}_fallback`, scene);
    cache.set(sourceMaterial, converted);

    copyCommonMaterialFlags(source, converted);

    if ("albedoTexture" in source) converted.diffuseTexture = (source.albedoTexture as StandardMaterial["diffuseTexture"]) ?? null;
    else if ("baseColorTexture" in source) converted.diffuseTexture = (source.baseColorTexture as StandardMaterial["diffuseTexture"]) ?? null;
    else if ("diffuseTexture" in source) converted.diffuseTexture = (source.diffuseTexture as StandardMaterial["diffuseTexture"]) ?? null;

    if ("opacityTexture" in source) converted.opacityTexture = (source.opacityTexture as StandardMaterial["opacityTexture"]) ?? null;
    if ("emissiveTexture" in source) converted.emissiveTexture = (source.emissiveTexture as StandardMaterial["emissiveTexture"]) ?? null;
    if ("bumpTexture" in source) converted.bumpTexture = (source.bumpTexture as StandardMaterial["bumpTexture"]) ?? null;
    if ("ambientTexture" in source) converted.ambientTexture = (source.ambientTexture as StandardMaterial["ambientTexture"]) ?? null;

    converted.diffuseColor = readColor3Like(
        source.albedoColor ?? source.baseColor ?? source.diffuseColor,
        Color3.White(),
    );
    converted.emissiveColor = readColor3Like(source.emissiveColor, Color3.Black());
    converted.ambientColor = readColor3Like(source.ambientColor, Color3.Black());
    converted.backFaceCulling = false;
    if (converted.ambientColor.r === 0 && converted.ambientColor.g === 0 && converted.ambientColor.b === 0) {
        converted.ambientColor = new Color3(0.2, 0.2, 0.2);
    }

    if ("specularColor" in source) {
        converted.specularColor = readColor3Like(source.specularColor, new Color3(0.12, 0.12, 0.12));
    } else {
        const metallic = Number.isFinite(source.metallic) ? clamp01(Number(source.metallic)) : 0;
        const roughness = Number.isFinite(source.roughness) ? clamp01(Number(source.roughness)) : 0.5;
        const specularLevel = 0.08 + metallic * 0.32;
        const gloss = 1 - roughness;
        converted.specularColor = new Color3(specularLevel, specularLevel, specularLevel).scale(0.35 + gloss * 0.65);
        converted.roughness = roughness;
        converted.specularPower = Math.max(8, 16 + gloss * gloss * 240);
    }

    applyGlbDebugVisibilityMaterialTuning(converted);

    return converted;
}

function normalizeGlbAccessoryMaterials(host: XLoadHost, meshes: readonly AbstractMesh[]): void {
    if (!host.scene.getEngine().isWebGPU) return;

    const cache = new Map<Material, Material>();
    for (const mesh of meshes) {
        const material = mesh.material;
        if (!material) continue;
        mesh.material = convertAccessoryMaterialToStandard(material, host.scene, cache);
    }
}

function getAccessoryBaseScale(entry: AccessoryEntry): number {
    return Number.isFinite(entry.baseScale) && entry.baseScale > 0 ? entry.baseScale : 1;
}

function getAccessoryRelativeScale(entry: AccessoryEntry): number {
    const baseScale = getAccessoryBaseScale(entry);
    const currentScale = (entry.offset.scaling.x + entry.offset.scaling.y + entry.offset.scaling.z) / 3;
    return currentScale / baseScale;
}

function autoPlaceGlbAccessory(offset: TransformNode): void {
    offset.computeWorldMatrix(true);
    let bounds = offset.getHierarchyBoundingVectors(true);
    const size = bounds.max.subtract(bounds.min);
    const maxDimension = Math.max(size.x, size.y, size.z);

    if (Number.isFinite(maxDimension) && maxDimension > 0 && maxDimension < GLB_ACCESSORY_MIN_VISIBLE_SIZE) {
        const scaleMultiplier = Math.min(GLB_ACCESSORY_MAX_AUTO_SCALE, GLB_ACCESSORY_MIN_VISIBLE_SIZE / maxDimension);
        offset.scaling.scaleInPlace(scaleMultiplier);
        offset.computeWorldMatrix(true);
        bounds = offset.getHierarchyBoundingVectors(true);
    }

    const centerX = (bounds.min.x + bounds.max.x) * 0.5;
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
    offset.position.x -= centerX;
    offset.position.y -= bounds.min.y;
    offset.position.z -= centerZ;
    offset.computeWorldMatrix(true);

    const adjustedBounds = offset.getHierarchyBoundingVectors(true);
    const adjustedSize = adjustedBounds.max.subtract(adjustedBounds.min);
    logDebugIfEnabled("accessoryLoad", "asset", "glb accessory auto placed", {
        accessoryName: offset.name,
        scale: offset.scaling.x,
        position: {
            x: offset.position.x,
            y: offset.position.y,
            z: offset.position.z,
        },
        size: {
            x: adjustedSize.x,
            y: adjustedSize.y,
            z: adjustedSize.z,
        },
    });
}

function frameGlbAccessoryInCamera(host: XLoadHost, offset: TransformNode): void {
    if (!host.setCameraTarget || !host.setCameraDistance) return;
    if ((host.getLoadedModels?.().length ?? 0) > 0) return;

    offset.computeWorldMatrix(true);
    const bounds = offset.getHierarchyBoundingVectors(true);
    const center = bounds.min.add(bounds.max).scale(0.5);
    const size = bounds.max.subtract(bounds.min);
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const distance = Math.max(8, Math.min(80, maxDimension * 4));

    host.setCameraTarget(center.x, center.y, center.z);
    host.setCameraDistance(distance);

    logDebugIfEnabled("accessoryLoad", "asset", "glb accessory camera framed", {
        accessoryName: offset.name,
        target: {
            x: center.x,
            y: center.y,
            z: center.z,
        },
        distance,
    });
}

function logGlbImportDebug(
    accessoryName: string,
    result: { transformNodes: TransformNode[]; meshes: AbstractMesh[] },
    managedMeshes: readonly AbstractMesh[],
): void {
    if (!isDebugLogEnabled("accessoryLoad")) return;

    const managedMeshSet = new Set(managedMeshes);
    const meshRows = result.meshes.map((mesh) => {
        const sourceMesh = (mesh as AbstractMesh & { sourceMesh?: Mesh | null }).sourceMesh;
        const material = mesh.material;
        const absolutePosition = mesh.getAbsolutePosition();
        const positionVertexBuffer = mesh.getVertexBuffer?.(VertexBuffer.PositionKind)
            ?? sourceMesh?.getVertexBuffer(VertexBuffer.PositionKind)
            ?? null;
        return {
            name: mesh.name,
            className: typeof (mesh as { getClassName?: () => string }).getClassName === "function"
                ? (mesh as { getClassName: () => string }).getClassName()
                : "Unknown",
            parent: mesh.parent?.name ?? null,
            sourceMesh: sourceMesh?.name ?? null,
            managed: managedMeshSet.has(mesh),
            enabled: mesh.isEnabled(),
            visible: mesh.isVisible,
            vertices: getAccessoryRenderableVertexCount(mesh),
            indices: getAccessoryRenderableIndexCount(mesh),
            subMeshes: mesh.subMeshes?.length ?? 0,
            positionStride: positionVertexBuffer?.byteStride ?? null,
            material: material?.name ?? null,
            materialClass: typeof (material as { getClassName?: () => string } | null)?.getClassName === "function"
                ? (material as { getClassName: () => string }).getClassName()
                : null,
            position: `${absolutePosition.x.toFixed(2)}, ${absolutePosition.y.toFixed(2)}, ${absolutePosition.z.toFixed(2)}`,
        };
    });

    const transformRows = result.transformNodes.map((node) => {
        const absolutePosition = node.getAbsolutePosition();
        return {
            name: node.name,
            parent: node.parent?.name ?? null,
            enabled: node.isEnabled(),
            position: `${absolutePosition.x.toFixed(2)}, ${absolutePosition.y.toFixed(2)}, ${absolutePosition.z.toFixed(2)}`,
        };
    });

    logDebugIfEnabled("accessoryLoad", "asset", "GLB import debug rows", {
        accessoryName,
        meshRows,
        transformRows,
    });
}

function logGlbReplacementDebug(accessoryName: string, meshes: readonly AbstractMesh[]): void {
    if (!isDebugLogEnabled("accessoryLoad")) return;
    if (meshes.length === 0) return;

    const replacementRows = meshes.map((mesh) => {
        const absolutePosition = mesh.getAbsolutePosition();
        const bounds = mesh.getBoundingInfo().boundingBox;
        const size = bounds.maximumWorld.subtract(bounds.minimumWorld);
        const positionVertexBuffer = mesh.getVertexBuffer?.(VertexBuffer.PositionKind) ?? null;
        return {
            name: mesh.name,
            parent: mesh.parent?.name ?? null,
            enabled: mesh.isEnabled(),
            visible: mesh.isVisible,
            vertices: getAccessoryRenderableVertexCount(mesh),
            indices: getAccessoryRenderableIndexCount(mesh),
            subMeshes: mesh.subMeshes?.length ?? 0,
            positionStride: positionVertexBuffer?.byteStride ?? null,
            position: `${absolutePosition.x.toFixed(2)}, ${absolutePosition.y.toFixed(2)}, ${absolutePosition.z.toFixed(2)}`,
            size: `${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`,
            material: mesh.material?.name ?? null,
        };
    });

    logDebugIfEnabled("accessoryLoad", "asset", "GLB replacement debug rows", {
        accessoryName,
        replacementRows,
    });
}

function createAccessoryEntryFromImport(
    host: XLoadHost & object,
    kind: AccessoryKind,
    filePath: string,
    accessoryName: string,
    result: { transformNodes: TransformNode[]; meshes: AbstractMesh[] },
    importScale: number,
): AccessoryEntry {
    const entries = getAccessoryEntries(host);
    const root = new TransformNode(`${kind}_accessory_root_${entries.length}`, host.scene);
    root.name = `${accessoryName}_root`;
    const offset = new TransformNode(`${kind}_accessory_offset_${entries.length}`, host.scene);
    offset.name = `${accessoryName}_offset`;
    offset.parent = root;
    offset.scaling.set(importScale, importScale, importScale);

    attachImportedNodesToAccessoryRoot(result, offset);
    let managedMeshes = getManagedAccessoryMeshes(result.meshes);
    let hierarchyMeshes = result.meshes;
    if (kind === "glb") {
        normalizeGlbAccessoryMaterials(host, managedMeshes);
    }
    if (kind === "glb" && managedMeshes.length === 0) {
        logWarn("asset", "glb managed mesh filter matched no meshes", {
            accessoryName,
            meshCount: result.meshes.length,
            meshes: result.meshes.map((mesh) => ({
                name: mesh.name,
                className: typeof (mesh as { getClassName?: () => string }).getClassName === "function"
                    ? (mesh as { getClassName: () => string }).getClassName()
                    : "Unknown",
                subMeshes: mesh.subMeshes?.length ?? 0,
                vertexCount: getAccessoryRenderableVertexCount(mesh),
                indexCount: getAccessoryRenderableIndexCount(mesh),
                hasPositions: (mesh.getVerticesData?.(VertexBuffer.PositionKind)?.length ?? 0) > 0,
                sourceMesh: (mesh as AbstractMesh & { sourceMesh?: Mesh | null }).sourceMesh?.name ?? null,
            })),
        });
    }
    configureImportedAccessoryTransformNodes(result.transformNodes);
    if (kind === "glb") {
        const sourceManagedMeshes = managedMeshes;
        managedMeshes = createGlbReplacementMeshes(host.scene, offset, sourceManagedMeshes);
        configureImportedGlbSourceMeshes(result.meshes, sourceManagedMeshes);
        const sourceManagedSet = new Set(sourceManagedMeshes);
        hierarchyMeshes = result.meshes.filter((mesh) => !sourceManagedSet.has(mesh));
    } else {
        configureImportedAccessoryMeshes(host, result.meshes, managedMeshes);
    }
    forceAccessoryHierarchyEnabled([...result.transformNodes, ...hierarchyMeshes, ...managedMeshes]);
    prepareManagedAccessoryMeshes(host, managedMeshes, kind !== "glb");
    if (kind === "x") {
        const accessoryMaterials = collectAccessoryMaterials(managedMeshes);
        applyWgslShaderPresetToMaterials(
            host as Parameters<typeof applyWgslShaderPresetToMaterials>[0],
            accessoryMaterials,
            "wgsl-accessory-toon",
        );
    }
    if (kind === "glb") {
        excludeGlbAccessoryMeshesFromDepthAndShadow(host, managedMeshes);
    }
    if (kind === "glb" && managedMeshes.length > 0) {
        autoPlaceGlbAccessory(offset);
        frameGlbAccessoryInCamera(host, offset);
    }
    if (kind === "glb") {
        logGlbImportDebug(accessoryName, result, managedMeshes);
        logGlbReplacementDebug(accessoryName, managedMeshes);
    }
    const baseScale = (offset.scaling.x + offset.scaling.y + offset.scaling.z) / 3;

    const entry: AccessoryEntry = {
        kind,
        name: accessoryName,
        path: filePath,
        root,
        offset,
        baseScale,
        meshes: managedMeshes,
        castsShadow: kind !== "glb",
        parentModelRef: null,
        parentModelName: null,
        parentBoneName: null,
        parentBoneUseMeshWorldMatrix: false,
        transformKeyframes: createEmptyAccessoryTransformKeyframes(),
    };
    entries.push(entry);
    ensureAccessoryUpdateObserver(host);

    if (kind === "glb") {
        const observer = host.scene.onBeforeRenderObservable.add(() => {
            forceAccessoryHierarchyEnabled([...result.transformNodes, ...hierarchyMeshes, ...managedMeshes]);
            host.scene.onBeforeRenderObservable.remove(observer);
        });
    }

    return entry;
}

function findFrameInsertionIndex(frames: Uint32Array, frame: number): { index: number; exists: boolean } {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (frames[mid] < normalizedFrame) lo = mid + 1;
        else hi = mid;
    }
    return { index: lo, exists: lo < frames.length && frames[lo] === normalizedFrame };
}

function insertFrameNumbers(frames: Uint32Array, frame: number): { frames: Uint32Array; index: number; exists: boolean } {
    const { index, exists } = findFrameInsertionIndex(frames, frame);
    const normalizedFrame = Math.max(0, Math.floor(frame));
    if (exists) {
        return { frames, index, exists: true };
    }

    const next = new Uint32Array(frames.length + 1);
    next.set(frames.subarray(0, index), 0);
    next[index] = normalizedFrame;
    next.set(frames.subarray(index), index + 1);
    return { frames: next, index, exists: false };
}

function insertFloatValues(
    values: Float32Array,
    stride: number,
    frameIndex: number,
    exists: boolean,
    block: readonly number[],
): Float32Array {
    const sourceFrameCount = Math.floor(values.length / stride);
    const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
    const next = new Float32Array(targetFrameCount * stride);

    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex ? sourceFrameIndex + 1 : sourceFrameIndex;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        next.set(values.subarray(sourceOffset, sourceOffset + stride), targetOffset);
    }

    const writeOffset = frameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        next[writeOffset + i] = Number.isFinite(block[i]) ? Number(block[i]) : 0;
    }

    return next;
}

function upsertAccessoryTransformKeyframes(
    entry: AccessoryEntry,
    frame: number,
): boolean {
    const transform = {
        position: {
            x: entry.offset.position.x,
            y: entry.offset.position.y,
            z: entry.offset.position.z,
        },
        rotationDeg: {
            x: toDegrees(entry.offset.rotationQuaternion ? entry.offset.rotationQuaternion.toEulerAngles().x : entry.offset.rotation.x),
            y: toDegrees(entry.offset.rotationQuaternion ? entry.offset.rotationQuaternion.toEulerAngles().y : entry.offset.rotation.y),
            z: toDegrees(entry.offset.rotationQuaternion ? entry.offset.rotationQuaternion.toEulerAngles().z : entry.offset.rotation.z),
        },
        scale: getAccessoryRelativeScale(entry),
    };
    const frameEdit = insertFrameNumbers(entry.transformKeyframes.frameNumbers, frame);

    entry.transformKeyframes.frameNumbers = frameEdit.frames;
    entry.transformKeyframes.positions = insertFloatValues(entry.transformKeyframes.positions, 3, frameEdit.index, frameEdit.exists, [
        transform.position.x,
        transform.position.y,
        transform.position.z,
    ]);
    entry.transformKeyframes.rotations = insertFloatValues(entry.transformKeyframes.rotations, 3, frameEdit.index, frameEdit.exists, [
        transform.rotationDeg.x,
        transform.rotationDeg.y,
        transform.rotationDeg.z,
    ]);
    entry.transformKeyframes.scales = insertFloatValues(entry.transformKeyframes.scales, 1, frameEdit.index, frameEdit.exists, [transform.scale]);
    return true;
}

function getSceneModels(host: object): Array<{ model: object; mesh: AbstractMesh; info?: { name?: string; boneNames?: string[] } }> {
    const value = (host as { sceneModels?: unknown }).sceneModels;
    if (!Array.isArray(value)) return [];
    return value as Array<{ model: object; mesh: AbstractMesh; info?: { name?: string; boneNames?: string[] } }>;
}

function getModelEntryByIndex(
    host: object,
    modelIndex: number | null,
): { model: object; mesh: AbstractMesh; info?: { name?: string; boneNames?: string[] } } | null {
    if (modelIndex === null || !Number.isInteger(modelIndex)) return null;
    const sceneModels = getSceneModels(host);
    return sceneModels[modelIndex] ?? null;
}

function getModelEntryByRef(
    host: object,
    modelRef: object | null,
): { model: object; mesh: AbstractMesh; info?: { name?: string; boneNames?: string[] } } | null {
    if (!modelRef) return null;
    const sceneModels = getSceneModels(host);
    return sceneModels.find((entry) => entry.model === modelRef) ?? null;
}

function findRuntimeBone(modelRef: object, boneName: string | null): {
    name: string;
    getWorldMatrixToRef: (result: Matrix) => void;
    getWorldTranslationToRef?: (result: Vector3) => void;
} | null {
    if (!boneName || boneName.length === 0) return null;
    const runtimeBones = (modelRef as { runtimeBones?: unknown }).runtimeBones;
    if (!Array.isArray(runtimeBones)) return null;

    for (const runtimeBone of runtimeBones as Array<{ name?: string; getWorldMatrixToRef?: (result: Matrix) => void; getWorldTranslationToRef?: (result: Vector3) => void }>) {
        if (runtimeBone?.name !== boneName) continue;
        if (typeof runtimeBone.getWorldMatrixToRef !== "function") continue;
        return {
            name: runtimeBone.name,
            getWorldMatrixToRef: runtimeBone.getWorldMatrixToRef.bind(runtimeBone),
            getWorldTranslationToRef: typeof runtimeBone.getWorldTranslationToRef === "function"
                ? runtimeBone.getWorldTranslationToRef.bind(runtimeBone)
                : undefined,
        };
    }

    return null;
}

function detectRuntimeBoneUsesMeshWorldMatrix(modelEntry: { model: object; mesh: AbstractMesh }): boolean {
    const runtimeBones = (modelEntry.model as { runtimeBones?: unknown }).runtimeBones;
    if (!Array.isArray(runtimeBones) || runtimeBones.length === 0) return false;

    const first = runtimeBones[0] as { getWorldTranslationToRef?: (result: Vector3) => void };
    if (!first || typeof first.getWorldTranslationToRef !== "function") return false;

    first.getWorldTranslationToRef(tempPosition);
    const meshWorld = modelEntry.mesh.computeWorldMatrix(true);
    Vector3.TransformCoordinatesToRef(tempPosition, meshWorld, tempPosition2);
    const meshPos = modelEntry.mesh.getAbsolutePosition();
    const rawDistance = Vector3.DistanceSquared(tempPosition, meshPos);
    const transformedDistance = Vector3.DistanceSquared(tempPosition2, meshPos);
    return transformedDistance <= rawDistance;
}

function setAnchorIdentity(node: TransformNode): void {
    node.parent = null;
    node.position.set(0, 0, 0);
    node.scaling.set(1, 1, 1);
    if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.Identity();
    node.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
    node.rotation.set(0, 0, 0);
}

function applyBoneAnchorTransform(
    modelEntry: { mesh: AbstractMesh },
    runtimeBone: { getWorldMatrixToRef: (result: Matrix) => void },
    useMeshWorldMatrix: boolean,
    anchor: TransformNode,
): void {
    runtimeBone.getWorldMatrixToRef(tempBoneMatrix);
    tempBoneMatrix.decompose(tempScale, tempRotation, tempPosition);

    if (useMeshWorldMatrix) {
        const meshWorld = modelEntry.mesh.computeWorldMatrix(true);
        Vector3.TransformCoordinatesToRef(tempPosition, meshWorld, tempPosition2);
        meshWorld.decompose(tempScale, tempRotation2, tempPosition3);
        tempRotation2.multiplyToRef(tempRotation, tempRotation);
        tempPosition.copyFrom(tempPosition2);
    }

    anchor.parent = null;
    anchor.position.copyFrom(tempPosition);
    anchor.scaling.set(1, 1, 1);
    if (!anchor.rotationQuaternion) anchor.rotationQuaternion = Quaternion.Identity();
    tempRotation.normalize();
    anchor.rotationQuaternion.copyFrom(tempRotation);
    anchor.rotation.set(0, 0, 0);
}

function syncAccessoryAttachment(host: object, entry: AccessoryEntry): void {
    const modelEntry = getModelEntryByRef(host, entry.parentModelRef);
    if (!modelEntry) {
        setAnchorIdentity(entry.root);
        return;
    }

    if (!entry.parentBoneName) {
        entry.root.parent = modelEntry.mesh;
        entry.root.position.set(0, 0, 0);
        entry.root.scaling.set(1, 1, 1);
        if (!entry.root.rotationQuaternion) entry.root.rotationQuaternion = Quaternion.Identity();
        entry.root.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
        entry.root.rotation.set(0, 0, 0);
        return;
    }

    const runtimeBone = findRuntimeBone(modelEntry.model, entry.parentBoneName);
    if (!runtimeBone) {
        entry.parentBoneName = null;
        entry.root.parent = modelEntry.mesh;
        entry.root.position.set(0, 0, 0);
        entry.root.scaling.set(1, 1, 1);
        if (!entry.root.rotationQuaternion) entry.root.rotationQuaternion = Quaternion.Identity();
        entry.root.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
        entry.root.rotation.set(0, 0, 0);
        return;
    }

    applyBoneAnchorTransform(modelEntry, runtimeBone, entry.parentBoneUseMeshWorldMatrix, entry.root);
}

function ensureAccessoryUpdateObserver(host: XLoadHost & object): void {
    if (accessoryUpdateObserverRegistered.has(host)) return;

    host.scene.onBeforeRenderObservable.add(() => {
        const entries = getAccessoryEntries(host);
        for (const entry of entries) {
            syncAccessoryAttachment(host, entry);
        }
    });

    accessoryUpdateObserverRegistered.add(host);
}

function isAccessoryVisible(entry: AccessoryEntry): boolean {
    if (!entry.root.isEnabled()) return false;
    for (const mesh of entry.meshes) {
        if (mesh.isEnabled() && mesh.isVisible) return true;
    }
    return entry.meshes.length === 0;
}

function setAccessoryVisible(entry: AccessoryEntry, visible: boolean): void {
    entry.root.setEnabled(visible);
    for (const mesh of entry.meshes) {
        mesh.setEnabled(visible);
        mesh.isVisible = visible;
    }
}

function applyAccessoryShadowCasterState(host: XLoadHost, entry: AccessoryEntry): void {
    const enabled = entry.castsShadow && (host.getShadowEnabled?.() ?? true);
    for (const mesh of entry.meshes) {
        if (enabled) {
            host.shadowGenerator.addShadowCaster(mesh, false);
        } else {
            host.shadowGenerator.removeShadowCaster(mesh, false);
        }
    }
}

function isIblShadowAccessoryMeshCandidate(mesh: AbstractMesh): mesh is Mesh {
    if (!(mesh instanceof Mesh)) return false;
    if (mesh.isDisposed()) return false;
    if (!mesh.isEnabled() || !mesh.isVisible) return false;
    if ((mesh.getTotalVertices?.() ?? 0) <= 0) return false;
    return true;
}

function toDegrees(rad: number): number {
    return rad * (180 / Math.PI);
}

function toRadians(deg: number): number {
    return deg * (Math.PI / 180);
}

const mmdManagerProto = MmdManager.prototype as unknown as {
    loadX?: (filePath: string) => Promise<boolean>;
    loadGlb?: (filePath: string) => Promise<boolean>;
    loadObj?: (filePath: string) => Promise<boolean>;
    getLoadedAccessories?: () => AccessoryState[];
    clearAccessories?: () => void;
    setAccessoryVisibility?: (index: number, visible: boolean) => boolean;
    toggleAccessoryVisibility?: (index: number) => boolean;
    setAccessoryCastsShadow?: (index: number, castsShadow: boolean) => boolean;
    refreshAccessoryShadowCasters?: () => void;
    removeAccessory?: (index: number) => boolean;
    getAccessoryTransform?: (index: number) => AccessoryTransformState | null;
    setAccessoryTransform?: (index: number, transform: Partial<AccessoryTransformState>) => boolean;
    getAccessoryParent?: (index: number) => AccessoryParentState | null;
    setAccessoryParent?: (index: number, modelIndex: number | null, boneName: string | null) => boolean;
    hasAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
    addAccessoryTransformKeyframe?: (index: number, frame: number) => boolean;
    getAccessoryTransformKeyframes?: (index: number) => ProjectSerializedAccessoryTransformTrack | null;
    setAccessoryTransformKeyframes?: (index: number, track: ProjectSerializedAccessoryTransformTrack | null) => boolean;
    getModelBoneNames?: (modelIndex: number) => string[];
    getAccessoryMeshes?: () => AbstractMesh[];
    getIblShadowAccessoryMeshes?: () => AbstractMesh[];
    refreshAccessoryCoplanarMaterialDepthBiasCorrection?: (strength: unknown) => number;
};

if (!mmdManagerProto.loadX) {
    mmdManagerProto.loadX = async function(filePath: string): Promise<boolean> {
        const host = this as unknown as XLoadHost;
        try {
            const { fileName, fileUrl } = splitFilePath(filePath);
            logInfo("asset", "x accessory load started", { filePath, fileName });
            const data = await window.electronAPI.readBinaryFile(filePath);
            if (!data) {
                throw new Error(`Unable to read X file: ${filePath}`);
            }

            const result = await loadXIntoScene(host.scene, data, fileUrl);

            if (result.meshes.length === 0) {
                throw new Error("No mesh data found in X file");
            }

            const accessoryName = fileName.replace(/\.[^/.]+$/, "") || fileName;
            createAccessoryEntryFromImport(
                host as XLoadHost & object,
                "x",
                filePath,
                accessoryName,
                {
                    transformNodes: result.transformNodes,
                    meshes: result.meshes as AbstractMesh[],
                },
                X_ACCESSORY_IMPORT_SCALE,
            );
            host.applyToonShadowInfluenceToMeshes?.(result.meshes as Mesh[]);
            const coplanarBiasedMaterialCount = host.refreshMmdCoplanarMaterialDepthBiasCorrection?.() ?? 0;
            const redundantFaceCount = result.meshes.reduce((count, mesh) => {
                const metadata = mesh.metadata as { mmdModokiXRedundantFaceCount?: unknown } | null;
                const value = metadata?.mmdModokiXRedundantFaceCount;
                return count + (Number.isFinite(value) ? Number(value) : 0);
            }, 0);
            host.syncIblShadowsScene?.();
            host.refreshShadowAfterSceneContentChanged?.();

            logInfo("asset", "x accessory load completed", {
                filePath,
                fileName,
                accessoryName,
                meshCount: result.meshes.length,
                coplanarBiasedMaterialCount,
                redundantFaceCount,
            });
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logError("asset", "x accessory load failed", {
                filePath,
                ...toLogErrorData(err),
            });
            host.onError?.(`X load error: ${message}`);
            return false;
        }
    };
}

if (!mmdManagerProto.loadGlb) {
    mmdManagerProto.loadGlb = async function(filePath: string): Promise<boolean> {
        const host = this as unknown as XLoadHost;
        try {
            const { fileName, fileUrl } = splitFilePath(filePath);
            logInfo("asset", "glb accessory load started", { filePath, fileName });
            const container = await LoadAssetContainerAsync(fileName, host.scene, {
                rootUrl: fileUrl,
                pluginExtension: ".glb",
            });

            if (container.meshes.length === 0) {
                throw new Error("No mesh data found in GLB file");
            }

            for (const animationGroup of container.animationGroups) {
                animationGroup.stop();
            }

            normalizeGlbAccessoryMaterials(host, container.meshes);
            container.addToScene((asset) => {
                const className = typeof (asset as { getClassName?: () => string }).getClassName === "function"
                    ? (asset as { getClassName: () => string }).getClassName()
                    : "";
                return className !== "Camera" && className !== "Light";
            });

            const accessoryName = fileName.replace(/\.[^/.]+$/, "") || fileName;
            createAccessoryEntryFromImport(
                host as XLoadHost & object,
                "glb",
                filePath,
                accessoryName,
                {
                    transformNodes: container.transformNodes,
                    meshes: container.meshes as AbstractMesh[],
                },
                GLB_ACCESSORY_IMPORT_SCALE,
            );
            host.syncIblShadowsScene?.();
            host.refreshShadowAfterSceneContentChanged?.();

            logInfo("asset", "glb accessory load completed", {
                filePath,
                fileName,
                accessoryName,
                meshCount: container.meshes.length,
                transformNodeCount: container.transformNodes.length,
                animationGroupCount: container.animationGroups.length,
            });
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logError("asset", "glb accessory load failed", {
                filePath,
                ...toLogErrorData(err),
            });
            host.onError?.(`GLB load error: ${message}`);
            return false;
        }
    };
}

if (!mmdManagerProto.loadObj) {
    mmdManagerProto.loadObj = async function(filePath: string): Promise<boolean> {
        const host = this as unknown as XLoadHost;
        try {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath)) {
                throw new Error("OBJ loading only accepts local file paths");
            }

            const { fileName } = splitFilePath(filePath);
            logInfo("asset", "obj accessory load started", { filePath, fileName });
            const data = await window.electronAPI.readTextFile(filePath);
            if (data === null) {
                throw new Error(`Unable to read OBJ file: ${filePath}`);
            }

            const materialBundle = await prepareLocalObjMaterialBundle(filePath, data, {
                readTextFile: (path) => window.electronAPI.readTextFile(path),
                readBinaryFile: (path) => window.electronAPI.readBinaryFile(path),
            });
            for (const warning of materialBundle.warnings) {
                logWarn("asset", "obj material fallback", {
                    filePath,
                    materialPath: materialBundle.materialPath,
                    warning,
                });
            }
            if (materialBundle.warnings.length > 0) {
                const remainingCount = materialBundle.warnings.length - 1;
                const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
                host.onWarning?.(`OBJ material warning: ${materialBundle.warnings[0]}${suffix}`);
            }

            const materialsLoaded = materialBundle.mtlData !== null;
            const loader = createObjLoaderForLocalMaterialData(materialBundle.mtlData);
            const container = await loader.loadAssetContainerAsync(host.scene, data, "");
            const meshes = container.meshes as AbstractMesh[];
            if (meshes.length === 0) {
                throw new Error("No mesh data found in OBJ file");
            }

            container.addAllToScene();
            const accessoryName = fileName.replace(/\.[^/.]+$/, "") || fileName;
            createAccessoryEntryFromImport(
                host as XLoadHost & object,
                "obj",
                filePath,
                accessoryName,
                {
                    transformNodes: container.transformNodes,
                    meshes,
                },
                OBJ_ACCESSORY_IMPORT_SCALE,
            );
            host.applyToonShadowInfluenceToMeshes?.(meshes as Mesh[]);
            const coplanarBiasedMaterialCount = host.refreshMmdCoplanarMaterialDepthBiasCorrection?.() ?? 0;
            host.syncIblShadowsScene?.();
            host.refreshShadowAfterSceneContentChanged?.();

            logInfo("asset", "obj accessory load completed", {
                filePath,
                fileName,
                accessoryName,
                meshCount: meshes.length,
                coplanarBiasedMaterialCount,
                materialReference: materialBundle.materialReference,
                materialPath: materialBundle.materialPath,
                materialsLoaded,
                loadedTextureCount: materialBundle.loadedTextureCount,
                materialWarningCount: materialBundle.warnings.length,
            });
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logError("asset", "obj accessory load failed", {
                filePath,
                ...toLogErrorData(err),
            });
            host.onError?.(`OBJ load error: ${message}`);
            return false;
        }
    };
}

if (!mmdManagerProto.getLoadedAccessories) {
    mmdManagerProto.getLoadedAccessories = function(): AccessoryState[] {
        const entries = getAccessoryEntries(this as unknown as object);
        return entries.map((entry, index) => ({
            index,
            name: entry.name,
            path: entry.path,
            visible: isAccessoryVisible(entry),
            castsShadow: entry.castsShadow,
            kind: entry.kind,
        }));
    };
}

if (!mmdManagerProto.getAccessoryMeshes) {
    mmdManagerProto.getAccessoryMeshes = function(): AbstractMesh[] {
        const entries = getAccessoryEntries(this as unknown as object);
        return entries.flatMap((entry) => entry.meshes);
    };
}

if (!mmdManagerProto.getIblShadowAccessoryMeshes) {
    mmdManagerProto.getIblShadowAccessoryMeshes = function(): AbstractMesh[] {
        const entries = getAccessoryEntries(this as unknown as object);
        return entries
            .filter((entry) => entry.kind !== "glb" && isAccessoryVisible(entry))
            .flatMap((entry) => entry.meshes.filter(isIblShadowAccessoryMeshCandidate));
    };
}

if (!mmdManagerProto.clearAccessories) {
    mmdManagerProto.clearAccessories = function(): void {
        const entries = getAccessoryEntries(this as unknown as object);
        const host = this as unknown as XLoadHost;
        while (entries.length > 0) {
            const entry = entries.pop();
            for (const mesh of entry?.meshes ?? []) {
                host.shadowGenerator.removeShadowCaster(mesh, false);
            }
            entry?.root.dispose(false);
        }
        host.syncIblShadowsScene?.();
        host.refreshShadowAfterSceneContentChanged?.();
    };
}

if (!mmdManagerProto.setAccessoryVisibility) {
    mmdManagerProto.setAccessoryVisibility = function(index: number, visible: boolean): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        setAccessoryVisible(entry, visible);
        (this as unknown as XLoadHost).syncIblShadowsScene?.();
        return isAccessoryVisible(entry);
    };
}

if (!mmdManagerProto.toggleAccessoryVisibility) {
    mmdManagerProto.toggleAccessoryVisibility = function(index: number): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        const next = !isAccessoryVisible(entry);
        setAccessoryVisible(entry, next);
        (this as unknown as XLoadHost).syncIblShadowsScene?.();
        return next;
    };
}

if (!mmdManagerProto.refreshAccessoryCoplanarMaterialDepthBiasCorrection) {
    mmdManagerProto.refreshAccessoryCoplanarMaterialDepthBiasCorrection = function(strength: unknown): number {
        let appliedMaterialCount = 0;
        for (const entry of getAccessoryEntries(this as unknown as object)) {
            if (entry.kind !== "x") continue;
            appliedMaterialCount += applyAccessoryCoplanarMaterialDepthBias(entry.meshes, strength);
        }
        return appliedMaterialCount;
    };
}

if (!mmdManagerProto.setAccessoryCastsShadow) {
    mmdManagerProto.setAccessoryCastsShadow = function(index: number, castsShadow: boolean): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        entry.castsShadow = castsShadow;
        applyAccessoryShadowCasterState(this as unknown as XLoadHost, entry);
        (this as unknown as XLoadHost).refreshShadowAfterSceneContentChanged?.();
        return true;
    };
}

if (!mmdManagerProto.refreshAccessoryShadowCasters) {
    mmdManagerProto.refreshAccessoryShadowCasters = function(): void {
        const host = this as unknown as XLoadHost;
        for (const entry of getAccessoryEntries(this as unknown as object)) {
            applyAccessoryShadowCasterState(host, entry);
        }
    };
}

if (!mmdManagerProto.removeAccessory) {
    mmdManagerProto.removeAccessory = function(index: number): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        if (index < 0 || index >= entries.length) return false;
        const [entry] = entries.splice(index, 1);
        if (!entry) return false;
        const host = this as unknown as XLoadHost;
        for (const mesh of entry.meshes) {
            host.shadowGenerator.removeShadowCaster(mesh, false);
        }
        entry.root.dispose(false);
        host.syncIblShadowsScene?.();
        host.refreshShadowAfterSceneContentChanged?.();
        return true;
    };
}

if (!mmdManagerProto.getAccessoryTransform) {
    mmdManagerProto.getAccessoryTransform = function(index: number): AccessoryTransformState | null {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return null;

        const position = entry.offset.position;
        const rotation = entry.offset.rotationQuaternion
            ? entry.offset.rotationQuaternion.toEulerAngles()
            : entry.offset.rotation;
        const scale = getAccessoryRelativeScale(entry);

        return {
            position: { x: position.x, y: position.y, z: position.z },
            rotationDeg: {
                x: toDegrees(rotation.x),
                y: toDegrees(rotation.y),
                z: toDegrees(rotation.z),
            },
            scale,
        };
    };
}

if (!mmdManagerProto.setAccessoryTransform) {
    mmdManagerProto.setAccessoryTransform = function(
        index: number,
        transform: Partial<AccessoryTransformState>,
    ): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;

        if (transform.position) {
            const { x, y, z } = transform.position;
            if (Number.isFinite(x)) entry.offset.position.x = x;
            if (Number.isFinite(y)) entry.offset.position.y = y;
            if (Number.isFinite(z)) entry.offset.position.z = z;
        }

        if (transform.rotationDeg) {
            const { x, y, z } = transform.rotationDeg;
            const current = entry.offset.rotationQuaternion
                ? entry.offset.rotationQuaternion.toEulerAngles()
                : entry.offset.rotation;
            const nextX = Number.isFinite(x) ? toRadians(x) : current.x;
            const nextY = Number.isFinite(y) ? toRadians(y) : current.y;
            const nextZ = Number.isFinite(z) ? toRadians(z) : current.z;
            entry.offset.rotationQuaternion = null;
            entry.offset.rotation.copyFromFloats(nextX, nextY, nextZ);
        }

        if (Number.isFinite(transform.scale)) {
            const safeScale = Math.max(0.001, Number(transform.scale));
            const appliedScale = safeScale * getAccessoryBaseScale(entry);
            entry.offset.scaling.copyFromFloats(appliedScale, appliedScale, appliedScale);
        }

        entry.offset.computeWorldMatrix(true);
        (this as unknown as XLoadHost).syncIblShadowsScene?.();
        return true;
    };
}

if (!mmdManagerProto.getAccessoryParent) {
    mmdManagerProto.getAccessoryParent = function(index: number): AccessoryParentState | null {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return null;

        const modelEntry = getModelEntryByRef(this as unknown as object, entry.parentModelRef);
        const modelIndex = modelEntry
            ? getSceneModels(this as unknown as object).findIndex((item) => item.model === modelEntry.model)
            : -1;

        return {
            modelIndex: modelIndex >= 0 ? modelIndex : null,
            modelName: modelEntry?.info?.name ?? entry.parentModelName,
            boneName: entry.parentBoneName,
        };
    };
}

if (!mmdManagerProto.setAccessoryParent) {
    mmdManagerProto.setAccessoryParent = function(
        index: number,
        modelIndex: number | null,
        boneName: string | null,
    ): boolean {
        const host = this as unknown as object;
        const entries = getAccessoryEntries(host);
        const entry = entries[index];
        if (!entry) return false;

        const modelEntry = getModelEntryByIndex(host, modelIndex);
        if (!modelEntry) {
            entry.parentModelRef = null;
            entry.parentModelName = null;
            entry.parentBoneName = null;
            entry.parentBoneUseMeshWorldMatrix = false;
            setAnchorIdentity(entry.root);
            return true;
        }

        entry.parentModelRef = modelEntry.model;
        entry.parentModelName = modelEntry.info?.name ?? null;

        const normalizedBoneName = boneName && boneName.length > 0 ? boneName : null;
        if (normalizedBoneName) {
            const runtimeBone = findRuntimeBone(modelEntry.model, normalizedBoneName);
            if (runtimeBone) {
                entry.parentBoneName = normalizedBoneName;
                entry.parentBoneUseMeshWorldMatrix = detectRuntimeBoneUsesMeshWorldMatrix(modelEntry);
                syncAccessoryAttachment(host, entry);
                return true;
            }
        }

        entry.parentBoneName = null;
        entry.parentBoneUseMeshWorldMatrix = false;
        syncAccessoryAttachment(host, entry);
        return true;
    };
}

if (!mmdManagerProto.hasAccessoryTransformKeyframe) {
    mmdManagerProto.hasAccessoryTransformKeyframe = function(index: number, frame: number): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        return entry.transformKeyframes.frameNumbers.includes(Math.max(0, Math.floor(frame)));
    };
}

if (!mmdManagerProto.addAccessoryTransformKeyframe) {
    mmdManagerProto.addAccessoryTransformKeyframe = function(index: number, frame: number): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        return upsertAccessoryTransformKeyframes(entry, frame);
    };
}

if (!mmdManagerProto.getAccessoryTransformKeyframes) {
    mmdManagerProto.getAccessoryTransformKeyframes = function(index: number): ProjectSerializedAccessoryTransformTrack | null {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return null;
        return {
            frameNumbers: packFrameNumbers(entry.transformKeyframes.frameNumbers),
            positions: packFloat32Array(entry.transformKeyframes.positions),
            rotations: packFloat32Array(entry.transformKeyframes.rotations),
            scales: packFloat32Array(entry.transformKeyframes.scales),
        };
    };
}

if (!mmdManagerProto.setAccessoryTransformKeyframes) {
    mmdManagerProto.setAccessoryTransformKeyframes = function(
        index: number,
        track: ProjectSerializedAccessoryTransformTrack | null,
    ): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        if (!track) {
            entry.transformKeyframes = createEmptyAccessoryTransformKeyframes();
            return true;
        }

        const frameCount = Math.max(0, Math.floor(track.frameNumbers.length ?? 0));
        entry.transformKeyframes = {
            frameNumbers: new Uint32Array(frameCount),
            positions: new Float32Array(frameCount * 3),
            rotations: new Float32Array(frameCount * 3),
            scales: new Float32Array(frameCount),
        };
        copyProjectArrayToUint32(track.frameNumbers, entry.transformKeyframes.frameNumbers);
        copyProjectArrayToFloat32(track.positions, entry.transformKeyframes.positions);
        copyProjectArrayToFloat32(track.rotations, entry.transformKeyframes.rotations);
        copyProjectArrayToFloat32(track.scales, entry.transformKeyframes.scales);
        return true;
    };
}

if (!mmdManagerProto.getModelBoneNames) {
    mmdManagerProto.getModelBoneNames = function(modelIndex: number): string[] {
        const modelEntry = getModelEntryByIndex(this as unknown as object, modelIndex);
        if (!modelEntry) return [];
        const names = modelEntry.info?.boneNames;
        if (!Array.isArray(names)) return [];
        return names.filter((name): name is string => typeof name === "string");
    };
}
