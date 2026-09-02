import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import type { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ReferencedMesh } from "babylon-mmd/esm/Loader/IMmdMaterialBuilder";
import { MmdMaterialRenderMethod } from "babylon-mmd/esm/Loader/materialBuilderBase";
import type { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { BpmxConverter } from "babylon-mmd/esm/Loader/Optimized/bpmxConverter";
import { BvmdConverter } from "babylon-mmd/esm/Loader/Optimized/bvmdConverter";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { TextureAlphaChecker } from "babylon-mmd/esm/Loader/textureAlphaChecker";
import { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";

export type ConfigureMmdMaterialBuilder = (builder: MmdStandardMaterialBuilder) => void;

function splitFilePath(filePath: string): { directory: string; fileName: string } {
    const normalized = filePath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    return {
        directory: normalized.substring(0, lastSlash + 1),
        fileName: normalized.substring(lastSlash + 1),
    };
}

function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    const rawUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}`
        : `file://${normalized}`;
    return encodeURI(rawUrl);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

async function evaluateMaterialAlpha(
    scene: Scene,
    mmdMesh: MmdMesh,
    materialBuilder: MmdStandardMaterialBuilder,
): Promise<{ translucentMaterials: boolean[]; alphaEvaluateResults: number[] }> {
    const textureAlphaChecker = new TextureAlphaChecker(scene);
    const translucentMaterials: boolean[] = [];
    const alphaEvaluateResults: number[] = [];
    try {
        const meshes = mmdMesh.metadata.meshes;
        const materials = mmdMesh.metadata.materials;
        for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
            const material = materials[materialIndex] as MmdStandardMaterial;
            const diffuseTexture = material.diffuseTexture;
            if (diffuseTexture) {
                diffuseTexture.hasAlpha = true;
                material.useAlphaFromDiffuseTexture = true;
            }

            const referencedMeshes: ReferencedMesh[] = [];
            for (const mesh of meshes) {
                const subMaterials = (mesh.material as MultiMaterial | null)?.subMaterials;
                if (subMaterials !== undefined) {
                    for (let subMaterialIndex = 0; subMaterialIndex < subMaterials.length; subMaterialIndex += 1) {
                        if (subMaterials[subMaterialIndex] === material) {
                            referencedMeshes.push({ mesh, subMeshIndex: subMaterialIndex });
                        }
                    }
                } else if (mesh.material === material) {
                    referencedMeshes.push(mesh);
                }
            }

            if (material.alpha < 1) {
                translucentMaterials[materialIndex] = true;
            } else if (!diffuseTexture) {
                translucentMaterials[materialIndex] = false;
            } else {
                translucentMaterials[materialIndex] = true;
                for (const referencedMesh of referencedMeshes) {
                    const mesh = "mesh" in referencedMesh ? referencedMesh.mesh : referencedMesh;
                    const subMeshIndex = "subMeshIndex" in referencedMesh ? referencedMesh.subMeshIndex : null;
                    const isOpaque = await textureAlphaChecker.hasFragmentsOnlyOpaqueOnGeometryAsync(
                        diffuseTexture,
                        mesh,
                        subMeshIndex,
                    );
                    if (isOpaque) {
                        translucentMaterials[materialIndex] = false;
                        break;
                    }
                }
            }

            if (!diffuseTexture) {
                alphaEvaluateResults[materialIndex] = Material.MATERIAL_OPAQUE;
                continue;
            }
            let transparencyMode = Number.MIN_SAFE_INTEGER;
            for (const referencedMesh of referencedMeshes) {
                const mesh = "mesh" in referencedMesh ? referencedMesh.mesh : referencedMesh as Mesh;
                const subMeshIndex = "subMeshIndex" in referencedMesh ? referencedMesh.subMeshIndex : null;
                const evaluatedMode = await textureAlphaChecker.hasTranslucentFragmentsOnGeometryAsync(
                    diffuseTexture,
                    mesh,
                    subMeshIndex,
                    materialBuilder.alphaThreshold,
                    materialBuilder.alphaBlendThreshold,
                );
                transparencyMode = Math.max(transparencyMode, evaluatedMode);
            }
            alphaEvaluateResults[materialIndex] = transparencyMode === Number.MIN_SAFE_INTEGER
                ? Material.MATERIAL_OPAQUE
                : transparencyMode;
        }
        return { translucentMaterials, alphaEvaluateResults };
    } finally {
        textureAlphaChecker.dispose();
    }
}

export async function convertPmxFileToBpmx(
    scene: Scene,
    filePath: string,
    configureMaterialBuilder?: ConfigureMmdMaterialBuilder,
): Promise<Uint8Array> {
    const { directory, fileName } = splitFilePath(filePath);
    if (!fileName || !/\.(pmx|pmd)$/i.test(fileName)) {
        throw new Error("A PMX or PMD model file is required");
    }

    const materialBuilder = new MmdStandardMaterialBuilder();
    materialBuilder.deleteTextureBufferAfterLoad = false;
    materialBuilder.renderMethod = MmdMaterialRenderMethod.AlphaEvaluation;
    materialBuilder.forceDisableAlphaEvaluation = true;
    configureMaterialBuilder?.(materialBuilder);

    const container = await LoadAssetContainerAsync(fileName, scene, {
        rootUrl: localPathToFileUrl(directory),
        pluginOptions: {
            mmdmodel: {
                materialBuilder,
                useSdef: true,
                buildSkeleton: true,
                buildMorph: true,
                alwaysSetSubMeshesBoundingInfo: false,
                optimizeSubmeshes: true,
                optimizeSingleMaterialModel: true,
                preserveSerializationData: true,
            },
        },
    });

    try {
        const mmdMesh = container.meshes.find(MmdMesh.isMmdMesh);
        if (!mmdMesh) {
            throw new Error("The selected model did not produce serializable MMD mesh data");
        }
        const alphaEvaluation = await evaluateMaterialAlpha(scene, mmdMesh, materialBuilder);
        const converter = new BpmxConverter();
        const result = converter.convert(mmdMesh, {
            includeSkinningData: true,
            includeMorphData: true,
            ...alphaEvaluation,
        });
        return new Uint8Array(result);
    } finally {
        container.dispose();
    }
}

export async function convertVmdBytesToBvmd(
    scene: Scene,
    name: string,
    bytes: Uint8Array,
): Promise<Uint8Array> {
    if (bytes.byteLength === 0) {
        throw new Error("The selected VMD file is empty");
    }
    const animation = await new VmdLoader(scene).loadFromBufferAsync(
        name.replace(/\.vmd$/i, "") || "motion",
        copyToArrayBuffer(bytes),
    );
    return new Uint8Array(BvmdConverter.Convert(animation));
}
