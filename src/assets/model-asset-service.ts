import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Material } from "@babylonjs/core/Materials/material";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { ModelInfo } from "../types";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { PBRMaterialBuilder } from "babylon-mmd/esm/Loader/pbrMaterialBuilder";
import { MmdMaterialRenderMethod } from "babylon-mmd/esm/Loader/materialBuilderBase";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { logDebugIfEnabled, logError, logInfo, logWarn, toLogErrorData } from "../app-logger";
import { ensureMaterialShaderDefaults } from "../scene/material-shader-service";
import { readExistingSubMeshEffectReadiness } from "../scene/mesh-render-stability";
import {
    isPbrMaterialPipelinePreset,
    normalizeMmdMaterialPipelinePreset,
    type MmdMaterialPipelinePreset,
} from "../shared/mmd-material-pipeline";
import {
    DEFAULT_MMD_RENDER_ORDER_MODE,
    getMmdMaterialAlphaIndex,
    getNextMmdModelRenderOrder,
    normalizeMmdRenderOrderMode,
    type MmdRenderOrderMode,
} from "../shared/mmd-render-order";
import { PbrMaterialProxy } from "../runtime/pbr-material-proxy";
import { AdaptivePbrMaterialBuilder } from "./adaptive-pbr-material-builder";
import { collectModelBoneInfo } from "./model-bone-metadata";
import {
    createUniqueModelInstanceId,
    normalizeModelInstanceId,
} from "../shared/model-instance-id";

const PMX_MORPH_CATEGORY_SYSTEM = 0;
const PMX_MORPH_CATEGORY_EYEBROW = 1;
const PMX_MORPH_CATEGORY_EYE = 2;
const PMX_MORPH_CATEGORY_LIP = 3;
const PMX_MORPH_CATEGORY_OTHER = 4;

function splitFilePath(filePath: string): { dir: string; fileName: string } {
    const pathParts = filePath.replace(/\\/g, "/");
    const lastSlash = pathParts.lastIndexOf("/");
    return {
        dir: pathParts.substring(0, lastSlash + 1),
        fileName: pathParts.substring(lastSlash + 1),
    };
}

function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    const rawUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}`
        : `file://${normalized}`;
    return encodeURI(rawUrl);
}

type SceneModelMaterialEntry = {
    key: string;
    name: string;
    material: ModelAssetMaterial;
    meshNames: string[];
};

type ModelAssetMaterial = object & {
    name?: unknown;
    metadata?: Record<string, unknown> | null;
    subMaterials?: Array<ModelAssetMaterial | null | undefined>;
    alpha?: number;
    transparencyMode?: number;
    useAlphaFromDiffuseTexture?: boolean;
    useAlphaFromAlbedoTexture?: boolean;
    backFaceCulling?: boolean;
    disableColorWrite?: boolean;
    disableDepthWrite?: boolean;
    forceDepthWrite?: boolean;
    needDepthPrePass?: boolean;
    diffuseTexture?: {
        name?: string;
        hasAlpha?: boolean;
        metadata?: Record<string, unknown> | null;
        isReady?: () => boolean;
    } | null;
    albedoTexture?: {
        name?: string;
        hasAlpha?: boolean;
        metadata?: Record<string, unknown> | null;
        isReady?: () => boolean;
    } | null;
    getClassName?: () => string;
    _pluginMaterial?: {
        isMock?: boolean;
        constructor?: { name?: string };
    };
    onCompiled?: (effect: unknown) => void;
    onError?: (effect: unknown, errors: string) => void;
    markAsDirty?: (flag?: number) => void;
    needAlphaBlending?: () => boolean;
    needAlphaTesting?: () => boolean;
    needAlphaBlendingForMesh?: (mesh: Mesh) => boolean;
    needAlphaTestingForMesh?: (mesh: Mesh) => boolean;
    getAlphaTestTexture?: () => { name?: unknown } | null;
};

type ModelAssetSceneWithDirtyBlock = Scene & {
    blockMaterialDirtyMechanism?: boolean;
    _forceBlockMaterialDirtyMechanism?: (value: boolean) => void;
};

type CapturedPmxMaterialInfo = {
    index: number;
    name: string | null;
    englishName: string | null;
    diffuseAlpha: number | null;
    flag: number | null;
    isDoubleSided: boolean | null;
    textureIndex: number | null;
    texturePath: unknown | null;
    sphereTextureIndex: number | null;
    sphereTexturePath: unknown | null;
    sphereTextureMode: number | null;
    toonTextureIndex: number | null;
    toonTexturePath: unknown | null;
    evaluatedTransparency: number | null;
};

const PMX_MATERIAL_FLAG_IS_DOUBLE_SIDED = 0x01;
const PMX_MATERIAL_DIAGNOSTIC_METADATA_KEY = "mmdModokiPmxMaterialInfo";
const MMD_MATERIAL_BUILDER_DIAGNOSTIC_PATCH_KEY = "__mmdModokiMaterialBuilderDiagnosticsInstalled";
const MMD_MATERIAL_BUILDER_DIAGNOSTIC_FILE_KEY = "__mmdModokiMaterialBuilderDiagnosticFileName";

function getConstructorName(value: unknown): string | null {
    return typeof value === "object" && value !== null
        ? ((value as { constructor?: { name?: string } }).constructor?.name ?? null)
        : null;
}

type SupportedMmdMaterialBuilder = MmdStandardMaterialBuilder | PBRMaterialBuilder;

function ensureSharedMmdMaterialBuilder(
    fileName: string,
    materialPipeline: MmdMaterialPipelinePreset,
    renderOrderMode: MmdRenderOrderMode,
): SupportedMmdMaterialBuilder {
    const renderMethod = renderOrderMode === "mmd-fixed"
        ? MmdMaterialRenderMethod.DepthWriteAlphaBlending
        : MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation;
    const currentBuilder = MmdModelLoader.SharedMaterialBuilder;
    if (isPbrMaterialPipelinePreset(materialPipeline)) {
        const builder = currentBuilder instanceof AdaptivePbrMaterialBuilder
            ? currentBuilder
            : new AdaptivePbrMaterialBuilder();
        builder.renderMethod = renderMethod;
        if (builder !== currentBuilder) {
            MmdModelLoader.SharedMaterialBuilder = builder;
        }
        logInfo("asset", "MMD PBR material builder ready", {
            fileName,
            previousBuilder: getConstructorName(currentBuilder),
            builder: getConstructorName(builder),
            renderMethod: formatMmdMaterialRenderMethod(builder.renderMethod),
        });
        return builder;
    }

    if (currentBuilder instanceof MmdStandardMaterialBuilder) {
        currentBuilder.renderMethod = renderMethod;
        installMmdMaterialBuilderDecisionDiagnostics(currentBuilder, fileName);
        logInfo("asset", "MMD material builder ready", {
            fileName,
            builder: getConstructorName(currentBuilder),
            renderMethod: formatMmdMaterialRenderMethod(currentBuilder.renderMethod),
            forceDisableAlphaEvaluation: currentBuilder.forceDisableAlphaEvaluation,
            alphaThreshold: currentBuilder.alphaThreshold,
            alphaBlendThreshold: currentBuilder.alphaBlendThreshold,
            alphaEvaluationResolution: currentBuilder.alphaEvaluationResolution,
        });
        return currentBuilder;
    }

    const builder = new MmdStandardMaterialBuilder();
    builder.renderMethod = renderMethod;
    installMmdMaterialBuilderDecisionDiagnostics(builder, fileName);
    MmdModelLoader.SharedMaterialBuilder = builder;
    logWarn("asset", "MMD material builder replaced before model import", {
        fileName,
        previousBuilder: getConstructorName(currentBuilder),
        builder: getConstructorName(builder),
    });
    return builder;
}

type DiagnosticMaterialBuilder = MmdStandardMaterialBuilder & {
    [MMD_MATERIAL_BUILDER_DIAGNOSTIC_PATCH_KEY]?: true;
    [MMD_MATERIAL_BUILDER_DIAGNOSTIC_FILE_KEY]?: string;
    _evaluateDiffuseTextureTransparencyModeAsync?: (...args: unknown[]) => unknown;
};

