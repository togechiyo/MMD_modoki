import { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import {
    getExternalWgslToonShaderPathForMaterial as getExternalWgslToonShaderPathForMaterialImpl,
    getWgslMaterialShaderPresetForMaterial as getWgslMaterialShaderPresetForMaterialImpl,
} from "../scene/material-shader-service";

type SsaoHostStatics = {
    DEFAULT_WGSL_MATERIAL_SHADER_PRESET: string;
    toonContactAoEnabled: boolean;
    toonContactAoStrength: number;
    toonContactAoRadius: number;
    toonContactAoFadeStartMeters: number;
    toonContactAoFadeEndMeters: number;
    toonContactAoDebugView: boolean;
    toonContactAoDepthRenderer: DepthRenderer | null;
};

type SsaoSceneModel = {
    mesh: object;
    materials: Array<{ material: object }>;
};

type SsaoHost = {
    constructor: unknown;
    hasEffectSceneTrack?(id: "ssao"): boolean;
    scene: Scene;
    camera: Camera & {
        radius: number;
        customRenderTargets: Texture[];
    };
    engine: {
        getRenderWidth(): number;
        getRenderHeight(): number;
    };
    postEffectBackend: "classic" | "frameGraph" | "experimental";
    postEffectSsaoEnabledValue: boolean;
    postEffectSsaoStrengthValue: number;
    postEffectSsaoRadiusValue: number;
    postEffectSsaoFadeEndValue: number;
    postEffectSsaoDebugViewValue: boolean;
    ssaoDepthRenderer: DepthRenderer | null;
    ssaoRenderingPipeline: SSAO2RenderingPipeline | null;
    ssaoPostProcess: PostProcess | null;
    sceneModels: SsaoSceneModel[];
    isWebGpuEngine(): boolean;
    enforceFinalPostProcessOrder(): void;
    disablePrePassRendererIfSupported(): void;
    addRuntimeDiagnostic(message: string): void;
    hasPrePassRendererSupport(): boolean;
    getEngineType(): string;
    ensureSimpleSsaoShader(): void;
    getPostProcessShaderLanguage(): unknown;
    getModelVisibility(mesh: object): boolean;
};

function getSsaoHostStatics(host: SsaoHost): SsaoHostStatics {
    return host.constructor as SsaoHostStatics;
}

export function syncShaderContactAoState(host: SsaoHost): void {
    const hostStatics = getSsaoHostStatics(host);
    const previousEnabled = hostStatics.toonContactAoEnabled;
    const shouldUseFullscreenSsao = host.isWebGpuEngine()
        && host.postEffectSsaoEnabledValue
        && host.postEffectSsaoStrengthValue > 0.00001;
    const shouldEnable = false;

    if (shouldUseFullscreenSsao && !host.ssaoDepthRenderer) {
        configureSsaoDepthRenderer(host);
    }

    const fadeEnd = host.postEffectSsaoFadeEndValue;
    const fadeStart = Math.max(2, Math.min(fadeEnd - 0.5, fadeEnd * 0.55));
    hostStatics.toonContactAoEnabled = shouldEnable;
    hostStatics.toonContactAoStrength = hostStatics.toonContactAoEnabled
        ? host.postEffectSsaoStrengthValue
        : 0;
    hostStatics.toonContactAoRadius = hostStatics.toonContactAoEnabled
        ? host.postEffectSsaoRadiusValue
        : 0.8;
    hostStatics.toonContactAoFadeStartMeters = fadeStart;
    hostStatics.toonContactAoFadeEndMeters = fadeEnd;
    hostStatics.toonContactAoDebugView = hostStatics.toonContactAoEnabled
        && host.postEffectSsaoDebugViewValue;
    hostStatics.toonContactAoDepthRenderer = hostStatics.toonContactAoEnabled
        ? host.ssaoDepthRenderer
        : null;

    if (previousEnabled !== hostStatics.toonContactAoEnabled) {
        host.scene.markAllMaterialsAsDirty(127);
    }
}

export function applySsaoSettings(host: SsaoHost): void {
    const hostStatics = getSsaoHostStatics(host);
    if (host.postEffectBackend === "frameGraph" || host.hasEffectSceneTrack?.("ssao")) {
        const previousEnabled = hostStatics.toonContactAoEnabled;
        hostStatics.toonContactAoEnabled = false;
        hostStatics.toonContactAoStrength = 0;
        hostStatics.toonContactAoRadius = 0.8;
        hostStatics.toonContactAoDebugView = false;
        hostStatics.toonContactAoDepthRenderer = null;
        if (previousEnabled) {
            host.scene.markAllMaterialsAsDirty(127);
        }
        if (host.ssaoRenderingPipeline) {
            host.ssaoRenderingPipeline.dispose(true);
            host.ssaoRenderingPipeline = null;
        }
        if (host.ssaoPostProcess) {
            host.ssaoPostProcess.dispose(host.camera);
            host.ssaoPostProcess = null;
        }
        if (host.ssaoDepthRenderer) {
            disposeSsaoDepthRenderer(host);
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (host.isWebGpuEngine()) {
        if (host.ssaoRenderingPipeline) {
            host.ssaoRenderingPipeline.dispose(true);
            host.ssaoRenderingPipeline = null;
        }
        host.disablePrePassRendererIfSupported();

        syncShaderContactAoState(host);
        if (host.postEffectSsaoEnabledValue && host.postEffectSsaoStrengthValue > 0.00001) {
            host.addRuntimeDiagnostic("WebGPU SSAO is using fallback mode.");
            ensureSsaoFallbackPostProcess(host);
        } else if (host.ssaoPostProcess) {
            host.ssaoPostProcess.dispose(host.camera);
            host.ssaoPostProcess = null;
        }
        if ((!host.postEffectSsaoEnabledValue || host.postEffectSsaoStrengthValue <= 0.00001) && host.ssaoDepthRenderer) {
            disposeSsaoDepthRenderer(host);
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    hostStatics.toonContactAoEnabled = false;
    hostStatics.toonContactAoStrength = 0;
    hostStatics.toonContactAoRadius = 0.8;
    hostStatics.toonContactAoDebugView = false;
    hostStatics.toonContactAoDepthRenderer = null;
    if (host.ssaoDepthRenderer) {
        disposeSsaoDepthRenderer(host);
    }

    if (!host.postEffectSsaoEnabledValue) {
        if (host.ssaoRenderingPipeline) {
            host.ssaoRenderingPipeline.dispose(true);
            host.ssaoRenderingPipeline = null;
        }
        host.disablePrePassRendererIfSupported();
        if (host.ssaoPostProcess) {
            host.ssaoPostProcess.dispose(host.camera);
            host.ssaoPostProcess = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    const canUseSsaoPipeline = host.hasPrePassRendererSupport() && SSAO2RenderingPipeline.IsSupported;
    if (canUseSsaoPipeline) {
        if (host.ssaoPostProcess) {
            host.ssaoPostProcess.dispose(host.camera);
            host.ssaoPostProcess = null;
        }

        if (!host.ssaoRenderingPipeline) {
            try {
                host.ssaoRenderingPipeline = new SSAO2RenderingPipeline(
                    "SsaoRenderingPipeline",
                    host.scene,
                    { ssaoRatio: 0.5, blurRatio: 0.5 },
                    [host.camera],
                );
                host.ssaoRenderingPipeline.samples = 16;
                host.ssaoRenderingPipeline.textureSamples = 1;
                host.ssaoRenderingPipeline.expensiveBlur = true;
                host.ssaoRenderingPipeline.bilateralSamples = 8;
                host.ssaoRenderingPipeline.bilateralSoften = 0.25;
                host.ssaoRenderingPipeline.bilateralTolerance = 0.15;
                host.ssaoRenderingPipeline.base = 0;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`SSAO2 pipeline initialization failed on ${host.getEngineType()}. Switching to screen-space SSAO fallback. Reason: ${message}`);
                host.addRuntimeDiagnostic(`SSAO fallback is active on ${host.getEngineType()}.`);
                host.ssaoRenderingPipeline = null;
            }
        }

        if (host.ssaoRenderingPipeline) {
            host.ssaoRenderingPipeline.totalStrength = Math.pow(Math.max(0, host.postEffectSsaoStrengthValue), 1.35) * 2.2;
            host.ssaoRenderingPipeline.radius = host.postEffectSsaoRadiusValue;
            host.ssaoRenderingPipeline.maxZ = Math.max(50, Math.min(2000, host.camera.radius * 12));
            host.ssaoRenderingPipeline.minZAspect = 0.2;
            host.ssaoRenderingPipeline.epsilon = 0.02;
            host.enforceFinalPostProcessOrder();
            return;
        }
    }

    if (host.ssaoRenderingPipeline) {
        host.ssaoRenderingPipeline.dispose(true);
        host.ssaoRenderingPipeline = null;
    }
    host.disablePrePassRendererIfSupported();

    if (!host.ssaoDepthRenderer) {
        configureSsaoDepthRenderer(host);
    }
    const initialDepthMap = host.ssaoDepthRenderer?.getDepthMap();
    if (!initialDepthMap) {
        host.postEffectSsaoEnabledValue = false;
        host.addRuntimeDiagnostic(`SSAO was disabled on ${host.getEngineType()}.`);
        if (host.ssaoPostProcess) {
            host.ssaoPostProcess.dispose(host.camera);
            host.ssaoPostProcess = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    ensureSsaoFallbackPostProcess(host, initialDepthMap);

    host.enforceFinalPostProcessOrder();
}

export function ensureSsaoFallbackPostProcess(host: SsaoHost, initialDepthMap?: Texture | null): void {
    if (!host.ssaoDepthRenderer) {
        configureSsaoDepthRenderer(host);
    }
    const fallbackDepthMap = initialDepthMap ?? host.ssaoDepthRenderer?.getDepthMap() ?? null;

    if (!host.ssaoPostProcess) {
        host.ensureSimpleSsaoShader();
        host.ssaoPostProcess = new PostProcess(
            "ssaoFallback",
            "mmdSimpleSsao",
            {
                uniforms: ["ssaoStrength", "ssaoRadius", "screenSize", "cameraNearFar", "inverseViewProjection", "worldFadeMeters", "ssaoDebugView", "ssaoTintMode"],
                samplers: ["depthSampler"],
                size: getSsaoPostProcessScale(host),
                camera: host.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: host.engine,
                reusable: false,
                shaderLanguage: host.getPostProcessShaderLanguage(),
            },
        );
        host.ssaoPostProcess.autoClear = false;
        host.ssaoPostProcess.onApplyObservable.add((effect) => {
            const depthMap = host.ssaoDepthRenderer?.getDepthMap() ?? fallbackDepthMap;
            effect.setTexture("depthSampler", depthMap);
            effect.setFloat("ssaoStrength", host.postEffectSsaoStrengthValue);
            effect.setFloat("ssaoRadius", host.postEffectSsaoRadiusValue);
            effect.setFloat("ssaoDebugView", host.postEffectSsaoDebugViewValue ? 1 : 0);
            effect.setFloat("ssaoTintMode", shouldUseToonTintedSsaoComposite(host) ? 1 : 0);
            effect.setFloat2(
                "screenSize",
                Math.max(1, host.engine.getRenderWidth()),
                Math.max(1, host.engine.getRenderHeight()),
            );
            effect.setFloat2("cameraNearFar", host.camera.minZ, host.camera.maxZ);
            const inverseViewProjection = host.camera.getTransformationMatrix().clone();
            inverseViewProjection.invert();
            effect.setMatrix("inverseViewProjection", inverseViewProjection);
            const fadeEnd = host.postEffectSsaoFadeEndValue;
            const fadeStart = Math.max(2, Math.min(fadeEnd - 0.5, fadeEnd * 0.55));
            effect.setFloat2("worldFadeMeters", fadeStart, fadeEnd);
        });
    }
}

export function shouldUseToonTintedSsaoComposite(host: SsaoHost): boolean {
    const hostStatics = getSsaoHostStatics(host);
    let hasVisibleSceneModel = false;

    for (const entry of host.sceneModels) {
        if (!entry || !host.getModelVisibility(entry.mesh)) continue;
        hasVisibleSceneModel = true;

        for (const materialEntry of entry.materials) {
            if (getExternalWgslToonShaderPathForMaterialImpl(host, materialEntry.material)) {
                return false;
            }
            if (getWgslMaterialShaderPresetForMaterialImpl(host, materialEntry.material) !== hostStatics.DEFAULT_WGSL_MATERIAL_SHADER_PRESET) {
                return false;
            }
        }
    }

    return hasVisibleSceneModel;
}

export function getSsaoPostProcessScale(host: SsaoHost): number {
    const renderWidth = Math.max(1, host.engine.getRenderWidth());
    const renderHeight = Math.max(1, host.engine.getRenderHeight());
    const shortSide = Math.max(1, Math.min(renderWidth, renderHeight));
    const targetShortSide = 720;
    return Math.max(0.45, Math.min(1, targetShortSide / shortSide));
}

export function configureSsaoDepthRenderer(host: SsaoHost): void {
    if (host.ssaoDepthRenderer) {
        return;
    }
    const depthRenderer = new DepthRenderer(
        host.scene,
        undefined,
        host.camera,
        false,
        Texture.NEAREST_SAMPLINGMODE,
        true,
    );
    depthRenderer.useOnlyInActiveCamera = true;
    depthRenderer.forceDepthWriteTransparentMeshes = true;
    host.ssaoDepthRenderer = depthRenderer;
    const depthMap = depthRenderer.getDepthMap();
    if (!host.camera.customRenderTargets.includes(depthMap)) {
        host.camera.customRenderTargets.push(depthMap);
    }
}

export function disposeSsaoDepthRenderer(host: SsaoHost): void {
    if (!host.ssaoDepthRenderer) {
        return;
    }
    const depthMap = host.ssaoDepthRenderer.getDepthMap();
    const index = host.camera.customRenderTargets.indexOf(depthMap);
    if (index !== -1) {
        host.camera.customRenderTargets.splice(index, 1);
    }
    host.ssaoDepthRenderer.dispose();
    host.ssaoDepthRenderer = null;
}
