import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { parseEffectFile } from "./single-file";
import { defaultEffectAssignment, type EffectAsset } from "./contract";
import { resolveEffectInputs, validateEffectMaterialInputs } from "./inputs";
import { ExternalWgslMaterialPlugin } from "./material-plugin";

const reference = readFileSync(new URL("../../wgsl/REFERENCE.md", import.meta.url), "utf8");
function section(name: string, language: string): string {
    const found = new RegExp(`<!-- reference-${name}:start -->\\s*\x60\x60\x60${language}\\r?\\n([\\s\\S]*?)\x60\x60\x60`).exec(reference);
    if (!found) throw new Error("Missing reference section: " + name);
    return found[1];
}
function asset(): EffectAsset {
    const metadata = { apiVersion: 1, kind: "mmd-material", name: "Reference", hooks: { finalColor: "shade" },
        inputs: JSON.parse(section("inputs", "json")) };
    return { revision: "a".repeat(64), ...parseEffectFile(`/* @modoki\n${JSON.stringify(metadata)}\n*/\nfn shade(s: ModokiFinalColor) -> vec3f { return s.color; }`) };
}
// NullEngine does not select WebGPU; only exercise source generation, never GPU compilation.
class WgslReferenceMaterial extends StandardMaterial {
    constructor(scene: Scene) { super("base", scene); this._shaderLanguage = ShaderLanguage.WGSL; }
}
function withScene(run: (scene: Scene, material: StandardMaterial, mesh: Mesh) => void): void {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
        const material = new WgslReferenceMaterial(scene); const mesh = new Mesh("mesh", scene);
        const camera = new FreeCamera("camera", new Vector3(2, 3, -6), scene); camera.getViewMatrix(true);
        const light = new DirectionalLight("first", new Vector3(0, -3, 4), scene);
        light.diffuse.set(0.2, 0.4, 0.8); light.intensity = 5;
        new DirectionalLight("second", new Vector3(1, 0, 0), scene);
        scene.setTransformMatrix(Matrix.LookAtLH(new Vector3(2, 3, -6), Vector3.Zero(), Vector3.Up()), Matrix.PerspectiveFovLH(0.8, 1.5, 0.1, 100));
        run(scene, material, mesh);
    } finally { scene.dispose(); engine.dispose(); }
}
const time = { frame: 45, time: 1.5, elapsed: -0.5, asyncTime: 3, asyncElapsed: 0.02 };

