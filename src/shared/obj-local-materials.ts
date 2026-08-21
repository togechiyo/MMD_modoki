import { OBJFileLoader } from "@babylonjs/loaders/OBJ/objFileLoader.js";

export type ObjLocalFileReader = {
    readTextFile: (filePath: string) => Promise<string | null>;
    readBinaryFile: (filePath: string) => Promise<ArrayBuffer | ArrayBufferView | null>;
};

export type PreparedObjMaterialBundle = {
    materialReference: string | null;
    materialPath: string | null;
    mtlData: string | null;
    loadedTextureCount: number;
    warnings: string[];
};

export function createObjLoaderForLocalMaterialData(mtlData: string | null): OBJFileLoader {
    const loader = new OBJFileLoader({
        skipMaterials: mtlData === null,
        materialLoadingFailsSilently: true,
    });
    if (mtlData === null) return loader;

    const loaderWithLocalMtl = loader as unknown as {
        _loadMTL: (
            url: string,
            rootUrl: string,
            onSuccess: (data: string | ArrayBuffer) => void,
            onFailure: (pathOfFile: string, exception: unknown) => void,
        ) => void;
    };
    loaderWithLocalMtl._loadMTL = (_url, _rootUrl, onSuccess) => {
        onSuccess(mtlData);
    };
    return loader;
}

type MtlTextureStatement = {
    lineIndex: number;
    indentation: string;
    keyword: string;
    optionPrefix: string;
    reference: string;
    supported: boolean;
};

const MAX_OBJ_TEXTURE_BYTES = 64 * 1024 * 1024;
const MTL_TEXTURE_KEYWORD_PATTERN = /^(\s*)(map_ka|map_kd|map_ks|map_bump|map_d)\s+(.+?)\s*$/i;

function unquotePath(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1).trim();
        }
    }
    return trimmed;
}

export function findObjMaterialLibraryReference(objData: string): string | null {
    let reference: string | null = null;
    for (const rawLine of objData.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("#")) continue;
        const match = /^mtllib\s+(.+)$/i.exec(line);
        if (!match) continue;
        const candidate = unquotePath(match[1] ?? "");
        if (candidate.length > 0) reference = candidate;
    }
    return reference;
}

type ParsedAbsoluteLocalPath = {
    root: string;
    segments: string[];
    caseInsensitive: boolean;
};

function parseAbsoluteLocalPath(filePath: string): ParsedAbsoluteLocalPath | null {
    const normalized = filePath.trim().replace(/\\/g, "/");
    const driveMatch = /^([a-z]):\/(.*)$/i.exec(normalized);
    if (driveMatch) {
        return {
            root: `${driveMatch[1]?.toUpperCase()}:`,
            segments: (driveMatch[2] ?? "").split("/").filter(Boolean),
            caseInsensitive: true,
        };
    }
    if (normalized.startsWith("//")) {
        const segments = normalized.slice(2).split("/").filter(Boolean);
        if (segments.length < 2) return null;
        return {
            root: `//${segments[0]}/${segments[1]}`,
            segments: segments.slice(2),
            caseInsensitive: true,
        };
    }
    if (normalized.startsWith("/")) {
        return {
            root: "/",
            segments: normalized.slice(1).split("/").filter(Boolean),
            caseInsensitive: false,
        };
    }
    return null;
}

function localPathSegmentEquals(left: string, right: string, caseInsensitive: boolean): boolean {
    return caseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function formatAbsoluteLocalPath(path: ParsedAbsoluteLocalPath): string {
    if (path.root === "/") return `/${path.segments.join("/")}`;
    return `${path.root}/${path.segments.join("/")}`;
}

export function resolveLocalObjCompanionPath(
    ownerFilePath: string,
    reference: string,
    allowedRootFilePath: string = ownerFilePath,
): string | null {
    const ownerPath = parseAbsoluteLocalPath(ownerFilePath);
    const allowedRootPath = parseAbsoluteLocalPath(allowedRootFilePath);
    const normalizedReference = unquotePath(reference).replace(/\\/g, "/");
    if (!ownerPath || !allowedRootPath || !normalizedReference || normalizedReference.includes("\0")) return null;
    if (normalizedReference.startsWith("/") || normalizedReference.startsWith("//")) return null;
    if (/^[a-z]:/i.test(normalizedReference) || /^[a-z][a-z0-9+.-]*:/i.test(normalizedReference)) return null;
    if (!localPathSegmentEquals(ownerPath.root, allowedRootPath.root, ownerPath.caseInsensitive)) return null;

    const resolvedSegments = ownerPath.segments.slice(0, -1);
    for (const segment of normalizedReference.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            if (resolvedSegments.length === 0) return null;
            resolvedSegments.pop();
            continue;
        }
        if (segment.includes(":")) return null;
        resolvedSegments.push(segment);
    }
    if (resolvedSegments.length === 0) return null;

    const allowedDirectorySegments = allowedRootPath.segments.slice(0, -1);
    const staysInsideAllowedRoot = allowedDirectorySegments.every((segment, index) => (
        localPathSegmentEquals(segment, resolvedSegments[index] ?? "", ownerPath.caseInsensitive)
    ));
    if (!staysInsideAllowedRoot) return null;

    return formatAbsoluteLocalPath({ ...ownerPath, segments: resolvedSegments });
}

