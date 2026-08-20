export const MMD_RENDER_ORDER_MODES = [
    "evaluated",
    "mmd-fixed",
] as const;

export type MmdRenderOrderMode = typeof MMD_RENDER_ORDER_MODES[number];

export const DEFAULT_MMD_RENDER_ORDER_MODE: MmdRenderOrderMode = "evaluated";

// Keep MMD model materials away from ordinary scene transparency indices and
// reserve enough room for unusually large PMX material lists.
export const MMD_RENDER_ORDER_ALPHA_INDEX_BASE = 1 << 16;
export const MMD_RENDER_ORDER_MODEL_STRIDE = 1 << 12;
export const DEFAULT_MMD_COPLANAR_DEPTH_BIAS_STRENGTH = 0;
export const MAX_MMD_COPLANAR_DEPTH_BIAS_STRENGTH = 4;
export const MAX_MMD_COPLANAR_DEPTH_BIAS_UNITS = 64;

export type MmdAxisAlignedBounds = {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
};

export function normalizeMmdRenderOrderMode(value: unknown): MmdRenderOrderMode {
    return value === "mmd-fixed" ? value : DEFAULT_MMD_RENDER_ORDER_MODE;
}

export function normalizeMmdModelRenderOrder(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Math.max(0, Math.trunc(fallback));
    return Math.max(0, Math.trunc(numeric));
}

export function normalizeMmdCoplanarDepthBiasStrength(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_MMD_COPLANAR_DEPTH_BIAS_STRENGTH;
    return Math.max(0, Math.min(MAX_MMD_COPLANAR_DEPTH_BIAS_STRENGTH, Math.round(numeric)));
}

