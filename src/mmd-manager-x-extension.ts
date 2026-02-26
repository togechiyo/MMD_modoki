import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MmdManager } from "./mmd-manager";
import "./x-file-loader";

export type AccessoryState = {
    index: number;
    name: string;
    path: string;
    visible: boolean;
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

declare module "./mmd-manager" {
    interface MmdManager {
        loadX(filePath: string): Promise<boolean>;
        getLoadedAccessories(): AccessoryState[];
        setAccessoryVisibility(index: number, visible: boolean): boolean;
        toggleAccessoryVisibility(index: number): boolean;
        removeAccessory(index: number): boolean;
        getAccessoryTransform(index: number): AccessoryTransformState | null;
        setAccessoryTransform(index: number, transform: Partial<AccessoryTransformState>): boolean;
        getAccessoryParent(index: number): AccessoryParentState | null;
        setAccessoryParent(index: number, modelIndex: number | null, boneName: string | null): boolean;
        getModelBoneNames(modelIndex: number): string[];
    }
}

type XLoadHost = {
    scene: Scene;
    shadowGenerator: Pick<ShadowGenerator, "addShadowCaster">;
    onError: ((message: string) => void) | null;
};

type AccessoryEntry = {
    name: string;
    path: string;
    root: TransformNode;
    offset: TransformNode;
    meshes: AbstractMesh[];
    parentModelRef: object | null;
    parentModelName: string | null;
    parentBoneName: string | null;
    parentBoneUseMeshWorldMatrix: boolean;
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

function getAccessoryEntries(host: object): AccessoryEntry[] {
    let entries = accessoryStore.get(host);
    if (!entries) {
        entries = [];
        accessoryStore.set(host, entries);
    }
    return entries;
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

function toDegrees(rad: number): number {
    return rad * (180 / Math.PI);
}

function toRadians(deg: number): number {
    return deg * (Math.PI / 180);
}

const mmdManagerProto = MmdManager.prototype as unknown as {
    loadX?: (filePath: string) => Promise<boolean>;
    getLoadedAccessories?: () => AccessoryState[];
    setAccessoryVisibility?: (index: number, visible: boolean) => boolean;
    toggleAccessoryVisibility?: (index: number) => boolean;
    removeAccessory?: (index: number) => boolean;
    getAccessoryTransform?: (index: number) => AccessoryTransformState | null;
    setAccessoryTransform?: (index: number, transform: Partial<AccessoryTransformState>) => boolean;
    getAccessoryParent?: (index: number) => AccessoryParentState | null;
    setAccessoryParent?: (index: number, modelIndex: number | null, boneName: string | null) => boolean;
    getModelBoneNames?: (modelIndex: number) => string[];
};

if (!mmdManagerProto.loadX) {
    mmdManagerProto.loadX = async function(filePath: string): Promise<boolean> {
        const host = this as unknown as XLoadHost;
        try {
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const dir = pathParts.substring(0, lastSlash + 1);
            const fileName = pathParts.substring(lastSlash + 1);
            const fileUrl = `file:///${dir}`;

            const result = await ImportMeshAsync(fileName, host.scene, {
                rootUrl: fileUrl,
                pluginExtension: ".x",
            });

            if (result.meshes.length === 0) {
                throw new Error("No mesh data found in X file");
            }

            const entries = getAccessoryEntries(host as unknown as object);
            const accessoryName = fileName.replace(/\.[^/.]+$/, "") || fileName;
            const root = new TransformNode(`x_accessory_root_${entries.length}`, host.scene);
            root.name = `${accessoryName}_root`;
            const offset = new TransformNode(`x_accessory_offset_${entries.length}`, host.scene);
            offset.name = `${accessoryName}_offset`;
            offset.parent = root;

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

            for (const mesh of result.meshes) {
                mesh.setEnabled(true);
                mesh.isVisible = true;
                mesh.receiveShadows = true;
                if ((mesh.getTotalVertices?.() ?? 0) > 0) {
                    host.shadowGenerator.addShadowCaster(mesh as AbstractMesh, true);
                }
            }

            entries.push({
                name: accessoryName,
                path: filePath,
                root,
                offset,
                meshes: result.meshes as AbstractMesh[],
                parentModelRef: null,
                parentModelName: null,
                parentBoneName: null,
                parentBoneUseMeshWorldMatrix: false,
            });

            ensureAccessoryUpdateObserver(host as XLoadHost & object);

            console.log("[X] Loaded:", fileName, "meshes:", result.meshes.length, "accessory:", accessoryName);
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load X:", message);
            host.onError?.(`X load error: ${message}`);
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
        }));
    };
}

if (!mmdManagerProto.setAccessoryVisibility) {
    mmdManagerProto.setAccessoryVisibility = function(index: number, visible: boolean): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        const entry = entries[index];
        if (!entry) return false;
        setAccessoryVisible(entry, visible);
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
        return next;
    };
}

if (!mmdManagerProto.removeAccessory) {
    mmdManagerProto.removeAccessory = function(index: number): boolean {
        const entries = getAccessoryEntries(this as unknown as object);
        if (index < 0 || index >= entries.length) return false;
        const [entry] = entries.splice(index, 1);
        if (!entry) return false;
        entry.root.dispose(false);
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
        const scale = (entry.offset.scaling.x + entry.offset.scaling.y + entry.offset.scaling.z) / 3;

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
            entry.offset.scaling.copyFromFloats(safeScale, safeScale, safeScale);
        }

        entry.offset.computeWorldMatrix(true);
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

if (!mmdManagerProto.getModelBoneNames) {
    mmdManagerProto.getModelBoneNames = function(modelIndex: number): string[] {
        const modelEntry = getModelEntryByIndex(this as unknown as object, modelIndex);
        if (!modelEntry) return [];
        const names = modelEntry.info?.boneNames;
        if (!Array.isArray(names)) return [];
        return names.filter((name): name is string => typeof name === "string");
    };
}