describe("published WGSL reference", () => {
    it("accepts all 37 documented declarations, including all 24 matrices", () => {
        const inputs = asset().manifest.inputs ?? {};
        expect(Object.keys(inputs)).toHaveLength(37);
        const matrixNames = Object.values(inputs).filter(input => input.type === "mat4x4f").map(input => input.semantic);
        expect(new Set(matrixNames).size).toBe(24);
        for (const base of ["WORLD", "VIEW", "PROJECTION", "WORLDVIEW", "VIEWPROJECTION", "WORLDVIEWPROJECTION"]) {
            for (const suffix of ["", "INVERSE", "TRANSPOSE", "INVERSETRANSPOSE"]) {
                expect(matrixNames).toContain(base + suffix);
                expect(reference).toContain("| `" + base + suffix + "` |");
            }
        }
    });

    it("matches the published fixed structures and generated input names", () => withScene((_scene, material) => {
        const data = asset(); const plugin = new ExternalWgslMaterialPlugin(material, () => ({}));
        plugin.configure(data, defaultEffectAssignment(data));
        const generated = plugin.generatedSource();
        const compact = (text: string) => text.replace(/\s/g, "");
        expect(compact(generated)).toContain(compact(section("interfaces", "wgsl")));
        for (const [name, input] of Object.entries(data.manifest.inputs ?? {})) expect(generated).toContain(`${name}: ${input.type},`);
        expect(generated).toContain("var<uniform> modokiInputs: ModokiEffectInputs;");
        plugin.dispose();
    }));

    it("resolves documented material, first-light, time and pixel-size values", () => withScene((scene, material, mesh) => {
        material.diffuseColor.set(0.1, 0.2, 0.3); material.alpha = 0.4;
        material.ambientColor.set(0.3, 0.2, 0.1); material.specularColor.set(0.4, 0.5, 0.6); material.specularPower = 32;
        const data = asset(); const assignment = defaultEffectAssignment(data);
        const evaluate = () => resolveEffectInputs(data, assignment, material, mesh, time, { width: 640, height: 360 });
        expect(evaluate()).toMatchObject({ MaterialDiffuse: [0.1, 0.2, 0.3, 0.4], MaterialAmbient: [0.3, 0.2, 0.1],
            MaterialSpecular: [0.4, 0.5, 0.6], MaterialSpecularPower: 32,
            LightDiffuse: [0.2, 0.4, 0.8], CameraPosition: [2, 3, -6],
            Time: 1.5, ElapsedTime: -0.5, FreeTime: 3, FreeElapsedTime: 0.02, Frame: 45, ViewportSize: [640, 360] });
        expect(evaluate().LightDirection).toEqual([0, expect.closeTo(-0.6, 8), 0.8]);
        material.diffuseColor.set(0.7, 0.8, 0.9);
        expect(evaluate().MaterialDiffuse).toEqual([0.7, 0.8, 0.9, 0.4]);
        for (const light of [...scene.lights]) light.dispose();
        expect(evaluate).toThrow("Directional light unavailable");
    }));

    it("uses column-vector composition and the documented inverse/transpose variants", () => withScene((scene, material, mesh) => {
        mesh.position.set(1, 2, 3); mesh.rotation.set(0.2, 0.4, 0.1); mesh.scaling.set(2, 3, 4); mesh.computeWorldMatrix(true);
        const data = asset(); const values = resolveEffectInputs(data, defaultEffectAssignment(data), material, mesh, time, { width: 640, height: 360 });
        const apply = (m: ArrayLike<number>, v: number[]) => [0, 1, 2, 3].map(row => v.reduce((sum, value, column) => sum + m[column * 4 + row] * value, 0));
        const close = (actual: number[], expected: number[]) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 4));
        const point = [0.3, 0.8, -0.4, 1];
        const w = mesh.getWorldMatrix().asArray(), v = scene.getViewMatrix().asArray(), p = scene.getProjectionMatrix().asArray();
        close(apply(values.WorldView as number[], point), apply(v, apply(w, point)));
        close(apply(values.ViewProjection as number[], point), apply(p, apply(v, point)));
        close(apply(values.WorldViewProjection as number[], point), apply(p, apply(v, apply(w, point))));
        for (const name of ["World", "View", "Projection", "WorldView", "ViewProjection", "WorldViewProjection"]) {
            const base = values[name] as number[]; const inverse = values[name + "Inverse"] as number[];
            close(apply(inverse, apply(base, point)), point);
            for (const [source, target] of [[base, values[name + "Transpose"] as number[]], [inverse, values[name + "InverseTranspose"] as number[]]]) {
                for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) expect(target[column * 4 + row]).toBeCloseTo(source[row * 4 + column], 5);
            }
        }
        mesh.scaling.x = 0; mesh.computeWorldMatrix(true);
        expect(() => resolveEffectInputs(data, defaultEffectAssignment(data), material, mesh, time, { width: 640, height: 360 })).toThrow("Singular matrix");
    }));

    it("rejects Phong declarations on PBR and accepts the other 35 inputs", () => withScene((scene, _material, mesh) => {
        const material = new PBRMaterial("pbr", scene); material.albedoColor.set(0.7, 0.6, 0.5); material.alpha = 0.8;
        const data = asset();
        expect(() => validateEffectMaterialInputs(data, material)).toThrow("MaterialSpecular");
        const inputs = data.manifest.inputs ?? {};
        delete inputs.MaterialSpecular;
        expect(() => validateEffectMaterialInputs(data, material)).toThrow("MaterialSpecularPower");
        delete inputs.MaterialSpecularPower;
        const values = resolveEffectInputs(data, defaultEffectAssignment(data), material, mesh, time, { width: 640, height: 360 });
        expect(Object.keys(values)).toHaveLength(35);
        expect(values.MaterialDiffuse).toEqual([0.7, 0.6, 0.5, 0.8]);
    }));
});
