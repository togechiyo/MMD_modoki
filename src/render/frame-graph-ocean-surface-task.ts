import { Constants } from "@babylonjs/core/Engines/constants";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphObjectList } from "@babylonjs/core/FrameGraph/frameGraphObjectList";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphObjectRendererTask } from "@babylonjs/core/FrameGraph/Tasks/Rendering/objectRendererTask";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
    FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL,
    FRAME_GRAPH_OCEAN_SURFACE_VERTEX_WGSL,
} from "./frame-graph-ocean-surface-shaders";

export type OceanSurfaceRuntimeSettings = {
    waterHeight: number;
    lightDirection: { x: number; y: number; z: number };
    lightColor: { r: number; g: number; b: number };
    lightIntensity: number;
};

export type OceanSurfaceClipmapLevel = {
    halfExtent: number;
    cellSize: number;
    innerHalfExtent: number;
};

export const OCEAN_SURFACE_CLIPMAP_LEVELS: readonly OceanSurfaceClipmapLevel[] = [
    { halfExtent: 128, cellSize: 2, innerHalfExtent: 0 },
    { halfExtent: 512, cellSize: 8, innerHalfExtent: 128 },
    { halfExtent: 2048, cellSize: 32, innerHalfExtent: 512 },
] as const;

export type OceanSurfaceClipmapGeometry = {
    positions: number[];
    indices: number[];
    levelVertexCounts: number[];
    levelTriangleCounts: number[];
};

export function buildOceanSurfaceClipmapGeometry(
    levels: readonly OceanSurfaceClipmapLevel[] = OCEAN_SURFACE_CLIPMAP_LEVELS,
): OceanSurfaceClipmapGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const levelVertexCounts: number[] = [];
    const levelTriangleCounts: number[] = [];

    for (const level of levels) {
        const segments = Math.round((level.halfExtent * 2) / level.cellSize);
        const verticesPerSide = segments + 1;
        const vertexOffset = positions.length / 3;
        for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
            const z = -level.halfExtent + zIndex * level.cellSize;
            for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
                const x = -level.halfExtent + xIndex * level.cellSize;
                positions.push(x, 0, z);
            }
        }

        let triangleCount = 0;
        for (let zIndex = 0; zIndex < segments; zIndex += 1) {
            const centerZ = -level.halfExtent + (zIndex + 0.5) * level.cellSize;
            for (let xIndex = 0; xIndex < segments; xIndex += 1) {
                const centerX = -level.halfExtent + (xIndex + 0.5) * level.cellSize;
                if (
                    level.innerHalfExtent > 0
                    && Math.abs(centerX) < level.innerHalfExtent
                    && Math.abs(centerZ) < level.innerHalfExtent
                ) {
                    continue;
                }
                const topLeft = vertexOffset + zIndex * verticesPerSide + xIndex;
                const topRight = topLeft + 1;
                const bottomLeft = topLeft + verticesPerSide;
                const bottomRight = bottomLeft + 1;
                indices.push(
                    topLeft,
                    bottomLeft,
                    topRight,
                    topRight,
                    bottomLeft,
                    bottomRight,
                );
                triangleCount += 2;
            }
        }
        levelVertexCounts.push(verticesPerSide * verticesPerSide);
        levelTriangleCounts.push(triangleCount);
    }

    return { positions, indices, levelVertexCounts, levelTriangleCounts };
}

