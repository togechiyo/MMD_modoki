import { MAX_RADIANCE_TRIANGLES, RADIANCE_TRIANGLE_STRIDE, TriangleRadianceBvh } from "./triangle-radiance-bvh";

type Input = { key: object; triangles: Float32Array };
type Entry = Input & { bvh: TriangleRadianceBvh; triangleOffset: number; nodeOffset: number };
export type RadianceBufferRange = { byteOffset: number; data: Float32Array };
type Changes = { triangles: RadianceBufferRange[]; nodes: RadianceBufferRange[] };
const NODE_STRIDE = 12;

// Mesh inputs are immutable chunks. Only a changed mesh is refitted/repacked; the top tree
// joins ordinary BLAS roots, so the GPU still traverses one tree starting at node zero.
export class MeshRadianceBvh {
    public nodes = new Float32Array(NODE_STRIDE);
    public triangles = new Float32Array(RADIANCE_TRIANGLE_STRIDE);
    public triangleCount = 0;
    private entries: Entry[] = [];
    private topCount = 0;

    public update(inputs: Input[]): Changes {
        inputs = inputs.filter(input => input.triangles.length > 0);
        const count = inputs.reduce((total, input) => total + input.triangles.length / RADIANCE_TRIANGLE_STRIDE, 0);
        if (!Number.isInteger(count) || count > MAX_RADIANCE_TRIANGLES) throw new Error("3D RC triangle budget exceeded or invalid geometry");
        const rebuild = inputs.length !== this.entries.length || inputs.some((input, index) => {
            const previous = this.entries[index];
            return input.key !== previous.key || input.triangles.length !== previous.triangles.length;
        });
        const changed: Entry[] = [];
        if (rebuild) {
            const previous = new Map(this.entries.map(entry => [entry.key, entry]));
            this.entries = inputs.map(input => {
                const old = previous.get(input.key), bvh = old?.bvh ?? new TriangleRadianceBvh();
                if (input.triangles !== old?.triangles) bvh.update(input.triangles);
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
                if (entry.triangles === input.triangles) continue;
                entry.bvh.update(input.triangles); entry.triangles = input.triangles; changed.push(entry);
            }
        }
        this.triangleCount = count;
        const changes: Changes = { triangles: [], nodes: [] };
        for (const entry of changed) {
            const triangleOffset = entry.triangleOffset * RADIANCE_TRIANGLE_STRIDE;
            this.triangles.set(entry.bvh.triangles, triangleOffset);
            const nodeOffset = entry.nodeOffset * NODE_STRIDE;
            this.nodes.set(entry.bvh.nodes, nodeOffset);
            for (let offset = nodeOffset; offset < nodeOffset + entry.bvh.nodes.length; offset += NODE_STRIDE) {
                if (this.nodes[offset + 7]) this.nodes[offset + 3] += entry.triangleOffset;
                else { this.nodes[offset + 3] += entry.nodeOffset; this.nodes[offset + 8] += entry.nodeOffset; }
            }
            changes.triangles.push(this.range(this.triangles, triangleOffset, entry.bvh.triangles.length));
            changes.nodes.push(this.range(this.nodes, nodeOffset, entry.bvh.nodes.length));
        }
        if (rebuild && this.topCount) this.buildTop();
        if (changed.length && this.topCount) {
            for (let node = this.topCount - 1; node >= 0; node--) {
                const offset = node * NODE_STRIDE, left = this.nodes[offset + 3] * NODE_STRIDE, right = this.nodes[offset + 8] * NODE_STRIDE;
                for (let axis = 0; axis < 3; axis++) {
                    this.nodes[offset + axis] = Math.min(this.nodes[left + axis], this.nodes[right + axis]);
                    this.nodes[offset + 4 + axis] = Math.max(this.nodes[left + 4 + axis], this.nodes[right + 4 + axis]);
                }
            }
            changes.nodes.unshift(this.range(this.nodes, 0, this.topCount * NODE_STRIDE));
        }
        if (rebuild) return { triangles: [this.range(this.triangles, 0, this.triangles.length)], nodes: [this.range(this.nodes, 0, this.nodes.length)] };
        return changes;
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
