import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { FloatArray } from "@babylonjs/core/types";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";

type Pose = { positions: FloatArray; signature: ArrayLike<number> };
type CachedPose = Pose & { snapshot: RadianceInputSnapshot };

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
        const parts: ArrayLike<number>[] = [source, [mesh.numBoneInfluencers]];
        if (mesh.skeleton) {
            const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind), weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
            parts.push(indices ?? [], weights ?? []);
            if (indices && weights) parts.push(mesh.skeleton.getTransformMatrices(mesh));
            if (mesh.numBoneInfluencers > 4) parts.push(mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind) ?? [],
                mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind) ?? []);
        }
        for (const target of targets) parts.push([target.influence], target.positions);
        const previous = this.poses.get(mesh);
        if (previous?.snapshot.matches(parts)) return previous;
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
            snapshot: new RadianceInputSnapshot(parts) };
        this.poses.set(mesh, pose); return pose;
    }
}
