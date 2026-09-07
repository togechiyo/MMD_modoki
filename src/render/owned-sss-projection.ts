/** Deterministic light-space grid: no history or dependence on seek order. */
export function ownedSssProjectionRadius(requiredRadius: number): number {
    return 2 ** Math.ceil(Math.log2(Math.max(1, requiredRadius) * 1.125));
}

export function snapOwnedSssCoordinate(coordinate: number, radius: number, size: number): number {
    const texel = 2 * radius / size;
    return Math.round(coordinate / texel) * texel;
}
