function matchesFloat32(snapshot: Float32Array, input: Float32Array): boolean {
    for (let i = 0; i < input.length; i++) if (input[i] !== snapshot[i]) return false;
    return true;
}
function matchesNumbers(snapshot: ArrayLike<number>, input: ArrayLike<number>): boolean {
    for (let i = 0; i < input.length; i++) if (input[i] !== snapshot[i]) return false;
    return true;
}

/** Compare numeric inputs by value: transforms and vertex arrays can be mutated in place. */
export class RadianceInputSnapshot {
    private readonly parts: Array<Float32Array | Float64Array>;
    constructor(parts: readonly ArrayLike<number>[]) {
        this.parts = parts.map(part => part instanceof Float32Array ? part.slice() : Float64Array.from(part));
    }
    public matches(parts: readonly ArrayLike<number>[]): boolean {
        return parts.length === this.parts.length && parts.every((part, index) => {
            const snapshot = this.parts[index];
            if (part.length !== snapshot.length) return false;
            // Keep the long f32 streams in their own monomorphic loop. Mixing JS arrays,
            // f32 vertices and f64 snapshots in one indexed loop makes dense comparisons costly.
            return snapshot instanceof Float32Array && part instanceof Float32Array
                ? matchesFloat32(snapshot, part) : matchesNumbers(snapshot, part);
        });
    }
}

/** Keep the existing half resolution on small views, with a bounded gather budget on large displays. */
export function radianceReceiverSize(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(0.5, 640 / Math.max(1, width, height));
    return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}
