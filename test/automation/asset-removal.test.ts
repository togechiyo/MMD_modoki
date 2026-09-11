import { it, expect } from "vitest";
import { assetRemovalInfo, resolveAssetRemoval } from "../../src/automation/asset-removal";
import type { AutomationAsset } from "../../src/automation/contracts";

it("requires the exact listed identity and path and refuses merged import removal", () => {
    const asset: AutomationAsset = { assetId: "accessory:0", kind: "accessory", recordedPath: "C:\\test.x", modelInstanceId: null, frame: null, availability: "unchecked", usageRole: "unknown" };
    expect(resolveAssetRemoval([asset], asset.assetId, asset.recordedPath)).toBe(asset);
    expect(() => resolveAssetRemoval([asset], asset.assetId, "C:\\other.x")).toThrow("ASSET_CHANGED");
    expect(() => resolveAssetRemoval([], asset.assetId, asset.recordedPath)).toThrow("ASSET_CHANGED");
    expect(() => resolveAssetRemoval([{ ...asset, kind: "vmd" }], asset.assetId, asset.recordedPath)).toThrow("ASSET_REMOVAL_UNSUPPORTED");
    expect(assetRemovalInfo("model")).toMatchObject({ removable: true, deletesSourceFile: false });
});
