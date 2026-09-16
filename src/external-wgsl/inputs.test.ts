import { describe, expect, it } from "vitest";
import { EffectClock, resolveEffectInputs, validateEffectMaterialInputs } from "./inputs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EffectAsset, EffectInput } from "./contract";

describe("PBR WGSL inputs", () => {
    it("reads live albedo/alpha and ambient without changing PBR settings", () => {
        const engine = new NullEngine(); const scene = new Scene(engine);
        try {
            const material = new PBRMaterial("pbr", scene); const mesh = new Mesh("mesh", scene);
            material.albedoColor.set(0.2, 0.3, 0.4); material.alpha = 0.6;
            material.ambientColor.set(0.1, 0.2, 0.3); material.roughness = 0.75; material.metallic = 0.8;
            const asset: EffectAsset = { revision: "a".repeat(64), sources: [], manifest: { apiVersion: 2, kind: "mmd-material", name: "test", sources: [], hooks: {}, inputOrder: ["Color", "Ambient"], inputs: {
                Color: { type: "vec4f", semantic: "DIFFUSE", annotations: { Object: "Geometry" } },
                Ambient: { type: "vec3f", semantic: "AMBIENT", annotations: { Object: "Geometry" } },
            } } };
            const evaluate = () => resolveEffectInputs(asset, { effectRevision: asset.revision, enabled: true }, material, mesh,
                { frame: 0, time: 0, elapsed: 0, asyncTime: 0, asyncElapsed: 0 }, { width: 640, height: 360 });
            expect(evaluate()).toEqual({ Color: [0.2, 0.3, 0.4, 0.6], Ambient: [0.1, 0.2, 0.3] });
            material.albedoColor.set(0.7, 0.8, 0.9);
            expect(evaluate().Color).toEqual([0.7, 0.8, 0.9, 0.6]);
            expect(material.roughness).toBe(0.75); expect(material.metallic).toBe(0.8);
            for (const semantic of ["SPECULAR", "SPECULARPOWER"]) {
                const input: EffectInput = { type: semantic === "SPECULAR" ? "vec3f" : "f32", semantic, annotations: { Object: "Geometry" } };
                asset.manifest.inputs = { Phong: input };
                expect(() => validateEffectMaterialInputs(asset, material)).toThrow(`Phong (${semantic})`);
            }
        } finally { scene.dispose(); engine.dispose(); }
    });
});
describe("WGSL time snapshots", () => {
    it("uses timeline seconds, fractional frames, negative seeks and zero stopped delta", () => {
        const clock = new EffectClock();
        expect(clock.evaluate(45, false, 10)).toMatchObject({ time: 1.5, elapsed: 0 });
        expect(clock.evaluate(45, false, 11)).toMatchObject({ time: 1.5, elapsed: 0, asyncTime: 2.5, asyncElapsed: 1 });
        expect(clock.evaluate(30, false, 12)).toMatchObject({ time: 1, elapsed: -0.5 });
        expect(clock.evaluate(30.5, true, 13).time).toBeCloseTo(30.5 / 30);
    });
    it("freezes both clocks to the export scheduler, including the first frame", () => {
        const clock = new EffectClock();
        expect(clock.evaluate(45, false, 100, { elapsed: 1 / 60 })).toMatchObject({ time: 1.5, asyncTime: 1.5, elapsed: 1 / 60, asyncElapsed: 1 / 60 });
        expect(clock.evaluate(45, false, 101, { elapsed: 0 })).toMatchObject({ time: 1.5, asyncTime: 1.5, elapsed: 0 });
    });
});