export function getMmdGeometryBoundsFromPositions(
    positions: ArrayLike<number> | null | undefined,
): MmdAxisAlignedBounds | null {
    if (!positions || positions.length < 3) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let index = 0; index + 2 < positions.length; index += 3) {
        const x = Number(positions[index]);
        const y = Number(positions[index + 1]);
        const z = Number(positions[index + 2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
    }
    return Number.isFinite(min.x) && Number.isFinite(max.x) ? { min, max } : null;
}

export function getMmdGeometryBoundsFromIndexedRange(
    positions: ArrayLike<number> | null | undefined,
    indices: ArrayLike<number> | null | undefined,
    indexStart: number,
    indexCount: number,
): MmdAxisAlignedBounds | null {
    if (!positions || positions.length < 3 || !indices || indices.length === 0) return null;
    const start = Math.max(0, Math.min(indices.length, Math.trunc(indexStart)));
    const end = Math.max(start, Math.min(indices.length, start + Math.max(0, Math.trunc(indexCount))));
    if (start === end) return null;

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let indexOffset = start; indexOffset < end; indexOffset += 1) {
        const vertexIndex = Math.trunc(Number(indices[indexOffset]));
        const positionOffset = vertexIndex * 3;
        if (vertexIndex < 0 || positionOffset + 2 >= positions.length) continue;
        const x = Number(positions[positionOffset]);
        const y = Number(positions[positionOffset + 1]);
        const z = Number(positions[positionOffset + 2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
    }
    return Number.isFinite(min.x) && Number.isFinite(max.x) ? { min, max } : null;
}

export function getMmdMaterialAlphaIndex(modelRenderOrder: number, materialOrder: number): number {
    const normalizedModelOrder = normalizeMmdModelRenderOrder(modelRenderOrder, 0);
    const normalizedMaterialOrder = Math.max(0, Math.trunc(Number(materialOrder) || 0));
    return MMD_RENDER_ORDER_ALPHA_INDEX_BASE
        + normalizedModelOrder * MMD_RENDER_ORDER_MODEL_STRIDE
        + normalizedMaterialOrder;
}

export function getNextMmdModelRenderOrder(currentOrders: readonly number[]): number {
    return currentOrders.reduce(
        (next, order, index) => Math.max(next, normalizeMmdModelRenderOrder(order, index) + 1),
        0,
    );
}

export function getMmdCoplanarMaterialDepthBiasUnits(
    bounds: readonly MmdAxisAlignedBounds[],
    strength: unknown,
): number[] {
    const normalizedStrength = normalizeMmdCoplanarDepthBiasStrength(strength);
    const result = new Array<number>(bounds.length).fill(0);
    if (normalizedStrength === 0 || bounds.length < 2) return result;
    const biasUnitsPerStep = 2 ** (normalizedStrength - 1);

    const planes = bounds.map(classifyCoplanarCandidate);
    const adjacency = bounds.map(() => new Set<number>());
    for (let left = 0; left < planes.length; left += 1) {
        const leftPlane = planes[left];
        if (!leftPlane) continue;
        for (let right = left + 1; right < planes.length; right += 1) {
            const rightPlane = planes[right];
            if (!rightPlane || !areCoplanarCandidatesOverlapping(leftPlane, rightPlane)) continue;
            adjacency[left].add(right);
            adjacency[right].add(left);
        }
    }

    const visited = new Set<number>();
    for (let start = 0; start < adjacency.length; start += 1) {
        if (visited.has(start) || adjacency[start].size === 0) continue;
        const component: number[] = [];
        const pending = [start];
        visited.add(start);
        while (pending.length > 0) {
            const current = pending.pop();
            if (current === undefined) break;
            component.push(current);
            for (const neighbor of adjacency[current]) {
                if (visited.has(neighbor)) continue;
                visited.add(neighbor);
                pending.push(neighbor);
            }
        }

        component.sort((a, b) => a - b);
        component.forEach((materialOrder, rank) => {
            if (rank === 0) {
                result[materialOrder] = 0;
                return;
            }
            result[materialOrder] = -Math.min(
                MAX_MMD_COPLANAR_DEPTH_BIAS_UNITS,
                rank * biasUnitsPerStep,
            );
        });
    }
    return result;
}

type CoplanarCandidate = {
    thinAxis: 0 | 1 | 2;
    center: [number, number, number];
    size: [number, number, number];
    min: [number, number, number];
    max: [number, number, number];
};

function classifyCoplanarCandidate(bounds: MmdAxisAlignedBounds): CoplanarCandidate | null {
    const min: [number, number, number] = [bounds.min.x, bounds.min.y, bounds.min.z];
    const max: [number, number, number] = [bounds.max.x, bounds.max.y, bounds.max.z];
    if (![...min, ...max].every(Number.isFinite)) return null;
    const size: [number, number, number] = [
        Math.max(0, max[0] - min[0]),
        Math.max(0, max[1] - min[1]),
        Math.max(0, max[2] - min[2]),
    ];
    const sortedAxes = [0, 1, 2].sort((a, b) => size[a] - size[b]);
    const thinAxis = sortedAxes[0] as 0 | 1 | 2;
    const middleSize = size[sortedAxes[1]];
    const majorSize = size[sortedAxes[2]];
    if (majorSize < 0.25 || middleSize < majorSize * 0.05) return null;
    if (size[thinAxis] > Math.max(0.02, majorSize * 0.002)) return null;
    return {
        thinAxis,
        center: [
            (min[0] + max[0]) * 0.5,
            (min[1] + max[1]) * 0.5,
            (min[2] + max[2]) * 0.5,
        ],
        size,
        min,
        max,
    };
}

function areCoplanarCandidatesOverlapping(left: CoplanarCandidate, right: CoplanarCandidate): boolean {
    if (left.thinAxis !== right.thinAxis) return false;
    const thinAxis = left.thinAxis;
    const majorSize = Math.max(...left.size, ...right.size);
    if (majorSize < 5) return false;
    const planeDistanceTolerance = Math.max(
        0.02,
        (left.size[thinAxis] + right.size[thinAxis]) * 0.5 + majorSize * 0.0005,
    );
    if (Math.abs(left.center[thinAxis] - right.center[thinAxis]) > planeDistanceTolerance) return false;

    const planeAxes = ([0, 1, 2] as const).filter((axis) => axis !== thinAxis);
    let overlapArea = 1;
    let smallerArea = 1;
    for (const axis of planeAxes) {
        const overlap = Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]);
        if (overlap <= 0) return false;
        overlapArea *= overlap;
        smallerArea *= Math.min(left.size[axis], right.size[axis]);
    }
    return smallerArea > 0 && overlapArea / smallerArea >= 0.05;
}

export function moveMmdModelRenderOrder(
    currentOrders: readonly number[],
    modelIndex: number,
    direction: -1 | 1,
): number[] | null {
    if (!Number.isInteger(modelIndex) || modelIndex < 0 || modelIndex >= currentOrders.length) {
        return null;
    }

    const rankedIndices = currentOrders
        .map((order, index) => ({ index, order: normalizeMmdModelRenderOrder(order, index) }))
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map((entry) => entry.index);
    const rank = rankedIndices.indexOf(modelIndex);
    const targetRank = rank + direction;
    if (rank < 0 || targetRank < 0 || targetRank >= rankedIndices.length) return null;

    [rankedIndices[rank], rankedIndices[targetRank]] = [rankedIndices[targetRank], rankedIndices[rank]];
    const nextOrders = new Array<number>(currentOrders.length);
    rankedIndices.forEach((index, order) => {
        nextOrders[index] = order;
    });
    return nextOrders;
}
