/** Shared by the editor and export windows, including the packaged file:// page. */
export function createRendererContentSecurityPolicy(devServerUrl?: string): string {
    const assetSources = ["'self'", "file:", "blob:", "data:"];
    const connectSources = [...assetSources];
    if (devServerUrl) {
        const socketUrl = new URL(devServerUrl);
        if (socketUrl.protocol !== "http:" && socketUrl.protocol !== "https:") {
            throw new Error("The renderer dev server must use HTTP or HTTPS");
        }
        socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
        // HMR is the only socket connection; no network sources reach packaged HTML.
        connectSources.push("mmd-local:", socketUrl.origin);
        assetSources.push("mmd-local:");
    }
    return [
        "default-src 'none'",
        "script-src 'self' 'wasm-unsafe-eval'",
        // Existing UI uses style attributes and Vite injects styles during development.
        "style-src 'self' 'unsafe-inline'",
        `img-src ${assetSources.join(" ")}`,
        `media-src ${assetSources.join(" ")}`,
        "font-src 'self' data:",
        `connect-src ${connectSources.join(" ")}`,
        // Babylon's local Gaussian-splat sorting uses a generated Blob worker.
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
    ].join("; ");
}