function installMmdMaterialBuilderDecisionDiagnostics(builder: MmdStandardMaterialBuilder, fileName: string): void {
    const diagnosticBuilder = builder as DiagnosticMaterialBuilder;
    diagnosticBuilder[MMD_MATERIAL_BUILDER_DIAGNOSTIC_FILE_KEY] = fileName;
    if (diagnosticBuilder[MMD_MATERIAL_BUILDER_DIAGNOSTIC_PATCH_KEY]) return;

    const originalSetAlphaBlendMode = diagnosticBuilder.setAlphaBlendMode.bind(diagnosticBuilder);
    diagnosticBuilder.setAlphaBlendMode = async (...args): Promise<void> => {
        const material = args[0] as ModelAssetMaterial;
        const materialInfo = args[1];
        const referencedMeshes = Array.isArray(args[2]) ? args[2] as readonly unknown[] : [];
        const beforeState = captureMaterialBuilderDecisionState(material);

        await originalSetAlphaBlendMode(...args);

        if (shouldLogMaterialBuilderDecision(material, materialInfo, referencedMeshes)) {
            const currentFileName = diagnosticBuilder[MMD_MATERIAL_BUILDER_DIAGNOSTIC_FILE_KEY] ?? fileName;
            logInfo("asset", "MMD material builder alpha decision", {
                fileName: currentFileName,
                builder: getConstructorName(diagnosticBuilder),
                renderMethod: formatMmdMaterialRenderMethod(diagnosticBuilder.renderMethod),
                forceDisableAlphaEvaluation: diagnosticBuilder.forceDisableAlphaEvaluation,
                alphaThreshold: diagnosticBuilder.alphaThreshold,
                alphaBlendThreshold: diagnosticBuilder.alphaBlendThreshold,
                alphaEvaluationResolution: diagnosticBuilder.alphaEvaluationResolution,
                materialName: readStringProperty(materialInfo, "name") ?? (typeof material.name === "string" ? material.name : null),
                materialEnglishName: readStringProperty(materialInfo, "englishName"),
                diffuseAlpha: readNumberTupleValue(materialInfo, "diffuse", 3),
                evaluatedTransparency: formatEvaluatedTransparency(readNumberProperty(materialInfo, "evaluatedTransparency")),
                referencedMeshes: formatReferencedMeshes(referencedMeshes),
                before: beforeState,
                after: captureMaterialBuilderDecisionState(material),
            });
        }
    };

    const originalEvaluate = diagnosticBuilder._evaluateDiffuseTextureTransparencyModeAsync;
    if (typeof originalEvaluate === "function") {
        diagnosticBuilder._evaluateDiffuseTextureTransparencyModeAsync = async (...args): Promise<unknown> => {
            const diffuseTexture = args[0] as ModelAssetMaterial["diffuseTexture"];
            const evaluatedTransparency = Number(args[1]);
            const referencedMeshes = Array.isArray(args[2]) ? args[2] as readonly unknown[] : [];
            const result = await originalEvaluate.apply(diagnosticBuilder, args);

            if (shouldLogTextureAlphaEvaluation(diffuseTexture, referencedMeshes, evaluatedTransparency, result)) {
                const currentFileName = diagnosticBuilder[MMD_MATERIAL_BUILDER_DIAGNOSTIC_FILE_KEY] ?? fileName;
                logInfo("asset", "MMD texture alpha evaluation result", {
                    fileName: currentFileName,
                    renderMethod: formatMmdMaterialRenderMethod(diagnosticBuilder.renderMethod),
                    forceDisableAlphaEvaluation: diagnosticBuilder.forceDisableAlphaEvaluation,
                    alphaThreshold: diagnosticBuilder.alphaThreshold,
                    alphaBlendThreshold: diagnosticBuilder.alphaBlendThreshold,
                    alphaEvaluationResolution: diagnosticBuilder.alphaEvaluationResolution,
                    texture: formatTextureDiagnostic(diffuseTexture),
                    evaluatedTransparency: formatEvaluatedTransparency(Number.isFinite(evaluatedTransparency) ? evaluatedTransparency : null),
                    referencedMeshes: formatReferencedMeshes(referencedMeshes),
                    result,
                    resultName: typeof result === "number" ? formatTransparencyMode(result) : null,
                });
            }

            return result;
        };
    }

    diagnosticBuilder[MMD_MATERIAL_BUILDER_DIAGNOSTIC_PATCH_KEY] = true;
}

function formatMmdMaterialRenderMethod(value: number): string {
    if (value === MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation) {
        return "DepthWriteAlphaBlendingWithEvaluation";
    }
    if (value === MmdMaterialRenderMethod.DepthWriteAlphaBlending) {
        return "DepthWriteAlphaBlending";
    }
    if (value === MmdMaterialRenderMethod.AlphaEvaluation) {
        return "AlphaEvaluation";
    }
    return String(value);
}

function formatEvaluatedTransparency(value: number | null): Record<string, unknown> | null {
    if (value === null || !Number.isFinite(value)) return null;
    const normalized = value & 0xff;
    const depthWriteIsNotOpaqueBits = (normalized >> 4) & 0x03;
    const alphaEvaluateBits = normalized & 0x0f;
    return {
        raw: value,
        normalized,
        depthWriteIsNotOpaqueBits,
        depthWriteIsNotOpaque: depthWriteIsNotOpaqueBits === 0x03
            ? "not-evaluated"
            : depthWriteIsNotOpaqueBits === 0
                ? "opaque"
                : "not-opaque",
        alphaEvaluateBits,
        alphaEvaluateMode: alphaEvaluateBits === 0x0f
            ? "not-evaluated"
            : formatTransparencyMode(alphaEvaluateBits),
    };
}

function captureMaterialBuilderDecisionState(material: ModelAssetMaterial): Record<string, unknown> {
    return {
        alpha: material.alpha ?? null,
        transparencyMode: material.transparencyMode ?? null,
        transparencyModeName: formatTransparencyMode(material.transparencyMode),
        useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture ?? null,
        diffuseTexture: formatTextureDiagnostic(material.diffuseTexture),
        alphaCutOff: material.alphaCutOff ?? null,
        backFaceCulling: material.backFaceCulling ?? null,
        forceDepthWrite: material.forceDepthWrite ?? null,
        needDepthPrePass: material.needDepthPrePass ?? null,
        disableDepthWrite: material.disableDepthWrite ?? null,
        needAlphaBlending: safeMaterialBooleanCall(material.needAlphaBlending?.bind(material)),
        needAlphaTesting: safeMaterialBooleanCall(material.needAlphaTesting?.bind(material)),
        alphaTestTexture: material.getAlphaTestTexture?.()?.name ?? null,
    };
}

function formatTextureDiagnostic(texture: ModelAssetMaterial["diffuseTexture"]): Record<string, unknown> | null {
    if (!texture) return null;
    return {
        name: texture.name ?? null,
        hasAlpha: texture.hasAlpha ?? null,
        isReady: safeBooleanCall(texture.isReady?.bind(texture)),
        decodedDds: texture.metadata?.mmdModokiDecodedDdsFallback === true,
        decodedDdsHasAlpha: texture.metadata?.mmdModokiDecodedDdsHasAlpha ?? null,
        decodedBmp: texture.metadata?.mmdModokiDecodedBmpAlphaFallback === true,
        decodedBmpHasAlpha: texture.metadata?.mmdModokiDecodedBmpHasAlpha ?? null,
        minAlpha: texture.metadata?.mmdModokiDecodedTextureMinAlpha ?? null,
        maxAlpha: texture.metadata?.mmdModokiDecodedTextureMaxAlpha ?? null,
    };
}

function safeBooleanCall(call: (() => boolean) | undefined): boolean | null {
    if (!call) return null;
    try {
        return Boolean(call());
    } catch {
        return null;
    }
}

function formatReferencedMeshes(referencedMeshes: readonly unknown[]): Array<Record<string, unknown>> {
    return referencedMeshes.slice(0, 12).map((entry) => {
        const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        const mesh = record && "mesh" in record ? record.mesh : entry;
        const meshRecord = mesh && typeof mesh === "object" ? mesh as Mesh : null;
        return {
            meshName: meshRecord?.name ?? null,
            subMeshIndex: record && Number.isFinite(Number(record.subMeshIndex)) ? Number(record.subMeshIndex) : null,
            alphaIndex: meshRecord?.alphaIndex ?? null,
            renderingGroupId: meshRecord?.renderingGroupId ?? null,
            vertices: meshRecord?.getTotalVertices?.() ?? null,
        };
    });
}

function shouldLogMaterialBuilderDecision(
    material: ModelAssetMaterial,
    materialInfo: unknown,
    referencedMeshes: readonly unknown[],
): boolean {
    const searchText = [
        readStringProperty(materialInfo, "name"),
        readStringProperty(materialInfo, "englishName"),
        typeof material.name === "string" ? material.name : "",
        material.diffuseTexture?.name ?? "",
        ...formatReferencedMeshes(referencedMeshes).map((entry) => String(entry.meshName ?? "")),
    ].join(" ").toLowerCase();

    return isLikelyFaceAlphaDiagnosticText(searchText)
        || material.diffuseTexture?.hasAlpha === true
        || material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true
        || material.diffuseTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback === true
        || Number(material.alpha ?? 1) < 0.999
        || material.useAlphaFromDiffuseTexture === true
        || (typeof material.transparencyMode === "number" && material.transparencyMode !== Material.MATERIAL_OPAQUE)
        || readNumberTupleValue(materialInfo, "diffuse", 3) !== 1
        || readNumberProperty(materialInfo, "evaluatedTransparency") !== null;
}

