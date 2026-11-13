import { describe, expect, it, vi } from "vitest";
import { createLocalAssetProtocolHandler } from "./local-asset-protocol";

const devOrigin = "http://localhost:5173";
const assetUrl = "mmd-local://local/D:/assets/model.pmx";

function request(url = assetUrl, init: RequestInit = {}, initiatorOrigin: string | undefined = devOrigin): Request {
    return Object.assign(new Request(url, init), { initiatorOrigin });
}

function setup() {
    const fetchFile = vi.fn<(url: string, init: RequestInit) => Promise<Response>>().mockImplementation(async () => new Response("asset"));
    const getFileSize = vi.fn<(url: string) => Promise<number>>().mockResolvedValue(20);
    const resolveNearbyFileUrl = vi.fn<(url: string) => string | null>().mockReturnValue(null);
    const reportError = vi.fn();
    const handler = createLocalAssetProtocolHandler({ devOrigin, fetchFile, getFileSize, resolveNearbyFileUrl, reportError });
    return { handler, fetchFile, getFileSize, resolveNearbyFileUrl, reportError };
}

describe("development local asset protocol", () => {
    it.each(["https://example.com", "http://localhost:5174", "null", undefined])("rejects untrusted initiator %s before resolving files", async origin => {
        const { handler, fetchFile, resolveNearbyFileUrl } = setup();
        const incoming = Object.assign(new Request(assetUrl), { initiatorOrigin: origin });
        expect((await handler(incoming)).status).toBe(403);
        expect(fetchFile).not.toHaveBeenCalled();
        expect(resolveNearbyFileUrl).not.toHaveBeenCalled();
    });

    it("rejects malformed asset targets and write methods", async () => {
        const { handler, fetchFile } = setup();
        expect((await handler(request("mmd-local://other/path"))).status).toBe(400);
        expect((await handler(request(assetUrl, { method: "POST", body: "ignored" }))).status).toBe(405);
        expect(fetchFile).not.toHaveBeenCalled();
    });

    it("adds partial-response metadata to native 200 streams without buffering their body", async () => {
        const { handler, fetchFile, getFileSize } = setup();
        const nativeResponse = new Response("abcd", {
            status: 200,
            headers: { "Content-Type": "video/webm", "Vary": "Accept-Encoding" },
        });
        fetchFile.mockResolvedValueOnce(nativeResponse);
        const incoming = request(assetUrl, { headers: { Range: "bytes=4-7", Authorization: "not-forwarded" } });
        const response = await handler(incoming);
        const [fileUrl, init] = fetchFile.mock.calls[0];
        expect(fileUrl).toBe("file:///D:/assets/model.pmx");
        expect(init.method).toBe("GET");
        expect(init.signal).toBe(incoming.signal);
        expect(new Headers(init.headers).get("Range")).toBe("bytes=4-7");
        expect(new Headers(init.headers).get("Authorization")).toBeNull();
        expect(getFileSize).toHaveBeenCalledWith(fileUrl);
        expect(response.body).toBe(nativeResponse.body);
        expect(response.status).toBe(206);
        expect(response.statusText).toBe("Partial Content");
        expect(response.headers.get("Content-Range")).toBe("bytes 4-7/20");
        expect(response.headers.get("Content-Length")).toBe("4");
        expect(response.headers.get("Content-Type")).toBe("video/webm");
        expect(response.headers.get("Accept-Ranges")).toBe("bytes");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(devOrigin);
        expect(response.headers.get("Access-Control-Expose-Headers")).toBe("Accept-Ranges, Content-Range");
        expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
        expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
        expect(await response.text()).toBe("abcd");
    });

    it.each([
        ["bytes=4-7", "bytes=4-7", "bytes 4-7/20", 4],
        ["bytes=4-", "bytes=4-19", "bytes 4-19/20", 16],
        ["bytes=-4", "bytes=16-19", "bytes 16-19/20", 4],
        ["bytes=18-100", "bytes=18-19", "bytes 18-19/20", 2],
        ["bytes=-100", "bytes=0-19", "bytes 0-19/20", 20],
        ["bytes=0-999999999999999999999999999", "bytes=0-19", "bytes 0-19/20", 20],
        ["bytes=-999999999999999999999999999", "bytes=0-19", "bytes 0-19/20", 20],
    ])("normalizes %s for native streaming", async (range, normalized, contentRange, length) => {
        const { handler, fetchFile } = setup();
        fetchFile.mockResolvedValueOnce(new Response(new Uint8Array(Number(length))));
        const response = await handler(request(assetUrl, { headers: { Range: String(range) } }));
        expect(new Headers(fetchFile.mock.calls[0][1].headers).get("Range")).toBe(normalized);
        expect(response.status).toBe(206);
        expect(response.headers.get("Content-Range")).toBe(contentRange);
        expect(response.headers.get("Content-Length")).toBe(String(length));
        expect((await response.arrayBuffer()).byteLength).toBe(length);
    });

    it.each(["bytes=20-", "bytes=50-60", "bytes=-0", "bytes=999999999999999999999999999-"])("returns 416 before native fetch for %s", async range => {
        const { handler, fetchFile } = setup();
        const response = await handler(request(assetUrl, { headers: { Range: range } }));
        expect(response.status).toBe(416);
        expect(response.headers.get("Content-Range")).toBe("bytes */20");
        expect(response.headers.get("Content-Length")).toBe("0");
        expect(response.body).toBeNull();
        expect(fetchFile).not.toHaveBeenCalled();
    });

    it("returns 416 for a range over an empty file", async () => {
        const { handler, fetchFile, getFileSize } = setup();
        getFileSize.mockResolvedValueOnce(0);
        const response = await handler(request(assetUrl, { headers: { Range: "bytes=0-" } }));
        expect(response.status).toBe(416);
        expect(response.headers.get("Content-Range")).toBe("bytes */0");
        expect(fetchFile).not.toHaveBeenCalled();
    });

    it.each(["bytes=0-1,4-5", "bytes=9-2", "bytes=-", "bytes=word", "items=0-1"])("ignores malformed or unsupported Range %s", async range => {
        const { handler, fetchFile, getFileSize } = setup();
        const response = await handler(request(assetUrl, { headers: { Range: range } }));
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Range")).toBeNull();
        expect(await response.text()).toBe("asset");
        expect(new Headers(fetchFile.mock.calls[0][1].headers).has("Range")).toBe(false);
        expect(getFileSize).not.toHaveBeenCalled();
    });

    it("adds missing HEAD metadata and ignores its Range header", async () => {
        const { handler, fetchFile, getFileSize } = setup();
        fetchFile.mockResolvedValueOnce(new Response(null));
        const response = await handler(request(assetUrl, { method: "HEAD", headers: { Range: "bytes=4-7" } }));
        expect(response.status).toBe(200);
        expect(fetchFile.mock.calls[0][1].method).toBe("HEAD");
        expect(new Headers(fetchFile.mock.calls[0][1].headers).has("Range")).toBe(false);
        expect(getFileSize).toHaveBeenCalledWith("file:///D:/assets/model.pmx");
        expect(response.headers.get("Content-Length")).toBe("20");
        expect(response.headers.get("Content-Range")).toBeNull();
        expect(response.body).toBeNull();
    });

    it("does not stat ordinary GET requests or change failed native responses to 206", async () => {
        const { handler, fetchFile, getFileSize } = setup();
        expect((await handler(request())).status).toBe(200);
        expect(getFileSize).not.toHaveBeenCalled();
        fetchFile.mockResolvedValueOnce(new Response("missing", { status: 404 }));
        const response = await handler(request(assetUrl, { headers: { Range: "bytes=0-1" } }));
        expect(response.status).toBe(404);
        expect(response.headers.get("Content-Range")).toBeNull();
    });

    it("permits only read-only Range preflight requests", async () => {
        const { handler, fetchFile } = setup();
        const preflight = (method: string, headers: string) => request(assetUrl, { method: "OPTIONS", headers: {
            "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers,
        } });
        const response = await handler(preflight("GET", "range"));
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Range");
        expect((await handler(preflight("DELETE", "range"))).status).toBe(403);
        expect((await handler(preflight("GET", "authorization"))).status).toBe(403);
        expect(fetchFile).not.toHaveBeenCalled();
    });

    it("uses the existing nearby-file resolver but never forwards to the network", async () => {
        const { handler, fetchFile, resolveNearbyFileUrl } = setup();
        resolveNearbyFileUrl.mockReturnValueOnce("file:///D:/assets/texture.png");
        expect((await handler(request())).status).toBe(200);
        expect(fetchFile.mock.calls[0][0]).toBe("file:///D:/assets/texture.png");
        resolveNearbyFileUrl.mockReturnValueOnce("https://example.com/texture.png");
        expect((await handler(request())).status).toBe(400);
        expect(fetchFile).toHaveBeenCalledTimes(1);
    });

    it("reports failed local reads without exposing their error to the renderer", async () => {
        const { handler, fetchFile, reportError } = setup();
        const error = new Error("private file path");
        fetchFile.mockRejectedValueOnce(error);
        const response = await handler(request());
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Local asset unavailable");
        expect(reportError).toHaveBeenCalledWith(error);
    });

    it("does not log intentional request cancellation", async () => {
        const { handler, fetchFile, reportError } = setup();
        const controller = new AbortController();
        const incoming = request(assetUrl, { signal: controller.signal });
        controller.abort();
        fetchFile.mockRejectedValueOnce(new Error("aborted"));
        expect((await handler(incoming)).status).toBe(404);
        expect(reportError).not.toHaveBeenCalled();
    });
});
