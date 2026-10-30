import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { readRcDiffuseGiLight } from "./rc-diffuse-gi-light";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine);
    return { scene, light: new DirectionalLight("main", new Vector3(0, -2, 0), scene) };
}

describe("RC GI directional light snapshot", () => {
    it("uses normalized incoming direction and changes for direction, color, intensity and OFF", () => {
        const { light } = fixture();
        light.diffuse = new Color3(1, 0.5, 0.25); light.intensity = 2;
        expect(readRcDiffuseGiLight(light)).toEqual({ directionToLight: [-0, 1, -0], color: [2, 1, 0.5] });
        light.direction.set(-2, 0, 0); light.diffuse.r = 0.25;
        expect(readRcDiffuseGiLight(light)).toEqual({ directionToLight: [1, -0, -0], color: [0.5, 1, 0.5] });
        light.setEnabled(false);
        expect(readRcDiffuseGiLight(light)?.color).toEqual([0, 0, 0]);
    });

    it("follows a transformed light and returns to local direction after the parent is removed", () => {
        const { scene, light } = fixture(), parent = new TransformNode("parent", scene);
        parent.rotation.z = Math.PI / 2; parent.computeWorldMatrix(true); light.parent = parent;
        const incoming = readRcDiffuseGiLight(light)?.directionToLight;
        expect(incoming?.[0]).toBeCloseTo(-1); expect(incoming?.[1]).toBeCloseTo(0);
        light.parent = null;
        expect(readRcDiffuseGiLight(light)?.directionToLight).toEqual([-0, 1, -0]);
    });

    it("rejects missing, zero or invalid inputs without publishing NaN lighting", () => {
        const { light } = fixture();
        expect(readRcDiffuseGiLight(null)).toBeNull();
        light.direction.setAll(0); expect(readRcDiffuseGiLight(light)).toBeNull();
        light.direction.set(0, -1, 0); light.diffuse.b = NaN; expect(readRcDiffuseGiLight(light)).toBeNull();
        light.diffuse.b = 1; light.intensity = Infinity; expect(readRcDiffuseGiLight(light)).toBeNull();
    });
});