function parseMtlTextureStatements(mtlData: string): MtlTextureStatement[] {
    const statements: MtlTextureStatement[] = [];
    const lines = mtlData.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] ?? "";
        const match = MTL_TEXTURE_KEYWORD_PATTERN.exec(line);
        if (!match) continue;

        const indentation = match[1] ?? "";
        const keyword = match[2] ?? "";
        const value = (match[3] ?? "").trim();
        const bumpOptionMatch = keyword.toLowerCase() === "map_bump"
            ? /^-bm\s+(\S+)\s+(.+)$/i.exec(value)
            : null;
        const optionPrefix = bumpOptionMatch ? `-bm ${bumpOptionMatch[1]} ` : "";
        const reference = unquotePath(bumpOptionMatch?.[2] ?? value);
        const supported = Boolean(reference) && (!value.startsWith("-") || Boolean(bumpOptionMatch));
        statements.push({ lineIndex, indentation, keyword, optionPrefix, reference, supported });
    }
    return statements;
}

function getTextureMimeType(filePath: string): string | null {
    const normalized = filePath.trim().toLowerCase();
    if (normalized.endsWith(".png")) return "image/png";
    if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
    if (normalized.endsWith(".webp")) return "image/webp";
    if (normalized.endsWith(".gif")) return "image/gif";
    if (normalized.endsWith(".bmp")) return "image/bmp";
    return null;
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function encodeTextureDataUrl(data: ArrayBuffer | ArrayBufferView, mimeType: string): string {
    const bytes = toUint8Array(data);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
        for (let index = 0; index < chunk.length; index += 1) {
            binary += String.fromCharCode(chunk[index] ?? 0);
        }
    }
    return `data:${mimeType};base64,${globalThis.btoa(binary)}`;
}

function rewriteMtlTextureStatements(
    mtlData: string,
    statements: readonly MtlTextureStatement[],
    replacements: ReadonlyMap<number, string | null>,
): string {
    const statementByLine = new Map(statements.map((statement) => [statement.lineIndex, statement]));
    return mtlData.split(/\r?\n/).map((line, lineIndex) => {
        const statement = statementByLine.get(lineIndex);
        if (!statement || !replacements.has(lineIndex)) return line;
        const replacement = replacements.get(lineIndex) ?? null;
        if (!replacement) {
            return `${statement.indentation}# MMD_modoki omitted ${statement.keyword} local texture`;
        }
        return `${statement.indentation}${statement.keyword} ${statement.optionPrefix}${replacement}`;
    }).join("\n");
}

export async function prepareLocalObjMaterialBundle(
    objFilePath: string,
    objData: string,
    reader: ObjLocalFileReader,
): Promise<PreparedObjMaterialBundle> {
    const materialReference = findObjMaterialLibraryReference(objData);
    if (!materialReference) {
        return {
            materialReference: null,
            materialPath: null,
            mtlData: null,
            loadedTextureCount: 0,
            warnings: [],
        };
    }

    const materialPath = resolveLocalObjCompanionPath(objFilePath, materialReference);
    if (!materialPath) {
        return {
            materialReference,
            materialPath: null,
            mtlData: null,
            loadedTextureCount: 0,
            warnings: [`Rejected unsafe OBJ material library reference: ${materialReference}`],
        };
    }

    let mtlData: string | null = null;
    try {
        mtlData = await reader.readTextFile(materialPath);
    } catch {
        mtlData = null;
    }
    if (mtlData === null) {
        return {
            materialReference,
            materialPath,
            mtlData: null,
            loadedTextureCount: 0,
            warnings: [`Unable to read OBJ material library: ${materialPath}`],
        };
    }

    const statements = parseMtlTextureStatements(mtlData);
    const replacements = new Map<number, string | null>();
    const textureDataUrlByPath = new Map<string, string | null>();
    const warnings: string[] = [];
    const loadedTexturePaths = new Set<string>();

    for (const statement of statements) {
        if (!statement.supported) {
            replacements.set(statement.lineIndex, null);
            warnings.push(`Unsupported MTL texture options: ${statement.reference}`);
            continue;
        }

        const texturePath = resolveLocalObjCompanionPath(materialPath, statement.reference, objFilePath);
        if (!texturePath) {
            replacements.set(statement.lineIndex, null);
            warnings.push(`Rejected unsafe MTL texture reference: ${statement.reference}`);
            continue;
        }

        const mimeType = getTextureMimeType(texturePath);
        if (!mimeType) {
            replacements.set(statement.lineIndex, null);
            warnings.push(`Unsupported MTL texture format: ${texturePath}`);
            continue;
        }

        let dataUrl = textureDataUrlByPath.get(texturePath);
        if (dataUrl === undefined) {
            let textureData: ArrayBuffer | ArrayBufferView | null = null;
            try {
                textureData = await reader.readBinaryFile(texturePath);
            } catch {
                textureData = null;
            }
            if (!textureData) {
                dataUrl = null;
                warnings.push(`Unable to read MTL texture: ${texturePath}`);
            } else if (textureData.byteLength > MAX_OBJ_TEXTURE_BYTES) {
                dataUrl = null;
                warnings.push(`MTL texture exceeds 64 MiB limit: ${texturePath}`);
            } else {
                dataUrl = encodeTextureDataUrl(textureData, mimeType);
                loadedTexturePaths.add(texturePath);
            }
            textureDataUrlByPath.set(texturePath, dataUrl);
        }
        replacements.set(statement.lineIndex, dataUrl);
    }

    return {
        materialReference,
        materialPath,
        mtlData: rewriteMtlTextureStatements(mtlData, statements, replacements),
        loadedTextureCount: loadedTexturePaths.size,
        warnings,
    };
}
