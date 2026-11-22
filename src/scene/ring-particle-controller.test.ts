import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_RING_PARTICLE_SETTINGS,
    hashRingParticle,
    normalizeRingParticleSettings,
    RingParticleController,
    resolveRingParticleMaterialState,
    sampleRingParticle,
} from "./ring-particle-controller";

describe("ring particle sampling", () => {
    it("既定のパーティクル色は白", () => {
        expect(DEFAULT_RING_PARTICLE_SETTINGS.color).toEqual({ r: 1, g: 1, b: 1 });
    });

    it("単色のRGB値を表示範囲に収める", () => {
        const normalized = normalizeRingParticleSettings({
            ...DEFAULT_RING_PARTICLE_SETTINGS, color: { r: -1, g: 0.4, b: 2 },
        });
        expect(normalized.color).toEqual({ r: 0, g: 0.4, b: 1 });
    });

    it("同じseedとframeなら同じ位置へ戻る", () => {
        const first = sampleRingParticle(17, 240, DEFAULT_RING_PARTICLE_SETTINGS);
        sampleRingParticle(17, 480, DEFAULT_RING_PARTICLE_SETTINGS);
        const seeked = sampleRingParticle(17, 240, DEFAULT_RING_PARTICLE_SETTINGS);
        expect(seeked).toEqual(first);
    });

    it("密度30のプリセットはモデル中央を空けた半径30..60へ配置する", () => {
        const densityScale = 30 / DEFAULT_RING_PARTICLE_SETTINGS.density;
        const innerRadius = 30 * densityScale;
        const outerRadius = innerRadius + 30 * densityScale;
        for (let index = 0; index < DEFAULT_RING_PARTICLE_SETTINGS.count; index++) {
            const particle = sampleRingParticle(index, 0, DEFAULT_RING_PARTICLE_SETTINGS);
            const radius = Math.hypot(particle.x, particle.z);
            expect(radius).toBeGreaterThanOrEqual(innerRadius - 0.001);
            expect(radius).toBeLessThanOrEqual(outerRadius + 0.001);
        }
    });

    it("hashは0以上1未満で固定される", () => {
        const values = Array.from({ length: 64 }, (_, index) => hashRingParticle(index, index % 12));
        expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
        expect(new Set(values).size).toBeGreaterThan(50);
    });

    it("発光強度を上げても指定色の色相を白へ潰さない", () => {
        const state = resolveRingParticleMaterialState({ r: 0.24, g: 1, b: 0.32 }, 4);

        expect(state.color.r).toBeCloseTo(0.24);
        expect(state.color.g).toBe(1);
        expect(state.color.b).toBeCloseTo(0.32);
        expect(state.color.g).toBeGreaterThan(state.color.r * 3);
        expect(state.alpha).toBe(1);
    });
});

describe("ring particle instances", () => {
    it("1つの材質で全粒子を着色し、色の変更で座標を再転送しない", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const camera = new FreeCamera("camera", Vector3.Zero(), scene);
        const controller = new RingParticleController(scene, camera, () => 0);
        try {
            const settings = { ...DEFAULT_RING_PARTICLE_SETTINGS, enabled: true, count: 32 };
            controller.setSettings(settings);
            expect(scene.meshes).toHaveLength(1);
            const mesh = scene.meshes[0] as Mesh;
            const material = mesh.material as StandardMaterial;
            expect(mesh.thinInstanceCount).toBe(32);
            const updateBuffer = vi.spyOn(mesh, "thinInstanceBufferUpdated");
            const redrawMaterial = vi.spyOn(material, "markAsDirty");
            controller.setSettings(structuredClone(settings));
            expect(redrawMaterial).not.toHaveBeenCalled();
            controller.setSettings({ ...settings, color: { r: 0.1, g: 0.6, b: 0.3 } });
            expect(material.emissiveColor.asArray()).toEqual([0.1, 0.6, 0.3]);
            expect(updateBuffer).not.toHaveBeenCalled();

            // Default IDs retain the particle positions of earlier projects.
            const particle = sampleRingParticle(0, 0, settings);
            expect(mesh.thinInstanceGetWorldMatrices()[0].getTranslation().x).toBeCloseTo(particle.x);
            controller.setSettings({ ...settings, count: 64 });
            expect(mesh.thinInstanceCount).toBe(64);
            controller.setSettings({ ...settings, intensity: 0 });
            expect(mesh.isEnabled()).toBe(false);
        } finally {
            controller.dispose();
            scene.dispose();
            engine.dispose();
        }
    });

    it("重ねたエフェクトは保存IDごとに異なる粒子配置と色を保つ", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const camera = new FreeCamera("camera", Vector3.Zero(), scene);
        const settings = { ...DEFAULT_RING_PARTICLE_SETTINGS, enabled: true, count: 16 };
        const first = new RingParticleController(scene, camera, () => 240, "effect-1");
        let second = new RingParticleController(scene, camera, () => 240, "effect-2");
        try {
            first.setSettings({ ...settings, color: { r: 1, g: 0, b: 0 } });
            const blue = { ...settings, color: { r: 0, g: 0, b: 1 } };
            second.setSettings(blue);
            const [firstMesh, secondMesh] = scene.meshes as Mesh[];
            expect((firstMesh.material as StandardMaterial).emissiveColor.asArray()).toEqual([1, 0, 0]);
            expect((secondMesh.material as StandardMaterial).emissiveColor.asArray()).toEqual([0, 0, 1]);
            const positions = (mesh: Mesh) => mesh.thinInstanceGetWorldMatrices().map(m => m.getTranslation().asArray());
            const secondPositions = positions(secondMesh);
            expect(positions(firstMesh)).not.toEqual(secondPositions);

            second.dispose();
            expect(scene.meshes).toEqual([firstMesh]);
            second = new RingParticleController(scene, camera, () => 240, "effect-2");
            second.setSettings(blue);
            expect(positions(scene.meshes[1] as Mesh)).toEqual(secondPositions);
        } finally {
            second.dispose();
            first.dispose();
            scene.dispose();
            engine.dispose();
        }
    });
});
