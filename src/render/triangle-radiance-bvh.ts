// World vertices, linear emission, UVs and texture source metadata (6 vec4s).
// 96 MB at this ceiling, below WebGPU's default 128 MiB storage binding limit.
export const MAX_RADIANCE_TRIANGLES = 1000000;
export const RADIANCE_TRIANGLE_STRIDE = 24;
// Match the existing stack traversal: push left then right, so visit right first.
// info.y is the node to visit after this subtree; -1 terminates the traversal.
export function threadRadianceBvh(nodes: Float32Array, index = 0, escape = -1): void {
    const offset = index * 12;
    nodes[offset + 9] = escape;
    if (nodes[offset + 7] === 0) {
        const left = nodes[offset + 3], right = nodes[offset + 8];
        threadRadianceBvh(nodes, right, left);
        threadRadianceBvh(nodes, left, escape);
    }
}
export function radianceTriangleBudget(maxStorageBufferBindingSize: number, maxBufferSize: number): number {
    return Math.min(MAX_RADIANCE_TRIANGLES, Math.floor(Math.min(maxStorageBufferBindingSize, maxBufferSize)
        / (RADIANCE_TRIANGLE_STRIDE * Float32Array.BYTES_PER_ELEMENT)));
}
export class TriangleRadianceBvh {
    public nodes = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0]);
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

    /** Caller certifies that topology and every non-position attribute still match. */
    public updatePositions(input: Float32Array): void {
        const stride = RADIANCE_TRIANGLE_STRIDE;
        if (input.length !== this.triangleCount * stride) throw new Error("3D RC position update topology mismatch");
        for (let offset = 0; offset < input.length; offset += stride) {
            for (let vertex = offset; vertex < offset + 12; vertex += 4) {
                if (!Number.isFinite(input[vertex]) || !Number.isFinite(input[vertex + 1]) || !Number.isFinite(input[vertex + 2])) {
                    throw new Error("3D RC geometry contains non-finite values");
                }
            }
        }
        this.refit(input);
    }

    public update(input: Float32Array): void {
        const stride = RADIANCE_TRIANGLE_STRIDE;
        const count = input.length / stride;
        if (!Number.isInteger(count) || count > MAX_RADIANCE_TRIANGLES) throw new Error("3D RC triangle budget exceeded or invalid geometry");
        for (let i = 0; i < input.length; i++) {
            if (!Number.isFinite(input[i])) throw new Error("3D RC geometry contains non-finite values");
        }
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
            if (count) threadRadianceBvh(this.nodes);
            else this.nodes[9] = -1;
            this.triangles = new Float32Array(Math.max(stride, input.length));
        }
        for (let index = 0; index < count; index++) {
            const source = this.order[index] * stride, target = index * stride;
            for (let component = 0; component < stride; component++) this.triangles[target + component] = input[source + component];
        }
        this.refit();
    }

    private refit(positions?: Float32Array): void {
        const count = this.triangleCount, stride = RADIANCE_TRIANGLE_STRIDE;
        const nodes = this.nodes, sorted = this.triangles, data = positions ?? sorted;
        for (let base = nodes.length - 12; base >= 0; base -= 12) {
            const first = nodes[base + 3], leafCount = nodes[base + 7];
            if (leafCount) {
                // The sorted range belongs to exactly one leaf. Copy the new pose
                // and accumulate its bounds while those coordinates are in registers.
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                for (let triangle = first; triangle < first + leafCount; triangle++) {
                    const target = triangle * stride, source = positions ? this.order[triangle] * stride : target;
                    const ax = data[source], ay = data[source + 1], az = data[source + 2];
                    const bx = data[source + 4], by = data[source + 5], bz = data[source + 6];
                    const cx = data[source + 8], cy = data[source + 9], cz = data[source + 10];
                    if (positions) {
                        sorted[target] = ax; sorted[target + 1] = ay; sorted[target + 2] = az;
                        sorted[target + 4] = bx; sorted[target + 5] = by; sorted[target + 6] = bz;
                        sorted[target + 8] = cx; sorted[target + 9] = cy; sorted[target + 10] = cz;
                    }
                    minX = Math.min(minX, ax, bx, cx); maxX = Math.max(maxX, ax, bx, cx);
                    minY = Math.min(minY, ay, by, cy); maxY = Math.max(maxY, ay, by, cy);
                    minZ = Math.min(minZ, az, bz, cz); maxZ = Math.max(maxZ, az, bz, cz);
                }
                nodes[base] = minX - 0.0001; nodes[base + 4] = maxX + 0.0001;
                nodes[base + 1] = minY - 0.0001; nodes[base + 5] = maxY + 0.0001;
                nodes[base + 2] = minZ - 0.0001; nodes[base + 6] = maxZ + 0.0001;
                continue;
            }
            const left = first * 12, right = nodes[base + 8] * 12;
            for (let axis = 0; axis < 3; axis++) {
                const low = count ? Math.min(nodes[left + axis], nodes[right + axis]) : 0;
                const high = count ? Math.max(nodes[left + 4 + axis], nodes[right + 4 + axis]) : 0;
                nodes[base + axis] = low - 0.0001; nodes[base + 4 + axis] = high + 0.0001;
            }
        }
    }
}