function shouldLogTextureAlphaEvaluation(
    texture: ModelAssetMaterial["diffuseTexture"],
    referencedMeshes: readonly unknown[],
    evaluatedTransparency: number,
    result: unknown,
): boolean {
    const meshText = formatReferencedMeshes(referencedMeshes).map((entry) => String(entry.meshName ?? "")).join(" ").toLowerCase();
    const textureName = String(texture?.name ?? "").toLowerCase();

    return isLikelyFaceAlphaDiagnosticText(`${textureName} ${meshText}`)
        || texture?.metadata?.mmdModokiDecodedDdsFallback === true
        || texture?.metadata?.mmdModokiDecodedBmpAlphaFallback === true
        || texture?.hasAlpha === true
        || (Number.isFinite(evaluatedTransparency) && evaluatedTransparency !== -1)
        || (typeof result === "number" && result !== Material.MATERIAL_OPAQUE);
}

function isLikelyFaceAlphaDiagnosticText(searchText: string): boolean {
    return searchText.includes("eye")
        || searchText.includes("face")
        || searchText.includes("hair")
        || searchText.includes("lash")
        || searchText.includes("shadow")
        || searchText.includes("highlight")
        || searchText.includes("hs")
        || searchText.includes("アイシャドウ")
        || searchText.includes("頬紅")
        || searchText.includes("口紅")
        || searchText.includes("まつげ");
}

function installPmxMaterialDiagnosticCapture(builder: MmdStandardMaterialBuilder): void {
    builder.afterBuildSingleMaterial = (
        material: ModelAssetMaterial,
        materialIndex: number,
        materialInfo: unknown,
        imagePathTable: readonly string[],
        texturesInfo: readonly unknown[],
    ): void => {
        material.metadata = {
            ...(material.metadata ?? {}),
            [PMX_MATERIAL_DIAGNOSTIC_METADATA_KEY]: capturePmxMaterialInfo(
                materialIndex,
                materialInfo,
                imagePathTable,
                texturesInfo,
            ),
        };
    };
}

function capturePmxMaterialInfo(
    materialIndex: number,
    materialInfo: unknown,
    imagePathTable: readonly string[],
    texturesInfo: readonly unknown[],
): CapturedPmxMaterialInfo {
    const flag = readNumberProperty(materialInfo, "flag");
    const textureIndex = readNumberProperty(materialInfo, "textureIndex");
    const sphereTextureIndex = readNumberProperty(materialInfo, "sphereTextureIndex");
    const toonTextureIndex = readNumberProperty(materialInfo, "toonTextureIndex");

    return {
        index: materialIndex,
        name: readStringProperty(materialInfo, "name"),
        englishName: readStringProperty(materialInfo, "englishName"),
        diffuseAlpha: readNumberTupleValue(materialInfo, "diffuse", 3),
        flag,
        isDoubleSided: flag === null ? null : (flag & PMX_MATERIAL_FLAG_IS_DOUBLE_SIDED) !== 0,
        textureIndex,
        texturePath: resolveTexturePath(textureIndex, imagePathTable, texturesInfo),
        sphereTextureIndex,
        sphereTexturePath: resolveTexturePath(sphereTextureIndex, imagePathTable, texturesInfo),
        sphereTextureMode: readNumberProperty(materialInfo, "sphereTextureMode"),
        toonTextureIndex,
        toonTexturePath: resolveTexturePath(toonTextureIndex, imagePathTable, texturesInfo),
        evaluatedTransparency: readNumberProperty(materialInfo, "evaluatedTransparency"),
    };
}

function resolveTexturePath(
    textureIndex: number | null,
    imagePathTable: readonly string[],
    texturesInfo: readonly unknown[],
): unknown | null {
    if (textureIndex === null || textureIndex < 0 || textureIndex >= texturesInfo.length) return null;
    const textureInfo = texturesInfo[textureIndex];
    const imagePathIndex = readNumberProperty(textureInfo, "imagePathIndex");
    if (imagePathIndex === null || imagePathIndex < 0 || imagePathIndex >= imagePathTable.length) return null;
    return imagePathTable[imagePathIndex] ?? null;
}

function readStringProperty(value: unknown, property: string): string | null {
    if (!value || typeof value !== "object") return null;
    const raw = (value as Record<string, unknown>)[property];
    return typeof raw === "string" ? raw : null;
}

function readNumberProperty(value: unknown, property: string): number | null {
    if (!value || typeof value !== "object") return null;
    const raw = (value as Record<string, unknown>)[property];
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
}

function readNumberTupleValue(value: unknown, property: string, index: number): number | null {
    if (!value || typeof value !== "object") return null;
    const raw = (value as Record<string, unknown>)[property];
    if (!Array.isArray(raw) && !(ArrayBuffer.isView(raw) && typeof raw.length === "number")) return null;
    const tuple = raw as ArrayLike<unknown>;
    const tupleValue = tuple[index];
    return Number.isFinite(Number(tupleValue)) ? Number(tupleValue) : null;
}

type ModelAssetRuntimeModel = object;

type ModelAssetHost = {
    physicsInitializationPromise: Promise<unknown>;
    scene: Scene;
    materialShaderPresetByMaterial: WeakMap<object, string>;
    constructor: unknown;
    configureMmdTextureLoaderForWebGpuForBuilder?: (builder: object) => void;
    suspendSceneRendering(): void;
    resumeSceneRendering(): void;
    applyGpuBoneTextureStorageForLargeSkeletons?: (fileName: string, meshes: Mesh[], skeletons: Skeleton[]) => void;
    applyCpuSkinningFallbackForWebGpuSdefMeshes?: (fileName: string, meshes: Mesh[]) => void;
    buildPmxMaterialFlagMap(metadata: object): WeakMap<object, number>;
    resolvePmxShadowFlagsForMaterial(
        material: unknown,
        materialFlagMap: WeakMap<object, number>,
        forceReceiveShadow?: boolean,
    ): {
        receivesShadow: boolean;
        castsShadow: boolean;
    };
    shadowGenerator: Pick<ShadowGenerator, "addShadowCaster">;
    applyMmdMaterialCompatibilityFixes(material: ModelAssetMaterial): boolean;
    refreshMmdCoplanarMaterialDepthBiasCorrection?: () => number;
    applyModelEdgeToMeshes(meshes: Mesh[]): void;
    applyCelShadingToMeshes(meshes: Mesh[]): void;
    applyAnisotropicFilteringToMeshes?: (meshes: Mesh[]) => void;
    applyAlphaTextureDebugToMeshes?: (fileName: string, meshes: Mesh[]) => void;
    applyDebugMaterialOverrideToMeshes?: (fileName: string, meshes: Mesh[]) => void;
    mmdRuntime: {
        createMmdModel(mesh: MmdMesh, options: object): ModelAssetRuntimeModel;
    };
    isPhysicsAvailable(): boolean;
    getPhysicsBackendLabel?: () => string;
    getPhysicsEvaluationTypeLabel?: () => string;
    getPreferredBulletPhysicsBackend?: () => string;
    getPhysicsBufferedEvaluationEnabled?: () => boolean;
    getPhysicsMaxSubSteps?: () => number;
    normalizeRuntimeBoneEvaluationOrder?: (model: ModelAssetRuntimeModel) => void;
    applyPhysicsStateToModel(model: ModelAssetRuntimeModel): void;
    modelKeyframeTracksByModel: WeakMap<ModelAssetRuntimeModel, Map<string, Uint32Array>>;
    modelSourceAnimationsByModel: WeakMap<ModelAssetRuntimeModel, object>;
    setModelMotionImports(model: ModelAssetRuntimeModel, imports: []): void;
    sceneModels: Array<{
        mesh: MmdMesh;
        renderMeshes: Mesh[];
        model: ModelAssetRuntimeModel;
        info: ModelInfo;
        materials: SceneModelMaterialEntry[];
        rigidBodies: Array<{
            name: string;
            boneIndex: number;
            shapeType: number;
            shapeSize: [number, number, number];
            shapePosition: [number, number, number];
            shapeRotation: [number, number, number];
            physicsMode: number;
            mass: number;
            linearDamping: number;
            angularDamping: number;
            repulsion: number;
            friction: number;
            collisionGroup: number;
            collisionMask: number;
        }>;
        joints: Array<{
            name: string;
            rigidbodyIndexA: number;
            rigidbodyIndexB: number;
            type: number;
            position: [number, number, number];
            rotation: [number, number, number];
            positionMin: [number, number, number];
            positionMax: [number, number, number];
            rotationMin: [number, number, number];
            rotationMax: [number, number, number];
            springPosition: [number, number, number];
            springRotation: [number, number, number];
        }>;
        shadowCasterMeshes: Mesh[];
        contactShadowMesh: null;
        castShadow: boolean;
        materialPipeline: MmdMaterialPipelinePreset;
        renderOrder: number;
        externalParent: {
            childBoneName: string;
            parentModelPath: string;
            parentBoneName: string;
        } | null;
        externalParentKeyframes: Array<{
            frame: number;
            childBoneName: string;
            parentModelPath: string | null;
            parentBoneName: string | null;
        }>;
    }>;
    refreshRigidBodyVisualizerTarget(): void;
    syncLuminousGlowLayer?: () => void;
    syncGlobalIlluminationSceneModels?: () => void;
    syncIblShadowsScene?: () => void;
    refreshShadowAfterSceneContentChanged?: () => void;
    refreshFrameGraphPostEffectsBackendForStackStateChange?: () => void;
    dumpRenderDiagnostics?: (reason: string) => Record<string, unknown>;
    shouldActivateAsCurrent(modelInfo: ModelInfo): boolean;
    currentMesh: MmdMesh | null;
    currentModel: ModelAssetRuntimeModel | null;
    activeModelInfo: ModelInfo | null;
    timelineTarget: "model" | "camera";
    refreshBoneVisualizerTarget(): void;
    setTimelineTarget(target: "model" | "camera"): void;
    updateBoneGizmoTarget(): void;
    onModelLoaded?: (modelInfo: ModelInfo) => void;
    emitMergedKeyframeTracks(): void;
    onSceneModelLoaded?: (modelInfo: ModelInfo, modelCount: number, activateAsCurrent: boolean) => void;
    onError?: (message: string) => void;
};

