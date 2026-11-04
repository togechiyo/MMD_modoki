import { MAX_RADIANCE_TRIANGLES, RADIANCE_TRIANGLE_STRIDE, TriangleRadianceBvh, threadRadianceBvh,
    materializeRadianceIndexedPositions, type RadianceIndexedPositions } from "./triangle-radiance-bvh";

// geometryVersion certifies all fields except RGB; attributesVersion certifies all except position XYZ.
// An indexed override supplies current XYZ; triangles retain immutable source-order attributes.
type Input = { key: object; triangles: Float32Array; indexedPositions?: RadianceIndexedPositions; geometryVersion?: object; attributesVersion?: object };
type Entry = Input & { bvh: TriangleRadianceBvh; triangleOffset: number; nodeOffset: number };
export type RadianceBufferRange = { byteOffset: number; data: Float32Array };
type Changes = { triangles: RadianceBufferRange[]; nodes: RadianceBufferRange[] };
const NODE_STRIDE = 12;

// Mesh inputs are immutable chunks. Only a changed mesh is refitted/repacked; the top tree
// joins ordinary BLAS roots, so the GPU still traverses one tree starting at node zero.
export class MeshRadianceBvh {
    public nodes = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0]);
    public triangles = new Float32Array(RADIANCE_TRIANGLE_STRIDE);
    public triangleCount = 0;
    /** Changes whenever triangle IDs or threaded traversal order may have been reassigned. */
    public layoutRevision = 0;
    public changedMin = [Infinity, Infinity, Infinity];
    public changedMax = [-Infinity, -Infinity, -Infinity];
    private entries: Entry[] = [];
    private topCount = 0;

    public update(inputs: Input[]): Changes {
        this.changedMin.fill(Infinity); this.changedMax.fill(-Infinity);
        inputs = inputs.filter(input => input.triangles.length > 0);
        const count = inputs.reduce((total, input) => total + input.triangles.length / RADIANCE_TRIANGLE_STRIDE, 0);
        if (!Number.isInteger(count) || count > MAX_RADIANCE_TRIANGLES) throw new Error("3D RC triangle budget exceeded or invalid geometry");
        const rebuild = inputs.length !== this.entries.length || inputs.some((input, index) => {
            const previous = this.entries[index];
            return input.key !== previous.key || input.triangles.length !== previous.triangles.length;
        });
        const changed: Entry[] = [];
        const refitted = new Set<Entry>();
        if (rebuild) {
            if (this.triangleCount) this.includeBounds(this.nodes, 0);
            const previous = new Map(this.entries.map(entry => [entry.key, entry]));
            this.entries = inputs.map(input => {
                const old = previous.get(input.key), bvh = old?.bvh ?? new TriangleRadianceBvh();
                if (!old || input.triangles !== old.triangles || input.indexedPositions !== old.indexedPositions) this.updateEntry(bvh, input, old);
                return { ...input, bvh, triangleOffset: 0, nodeOffset: 0 };
            });
            this.topCount = Math.max(0, this.entries.length - 1);
            let triangleOffset = 0, nodeOffset = this.topCount;
            for (const entry of this.entries) {
                entry.triangleOffset = triangleOffset; entry.nodeOffset = nodeOffset;
                triangleOffset += entry.bvh.triangleCount;
                nodeOffset += entry.bvh.nodes.length / NODE_STRIDE;
            }
            this.triangles = new Float32Array(Math.max(RADIANCE_TRIANGLE_STRIDE, triangleOffset * RADIANCE_TRIANGLE_STRIDE));
            this.nodes = new Float32Array(Math.max(NODE_STRIDE, nodeOffset * NODE_STRIDE));
            changed.push(...this.entries);
        } else {
            for (let index = 0; index < inputs.length; index++) {
                const entry = this.entries[index], input = inputs[index];
                if (entry.triangles === input.triangles && entry.indexedPositions === input.indexedPositions) continue;
                this.includeBounds(entry.bvh.nodes, 0);
                if (this.updateEntry(entry.bvh, input, entry)) refitted.add(entry);
                entry.triangles = input.triangles; entry.geometryVersion = input.geometryVersion;
                entry.attributesVersion = input.attributesVersion; entry.indexedPositions = input.indexedPositions; changed.push(entry);
            }
        }
        this.triangleCount = count;
        const changes: Changes = { triangles: [], nodes: [] };
        for (const entry of changed) {
            this.includeBounds(entry.bvh.nodes, 0);
            const triangleOffset = entry.triangleOffset * RADIANCE_TRIANGLE_STRIDE;
            this.triangles.set(entry.bvh.triangles, triangleOffset);
            changes.triangles.push(this.range(this.triangles, triangleOffset, entry.bvh.triangles.length));
            // Emission still dirties contact lighting inside these bounds, but cannot move a tree node.
            if (!rebuild && !refitted.has(entry)) continue;
            const nodeOffset = entry.nodeOffset * NODE_STRIDE;
            const local = entry.bvh.nodes;
            if (rebuild) {
                this.nodes.set(local, nodeOffset);
                for (let offset = nodeOffset; offset < nodeOffset + local.length; offset += NODE_STRIDE) {
                    if (this.nodes[offset + 7]) this.nodes[offset + 3] += entry.triangleOffset;
                    else { this.nodes[offset + 3] += entry.nodeOffset; this.nodes[offset + 8] += entry.nodeOffset; }
                }
            } else {
                // A refit keeps the existing leaf starts, child links and cross-mesh escapes.
                for (let offset = 0; offset < local.length; offset += NODE_STRIDE) {
                    const target = nodeOffset + offset;
                    for (let axis = 0; axis < 3; axis++) {
                        this.nodes[target + axis] = local[offset + axis];
                        this.nodes[target + 4 + axis] = local[offset + 4 + axis];
                    }
                }
            }
            changes.nodes.push(this.range(this.nodes, nodeOffset, entry.bvh.nodes.length));
        }
        if (rebuild && this.topCount) this.buildTop();
        if (rebuild) {
            if (count) threadRadianceBvh(this.nodes);
            else this.nodes[9] = -1;
        }
        if ((rebuild || refitted.size) && this.topCount) {
            for (let node = this.topCount - 1; node >= 0; node--) {
                const offset = node * NODE_STRIDE, left = this.nodes[offset + 3] * NODE_STRIDE, right = this.nodes[offset + 8] * NODE_STRIDE;
                for (let axis = 0; axis < 3; axis++) {
                    this.nodes[offset + axis] = Math.min(this.nodes[left + axis], this.nodes[right + axis]);
                    this.nodes[offset + 4 + axis] = Math.max(this.nodes[left + 4 + axis], this.nodes[right + 4 + axis]);
                }
            }
            changes.nodes.unshift(this.range(this.nodes, 0, this.topCount * NODE_STRIDE));
        }
        if (rebuild) {
            this.layoutRevision++;
            return { triangles: [this.range(this.triangles, 0, this.triangles.length)], nodes: [this.range(this.nodes, 0, this.nodes.length)] };
        }
        return changes;
    }

    /** Returns whether bounds changed; RGB-only edits never disturb the current indexed pose. */
    private updateEntry(bvh: TriangleRadianceBvh, input: Input, previous?: Input): boolean {
        const sameCount = previous?.triangles.length === input.triangles.length;
        if (sameCount && input.geometryVersion && input.geometryVersion === previous?.geometryVersion) {
            bvh.updateEmission(input.triangles); return false;
        }
        if (sameCount && input.attributesVersion && input.attributesVersion === previous?.attributesVersion) {
            if (input.indexedPositions) bvh.updateIndexedPositions(input.indexedPositions);
            else bvh.updatePositions(input.triangles);
        } else bvh.update(input.indexedPositions ? materializeRadianceIndexedPositions(input.triangles, input.indexedPositions) : input.triangles);
        return true;
    }

    private includeBounds(nodes: Float32Array, offset: number): void {
        for (let axis = 0; axis < 3; axis++) {
            this.changedMin[axis] = Math.min(this.changedMin[axis], nodes[offset + axis]);
            this.changedMax[axis] = Math.max(this.changedMax[axis], nodes[offset + 4 + axis]);
        }
    }

    private range(data: Float32Array, offset: number, length: number): RadianceBufferRange {
        return { byteOffset: offset * Float32Array.BYTES_PER_ELEMENT, data: data.subarray(offset, offset + length) };
    }

    private buildTop(): void {
        let next = 0;
        const build = (entries: Entry[]): number => {
            if (entries.length === 1) return entries[0].nodeOffset;
            const index = next++, low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
            const center = (entry: Entry, axis: number): number => entry.bvh.nodes[axis] + entry.bvh.nodes[4 + axis];
            for (const entry of entries) for (let axis = 0; axis < 3; axis++) {
                low[axis] = Math.min(low[axis], center(entry, axis)); high[axis] = Math.max(high[axis], center(entry, axis));
            }
            const extent = high.map((value, axis) => value - low[axis]), axis = extent.indexOf(Math.max(...extent));
            entries.sort((a, b) => center(a, axis) - center(b, axis));
            const middle = entries.length >> 1;
            this.nodes[index * NODE_STRIDE + 3] = build(entries.slice(0, middle));
            this.nodes[index * NODE_STRIDE + 8] = build(entries.slice(middle));
            return index;
        };
        build(this.entries.slice());
    }
}
