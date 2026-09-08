import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { Nullable } from "@babylonjs/core/types";
import type {
    MaterialInfo,
    ReferencedMesh,
    TextureInfo,
} from "babylon-mmd/esm/Loader/IMmdMaterialBuilder";
import type { ILogger } from "babylon-mmd/esm/Loader/Parser/ILogger";
import { PBRMaterialBuilder } from "babylon-mmd/esm/Loader/pbrMaterialBuilder";
import type { ReferenceFileResolver } from "babylon-mmd/esm/Loader/referenceFileResolver";
import type { TextureAlphaChecker } from "babylon-mmd/esm/Loader/textureAlphaChecker";
import { DEFAULT_PBR_MATERIAL_SHADER_PRESET } from "../shared/mmd-material-pipeline";
import {
    applyPbrMaterialShaderPreset,
    registerPbrPresetMaterial,
    registerPbrPresetTransparencyBaseline,
    registerPbrPresetToonTexture,
} from "../render/pbr-mmd-like-toon-settings";

type ToonTextureLoadArguments = [
    uniqueId: number,
    material: PBRMaterial,
    materialInfo: MaterialInfo,
    imagePathTable: readonly string[],
    textureInfo: Nullable<TextureInfo>,
    scene: Scene,
    assetContainer: Nullable<AssetContainer>,
    rootUrl: string,
    referenceFileResolver: ReferenceFileResolver,
    logger: ILogger,
    onTextureLoadComplete?: () => void,
];

export class AdaptivePbrMaterialBuilder extends PBRMaterialBuilder {
    public override loadGeneralScalarProperties(
        material: PBRMaterial,
        materialInfo: MaterialInfo,
        meshes: readonly ReferencedMesh[],
    ): void {
        super.loadGeneralScalarProperties(material, materialInfo, meshes);
        registerPbrPresetMaterial(material, materialInfo.ambient);
        applyPbrMaterialShaderPreset(material, DEFAULT_PBR_MATERIAL_SHADER_PRESET);
    }

    public override async setAlphaBlendMode(
        material: PBRMaterial,
        materialInfo: MaterialInfo,
        meshes: readonly ReferencedMesh[],
        logger: ILogger,
        getTextureAlphaChecker: () => Nullable<TextureAlphaChecker>,
    ): Promise<void> {
        await super.setAlphaBlendMode(
            material,
            materialInfo,
            meshes,
            logger,
            getTextureAlphaChecker,
        );
        registerPbrPresetTransparencyBaseline(material);
        applyPbrMaterialShaderPreset(material, DEFAULT_PBR_MATERIAL_SHADER_PRESET);
    }

    public override loadToonTexture(...args: unknown[]): void {
        if (args.length === 0) return;

        // babylon-mmd 1.2.0 declares PBRMaterialBuilder.loadToonTexture() with
        // no parameters even though MaterialBuilderBase calls the full loader
        // signature and awaits its runtime return value. Preserve that Promise
        // at runtime while keeping this override compatible with the upstream d.ts.
        return this.loadMmdLikeToonTexture(
            ...(args as ToonTextureLoadArguments),
        ) as unknown as void;
    }

    private async loadMmdLikeToonTexture(
        uniqueId: number,
        material: PBRMaterial,
        materialInfo: MaterialInfo,
        imagePathTable: readonly string[],
        textureInfo: Nullable<TextureInfo>,
        scene: Scene,
        assetContainer: Nullable<AssetContainer>,
        rootUrl: string,
        referenceFileResolver: ReferenceFileResolver,
        logger: ILogger,
        onTextureLoadComplete?: () => void,
    ): Promise<void> {
        const toonTexturePath = materialInfo.isSharedToonTexture
            ? materialInfo.toonTextureIndex
            : imagePathTable[textureInfo?.imagePathIndex ?? -1];

        if (toonTexturePath === undefined) {
            onTextureLoadComplete?.();
            return;
        }

        const toonTextureFileFullPath = referenceFileResolver.createFullPath(toonTexturePath.toString());
        const file = typeof toonTexturePath === "string"
            ? referenceFileResolver.resolve(toonTextureFileFullPath)
            : undefined;
        const format = scene.getEngine().isWebGPU
            ? Constants.TEXTUREFORMAT_RGBA
            : Constants.TEXTUREFORMAT_RGB;

        const toonTexture = file !== undefined
            ? await this._textureLoader.loadTextureFromBufferAsync(
                uniqueId,
                toonTextureFileFullPath,
                file instanceof File ? file : file.data,
                scene,
                assetContainer,
                {
                    ...textureInfo,
                    deleteBuffer: this.deleteTextureBufferAfterLoad,
                    format,
                    mimeType: file instanceof File ? file.type : file.mimeType,
                },
            )
            : await this._textureLoader.loadTextureAsync(
                uniqueId,
                rootUrl,
                toonTexturePath,
                scene,
                assetContainer,
                {
                    ...textureInfo,
                    deleteBuffer: this.deleteTextureBufferAfterLoad,
                    format,
                },
            );

        if (toonTexture !== null) {
            registerPbrPresetToonTexture(material, toonTexture);
        } else {
            logger.error(`Failed to load toon texture for adaptive PBR presets: ${toonTextureFileFullPath}`);
        }
        onTextureLoadComplete?.();
    }
}