function createMmdModelWithPhysicsDiagnostics(
    host: ModelAssetHost,
    mmdMesh: MmdMesh,
    options: object,
): ModelAssetRuntimeModel {
    const physicsAvailable = host.isPhysicsAvailable();
    const physicsDiagnostics = {
        physicsAvailable,
        backend: host.getPhysicsBackendLabel?.() ?? "unknown",
        evaluationType: host.getPhysicsEvaluationTypeLabel?.() ?? "unknown",
        preferredBulletBackend: host.getPreferredBulletPhysicsBackend?.() ?? "unknown",
        bufferedEvaluationDuringPlayback: host.getPhysicsBufferedEvaluationEnabled?.() ?? false,
        maxSubSteps: host.getPhysicsMaxSubSteps?.() ?? null,
    };
    logInfo("physics", "MMD model physics creation path", physicsDiagnostics);

    return host.mmdRuntime.createMmdModel(mmdMesh, options);
}

function visitModelMaterials(
    mesh: Mesh,
    visitor: (material: ModelAssetMaterial, fallbackName: string, meshName: string) => void,
): void {
    const meshName = mesh.name || "mesh";
    const material = mesh.material as ModelAssetMaterial | null;
    if (!material) return;

    if (Array.isArray(material.subMaterials)) {
        for (let subIndex = 0; subIndex < material.subMaterials.length; subIndex += 1) {
            const subMaterial = material.subMaterials[subIndex];
            if (subMaterial && typeof subMaterial === "object") {
                visitor(subMaterial, `${meshName}#${String(subIndex + 1)}`, meshName);
            }
        }
        return;
    }

    visitor(material, meshName, meshName);
}

function applyMmdFixedAlphaBlend(material: ModelAssetMaterial): void {
    if (material.diffuseTexture) {
        material.diffuseTexture.hasAlpha = true;
        material.useAlphaFromDiffuseTexture = true;
    }
    if (material.albedoTexture) {
        material.albedoTexture.hasAlpha = true;
        material.useAlphaFromAlbedoTexture = true;
    }
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.forceDepthWrite = true;
    material.markAsDirty?.(Material.AllDirtyFlag);
}

function collectSceneModelMaterials(
    host: ModelAssetHost,
    meshes: Mesh[],
    materialPipeline: MmdMaterialPipelinePreset,
): SceneModelMaterialEntry[] {
    const materialMap = new Map<object, SceneModelMaterialEntry>();
    let materialIndex = 0;

    const registerMaterial = (material: ModelAssetMaterial, fallbackName: string, meshName: string): void => {
        if (!material || typeof material !== "object") return;
        const materialName = typeof material.name === "string" && material.name.trim().length > 0
            ? material.name
            : fallbackName;

        let entry = materialMap.get(material as object);
        if (!entry) {
            const key = String(materialIndex) + ":" + materialName;
            materialIndex += 1;
            entry = {
                key,
                name: materialName,
                material,
                meshNames: [],
            };
            materialMap.set(material as object, entry);
        }

        if (!entry.meshNames.includes(meshName)) {
            entry.meshNames.push(meshName);
        }

        if (!isPbrMaterialPipelinePreset(materialPipeline)) {
            ensureMaterialShaderDefaults(host, material);
            if (!host.materialShaderPresetByMaterial.has(material as object)) {
                const hostConstructor = host.constructor as { DEFAULT_WGSL_MATERIAL_SHADER_PRESET: string };
                host.materialShaderPresetByMaterial.set(
                    material as object,
                    hostConstructor.DEFAULT_WGSL_MATERIAL_SHADER_PRESET,
                );
            }
        }
    };

    for (const mesh of meshes) {
        visitModelMaterials(mesh, registerMaterial);
    }

    return Array.from(materialMap.values());
}

function markModelMaterialDirty(material: ModelAssetMaterial): void {
    if (typeof material.markAsDirty !== "function") return;
    try {
        material.markAsDirty(Material.AllDirtyFlag);
    } catch {
        try {
            material.markAsDirty();
        } catch {
            // Some Babylon internals can reject dirty marks during disposal.
        }
    }
}

function delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function collectUniqueModelMaterials(meshes: readonly Mesh[]): ModelAssetMaterial[] {
    const materials = new Set<ModelAssetMaterial>();
    for (const mesh of meshes) {
        visitModelMaterials(mesh, (material) => {
            materials.add(material);
        });
    }
    return Array.from(materials);
}

function countPendingMmdMaterialPlugins(materials: readonly ModelAssetMaterial[]): number {
    return materials.filter((material) => material._pluginMaterial?.isMock === true).length;
}

function roundUvForLog(value: number): number {
    return Math.round(value * 100000) / 100000;
}

