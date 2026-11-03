import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { FloatArray } from "@babylonjs/core/types";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";

type Pose = { positions: FloatArray; signature: ArrayLike<number> };
type CachedPose = Pose & { vertexInputs: RadianceInputSnapshot; animationInputs: RadianceInputSnapshot };

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
        if (mesh.skeleton) {
            const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind), weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
            vertexParts.push(indices ?? [], weights ?? []);
            if (indices && weights) animationParts.push(mesh.skeleton.getTransformMatrices(mesh));
            if (mesh.numBoneInfluencers > 4) vertexParts.push(mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind) ?? [],
                mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind) ?? []);
        }
        for (const target of targets) vertexParts.push(target.positions);
        const previous = this.poses.get(mesh);
        const sameVertices = previous?.vertexInputs.matches(vertexParts);
        const sameAnimation = previous?.animationInputs.matches(animationParts);
        if (sameVertices && sameAnimation) return previous;
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
            vertexInputs: sameVertices ? previous.vertexInputs : new RadianceInputSnapshot(vertexParts),
            animationInputs: sameAnimation ? previous.animationInputs : new RadianceInputSnapshot(animationParts) };
        this.poses.set(mesh, pose); return pose;
    }
}
