import { describe, expect, it } from "vitest";
import { fromLocalAssetUrl, toLocalAssetUrl } from "./local-asset-url";

describe("local asset delivery URLs", () => {
    it.each([
        ["file:///D:/models/%E7%99%BD%20%23%25/model.pmx", "mmd-local://local/D:/models/%E7%99%BD%20%23%25/model.pmx"],
        ["file:///home/user/models/texture.png", "mmd-local://local/home/user/models/texture.png"],
        ["file://asset-server/share/a%20b/model.pmx", "mmd-local://unc/asset-server/share/a%20b/model.pmx"],
        ["file:///D:/assets/model.glb?version=1#mesh", "mmd-local://local/D:/assets/model.glb?version=1#mesh"],
    ])("preserves the canonical path while routing %s", (fileUrl, resourceUrl) => {
        expect(toLocalAssetUrl(fileUrl)).toBe(resourceUrl);
        expect(fromLocalAssetUrl(resourceUrl)).toBe(fileUrl);
        expect(toLocalAssetUrl(resourceUrl)).toBe(resourceUrl);
    });

    it.each(["https://example.invalid/a.png", "http://localhost:5173/a.wasm", "blob:http://localhost/id", "data:image/png;base64,AA==", "../textures/a.png"])('keeps non-file URL "%s" unchanged', url => {
        expect(toLocalAssetUrl(url)).toBe(url);
        expect(fromLocalAssetUrl(url)).toBeNull();
    });

    it("resolves relative textures without losing drive, share or encoded characters", () => {
        const directory = toLocalAssetUrl("file:///D:/models/a%20b/");
        expect(fromLocalAssetUrl(new URL("../textures/x%23y.png", directory).href)).toBe("file:///D:/models/textures/x%23y.png");
        const share = toLocalAssetUrl("file://asset-server/share/models/");
        expect(fromLocalAssetUrl(new URL("../textures/a.png", share).href)).toBe("file://asset-server/share/textures/a.png");
    });

    it.each([
        "mmd-local://unknown/D:/a.png",
        "mmd-local://user:pass@local/D:/a.png",
        "mmd-local://local:123/D:/a.png",
        "mmd-local://unc/",
        "mmd-local://unc/server",
        "mmd-local://unc/a%2Fb/share/a.png",
        "mmd-local://unc/a%5Cb/share/a.png",
        "mmd-local://local/D:/a%00.png",
        "not a URL",
    ])("rejects invalid resource URL %s", url => {
        expect(fromLocalAssetUrl(url)).toBeNull();
    });
});
