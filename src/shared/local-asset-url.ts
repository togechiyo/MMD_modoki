/** Local file identities stay canonical; only renderer resource requests use this scheme. */
export const LOCAL_ASSET_SCHEME = "mmd-local";

/** Convert a native absolute path from a file dialog, preserving literal #, ? and %. */
export function localPathToFileUrl(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    const escaped = encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F");
    if (normalized.startsWith("//")) return "file:" + escaped;
    return (normalized.startsWith("/") ? "file://" : "file:///") + escaped;
}

export function toLocalAssetUrl(value: string): string {
    try {
        const url = new URL(value);
        if (url.protocol !== "file:") return value;
        const root = url.hostname
            ? `${LOCAL_ASSET_SCHEME}://unc/${encodeURIComponent(url.hostname)}`
            : `${LOCAL_ASSET_SCHEME}://local`;
        return `${root}${url.pathname}${url.search}${url.hash}`;
    } catch {
        // Relative and opaque inputs remain the responsibility of their existing loader.
        return value;
    }
}

export function fromLocalAssetUrl(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== `${LOCAL_ASSET_SCHEME}:` || url.username || url.password || url.port) return null;
        if (decodeURIComponent(url.pathname).includes("\0")) return null;
        let fileUrl: string;
        if (url.hostname === "local") {
            fileUrl = `file://${url.pathname}${url.search}${url.hash}`;
        } else if (url.hostname === "unc") {
            const separator = url.pathname.indexOf("/", 1);
            if (separator < 2) return null;
            const hostname = decodeURIComponent(url.pathname.slice(1, separator));
            if (!hostname || /[\\/@?#\s]/.test(hostname)) return null;
            fileUrl = `file://${hostname}${url.pathname.slice(separator)}${url.search}${url.hash}`;
        } else {
            return null;
        }
        return new URL(fileUrl).href;
    } catch {
        // Invalid resource URLs never fall through to an arbitrary network protocol.
        return null;
    }
}
