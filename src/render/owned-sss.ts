import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import type { Scene } from "@babylonjs/core/scene";
import { OWNED_SSS_BLUR, OWNED_SSS_CAPTURE, OWNED_SSS_COMPOSE, OWNED_SSS_DEFINITIONS } from "./owned-sss-shaders";

type Profile = "skin" | "wax";
const runtimes = new WeakMap<Scene, OwnedSssRuntime>();
const plugins = new WeakMap<Material, OwnedSssPlugin>();
const liveRuntimes = new Set<OwnedSssRuntime>();

class OwnedSssRuntime {
    public mode = 0;
    public readonly materials = new Map<Material, OwnedSssPlugin>();
    public readonly fallback: RawTexture;
    public readonly entry: RenderTargetTexture;
    public readonly position: RenderTargetTexture;
    public readonly signal: RenderTargetTexture;
    public readonly surface: RenderTargetTexture;
    public readonly lightCamera: FreeCamera;
    public viewMatrix = Matrix.Identity();
    public lightMatrix = Matrix.Identity();
    public lightDirection = new Vector3(0, -1, 0);
    public lightColor = Vector3.Zero();
    public projection = [1, 1];

    public get attachedTargetCount(): number {
        return [this.entry, this.position, this.signal, this.surface].filter(target => this.scene.customRenderTargets.includes(target)).length;
    }
    public get surfacePassCount(): number {
        return this.scene.customRenderTargets.includes(this.surface) ? this.surface.postProcesses.length : 0;
    }
    public get ready(): boolean { return this.scene.isReady() && [this.signal, this.surface].every(target => !this.scene.customRenderTargets.includes(target) || target.postProcesses.every(pass => pass.isReady())); }

