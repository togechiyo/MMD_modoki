// Original CPU BVH. Triangles are 4 vec4s (world vertices + linear emission).
export const MAX_RADIANCE_TRIANGLES = 100000;
export class TriangleRadianceBvh {
    public nodes = new Float32Array(12);
    public triangles = new Float32Array(16);
    public triangleCount = 0;
    private order: number[] = [];

    public update(input: Float32Array): void {
        const count = input.length / 16;
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
                        const base = this.order[offset] * 16;
                        const center = (input[base + axis] + input[base + 4 + axis] + input[base + 8 + axis]) / 3;
                        low[axis] = Math.min(low[axis], center); high[axis] = Math.max(high[axis], center);
                    }
                    const extent = high.map((value, axis) => value - low[axis]);
                    const axis = extent.indexOf(Math.max(...extent));
                    const center = (triangle: number): number => input[triangle * 16 + axis] + input[triangle * 16 + 4 + axis] + input[triangle * 16 + 8 + axis];
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
            this.triangles = new Float32Array(Math.max(16, input.length));
        }
        for (let index = 0; index < count; index++) this.triangles.set(input.subarray(this.order[index] * 16, this.order[index] * 16 + 16), index * 16);
        // Refit for skinning, morphs and rigid transforms; rebuild when triangle count changes.
        for (let index = this.nodes.length / 12 - 1; index >= 0; index--) {
            const base = index * 12, first = this.nodes[base + 3], leafCount = this.nodes[base + 7];
            for (let axis = 0; axis < 3; axis++) {
                let low = Infinity, high = -Infinity;
                if (leafCount) {
                    for (let triangle = first; triangle < first + leafCount; triangle++) for (const vertex of [0, 4, 8]) {
                        const value = this.triangles[triangle * 16 + vertex + axis];
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