function summarizeMeshUv(mesh: Mesh): {
    min: [number, number];
    max: [number, number];
    outside01: number;
    samples: Array<[number, number]>;
} | null {
    const uvData = mesh.getVerticesData("uv") as ArrayLike<number> | null;
    if (!uvData || uvData.length < 2) return null;

    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let outside01 = 0;
    const samples: Array<[number, number]> = [];

    for (let index = 0; index + 1 < uvData.length; index += 2) {
        const u = Number(uvData[index]);
        const v = Number(uvData[index + 1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;

        minU = Math.min(minU, u);
        minV = Math.min(minV, v);
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
        if (u < 0 || u > 1 || v < 0 || v > 1) outside01 += 1;
        if (samples.length < 8) samples.push([roundUvForLog(u), roundUvForLog(v)]);
    }

    if (!Number.isFinite(minU) || !Number.isFinite(minV) || !Number.isFinite(maxU) || !Number.isFinite(maxV)) {
        return null;
    }

    return {
        min: [roundUvForLog(minU), roundUvForLog(minV)],
        max: [roundUvForLog(maxU), roundUvForLog(maxV)],
        outside01,
        samples,
    };
}

function shouldLogDetailedMaterialUv(name: string | null): boolean {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.includes("eye")
        || name.includes("目")
        || name.includes("顔")
        || normalized.includes("hair")
        || name.includes("髪");
}

async function waitForMmdMaterialPluginsReady(fileName: string, meshes: readonly Mesh[]): Promise<void> {
    const materials = collectUniqueModelMaterials(meshes);
    const initialPending = countPendingMmdMaterialPlugins(materials);
    if (initialPending === 0) return;

    const timeoutMs = 2500;
    const startedAt = performance.now();
    let pending = initialPending;
    while (performance.now() - startedAt < timeoutMs) {
        await delayMs(16);
        pending = countPendingMmdMaterialPlugins(materials);
        if (pending === 0) break;
    }

    for (const material of materials) {
        markModelMaterialDirty(material);
    }

    logWarn("asset", "waited for MMD material shader plugin initialization", {
        fileName,
        materialCount: materials.length,
        initialPending,
        remainingPending: pending,
        waitedMs: Math.round(performance.now() - startedAt),
        pluginSamples: materials.slice(0, 8).map((material) => ({
            name: typeof material.name === "string" ? material.name : null,
            plugin: material._pluginMaterial?.constructor?.name ?? null,
            isMock: material._pluginMaterial?.isMock ?? null,
        })),
    });
}

function restoreMaterialDirtyMechanismAfterImport(scene: Scene, meshes: readonly Mesh[]): void {
    const dirtyScene = scene as ModelAssetSceneWithDirtyBlock;
    if (dirtyScene.blockMaterialDirtyMechanism === true) {
        dirtyScene._forceBlockMaterialDirtyMechanism?.(false);
        logWarn("asset", "material dirty mechanism was still blocked after model import; forced restore", {
            meshCount: meshes.length,
        });
    }

    for (const material of collectUniqueModelMaterials(meshes)) {
        markModelMaterialDirty(material);
    }
}

function useParentMeshBoundsForSubMeshes(meshes: readonly Mesh[]): void {
    let patchedMeshCount = 0;
    let patchedSubMeshCount = 0;

    for (const mesh of meshes) {
        if ((mesh.subMeshes?.length ?? 0) <= 1) continue;

        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        const boundingInfo = mesh.getBoundingInfo();
        for (const subMesh of mesh.subMeshes) {
            if (subMesh.IsGlobal) continue;
            subMesh.setBoundingInfo(boundingInfo);
            patchedSubMeshCount += 1;
        }
        patchedMeshCount += 1;
    }

    if (patchedSubMeshCount > 0) {
        logDebugIfEnabled("renderStability", "asset", "PMX submesh bounds unified to parent mesh bounds", {
            meshCount: patchedMeshCount,
            subMeshCount: patchedSubMeshCount,
        });
    }
}

function logModelMaterialVisibilitySummary(fileName: string, meshes: readonly Mesh[], reason: string): void {
    const summary: Array<{
        mesh: string;
        visible: boolean;
        enabled: boolean;
        visibility: number;
        vertices: number;
        subMeshCount: number;
        material: string | null;
        materialClass: string | null;
        materialConstructor: string | null;
        alpha: number | null;
        transparencyMode: number | null;
        useAlphaFromDiffuseTexture: boolean | null;
        backFaceCulling: boolean | null;
        disableColorWrite: boolean | null;
        disableDepthWrite: boolean | null;
        forceDepthWrite: boolean | null;
        needDepthPrePass: boolean | null;
        materialReady: boolean | null;
        effectReady: boolean | null;
        effectName: string | null;
        pluginName: string | null;
        pluginIsMock: boolean | null;
        diffuseTexture: string | null;
        diffuseHasAlpha: boolean | null;
        diffuseReady: boolean | null;
        decodedDds: boolean;
        uv: ReturnType<typeof summarizeMeshUv>;
    }> = [];

    for (const mesh of meshes) {
        visitModelMaterials(mesh, (modelMaterial, fallbackName, meshName) => {
            const material = mesh.material as ModelAssetMaterial;
            const subMaterial = modelMaterial;
            const subMesh = mesh.subMeshes?.find((candidate) => candidate.getMaterial() === subMaterial)
                ?? mesh.subMeshes?.[0]
                ?? null;
            const materialReady = readExistingSubMeshEffectReadiness(subMesh);
            const effect = subMesh ? (subMesh as unknown as {
                effect?: {
                    isReady?: () => boolean;
                    name?: string;
                    _key?: string;
                } | null;
            }).effect : null;
            const materialName = subMaterial.name ?? fallbackName ?? material.name ?? null;
            summary.push({
                mesh: meshName,
                visible: mesh.isVisible,
                enabled: mesh.isEnabled(),
                visibility: mesh.visibility,
                vertices: mesh.getTotalVertices?.() ?? 0,
                subMeshCount: mesh.subMeshes?.length ?? 0,
                material: typeof materialName === "string" ? materialName : null,
                materialClass: subMaterial.getClassName?.() ?? null,
                materialConstructor: getConstructorName(subMaterial),
                alpha: subMaterial.alpha ?? null,
                transparencyMode: subMaterial.transparencyMode ?? null,
                useAlphaFromDiffuseTexture: subMaterial.useAlphaFromDiffuseTexture ?? null,
                backFaceCulling: subMaterial.backFaceCulling ?? null,
                disableColorWrite: subMaterial.disableColorWrite ?? null,
                disableDepthWrite: subMaterial.disableDepthWrite ?? null,
                forceDepthWrite: subMaterial.forceDepthWrite ?? null,
                needDepthPrePass: subMaterial.needDepthPrePass ?? null,
                materialReady,
                effectReady: materialReady,
                effectName: effect?.name ?? effect?._key ?? null,
                pluginName: subMaterial._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: subMaterial._pluginMaterial?.isMock ?? null,
                diffuseTexture: subMaterial.diffuseTexture?.name ?? null,
                diffuseHasAlpha: subMaterial.diffuseTexture?.hasAlpha ?? null,
                diffuseReady: subMaterial.diffuseTexture?.isReady?.() ?? null,
                decodedDds: subMaterial.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true,
                uv: shouldLogDetailedMaterialUv(typeof materialName === "string" ? materialName : null)
                    ? summarizeMeshUv(mesh)
                    : null,
            });
        });
        if (summary.length >= 40) break;
    }

    if (summary.some((item) => item.decodedDds || item.alpha === 0 || item.transparencyMode !== 0)) {
        logInfo("asset", "model material visibility summary", {
            fileName,
            reason,
            materialCount: summary.length,
            materials: summary,
        });
    }
}

function getCapturedPmxMaterialInfo(material: ModelAssetMaterial): CapturedPmxMaterialInfo | null {
    const captured = material.metadata?.[PMX_MATERIAL_DIAGNOSTIC_METADATA_KEY];
    return captured && typeof captured === "object" ? captured as CapturedPmxMaterialInfo : null;
}

function texturePathToSearchText(texturePath: unknown): string {
    if (typeof texturePath === "string") return texturePath.toLowerCase();
    if (!texturePath || typeof texturePath !== "object") return "";
    const record = texturePath as Record<string, unknown>;
    return `${String(record.fileName ?? "")}${String(record.extension ?? "")}`.toLowerCase();
}

function shouldLogSuspiciousAlphaMaterial(
    materialName: string | null,
    material: ModelAssetMaterial,
    captured: CapturedPmxMaterialInfo | null,
): boolean {
    const normalized = (materialName ?? "").toLowerCase();
    const isFaceLike = normalized.includes("eye")
        || normalized.includes("face")
        || normalized.includes("hair")
        || (materialName?.includes("顔") ?? false)
        || (materialName?.includes("目") ?? false)
        || (materialName?.includes("髪") ?? false)
        || (materialName?.includes("睫") ?? false)
        || (materialName?.includes("まつげ") ?? false)
        || (materialName?.includes("頬") ?? false)
        || (materialName?.includes("口") ?? false);
    const texturePath = texturePathToSearchText(captured?.texturePath);
    return isFaceLike
        || Boolean(material.diffuseTexture?.hasAlpha)
        || material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true
        || material.diffuseTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback === true
        || Number(material.alpha ?? 1) < 0.999
        || Boolean(material.useAlphaFromDiffuseTexture)
        || (typeof material.transparencyMode === "number" && material.transparencyMode !== Material.MATERIAL_OPAQUE)
        || (captured?.diffuseAlpha !== null && captured?.diffuseAlpha !== undefined && captured.diffuseAlpha < 0.999)
        || captured?.isDoubleSided === true
        || (captured?.evaluatedTransparency !== null && captured?.evaluatedTransparency !== undefined)
        || texturePath.endsWith(".dds")
        || texturePath.endsWith(".png")
        || texturePath.endsWith(".bmp");
}

function isOpaqueMaterial(material: ModelAssetMaterial): boolean {
    return material.transparencyMode === Material.MATERIAL_OPAQUE
        || material.transparencyMode === 0
        || material.transparencyMode === null
        || material.transparencyMode === undefined;
}

function formatTransparencyMode(mode: number | null | undefined): string | null {
    if (mode === Material.MATERIAL_OPAQUE) return "opaque";
    if (mode === Material.MATERIAL_ALPHATEST) return "alphatest";
    if (mode === Material.MATERIAL_ALPHABLEND) return "alphablend";
    if (mode === Material.MATERIAL_ALPHATESTANDBLEND) return "alphatest-and-blend";
    return mode === null || mode === undefined ? null : String(mode);
}

function safeMaterialBooleanCall(call: (() => boolean) | undefined): boolean | null {
    if (!call) return null;
    try {
        return Boolean(call());
    } catch {
        return null;
    }
}

function logSuspiciousMaterialAlphaDiagnostics(fileName: string, meshes: readonly Mesh[], reason: string): void {
    const entries: Array<Record<string, unknown>> = [];

    for (const mesh of meshes) {
        visitModelMaterials(mesh, (material, fallbackName, meshName) => {
            const materialName = typeof material.name === "string" ? material.name : fallbackName;
            const captured = getCapturedPmxMaterialInfo(material);
            if (!shouldLogSuspiciousAlphaMaterial(materialName, material, captured)) return;

            entries.push({
                mesh: meshName,
                material: materialName,
                vertices: mesh.getTotalVertices?.() ?? 0,
                meshAlphaIndex: mesh.alphaIndex,
                renderingGroupId: mesh.renderingGroupId,
                pmxIndex: captured?.index ?? null,
                pmxName: captured?.name ?? null,
                pmxEnglishName: captured?.englishName ?? null,
                pmxDiffuseAlpha: captured?.diffuseAlpha ?? null,
                pmxFlag: captured?.flag ?? null,
                pmxDoubleSided: captured?.isDoubleSided ?? null,
                pmxEvaluatedTransparency: captured?.evaluatedTransparency ?? null,
                pmxTextureIndex: captured?.textureIndex ?? null,
                pmxTexturePath: captured?.texturePath ?? null,
                pmxSphereTextureIndex: captured?.sphereTextureIndex ?? null,
                pmxSphereTexturePath: captured?.sphereTexturePath ?? null,
                pmxSphereTextureMode: captured?.sphereTextureMode ?? null,
                pmxToonTextureIndex: captured?.toonTextureIndex ?? null,
                pmxToonTexturePath: captured?.toonTexturePath ?? null,
                babylonAlpha: material.alpha ?? null,
                babylonTransparencyMode: material.transparencyMode ?? null,
                babylonTransparencyModeName: formatTransparencyMode(material.transparencyMode),
                useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture ?? null,
                diffuseTexture: material.diffuseTexture?.name ?? null,
                diffuseHasAlpha: material.diffuseTexture?.hasAlpha ?? null,
                decodedDds: material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true,
                decodedBmp: material.diffuseTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback === true,
                alphaCutOff: material.alphaCutOff ?? null,
                backFaceCulling: material.backFaceCulling ?? null,
                forceDepthWrite: material.forceDepthWrite ?? null,
                needDepthPrePass: material.needDepthPrePass ?? null,
                disableDepthWrite: material.disableDepthWrite ?? null,
                disableColorWrite: material.disableColorWrite ?? null,
                needAlphaBlending: safeMaterialBooleanCall(material.needAlphaBlending?.bind(material)),
                needAlphaTesting: safeMaterialBooleanCall(material.needAlphaTesting?.bind(material)),
                needAlphaBlendingForMesh: safeMaterialBooleanCall(material.needAlphaBlendingForMesh?.bind(material, mesh)),
                needAlphaTestingForMesh: safeMaterialBooleanCall(material.needAlphaTestingForMesh?.bind(material, mesh)),
                alphaTestTexture: material.getAlphaTestTexture?.()?.name ?? null,
            });
        });
        if (entries.length >= 60) break;
    }

    if (entries.length > 0) {
        logInfo("asset", "suspicious material alpha diagnostics", {
            fileName,
            reason,
            materialCount: entries.length,
            materials: entries,
        });
    }
}

function logAlphaTextureKeptOpaqueCandidates(fileName: string, meshes: readonly Mesh[], reason: string): void {
    const entries: Array<Record<string, unknown>> = [];

    for (const mesh of meshes) {
        visitModelMaterials(mesh, (material, fallbackName, meshName) => {
            const hasDiffuseAlpha = material.diffuseTexture?.hasAlpha === true;
            if (!hasDiffuseAlpha || material.useAlphaFromDiffuseTexture === true || !isOpaqueMaterial(material)) return;

            const captured = getCapturedPmxMaterialInfo(material);
            entries.push({
                mesh: meshName,
                material: typeof material.name === "string" ? material.name : fallbackName,
                meshAlphaIndex: mesh.alphaIndex,
                renderingGroupId: mesh.renderingGroupId,
                pmxIndex: captured?.index ?? null,
                pmxName: captured?.name ?? null,
                pmxDiffuseAlpha: captured?.diffuseAlpha ?? null,
                pmxDoubleSided: captured?.isDoubleSided ?? null,
                pmxTexturePath: captured?.texturePath ?? null,
                diffuseTexture: material.diffuseTexture?.name ?? null,
                decodedDds: material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true,
                decodedBmp: material.diffuseTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback === true,
                babylonTransparencyMode: material.transparencyMode ?? null,
                babylonTransparencyModeName: formatTransparencyMode(material.transparencyMode),
                useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture ?? null,
                alphaCutOff: material.alphaCutOff ?? null,
                forceDepthWrite: material.forceDepthWrite ?? null,
            });
        });
        if (entries.length >= 40) break;
    }

    if (entries.length > 0) {
        logInfo("asset", "alpha texture kept opaque candidates", {
            fileName,
            reason,
            materialCount: entries.length,
            materials: entries,
        });
    }
}

function attachMaterialCompileDiagnostics(fileName: string, meshes: readonly Mesh[]): void {
    for (const material of collectUniqueModelMaterials(meshes)) {
        const previousOnCompiled = material.onCompiled;
        const previousOnError = material.onError;
        material.onCompiled = (effect: unknown) => {
            previousOnCompiled?.(effect);
            logInfo("asset", "model material effect compiled", {
                fileName,
                materialName: typeof material.name === "string" ? material.name : null,
                pluginName: material._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: material._pluginMaterial?.isMock ?? null,
            });
        };
        material.onError = (effect: unknown, errors: string) => {
            previousOnError?.(effect, errors);
            logError("asset", "model material effect compile failed", {
                fileName,
                materialName: typeof material.name === "string" ? material.name : null,
                pluginName: material._pluginMaterial?.constructor?.name ?? null,
                pluginIsMock: material._pluginMaterial?.isMock ?? null,
                errors,
            });
        };
    }
}

function schedulePostRenderMaterialDiagnostics(fileName: string, scene: Scene, meshes: readonly Mesh[]): void {
    let remainingFrames = 8;
    const observer = scene.onAfterRenderObservable.add(() => {
        remainingFrames -= 1;
        if (remainingFrames > 0) return;
        if (observer) {
            scene.onAfterRenderObservable.remove(observer);
        }
        logModelMaterialVisibilitySummary(fileName, meshes, "after-render-frames");
        logSuspiciousMaterialAlphaDiagnostics(fileName, meshes, "after-render-frames");
        logAlphaTextureKeptOpaqueCandidates(fileName, meshes, "after-render-frames");
    });
    window.setTimeout(() => {
        if (observer) {
            scene.onAfterRenderObservable.remove(observer);
        }
        logModelMaterialVisibilitySummary(fileName, meshes, "after-timeout");
        logSuspiciousMaterialAlphaDiagnostics(fileName, meshes, "after-timeout");
        logAlphaTextureKeptOpaqueCandidates(fileName, meshes, "after-timeout");
    }, 1500);
}

export async function loadPMX(
    host: ModelAssetHost,
    filePath: string,
    requestedMaterialPipeline?: MmdMaterialPipelinePreset,
    requestedRenderOrderMode: MmdRenderOrderMode = DEFAULT_MMD_RENDER_ORDER_MODE,
    requestedRenderOrder?: number,
    requestedInstanceId?: string,
): Promise<ModelInfo | null> {
    let renderingSuspended = false;
    try {
        await host.physicsInitializationPromise;

        const { dir, fileName } = splitFilePath(filePath);
        const isBpmx = /\.bpmx$/i.test(fileName);
        const formatLabel = isBpmx ? "BPMX" : "PMX/PMD";
        const fileUrl = localPathToFileUrl(dir);
        const materialPipeline = normalizeMmdMaterialPipelinePreset(requestedMaterialPipeline);
        const renderOrderMode = normalizeMmdRenderOrderMode(requestedRenderOrderMode);
        const renderOrder = Number.isFinite(requestedRenderOrder)
            ? Math.max(0, Math.trunc(Number(requestedRenderOrder)))
            : getNextMmdModelRenderOrder(host.sceneModels.map((entry) => entry.renderOrder));

        logInfo("asset", "model load started", {
            filePath,
            fileName,
            materialPipeline,
            renderOrderMode,
            renderOrder,
        });
        const materialBuilder = ensureSharedMmdMaterialBuilder(fileName, materialPipeline, renderOrderMode);
        host.configureMmdTextureLoaderForWebGpuForBuilder?.(materialBuilder);
        if (materialBuilder instanceof MmdStandardMaterialBuilder) {
            installPmxMaterialDiagnosticCapture(materialBuilder);
        }
        host.suspendSceneRendering();
        renderingSuspended = true;
        const loaderOptions = isBpmx
            ? {
                materialBuilder,
                useSingleMeshForSingleGeometryModel: true,
                preserveSerializationData: true,
            }
            : {
                materialBuilder,
                useSdef: true,
                // Large, thin stage/background PMX meshes can be split into many
                // submeshes whose per-material bounds are too fragile at shallow
                // camera angles. Keep culling at the mesh bounds level for v0.2.
                alwaysSetSubMeshesBoundingInfo: false,
                optimizeSubmeshes: true,
                optimizeSingleMaterialModel: true,
                preserveSerializationData: true,
            };

        const result = await ImportMeshAsync(fileName, host.scene, {
            rootUrl: fileUrl,
            pluginOptions: {
                mmdmodel: loaderOptions,
            },
        });

        logDebugIfEnabled("modelLoad", "asset", "model import result", {
            filePath,
            fileName,
            meshCount: result.meshes.length,
            skeletonCount: result.skeletons.length,
            meshNames: result.meshes.map((m) => m.name),
        });

        if (result.meshes.length === 0) {
            logWarn("asset", "model import returned no meshes", { filePath, fileName });
            throw new Error(`No mesh data found in ${formatLabel} file`);
        }

        const mmdMesh = result.meshes[0] as MmdMesh;
        if (!mmdMesh) {
            logWarn("asset", "model import first mesh is unavailable", {
                filePath,
                fileName,
                meshCount: result.meshes.length,
            });
            throw new Error(`Imported ${formatLabel} mesh is unavailable`);
        }

        const skeletonPool: Skeleton[] = [];
        if (mmdMesh.skeleton) skeletonPool.push(mmdMesh.skeleton);
        for (const mesh of result.meshes) {
            if (mesh.skeleton) skeletonPool.push(mesh.skeleton);
        }
        for (const skeleton of result.skeletons) {
            if (skeleton) skeletonPool.push(skeleton);
        }
        const uniqueSkeletons = Array.from(new Set(skeletonPool));
        host.applyGpuBoneTextureStorageForLargeSkeletons?.(fileName, result.meshes as Mesh[], uniqueSkeletons);
        host.applyCpuSkinningFallbackForWebGpuSdefMeshes?.(fileName, result.meshes as Mesh[]);

        mmdMesh.setEnabled(true);
        mmdMesh.isVisible = true;
        const mmdMetadata = mmdMesh.metadata as typeof mmdMesh.metadata & {
            containsSerializationData?: boolean;
            materialsMetadata?: readonly { flag: number }[];
            displayFrames?: readonly {
                name: string;
                frames: readonly { type: number; index: number }[];
            }[];
            morphs?: readonly {
                name?: string;
                category?: number;
            }[];
            bones?: readonly {
                name: string;
                flag: number;
                parentBoneIndex: number;
                position: readonly [number, number, number];
                appendTransform?: {
                    parentIndex: number;
                    ratio: number;
                };
                ik?: {
                    target?: number;
                    links: readonly { target?: number }[];
                };
            }[];
            rigidBodies?: readonly {
                name?: string;
                shapeType?: number;
                shapeSize?: readonly [number, number, number];
                shapePosition?: readonly [number, number, number];
                shapeRotation?: readonly [number, number, number];
                physicsMode?: number;
                boneIndex?: number;
                mass?: number;
                linearDamping?: number;
                angularDamping?: number;
                repulsion?: number;
                friction?: number;
                collisionGroup?: number;
                collisionMask?: number;
            }[];
            joints?: readonly {
                name?: string;
                type?: number;
                rigidbodyIndexA?: number;
                rigidbodyIndexB?: number;
                position?: readonly [number, number, number];
                rotation?: readonly [number, number, number];
                positionMin?: readonly [number, number, number];
                positionMax?: readonly [number, number, number];
                rotationMin?: readonly [number, number, number];
                rotationMax?: readonly [number, number, number];
                springPosition?: readonly [number, number, number];
                springRotation?: readonly [number, number, number];
            }[];
        };
        const materialFlagMap = host.buildPmxMaterialFlagMap(mmdMetadata);
        attachMaterialCompileDiagnostics(fileName, result.meshes as Mesh[]);
        let materialOrder = 0;
        const shadowCasterMeshes: Mesh[] = [];
        for (const mesh of result.meshes) {
            mesh.setEnabled(true);
            mesh.isVisible = true;
            const shadowFlags = host.resolvePmxShadowFlagsForMaterial(
                mesh.material,
                materialFlagMap,
                isPbrMaterialPipelinePreset(materialPipeline),
            );
            mesh.receiveShadows = shadowFlags.receivesShadow;
            if ((mesh.getTotalVertices?.() ?? 0) > 0 && shadowFlags.castsShadow) {
                host.shadowGenerator.addShadowCaster(mesh, true);
                shadowCasterMeshes.push(mesh as Mesh);
            }

            if (mesh.material) {
                visitModelMaterials(mesh, (material) => {
                    host.applyMmdMaterialCompatibilityFixes(material);
                    if (renderOrderMode === "mmd-fixed") {
                        applyMmdFixedAlphaBlend(material);
                    }
                });
                mesh.alphaIndex = getMmdMaterialAlphaIndex(renderOrder, materialOrder);
                materialOrder += 1;
            }
        }

        host.applyModelEdgeToMeshes(result.meshes as Mesh[]);
        host.applyCelShadingToMeshes(result.meshes as Mesh[]);
        host.applyAnisotropicFilteringToMeshes?.(result.meshes as Mesh[]);
        host.applyAlphaTextureDebugToMeshes?.(fileName, result.meshes as Mesh[]);
        host.applyDebugMaterialOverrideToMeshes?.(fileName, result.meshes as Mesh[]);
        useParentMeshBoundsForSubMeshes(result.meshes as Mesh[]);
        await waitForMmdMaterialPluginsReady(fileName, result.meshes as Mesh[]);
        restoreMaterialDirtyMechanismAfterImport(host.scene, result.meshes as Mesh[]);
        logModelMaterialVisibilitySummary(fileName, result.meshes as Mesh[], "after-material-setup");
        logSuspiciousMaterialAlphaDiagnostics(fileName, result.meshes as Mesh[], "after-material-setup");
        logAlphaTextureKeptOpaqueCandidates(fileName, result.meshes as Mesh[], "after-material-setup");
        const sceneMaterials = collectSceneModelMaterials(host, result.meshes as Mesh[], materialPipeline);

        const mmdModel = createMmdModelWithPhysicsDiagnostics(host, mmdMesh, {
            materialProxyConstructor: isPbrMaterialPipelinePreset(materialPipeline)
                ? PbrMaterialProxy
                : MmdStandardMaterialProxy,
            buildPhysics: host.isPhysicsAvailable()
                ? { disableOffsetForConstraintFrame: true }
                : false,
        });
        logModelMaterialVisibilitySummary(fileName, result.meshes as Mesh[], "after-runtime-model-created");
        logSuspiciousMaterialAlphaDiagnostics(fileName, result.meshes as Mesh[], "after-runtime-model-created");
        logAlphaTextureKeptOpaqueCandidates(fileName, result.meshes as Mesh[], "after-runtime-model-created");
        host.modelKeyframeTracksByModel.set(mmdModel, new Map());
        host.modelSourceAnimationsByModel.delete(mmdModel);
        host.setModelMotionImports(mmdModel, []);

        logDebugIfEnabled("modelLoad", "asset", "runtime model created", {
            filePath,
            fileName,
            hasMorph: !!mmdModel.morph,
        });

        const morphNames: string[] = [];
        const morphEntries: { index: number; name: string; category: number }[] = [];
        const metadataMorphs = Array.isArray(mmdMetadata.morphs) ? mmdMetadata.morphs : [];
        const seenMorphNames = new Set<string>();
        for (let morphIndex = 0; morphIndex < metadataMorphs.length; morphIndex += 1) {
            const morph = metadataMorphs[morphIndex];
            if (!morph?.name) continue;
            morphEntries.push({
                index: morphIndex,
                name: morph.name,
                category: typeof morph.category === "number" ? morph.category : PMX_MORPH_CATEGORY_OTHER,
            });
            if (!seenMorphNames.has(morph.name)) {
                seenMorphNames.add(morph.name);
                morphNames.push(morph.name);
            }
        }

        const vertexCount = result.meshes.reduce((sum, mesh) => {
            const meshVertices = mesh.getTotalVertices?.() ?? 0;
            return sum + meshVertices;
        }, 0);

        const boneCount = uniqueSkeletons.reduce((max, skeleton) => {
            return Math.max(max, skeleton.bones.length);
        }, 0);

        const metadataBones = Array.isArray(mmdMetadata.bones) ? mmdMetadata.bones : [];
        const metadataRigidBodies = Array.isArray(mmdMetadata.rigidBodies) ? mmdMetadata.rigidBodies : [];
        const metadataJoints = Array.isArray(mmdMetadata.joints) ? mmdMetadata.joints : [];
        const toPhysicsVector = (value: readonly [number, number, number] | undefined): [number, number, number] => {
            return [
                Number(value?.[0] ?? 0),
                Number(value?.[1] ?? 0),
                Number(value?.[2] ?? 0),
            ];
        };
        const sceneRigidBodies = metadataRigidBodies.map((rigidBody, index) => {
            const rawShapeSize = Array.isArray(rigidBody?.shapeSize) ? rigidBody.shapeSize : [0.5, 0.5, 0.5];
            return {
                name: rigidBody?.name || `RigidBody ${index + 1}`,
                boneIndex: typeof rigidBody?.boneIndex === "number" ? rigidBody.boneIndex : -1,
                shapeType: typeof rigidBody?.shapeType === "number" ? rigidBody.shapeType : 0,
                shapeSize: [
                    Number(rawShapeSize[0] ?? 0.5),
                    Number(rawShapeSize[1] ?? rawShapeSize[0] ?? 0.5),
                    Number(rawShapeSize[2] ?? rawShapeSize[0] ?? 0.5),
                ] as [number, number, number],
                shapePosition: toPhysicsVector(rigidBody?.shapePosition),
                shapeRotation: toPhysicsVector(rigidBody?.shapeRotation),
                physicsMode: typeof rigidBody?.physicsMode === "number" ? rigidBody.physicsMode : 0,
                mass: typeof rigidBody?.mass === "number" ? rigidBody.mass : 0,
                linearDamping: typeof rigidBody?.linearDamping === "number" ? rigidBody.linearDamping : 0,
                angularDamping: typeof rigidBody?.angularDamping === "number" ? rigidBody.angularDamping : 0,
                repulsion: typeof rigidBody?.repulsion === "number" ? rigidBody.repulsion : 0,
                friction: typeof rigidBody?.friction === "number" ? rigidBody.friction : 0,
                collisionGroup: typeof rigidBody?.collisionGroup === "number" ? rigidBody.collisionGroup : 0,
                collisionMask: typeof rigidBody?.collisionMask === "number" ? rigidBody.collisionMask : 0,
            };
        });
        const sceneJoints = metadataJoints.map((joint, index) => {
            return {
                name: joint?.name || `Joint ${index + 1}`,
                rigidbodyIndexA: typeof joint?.rigidbodyIndexA === "number" ? joint.rigidbodyIndexA : -1,
                rigidbodyIndexB: typeof joint?.rigidbodyIndexB === "number" ? joint.rigidbodyIndexB : -1,
                type: typeof joint?.type === "number" ? joint.type : 0,
                position: toPhysicsVector(joint?.position),
                rotation: toPhysicsVector(joint?.rotation),
                positionMin: toPhysicsVector(joint?.positionMin),
                positionMax: toPhysicsVector(joint?.positionMax),
                rotationMin: toPhysicsVector(joint?.rotationMin),
                rotationMax: toPhysicsVector(joint?.rotationMax),
                springPosition: toPhysicsVector(joint?.springPosition),
                springRotation: toPhysicsVector(joint?.springRotation),
            };
        });
        const { boneNames, physicsBoneNames, boneControlInfos } = collectModelBoneInfo(
            metadataBones,
            metadataRigidBodies,
        );

        const eyeMorphs: { index: number; name: string }[] = [];
        const lipMorphs: { index: number; name: string }[] = [];
        const eyebrowMorphs: { index: number; name: string }[] = [];
        const otherMorphs: { index: number; name: string }[] = [];
        for (const morphEntry of morphEntries) {
            const morphItem = {
                index: morphEntry.index,
                name: morphEntry.name,
            };
            switch (morphEntry.category) {
                case PMX_MORPH_CATEGORY_EYE:
                    eyeMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_LIP:
                    lipMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_EYEBROW:
                    eyebrowMorphs.push(morphItem);
                    break;
                case PMX_MORPH_CATEGORY_SYSTEM:
                case PMX_MORPH_CATEGORY_OTHER:
                default:
                    otherMorphs.push(morphItem);
                    break;
            }
        }
        const morphDisplayFrames = morphEntries.length > 0
            ? [
                { name: "\u76ee", morphs: eyeMorphs },
                { name: "\u30ea\u30c3\u30d7", morphs: lipMorphs },
                { name: "\u7709", morphs: eyebrowMorphs },
                { name: "\u305d\u306e\u4ed6", morphs: otherMorphs },
            ]
            : [];
        const existingInstanceIds = new Set(host.sceneModels.map((entry) => entry.info.instanceId));
        const normalizedRequestedInstanceId = normalizeModelInstanceId(requestedInstanceId);
        const instanceId = normalizedRequestedInstanceId && !existingInstanceIds.has(normalizedRequestedInstanceId)
            ? normalizedRequestedInstanceId
            : createUniqueModelInstanceId(existingInstanceIds);
        if (requestedInstanceId && instanceId !== requestedInstanceId) {
            logWarn("asset", "Model instance ID was invalid or duplicated; generated a replacement", {
                filePath,
                requestedInstanceId,
                instanceId,
            });
        }
        const modelInfo: ModelInfo = {
            instanceId,
            name: fileName.replace(/\.(pmx|pmd|bpmx)$/i, ""),
            path: filePath,
            vertexCount,
            boneCount,
            boneNames,
            physicsBoneNames,
            boneControlInfos,
            morphCount: morphEntries.length,
            morphNames,
            morphDisplayFrames,
        };

        logDebugIfEnabled("modelLoad", "asset", "model info resolved", {
            filePath,
            modelInfo,
        });

        host.sceneModels.push({
            mesh: mmdMesh,
            renderMeshes: result.meshes as Mesh[],
            model: mmdModel,
            info: modelInfo,
            materials: sceneMaterials,
            rigidBodies: sceneRigidBodies,
            joints: sceneJoints,
            shadowCasterMeshes,
            contactShadowMesh: null,
            castShadow: true,
            materialPipeline,
            renderOrder,
            externalParent: null,
            externalParentKeyframes: [],
        });
        host.refreshMmdCoplanarMaterialDepthBiasCorrection?.();
        host.normalizeRuntimeBoneEvaluationOrder?.(mmdModel);
        host.applyPhysicsStateToModel(mmdModel);
        host.refreshRigidBodyVisualizerTarget();
        host.syncLuminousGlowLayer?.();
        host.syncGlobalIlluminationSceneModels?.();
        host.syncIblShadowsScene?.();
        host.refreshShadowAfterSceneContentChanged?.();
        host.refreshFrameGraphPostEffectsBackendForStackStateChange?.();
        host.dumpRenderDiagnostics?.("after model scene sync");

        const activateAsCurrent = host.shouldActivateAsCurrent(modelInfo);
        if (activateAsCurrent) {
            host.currentMesh = mmdMesh;
            host.currentModel = mmdModel;
            host.activeModelInfo = modelInfo;
            host.refreshBoneVisualizerTarget();
            host.setTimelineTarget("model");
            host.onModelLoaded?.(modelInfo);
            host.emitMergedKeyframeTracks();
            host.dumpRenderDiagnostics?.("after active model load");
        }

        host.onSceneModelLoaded?.(modelInfo, host.sceneModels.length, activateAsCurrent);
        logInfo("asset", "model load completed", {
            instanceId,
            filePath,
            fileName,
            modelName: modelInfo.name,
            vertexCount,
            boneCount,
            materialPipeline,
            renderOrderMode,
            renderOrder,
            morphCount: morphEntries.length,
            meshCount: result.meshes.length,
            sceneModelCount: host.sceneModels.length,
            activateAsCurrent,
        });
        host.resumeSceneRendering();
        renderingSuspended = false;
        schedulePostRenderMaterialDiagnostics(fileName, host.scene, result.meshes as Mesh[]);
        return modelInfo;
    } catch (err: unknown) {
        if (renderingSuspended) {
            host.resumeSceneRendering();
        }
        const message = err instanceof Error ? err.message : String(err);
        logError("asset", "model load failed", {
            filePath,
            ...toLogErrorData(err),
        });
        const formatLabel = /\.bpmx$/i.test(filePath) ? "BPMX" : "PMX/PMD";
        host.onError?.(`${formatLabel} load error: ${message}`);
        return null;
    }
}