    public constructor(private readonly scene: Scene) {
        liveRuntimes.add(this);
        this.fallback = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false);
        this.lightCamera = new FreeCamera("owned-sss-light", Vector3.Zero(), scene);
        this.lightCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        this.lightCamera.minZ = 0.01;
        this.entry = this.target("entry", 3, Constants.TEXTURETYPE_FLOAT);
        this.entry.resize(2048);
        this.position = this.target("position", 2, Constants.TEXTURETYPE_FLOAT);
        this.signal = this.target("signal", 1, Constants.TEXTURETYPE_HALF_FLOAT);
        this.surface = this.target("surface", 4, Constants.TEXTURETYPE_HALF_FLOAT);
        ShaderStore.ShadersStoreWGSL.ownedSssBlurPixelShader = OWNED_SSS_BLUR;
        for (const target of [this.signal, this.surface]) for (const axis of [[1, 0], [0, 1]]) {
            const blur = new PostProcess(`${target.name}-blur-${axis[0]}`, "ownedSssBlur", {
                uniforms: ["axis", "viewProjection", "projection"], samplers: ["positionTexture"],
                size: 1, engine: scene.getEngine(), shaderLanguage: ShaderLanguage.WGSL,
                textureType: Constants.TEXTURETYPE_HALF_FLOAT, samplingMode: Texture.NEAREST_SAMPLINGMODE,
            });
            blur.onApplyObservable.add(effect => {
                effect.setFloat2("axis", axis[0], axis[1]);
                effect.setMatrix("viewProjection", this.viewMatrix);
                effect.setFloat2("projection", this.projection[0], this.projection[1]);
                effect.setTexture("positionTexture", this.position);
            });
            target.addPostProcess(blur);
        }
        scene.onBeforeRenderObservable.add(() => this.update());
        scene.onDisposeObservable.addOnce(() => {
            liveRuntimes.delete(this);
            this.entry.dispose(); this.position.dispose(); this.signal.dispose(); this.surface.dispose();
            this.fallback.dispose(); this.lightCamera.dispose();
        });
    }

    private target(name: string, mode: number, type: number): RenderTargetTexture {
        const target = new RenderTargetTexture(`owned-sss-${name}`, 1024, this.scene, {
            type, samplingMode: Texture.NEAREST_SAMPLINGMODE, generateMipMaps: false,
        });
        target.clearColor = new Color4(0, 0, 0, 0);
        target.ignoreCameraViewport = true;
        target.useCameraPostProcesses = false;
        target.renderParticles = false;
        target.renderSprites = false;
        target.customRenderFunction = (opaque, alphaTest) => {
            for (const list of [opaque, alphaTest]) {
                for (let i = 0; i < list.length; i++) {
                    const subMesh = list.data[i];
                    const material = subMesh.getMaterial();
                    if (material && (this.mode === 3 ? plugins.has(material) : this.materials.has(material))) subMesh.render(false);
                }
            }
        };
        target.onBeforeBindObservable.add(() => { this.mode = mode; });
        target.onAfterUnbindObservable.add(() => { this.mode = 0; });
        return target;
    }

    private update(): void {
        // Model reload may retain material objects for compatibility; only live meshes own work.
        const referenced = new Set(this.scene.meshes.flatMap(mesh => (mesh.subMeshes ?? []).map(sub => sub.getMaterial())));
        for (const material of this.materials.keys()) if (!referenced.has(material)) this.materials.delete(material);
        const targets = [this.entry, this.position, this.signal, this.surface];
        const active = this.materials.size > 0;
        const skinActive = Array.from(this.materials.values()).some(plugin => plugin.profile === "skin");
        if (!active) for (const material of this.scene.materials) plugins.get(material)?.setCaptureEnabled(false);
        for (const target of targets) {
            const index = this.scene.customRenderTargets.indexOf(target);
            const needed = active && (target !== this.surface || skinActive);
            if (needed && index < 0) this.scene.customRenderTargets.push(target);
            if (!needed && index >= 0) this.scene.customRenderTargets.splice(index, 1);
        }
        const camera = this.scene.activeCamera;
        if (!active || !camera) return;
        const meshes = this.scene.meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible
            && mesh.subMeshes?.some(sub => { const mat = sub.getMaterial(); return mat && this.materials.has(mat); }));
        const skeletons = new Set(meshes.map(mesh => mesh.skeleton).filter(skeleton => skeleton !== null));
        const occluders = this.scene.meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible
            && (meshes.includes(mesh) || (mesh.skeleton && skeletons.has(mesh.skeleton))));
        // Capture other surfaces on the same character, never editor helper meshes.
        for (const mesh of occluders) for (const sub of mesh.subMeshes ?? []) {
            const material = sub.getMaterial();
            if (!(material instanceof StandardMaterial)) continue;
            let plugin = plugins.get(material);
            if (!plugin) { plugin = new OwnedSssPlugin(material, this); plugins.set(material, plugin); }
            plugin.setCaptureEnabled(true);
        }
        for (const target of targets) target.renderList = meshes;
        this.entry.renderList = occluders;
        const width = this.scene.getEngine().getRenderWidth();
        const height = this.scene.getEngine().getRenderHeight();
        for (const target of [this.position, this.signal, this.surface]) {
            if (target.getSize().width !== width || target.getSize().height !== height) target.resize({ width, height });
            target.activeCamera = camera;
        }
        this.viewMatrix = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
        this.projection = [camera.getProjectionMatrix().m[0], camera.getProjectionMatrix().m[5]];
        const light = this.scene.lights.find(item => item instanceof DirectionalLight && item.isEnabled());
        if (light instanceof DirectionalLight) {
            this.lightDirection.copyFrom(light.direction).normalize();
            this.lightColor.set(light.diffuse.r * light.intensity, light.diffuse.g * light.intensity, light.diffuse.b * light.intensity);
        } else this.lightColor.setAll(0);
        const minimum = new Vector3(Infinity, Infinity, Infinity);
        const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const mesh of meshes) {
            // Loader bounds include a large static margin and do not follow bones.
            const positions = mesh.getPositionData(true, true);
            if (!positions) continue;
            const world = mesh.getWorldMatrix();
            const point = Vector3.Zero();
            for (let i = 0; i < positions.length; i += 3) {
                Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], world, point);
                minimum.minimizeInPlace(point);
                maximum.maximizeInPlace(point);
            }
        }
        if (meshes.length === 0) return;
        const center = minimum.add(maximum).scale(0.5);
        const radius = Math.max(1, Vector3.Distance(minimum, maximum) * 0.5);
        this.lightCamera.position.copyFrom(center.subtract(this.lightDirection.scale(radius * 2)));
        this.lightCamera.upVector = Math.abs(this.lightDirection.y) > 0.95 ? Vector3.Forward() : Vector3.Up();
        this.lightCamera.setTarget(center);
        this.lightCamera.orthoLeft = -radius; this.lightCamera.orthoRight = radius;
        this.lightCamera.orthoBottom = -radius; this.lightCamera.orthoTop = radius;
        this.lightCamera.maxZ = radius * 4;
        this.lightMatrix = this.lightCamera.getViewMatrix().multiply(this.lightCamera.getProjectionMatrix(true));
        this.entry.activeCamera = this.lightCamera;
    }
}