export class FrameGraphOceanSurfaceTask extends FrameGraphObjectRendererTask {
    broadWaveTexture?: FrameGraphTextureHandle;
    mediumWaveTexture?: FrameGraphTextureHandle;
    fineWaveTexture?: FrameGraphTextureHandle;
    readonly mesh: Mesh;
    readonly material: ShaderMaterial;
    readonly vertexCount: number;
    readonly triangleCount: number;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        scene: Scene,
        private readonly surfaceCamera: Camera,
        private readonly getSettings: () => OceanSurfaceRuntimeSettings,
    ) {
        super(name, frameGraph, scene, { doNotChangeAspectRatio: true });

        const geometry = buildOceanSurfaceClipmapGeometry();
        this.vertexCount = geometry.positions.length / 3;
        this.triangleCount = geometry.indices.length / 3;
        this.mesh = new Mesh(`${name}Clipmap`, scene);
        const vertexData = new VertexData();
        vertexData.positions = geometry.positions;
        vertexData.indices = geometry.indices;
        vertexData.applyToMesh(this.mesh, false);
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.isPickable = false;
        this.mesh.isVisible = false;

        this.material = new ShaderMaterial(
            `${name}Material`,
            scene,
            {
                vertexSource: FRAME_GRAPH_OCEAN_SURFACE_VERTEX_WGSL,
                fragmentSource: FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL,
                spectorName: "mmdFrameGraphOceanSurface",
            },
            {
                attributes: ["position"],
                uniforms: [
                    "world",
                    "viewProjection",
                    "waterHeight",
                    "cameraPosition",
                    "lightDirection",
                    "lightColor",
                    "lightIntensity",
                ],
                samplers: [
                    "broadWaveTexture",
                    "mediumWaveTexture",
                    "fineWaveTexture",
                ],
                needAlphaBlending: true,
                needAlphaTesting: false,
                shaderLanguage: ShaderLanguage.WGSL,
            },
        );
        this.material.backFaceCulling = false;
        this.material.alphaMode = Constants.ALPHA_COMBINE;
        this.material.disableDepthWrite = true;
        this.mesh.material = this.material;

        const objectList = new FrameGraphObjectList();
        objectList.meshes = [this.mesh];
        objectList.particleSystems = [];
        this.objectList = objectList;
        this.camera = surfaceCamera;
        this.depthTest = true;
        this.depthWrite = false;
        this.disableImageProcessing = true;
        this.renderParticles = false;
        this.renderSprites = false;
        this.renderDepthOnlyMeshes = false;
        this.renderAlphaTestMeshes = false;
        this.renderOpaqueMeshes = false;
        this.renderTransparentMeshes = true;
        this.disableShadows = true;

        this.objectRenderer.onBeforeRenderObservable.add(() => {
            this.mesh.isVisible = true;
        });
        this.objectRenderer.onAfterRenderObservable.add(() => {
            this.mesh.isVisible = false;
        });

        this.onTexturesAllocatedObservable.add((context) => {
            const broad = this.broadWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.broadWaveTexture);
            const medium = this.mediumWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.mediumWaveTexture);
            const fine = this.fineWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.fineWaveTexture);
            if (broad && medium && fine) {
                this.material.setInternalTexture("broadWaveTexture", broad);
                this.material.setInternalTexture("mediumWaveTexture", medium);
                this.material.setInternalTexture("fineWaveTexture", fine);
            }
        });

        this.onBeforeTaskExecute.add(() => {
            const settings = this.getSettings();
            const snapSize = OCEAN_SURFACE_CLIPMAP_LEVELS[0].cellSize;
            this.mesh.position.x = Math.round(this.surfaceCamera.globalPosition.x / snapSize) * snapSize;
            this.mesh.position.z = Math.round(this.surfaceCamera.globalPosition.z / snapSize) * snapSize;
            this.material.setFloat("waterHeight", settings.waterHeight);
            this.material.setVector3("cameraPosition", this.surfaceCamera.globalPosition);
            this.material.setVector3("lightDirection", settings.lightDirection);
            this.material.setColor3("lightColor", settings.lightColor);
            this.material.setFloat("lightIntensity", Math.max(0, Math.min(4, settings.lightIntensity)));
        });
    }

    override record(skipCreationOfDisabledPasses = false) {
        if (
            this.broadWaveTexture === undefined
            || this.mediumWaveTexture === undefined
            || this.fineWaveTexture === undefined
        ) {
            throw new Error(`${this.name}: all wave-field textures are required.`);
        }
        const targetTextures = Array.isArray(this.targetTexture)
            ? this.targetTexture
            : [this.targetTexture];
        this.dependencies = new Set([
            ...targetTextures,
            ...(this.depthTexture === undefined ? [] : [this.depthTexture]),
            this.broadWaveTexture,
            this.mediumWaveTexture,
            this.fineWaveTexture,
        ]);
        return super.record(skipCreationOfDisabledPasses);
    }

    override dispose(): void {
        this.mesh.dispose(false, false);
        this.material.dispose(false, false);
        super.dispose();
    }
}
