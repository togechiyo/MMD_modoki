import { GaussianSplattingMesh } from "@babylonjs/core/Meshes/GaussianSplatting/gaussianSplattingMesh.js";
import { GaussianSplattingMaterial } from "@babylonjs/core/Materials/GaussianSplatting/gaussianSplattingMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { ParseSpz } from "@babylonjs/loaders/SPLAT/spz.js";
import { prepareGaussianPly } from "../shared/ply-mesh";
import { decompressSpz, validateRawSplat, validateSpz } from "../shared/gaussian-splat-input";

export type GaussianAccessoryKind = "ply" | "splat" | "spz";
export function isGaussianAccessoryMesh(mesh: AbstractMesh): mesh is GaussianSplattingMesh {
    return mesh instanceof GaussianSplattingMesh;
}

/** 9.2 retains a constructor camera observer after disposal; remove only this mesh's observers. */
export function createGaussianAccessoryMesh(scene: Scene): GaussianSplattingMesh {
    const previousObservers = new Set(scene.onCameraRemovedObservable.observers);
    const mesh = new GaussianSplattingMesh("GaussianSplatting", null, scene, false);
    const ownedObservers = scene.onCameraRemovedObservable.observers.filter(observer => !previousObservers.has(observer));
    mesh.onDisposeObservable.addOnce(() => { for (const observer of ownedObservers) observer.remove(); });
    // This accessory does not cast shadows. Native 9.2 does not own the wrapper's base material on disposal.
    const material = mesh.material;
    const depthWrapper = material?.shadowDepthWrapper;
    if (material && depthWrapper) {
        depthWrapper.dispose();
        depthWrapper.baseMaterial.dispose();
        material.shadowDepthWrapper = null;
    }
    return mesh;
}

/** Native conversion only; no SceneLoader URL, camera metadata, CDN or external decoder. */
export async function decodeGaussianAccessory(scene: Scene, kind: GaussianAccessoryKind, input: ArrayBuffer): Promise<{
    data: ArrayBuffer; sh?: Uint8Array[]; antiAliased: boolean;
}> {
    let data = input;
    let sh: Uint8Array[] | undefined;
    let antiAliased = false;
    if (kind === "ply") {
        const parsed = await GaussianSplattingMesh.ConvertPLYWithSHToSplatAsync(prepareGaussianPly(input));
        data = parsed.buffer;
        sh = parsed.sh ?? undefined;
    } else if (kind === "spz") {
        const decompressed = await decompressSpz(input);
        validateSpz(decompressed);
        const parsed = await ParseSpz(decompressed, scene, { disableAutoCameraLimits: true });
        data = parsed.data;
        sh = parsed.sh;
        antiAliased = parsed.trainedWithAntialiasing ?? false;
    }
    validateRawSplat(data);
    return { data, sh, antiAliased };
}

export async function loadGaussianAccessoryMesh(scene: Scene, kind: GaussianAccessoryKind, data: ArrayBuffer): Promise<GaussianSplattingMesh> {
    const parsed = await decodeGaussianAccessory(scene, kind, data);
    const mesh = createGaussianAccessoryMesh(scene);
    try {
        if (parsed.antiAliased && mesh.material instanceof GaussianSplattingMaterial) {
            mesh.material.kernelSize = 0.1;
            mesh.material.compensation = true;
        }
        mesh.updateData(parsed.data, parsed.sh, { flipY: false });
        // Match the native 9.2 loader's default orientation and preserve authored scales.
        mesh.scaling.y = -1;
        mesh.receiveShadows = false;
        mesh.isPickable = false;
        mesh.computeWorldMatrix(true);
        return mesh;
    } catch (error) { mesh.dispose(); throw error; }
}
