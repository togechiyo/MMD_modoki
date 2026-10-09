export type PlyMeshData = {
    positions: number[];
    indices: number[];
    normals: number[] | null;
    colors: number[] | null;
};

type ScalarType = { size: number; read(view: DataView, offset: number, little: boolean): number; integer: boolean };
const scalarTypes: Record<string, ScalarType> = {
    char: { size: 1, read: (v, o) => v.getInt8(o), integer: true },
    uchar: { size: 1, read: (v, o) => v.getUint8(o), integer: true },
    short: { size: 2, read: (v, o, l) => v.getInt16(o, l), integer: true },
    ushort: { size: 2, read: (v, o, l) => v.getUint16(o, l), integer: true },
    int: { size: 4, read: (v, o, l) => v.getInt32(o, l), integer: true },
    uint: { size: 4, read: (v, o, l) => v.getUint32(o, l), integer: true },
    float: { size: 4, read: (v, o, l) => v.getFloat32(o, l), integer: false },
    double: { size: 8, read: (v, o, l) => v.getFloat64(o, l), integer: false },
};
const aliases: Record<string, string> = {
    int8: "char", uint8: "uchar", int16: "short", uint16: "ushort",
    int32: "int", uint32: "uint", float32: "float", float64: "double",
};
type Property = { name: string; valueType: ScalarType; countType?: ScalarType };
type Element = { name: string; count: number; properties: Property[] };

function scalarType(name: string): ScalarType {
    const resolved = Object.hasOwn(aliases, name) ? aliases[name] : name;
    const type = Object.hasOwn(scalarTypes, resolved) ? scalarTypes[resolved] : undefined;
    if (!type) throw new Error(`Unsupported PLY property type: ${name}`);
    return type;
}

/** Static triangle meshes only. No texture references, point-cloud or Splat runtime. */
export function parsePlyMesh(data: ArrayBuffer): PlyMeshData {
    if (data.byteLength > 256 * 1024 * 1024) throw new Error("PLY file exceeds 256 MiB");
    const bytes = new Uint8Array(data);
    const header = new TextDecoder().decode(bytes.subarray(0, 64 * 1024));
    const end = /(?:^|\n)end_header\r?\n/.exec(header);
    if (!header.startsWith("ply\n") && !header.startsWith("ply\r\n")) throw new Error("Invalid PLY signature");
    if (!end) throw new Error("PLY header is missing or exceeds 64 KiB");
    const headerLength = new TextEncoder().encode(header.slice(0, end.index + end[0].length)).length;
    const elements: Element[] = [];
    let format = "";
    let current: Element | undefined;
    for (const line of header.slice(0, end.index).split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === "format") {
            if (parts[2] !== "1.0") throw new Error("Unsupported PLY version");
            format = parts[1];
        } else if (parts[0] === "element") {
            const count = Number(parts[2]);
            if (!Number.isSafeInteger(count) || count < 0 || count > 5_000_000 || count > bytes.length) {
                throw new Error("Invalid or excessive PLY element count");
            }
            current = { name: parts[1], count, properties: [] };
            elements.push(current);
        } else if (parts[0] === "property") {
            if (!current) throw new Error("PLY property has no element");
            const property: Property = parts[1] === "list"
                ? { name: parts[4], countType: scalarType(parts[2]), valueType: scalarType(parts[3]) }
                : { name: parts[2], valueType: scalarType(parts[1]) };
            if (!property.name || current.properties.some(p => p.name === property.name)
                || (property.countType && !property.countType.integer)) throw new Error("Invalid PLY property");
            current.properties.push(property);
        }
    }
    if (!["ascii", "binary_little_endian", "binary_big_endian"].includes(format)) throw new Error("Unsupported PLY encoding");
    const vertex = elements.find(e => e.name === "vertex");
    const face = elements.find(e => e.name === "face");
    if (!vertex?.count || !["x", "y", "z"].every(name => vertex.properties.some(p => p.name === name && !p.countType))) {
        throw new Error("PLY mesh needs vertex positions");
    }
    if (!face?.count) throw new Error("Point-cloud and Gaussian Splat PLY are not supported; use a PLY with triangle faces");
    if (elements.filter(e => e.name === "vertex").length !== 1 || elements.filter(e => e.name === "face").length !== 1) {
        throw new Error("Duplicate PLY vertex or face element");
    }
    if (!face.properties.some(p => ["vertex_indices", "vertex_index"].includes(p.name) && p.countType && p.valueType.integer)) {
        throw new Error("PLY faces need an integer vertex_indices list");
    }
    const hasNormals = ["nx", "ny", "nz"].every(name => vertex.properties.some(p => p.name === name && !p.countType));
    const hasColors = ["red", "green", "blue"].every(name => vertex.properties.some(p => p.name === name && !p.countType));
    const result: PlyMeshData = { positions: [], indices: [], normals: hasNormals ? [] : null, colors: hasColors ? [] : null };
    const view = new DataView(data);
    const ascii = format === "ascii" ? new TextDecoder().decode(bytes.subarray(headerLength)) : "";
    const tokenPattern = /\S+/g;
    let offset = headerLength;
    const read = (type: ScalarType): number => {
        let value: number;
        if (format === "ascii") {
            const token = tokenPattern.exec(ascii)?.[0];
            if (token === undefined) throw new Error("Truncated PLY data");
            value = Number(token);
        } else {
            if (offset + type.size > view.byteLength) throw new Error("Truncated PLY data");
            value = type.read(view, offset, format === "binary_little_endian");
            offset += type.size;
        }
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)) || (type.integer && !Number.isInteger(value))) {
            throw new Error("Invalid PLY numeric value");
        }
        return value;
    };
    for (const element of elements) {
        if (element.count && !element.properties.length) throw new Error("PLY element has no properties");
        for (let row = 0; row < element.count; row++) {
            const values: Record<string, number> = {};
            for (const property of element.properties) {
                if (property.countType) {
                    const count = read(property.countType);
                    if (!Number.isSafeInteger(count) || count < 0 || count > 1024) throw new Error("Invalid or excessive PLY list count");
                    const isFace = element === face && ["vertex_indices", "vertex_index"].includes(property.name);
                    if (isFace && count !== 3) throw new Error("Only triangle PLY faces are supported; triangulate the mesh before importing");
                    const indices: number[] = [];
                    for (let i = 0; i < count; i++) {
                        const value = read(property.valueType);
                        if (isFace) {
                            if (value < 0 || value >= vertex.count) throw new Error("PLY face index is outside the vertex range");
                            indices.push(value);
                        }
                    }
                    // Babylon's left-handed scene uses the reverse winding of authored PLY faces.
                    if (isFace) result.indices.push(indices[2], indices[1], indices[0]);
                } else {
                    values[property.name] = read(property.valueType);
                }
            }
            if (element === vertex) {
                result.positions.push(values.x, values.y, values.z);
                result.normals?.push(values.nx, values.ny, values.nz);
                if (result.colors) {
                    for (const name of ["red", "green", "blue", "alpha"]) {
                        const value = values[name] ?? (name === "alpha" ? 255 : 0);
                        if (value < 0 || value > 255) throw new Error("PLY vertex colors must be in the 0..255 range");
                        result.colors.push(value / 255);
                    }
                }
            }
        }
    }
    if (!result.indices.length) throw new Error("No triangle mesh data found in PLY file");
    return result;
}
