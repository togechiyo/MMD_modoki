import type { AutomationAsset } from "./contracts";
import { AutomationError } from "./diagnostics";

const removable = new Set(["model", "accessory", "camera-motion", "audio", "background-image", "background-video", "environment", "lut"]);
export function assetRemovalInfo(kind: string) {
    return { removable: removable.has(kind), removalScope: kind === "model" ? "model_and_owned_motion" : kind === "camera-motion" ? "camera_motion_and_edits" : removable.has(kind) ? "scene_reference" : "merged_motion_not_individually_removable",
        deletesSourceFile: false, undoable: false };
}
export function resolveAssetRemoval(assets: readonly AutomationAsset[], assetId: string, expectedPath: string): AutomationAsset {
    const matches = assets.filter(asset => asset.assetId === assetId);
    if (matches.length !== 1 || matches[0].recordedPath !== expectedPath) throw new AutomationError("ASSET_CHANGED");
    if (!assetRemovalInfo(matches[0].kind).removable) throw new AutomationError("ASSET_REMOVAL_UNSUPPORTED");
    return matches[0];
}
