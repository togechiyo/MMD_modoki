export type XFaceDeduplicationInput = {
    positions: readonly number[];
    uvs: readonly number[] | null;
    faces: readonly (readonly number[])[];
    faceMaterials: readonly number[];
};

const POSITION_PRECISION = 1_000_000;
const UV_PRECISION = 1_000_000;

function quantize(value: number, precision: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * precision);
}

function getCornerKey(
    positions: readonly number[],
    uvs: readonly number[] | null,
    vertexIndex: number,
): string {
    const positionOffset = vertexIndex * 3;
    const positionKey = [
        quantize(positions[positionOffset] ?? 0, POSITION_PRECISION),
        quantize(positions[positionOffset + 1] ?? 0, POSITION_PRECISION),
        quantize(positions[positionOffset + 2] ?? 0, POSITION_PRECISION),
    ].join(":");

    if (!uvs) return positionKey;

    const uvOffset = vertexIndex * 2;
    return `${positionKey}:${quantize(uvs[uvOffset] ?? 0, UV_PRECISION)}:${quantize(uvs[uvOffset + 1] ?? 0, UV_PRECISION)}`;
}

function getCanonicalCyclicKey(corners: readonly string[]): string {
    let canonical = "";

    const consider = (sequence: readonly string[]): void => {
        for (let offset = 0; offset < sequence.length; offset += 1) {
            const rotated = [
                ...sequence.slice(offset),
                ...sequence.slice(0, offset),
            ].join("|");
            if (canonical === "" || rotated < canonical) canonical = rotated;
        }
    };

    consider(corners);
    consider([...corners].reverse());
    return canonical;
}

export function findRedundantXFaceIndices(input: XFaceDeduplicationInput): Set<number> {
    const redundant = new Set<number>();
    const firstFaceBySignature = new Map<string, number>();

    for (let faceIndex = 0; faceIndex < input.faces.length; faceIndex += 1) {
        const face = input.faces[faceIndex];
        if (!face || face.length < 3) continue;

        const materialIndex = input.faceMaterials[faceIndex] ?? 0;
        const corners = face.map((vertexIndex) => getCornerKey(
            input.positions,
            input.uvs,
            vertexIndex,
        ));
        const signature = `${materialIndex}/${face.length}/${getCanonicalCyclicKey(corners)}`;

        if (firstFaceBySignature.has(signature)) {
            redundant.add(faceIndex);
        } else {
            firstFaceBySignature.set(signature, faceIndex);
        }
    }

    return redundant;
}