class OwnedSssPlugin extends MaterialPluginBase {
    public enabled = false;
    public profile: Profile = "skin";
    private readonly materialId: number;
    private captureEnabled = false;
    private static nextId = 1;
    public constructor(material: Material, private readonly runtime: OwnedSssRuntime) {
        super(material, "OwnedSss", 220, { OWNED_SSS: false }, true, false);
        this.materialId = OwnedSssPlugin.nextId++;
        this.doNotSerialize = true;
        this.registerForExtraEvents = true;
        material.onDisposeObservable.addOnce(() => runtime.materials.delete(material));
    }
    public getClassName(): string { return "OwnedSssPlugin"; }
    public isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public setCaptureEnabled(enabled: boolean): void {
        if (this.captureEnabled === enabled) return;
        this.captureEnabled = enabled;
        this._enable(this.enabled || enabled);
        this.markAllDefinesAsDirty();
    }
    public setProfile(profile: Profile | null): void {
        this.enabled = profile !== null;
        if (profile) { this.profile = profile; this.runtime.materials.set(this._material, this); }
        else this.runtime.materials.delete(this._material);
        this._enable(this.enabled || this.captureEnabled);
        this.markAllDefinesAsDirty();
    }
    public prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { OWNED_SSS: boolean }).OWNED_SSS = this.enabled || this.captureEnabled;
    }
    public getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: [
            { name: "ownedSssParams", size: 4, type: "vec4" },
            { name: "ownedSssProfile", size: 4, type: "vec4" },
            { name: "ownedSssLight", size: 4, type: "vec4" },
            { name: "ownedSssLightColor", size: 4, type: "vec4" },
            { name: "ownedSssProjection", size: 4, type: "vec4" },
            { name: "ownedSssViewMatrix", size: 16, type: "mat4" },
            { name: "ownedSssLightMatrix", size: 16, type: "mat4" },
        ] };
    }
    public getSamplers(samplers: string[]): void { samplers.push("ownedSssSignal", "ownedSssSurface", "ownedSssPosition", "ownedSssEntry"); }
    public hardBindForSubMesh(buffer: UniformBuffer): void {
        const r = this.runtime;
        buffer.updateFloat4("ownedSssParams", r.mode, this.profile === "skin" ? 0.08 : 0.6, this.profile === "skin" ? 0.12 : 0.5, this.enabled ? this.materialId : 0);
        const toon = (this._material as Material & { toonTexture?: Texture | null }).toonTexture;
        // This is the application's fallback resource name, never a model/material name.
        const warmFallback = this.enabled && this.profile === "skin" && toon?.name === "preset:fallback_shadow_toon";
        buffer.updateFloat4("ownedSssProfile", this.profile === "skin" ? 0.3 : 1, this.profile === "wax" ? 1 : 0, warmFallback ? 1 : 0, 0);
        buffer.updateFloat4("ownedSssLight", r.lightDirection.x, r.lightDirection.y, r.lightDirection.z, 0);
        buffer.updateFloat4("ownedSssLightColor", r.lightColor.x, r.lightColor.y, r.lightColor.z, 0);
        buffer.updateFloat4("ownedSssProjection", r.projection[0], r.projection[1], 0, 0);
        buffer.updateMatrix("ownedSssViewMatrix", r.viewMatrix);
        buffer.updateMatrix("ownedSssLightMatrix", r.lightMatrix);
        buffer.setTexture("ownedSssSignal", r.mode === 0 ? r.signal : r.fallback);
        buffer.setTexture("ownedSssSurface", r.mode === 0 && this.profile === "skin" ? r.surface : r.fallback);
        buffer.setTexture("ownedSssPosition", r.mode === 0 ? r.position : r.fallback);
        buffer.setTexture("ownedSssEntry", r.mode === 3 ? r.fallback : r.entry);
    }
    public getCustomCode(shaderType: string): Record<string, string> | null {
        if (shaderType !== "fragment") return null;
        return { CUSTOM_FRAGMENT_DEFINITIONS: OWNED_SSS_DEFINITIONS,
            // The installed Standard WGSL shader declares emissive just after lighting.
            // Inject before finalDiffuse, so the MMD sphere/ambient composition survives.
            "!var emissiveColor: vec3f=uniforms\\.vEmissiveColor;": `$0\n${OWNED_SSS_COMPOSE}`,
            CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: OWNED_SSS_CAPTURE };
    }
}

