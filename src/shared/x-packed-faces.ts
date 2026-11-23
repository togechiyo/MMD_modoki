/** Face n uses indices[offsets[n] .. offsets[n + 1]). */
export type PackedXFaces = {
    offsets: Uint32Array;
    indices: Uint32Array;
};
