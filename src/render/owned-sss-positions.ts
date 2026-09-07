import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/** Match Babylon's morph-then-skeleton positions without scanning inactive
 * morph targets for every vertex component. No pose history is retained. */
export function getOwnedSssPositions(mesh: AbstractMesh) {
    const manager = mesh.morphTargetManager;
    const active = [];
    if (manager) for (let i = 0; i < manager.numTargets; i++) {
        const target = manager.getTarget(i);
        if (target.influence === 0) continue;
        const positions = target.getPositions();
        if (positions) active.push({ positions, influence: target.influence });
    }
    if (active.length === 0) return mesh.getPositionData(true, false);
    const source = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!source) return null;
    // Preserve the source array's rounding, target order, and per-component
    // accumulation before the installed Babylon skeleton implementation runs.
    const morphed = source.slice();
    for (let i = 0; i < source.length; i++) {
        let value = source[i];
        for (const target of active) value += (target.positions[i] - source[i]) * target.influence;
        morphed[i] = value;
    }
    return mesh.getPositionData(true, false, morphed);
}
