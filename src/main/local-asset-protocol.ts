import { fromLocalAssetUrl } from "../shared/local-asset-url";

type LocalAssetRequest = Request & { initiatorOrigin?: string };

export interface LocalAssetProtocolOptions {
    devOrigin: string;
    fetchFile: (url: string, init: RequestInit) => Promise<Response>;
    getFileSize: (url: string) => Promise<number>;
    resolveNearbyFileUrl: (url: string) => string | null;
    reportError: (error: unknown) => void;
}

type ByteRange = { first: bigint; last: bigint | null } | { suffix: bigint };

function parseSingleByteRange(header: string | null): ByteRange | null {
    const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
    // Ignore unsupported units, malformed ranges and multipart ranges: serve the full file.
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) return { suffix: BigInt(match[2]) };
    const first = BigInt(match[1]);
    const last = match[2] ? BigInt(match[2]) : null;
    if (last !== null && last < first) return null;
    return { first, last };
}

function resolveByteRange(range: ByteRange, size: number): { first: number; last: number } | null {
    if (size === 0) return null;
    const length = BigInt(size);
    if ("suffix" in range) {
        if (range.suffix === 0n) return null;
        return { first: Number(range.suffix >= length ? 0n : length - range.suffix), last: size - 1 };
    }
    if (range.first >= length) return null;
    return {
        first: Number(range.first),
        last: Number(range.last === null || range.last >= length ? length - 1n : range.last),
    };
}

/** Serve local assets to the isolated Vite renderer without disabling origin checks. */
export function createLocalAssetProtocolHandler(options: LocalAssetProtocolOptions): (request: LocalAssetRequest) => Promise<Response> {
    const allowedOrigin = new URL(options.devOrigin).origin;
    return async (request) => {
        // Chromium supplies this value; unlike referrer, the page cannot forge it.
        if (request.initiatorOrigin !== allowedOrigin) {
            return new Response("Forbidden", { status: 403 });
        }

        const headers = new Headers({
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Vary": "Origin",
        });
        const fileUrl = fromLocalAssetUrl(request.url);
        if (!fileUrl) return new Response("Invalid local asset URL", { status: 400, headers });

        if (request.method === "OPTIONS") {
            const requestedMethod = request.headers.get("Access-Control-Request-Method");
            const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
                .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
            if (!requestedMethod || !["GET", "HEAD"].includes(requestedMethod)
                || requestedHeaders.some(value => value !== "range")) {
                return new Response("Forbidden preflight", { status: 403, headers });
            }
            headers.set("Access-Control-Allow-Methods", "GET, HEAD");
            headers.set("Access-Control-Allow-Headers", "Range");
            return new Response(null, { status: 204, headers });
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
            headers.set("Allow", "GET, HEAD, OPTIONS");
            return new Response("Method not allowed", { status: 405, headers });
        }

        try {
            const resolvedUrl = options.resolveNearbyFileUrl(fileUrl) ?? fileUrl;
            // The fallback must remain local even if its implementation changes.
            if (new URL(resolvedUrl).protocol !== "file:") {
                return new Response("Invalid local asset target", { status: 400, headers });
            }
            const requestHeaders = new Headers();
            // Range has semantics only for GET. Native file fetch slices the stream but
            // returns 200 without Content-Range, so supply the HTTP metadata ourselves.
            const range = request.method === "GET" ? parseSingleByteRange(request.headers.get("Range")) : null;
            let fileSize: number | null = null;
            let resolvedRange: { first: number; last: number } | null = null;
            if (range || request.method === "HEAD") {
                fileSize = await options.getFileSize(resolvedUrl);
                if (!Number.isSafeInteger(fileSize) || fileSize < 0) throw new Error("Invalid local asset size");
            }
            if (range && fileSize !== null) {
                resolvedRange = resolveByteRange(range, fileSize);
                if (!resolvedRange) {
                    headers.set("Accept-Ranges", "bytes");
                    headers.set("Content-Range", `bytes */${fileSize}`);
                    headers.set("Content-Length", "0");
                    return new Response(null, { status: 416, headers });
                }
                requestHeaders.set("Range", `bytes=${resolvedRange.first}-${resolvedRange.last}`);
            }
            const response = await options.fetchFile(resolvedUrl, {
                method: request.method,
                headers: requestHeaders,
                signal: request.signal,
            });
            // Keep streaming/partial responses intact, especially video seeks.
            const responseHeaders = new Headers(response.headers);
            headers.forEach((value, key) => {
                if (key === "vary" && responseHeaders.has(key)) {
                    responseHeaders.append(key, value);
                } else responseHeaders.set(key, value);
            });
            const partial = resolvedRange !== null && response.ok;
            if (response.ok) {
                responseHeaders.set("Accept-Ranges", "bytes");
                if (partial) {
                    responseHeaders.set("Content-Range", `bytes ${resolvedRange.first}-${resolvedRange.last}/${fileSize}`);
                    responseHeaders.set("Content-Length", String(resolvedRange.last - resolvedRange.first + 1));
                } else if (request.method === "HEAD") {
                    responseHeaders.delete("Content-Range");
                    responseHeaders.set("Content-Length", String(fileSize));
                }
            }
            return new Response(request.method === "HEAD" ? null : response.body, {
                status: partial ? 206 : response.status,
                statusText: partial ? "Partial Content" : response.statusText,
                headers: responseHeaders,
            });
        } catch (error) {
            if (!request.signal.aborted) options.reportError(error);
            return new Response("Local asset unavailable", { status: 404, headers });
        }
    };
}
