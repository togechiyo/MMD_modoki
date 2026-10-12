/** Compare numeric inputs by value: transforms and vertex arrays can be mutated in place. */
export class RadianceInputSnapshot {
    private readonly parts: Float64Array[];
    constructor(parts: readonly ArrayLike<number>[]) { this.parts = parts.map(part => Float64Array.from(part)); }
    public matches(parts: readonly ArrayLike<number>[]): boolean {
        return parts.length === this.parts.length && parts.every((part, index) => {
            const snapshot = this.parts[index];
            if (part.length !== snapshot.length) return false;
            for (let i = 0; i < part.length; i++) if (part[i] !== snapshot[i]) return false;
            return true;
        });
    }
}

/** Keep the existing half resolution on small views, with a bounded gather budget on large displays. */
export function radianceReceiverSize(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(0.5, 640 / Math.max(1, width, height));
    return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}
