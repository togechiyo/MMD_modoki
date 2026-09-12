import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { matrixSemantic, type EffectAsset, type EffectAssignment, type EffectValue } from "./contract";

export type EffectTime = { frame: number; time: number; elapsed: number; asyncTime: number; asyncElapsed: number };
export class EffectClock {
    private previous: { frame: number; now: number; playing: boolean; anchor: number } | null = null;
    public evaluate(frame: number, playing: boolean, now: number, output?: { elapsed: number }): EffectTime {
        const previous = this.previous;
        const anchor = !previous || previous.playing !== playing || previous.frame !== frame ? now - frame / 30 : previous.anchor;
        const time = frame / 30;
        const elapsed = output?.elapsed ?? (previous ? (frame - previous.frame) / 30 : 0);
        this.previous = { frame, now, playing, anchor };
        return { frame, time, elapsed, asyncTime: output || playing ? time : now - anchor,
            asyncElapsed: output || playing ? elapsed : previous ? now - previous.now : 0 };
    }
}
export function resolveEffectInputs(asset: EffectAsset, assignment: EffectAssignment, material: StandardMaterial, mesh: AbstractMesh, time: EffectTime, viewportSize: { width: number; height: number }): Record<string, EffectValue> {
    const scene = material.getScene();
    const values: Record<string, EffectValue> = { ...assignment.parameters };
    const light = scene.lights.find(item => item instanceof DirectionalLight) as DirectionalLight | undefined;
    for (const [name, input] of Object.entries(asset.manifest.inputs ?? {})) {
        const matrix = matrixSemantic(input.semantic);
        if (matrix) {
            const matrices = { WORLD: mesh.getWorldMatrix(), VIEW: scene.getViewMatrix(), PROJECTION: scene.getProjectionMatrix() };
            let value: Matrix;
            switch (matrix.base) {
                case "WORLD": value = matrices.WORLD.clone(); break;
                case "VIEW": value = matrices.VIEW.clone(); break;
                case "PROJECTION": value = matrices.PROJECTION.clone(); break;
                case "WORLDVIEW": value = matrices.WORLD.multiply(matrices.VIEW); break;
                case "VIEWPROJECTION": value = matrices.VIEW.multiply(matrices.PROJECTION); break;
                default: value = matrices.WORLD.multiply(matrices.VIEW).multiply(matrices.PROJECTION);
            }
            if (matrix.inverse) { if (Math.abs(value.determinant()) < 1e-12) throw new Error("Singular matrix: " + name); value.invert(); }
            if (matrix.transpose) value = Matrix.Transpose(value);
            values[name] = Array.from(value.asArray()); continue;
        }
        switch (input.semantic) {
            case "TIME": values[name] = input.annotations?.SyncInEditMode ? time.time : time.asyncTime; break;
            case "ELAPSEDTIME": values[name] = input.annotations?.SyncInEditMode ? time.elapsed : time.asyncElapsed; break;
            case "MODOKI_FRAME": values[name] = time.frame; break;
            // The host owns output dimensions; the currently bound target may be an intermediate pass.
            case "VIEWPORTPIXELSIZE": values[name] = [viewportSize.width, viewportSize.height]; break;
            case "DIFFUSE":
                if (input.annotations?.Object === "Light") { if (!light) throw new Error("Directional light unavailable"); values[name] = light.diffuse.asArray(); }
                else values[name] = [...material.diffuseColor.asArray(), material.alpha];
                break;
            case "AMBIENT": values[name] = material.ambientColor.asArray(); break;
            case "SPECULAR": values[name] = material.specularColor.asArray(); break;
            case "SPECULARPOWER": values[name] = material.specularPower; break;
            case "POSITION": if (!scene.activeCamera) throw new Error("Camera unavailable"); values[name] = scene.activeCamera.globalPosition.asArray(); break;
            case "DIRECTION": if (!light) throw new Error("Directional light unavailable"); values[name] = light.direction.normalizeToNew().asArray(); break;
        }
    }
    return values;
}