export function setOwnedSssProfile(material: object, profile: Profile | null): void {
    if (!(material instanceof Material)) return;
    let plugin = plugins.get(material);
    if (!plugin && profile) {
        const scene = material.getScene();
        let runtime = runtimes.get(scene);
        if (!runtime) { runtime = new OwnedSssRuntime(scene); runtimes.set(scene, runtime); }
        plugin = new OwnedSssPlugin(material, runtime);
        plugins.set(material, plugin);
    }
    plugin?.setProfile(profile);
}

/** Read-only diagnostics for local visual tests. */
export async function inspectOwnedSss(): Promise<object> {
    const targetCount = Array.from(liveRuntimes).reduce((sum, item) => sum + item.attachedTargetCount, 0);
    const runtime = Array.from(liveRuntimes).find(item => item.materials.size > 0);
    if (!runtime) return { materialCount: 0, targetCount };
    const pixels = await runtime.position.readPixels();
    const size = runtime.position.getSize();
    const probes: object[] = [];
    if (pixels instanceof Float32Array) {
        for (let y = Math.floor(size.height * 0.2); y < size.height * 0.8; y += 60) {
            for (let x = Math.floor(size.width * 0.4); x < size.width * 0.6; x += 60) {
                const i = (y * size.width + x) * 4;
                if (pixels[i + 3] <= 0) continue;
                const p = Vector3.TransformCoordinates(new Vector3(pixels[i], pixels[i + 1], pixels[i + 2]), runtime.viewMatrix);
                probes.push({ pixel: [(x + 0.5) / size.width, (y + 0.5) / size.height], projected: [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5], id: pixels[i + 3] });
            }
        }
    }
    return { materialCount: runtime.materials.size, ready: runtime.ready, targetCount, mode: runtime.mode,
        blurPassCount: runtime.signal.postProcesses.length,
        surfacePassCount: runtime.surfacePassCount, size, probes };
}

export function isOwnedSssReady(): boolean {
    return Array.from(liveRuntimes).every(runtime => runtime.ready);
}
