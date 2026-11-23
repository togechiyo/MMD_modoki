import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

type ShadowMapCaps = {
    maxTextureSize?: number;
    textureFloatRender: boolean;
};

export function selectDirectionalShadowMap(
    caps: ShadowMapCaps, isWebGPU: boolean, cascaded: boolean, penumbra: boolean,
): { mapSize: number; preferFloat32: boolean } {
    const preferFloat32 = isWebGPU && cascaded && !penumbra && caps.textureFloatRender;
    return { mapSize: Math.min(preferFloat32 ? 6144 : 8192, caps.maxTextureSize ?? 4096), preferFloat32 };
}

class WebGpuCascadedShadowGenerator extends CascadedShadowGenerator {
    protected override _createTargetRenderTexture(): void {
        // Babylon's general float32 selection requires linear filtering. Our hard CSM
        // uses FILTER_NONE with nearest sampling, including on devices without float32-filterable.
        if (this.useFloat32TextureType) this._textureType = Constants.TEXTURETYPE_FLOAT;
        super._createTargetRenderTexture();
    }

    public updatePenumbraMap(penumbra: boolean): void {
        const caps = this.getLight().getScene().getEngine().getCaps();
        const { mapSize, preferFloat32 } = selectDirectionalShadowMap(caps, true, true, penumbra);
        if (preferFloat32 === this.useFloat32TextureType) return;

        // The public precision setter disposes the CSM and clears its caster callbacks.
        // mapSize recreates just the RTT, preserving the render list and generator observers.
        // WebGPU guarantees renderable, filterable r16float, Babylon's first choice for PCSS.
        const textureType = preferFloat32 ? Constants.TEXTURETYPE_FLOAT : Constants.TEXTURETYPE_HALF_FLOAT;
        this._usefullFloatFirst = preferFloat32;
        if (mapSize === this.mapSize && textureType === this._textureType) return;
        this._textureType = textureType;
        this.mapSize = mapSize;
    }
}

export function createDirectionalShadowGenerator(
    light: DirectionalLight, camera: Camera | null, cascaded: boolean, penumbra: boolean,
): ShadowGenerator {
    const engine = light.getScene().getEngine();
    const { mapSize, preferFloat32 } = selectDirectionalShadowMap(engine.getCaps(), engine.isWebGPU, cascaded, penumbra);
    if (!cascaded) return new ShadowGenerator(mapSize, light);
    const Generator = engine.isWebGPU ? WebGpuCascadedShadowGenerator : CascadedShadowGenerator;
    return new Generator(mapSize, light, preferFloat32, camera);
}

export function updateCascadedShadowMapForPenumbra(generator: ShadowGenerator | null, penumbra: boolean): void {
    if (generator instanceof WebGpuCascadedShadowGenerator) generator.updatePenumbraMap(penumbra);
}
