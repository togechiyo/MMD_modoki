// World vertices, linear emission, UVs and texture source metadata (6 vec4s).
// 96 MB at this ceiling, below WebGPU's default 128 MiB storage binding limit.
export const MAX_RADIANCE_TRIANGLES = 1000000;
export const RADIANCE_TRIANGLE_STRIDE = 24;
export function radianceTriangleBudget(maxStorageBufferBindingSize: number, maxBufferSize: number): number {
    return Math.min(MAX_RADIANCE_TRIANGLES, Math.floor(Math.min(maxStorageBufferBindingSize, maxBufferSize)
        / (RADIANCE_TRIANGLE_STRIDE * Float32Array.BYTES_PER_ELEMENT)));
}
export class TriangleRadianceBvh {
    public nodes = new Float32Array(12);
    public triangles = new Float32Array(RADIANCE_TRIANGLE_STRIDE);
    public triangleCount = 0;
    private order: number[] = [];

    /** The caller certifies all geometry/UV/source fields are unchanged. Keep the BLAS/order intact. */
    public updateEmission(input: Float32Array): void {
        const stride = RADIANCE_TRIANGLE_STRIDE;
        if (input.length !== this.triangleCount * stride) throw new Error("3D RC emission update topology mismatch");
        for (let offset = 12; offset < input.length; offset += stride) {
            if (!Number.isFinite(input[offset]) || !Number.isFinite(input[offset + 1]) || !Number.isFinite(input[offset + 2])) {
                throw new Error("3D RC emission contains non-finite values");
            }
        }
        for (let index = 0; index < this.triangleCount; index++) {
            const source = this.order[index] * stride + 12, target = index * stride + 12;
            this.triangles[target] = input[source];
            this.triangles[target + 1] = input[source + 1];
            this.triangles[target + 2] = input[source + 2];
        }
    }

    public update(input: Float32Array): void {
        const stride = RADIANCE_TRIANGLE_STRIDE;
        const count = input.length / stride;
        if (!Number.isInteger(count) || count > MAX_RADIANCE_TRIANGLES) throw new Error("3D RC triangle budget exceeded or invalid geometry");
        if (input.some(value => !Number.isFinite(value))) throw new Error("3D RC geometry contains non-finite values");
        if (count !== this.triangleCount) {
            this.triangleCount = count;
            this.order = Array.from({ length: count }, (_, index) => index);
            const nodes: number[] = [];
            const build = (start: number, end: number): number => {
                const index = nodes.length / 12;
                nodes.push(...new Array<number>(12).fill(0));
                if (end - start <= 8) { nodes[index * 12 + 3] = start; nodes[index * 12 + 7] = end - start; }
                else {
                    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
                    for (let offset = start; offset < end; offset++) for (let axis = 0; axis < 3; axis++) {
                        const base = this.order[offset] * stride;
                        const center = (input[base + axis] + input[base + 4 + axis] + input[base + 8 + axis]) / 3;
                        low[axis] = Math.min(low[axis], center); high[axis] = Math.max(high[axis], center);
                    }
                    const extent = high.map((value, axis) => value - low[axis]);
                    const axis = extent.indexOf(Math.max(...extent));
                    const center = (triangle: number): number => input[triangle * stride + axis] + input[triangle * stride + 4 + axis] + input[triangle * stride + 8 + axis];
                    const sorted = this.order.slice(start, end).sort((a, b) => center(a) - center(b));
                    for (let offset = 0; offset < sorted.length; offset++) this.order[start + offset] = sorted[offset];
                    const middle = (start + end) >> 1;
                    nodes[index * 12 + 3] = build(start, middle);
                    nodes[index * 12 + 8] = build(middle, end);
                }
                return index;
            };
            if (count) build(0, count);
            this.nodes = new Float32Array(Math.max(12, nodes.length)); this.nodes.set(nodes);
            this.triangles = new Float32Array(Math.max(stride, input.length));
        }
        for (let index = 0; index < count; index++) this.triangles.set(input.subarray(this.order[index] * stride, (this.order[index] + 1) * stride), index * stride);
        // Refit for skinning, morphs and rigid transforms; rebuild when triangle count changes.
        for (let index = this.nodes.length / 12 - 1; index >= 0; index--) {
            const base = index * 12, first = this.nodes[base + 3], leafCount = this.nodes[base + 7];
            for (let axis = 0; axis < 3; axis++) {
                let low = Infinity, high = -Infinity;
                if (leafCount) {
                    for (let triangle = first; triangle < first + leafCount; triangle++) for (const vertex of [0, 4, 8]) {
                        const value = this.triangles[triangle * stride + vertex + axis];
                        low = Math.min(low, value); high = Math.max(high, value);
                    }
                } else if (count) {
                    const right = this.nodes[base + 8];
                    low = Math.min(this.nodes[first * 12 + axis], this.nodes[right * 12 + axis]);
                    high = Math.max(this.nodes[first * 12 + 4 + axis], this.nodes[right * 12 + 4 + axis]);
                } else { low = 0; high = 0; }
                this.nodes[base + axis] = low - 0.0001; this.nodes[base + 4 + axis] = high + 0.0001;
            }
        }
    }
}
