import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { FloatArray } from "@babylonjs/core/types";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";

type Pose = { positions: FloatArray; signature: ArrayLike<number> };
type MatrixViews = { palette: Float32Array; parts: Float32Array[] };
type CachedPose = Pose & { vertexInputs: RadianceInputSnapshot; animationInputs: RadianceInputSnapshot;
    bindingCount: number; matrices?: MatrixViews };

/** The views reference Babylon's live palette; animationInputs snapshots their values. */
function selectBoneMatrices(palette: Float32Array, vertexCount: number,
    bindings: ReadonlyArray<readonly [FloatArray, FloatArray]>): MatrixViews {
    const used = new Uint8Array(palette.length / 16);
    for (const [indices, weights] of bindings) {
        if (indices.length !== vertexCount * 4 || weights.length !== indices.length) return { palette, parts: [palette] };
        // Babylon ApplySkeleton reads every positive weight in each four-lane stream.
        for (let i = 0; i < weights.length; i++) {
            if (!(weights[i] > 0)) continue;
            const index = indices[i];
            // Fractional indices start partway through a matrix in Babylon. Keep its full input in that case.
            if (!Number.isInteger(index) || index < 0 || index >= used.length) return { palette, parts: [palette] };
            used[index] = 1;
        }
    }
    const parts: Float32Array[] = [];
    for (let start = 0; start < used.length;) {
        if (!used[start]) { start++; continue; }
        let end = start + 1;
        while (end < used.length && used[end]) end++;
        parts.push(palette.subarray(start * 16, end * 16));
        start = end;
    }
    return { palette, parts };
}

/** Compare the inputs before paying for CPU deformation. Matches Mesh.getPositionData's LBS inputs. */
export class LuminousRadiancePoseCache {
    private readonly poses = new WeakMap<Mesh, CachedPose>();
    private revision = 0;

    public read(mesh: Mesh): { positions: FloatArray | null; signature: ArrayLike<number> } {
        const source = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!source) return { positions: null, signature: [] };
        const targets: Array<{ positions: FloatArray; influence: number }> = [];
        const morphs = mesh.morphTargetManager;
        if (morphs) for (let i = 0; i < morphs.numTargets; i++) {
            const target = morphs.getTarget(i);
            if (target.influence === 0) continue;
            const positions = target.getPositions();
            if (positions) targets.push({ positions, influence: target.influence });
        }
        if (!mesh.skeleton && !targets.length) return { positions: source, signature: source };
        // Bone transforms and morph weights change during a dance. Keep the much
        // larger vertex, weight and target streams when their *values* still match.
        const vertexParts: ArrayLike<number>[] = [source];
        const animationParts: ArrayLike<number>[] = [[mesh.numBoneInfluencers, ...targets.map(target => target.influence)]];
        const bindings: Array<[FloatArray, FloatArray]> = [];
        if (mesh.skeleton) {
            const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind), weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
            vertexParts.push(indices ?? [], weights ?? []);
            if (indices && weights) bindings.push([indices, weights]);
            if (mesh.numBoneInfluencers > 4) {
                const extraIndices = mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind);
                const extraWeights = mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);
                vertexParts.push(extraIndices ?? [], extraWeights ?? []);
                if (bindings.length && extraIndices && extraWeights) bindings.push([extraIndices, extraWeights]);
            }
        }
        for (const target of targets) vertexParts.push(target.positions);
        const previous = this.poses.get(mesh);
        // An absent optional stream and a present empty stream both snapshot to [].
        // Babylon enables its extra lanes only when both buffers are present.
        const sameVertices = previous?.bindingCount === bindings.length && previous.vertexInputs.matches(vertexParts);
        let matrices: MatrixViews | undefined;
        if (bindings.length && mesh.skeleton) {
            const palette = mesh.skeleton.getTransformMatrices(mesh);
            matrices = sameVertices && previous.matrices?.palette === palette
                ? previous.matrices : selectBoneMatrices(palette, source.length / 3, bindings);
            for (const part of matrices.parts) animationParts.push(part);
        }
        const sameAnimation = previous?.animationInputs.matches(animationParts);
        if (sameVertices && sameAnimation) {
            previous.matrices = matrices;
            return previous;
        }
        // Native ApplyMorph visits every target for every component, even when almost all weights
        // are zero. Preserve its order and f32 rounding, but loop only over contributing targets.
        let data = source;
        if (targets.length) {
            data = source.slice();
            for (let i = 0; i < data.length; i++) {
                let value = data[i];
                for (const target of targets) value += (target.positions[i] - data[i]) * target.influence;
                data[i] = value;
            }
        }
        const positions = mesh.getPositionData(true, false, data);
        if (!positions) return { positions: null, signature: [] };
        const same = previous && previous.positions.length === positions.length && positions.every((value, i) => value === previous.positions[i]);
        const pose = { positions: same ? previous.positions : positions, signature: same ? previous.signature : [++this.revision],
            bindingCount: bindings.length, matrices,
            vertexInputs: sameVertices ? previous.vertexInputs : new RadianceInputSnapshot(vertexParts),
            animationInputs: sameAnimation ? previous.animationInputs : new RadianceInputSnapshot(animationParts) };
        this.poses.set(mesh, pose); return pose;
    }
}
