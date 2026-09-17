import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";

type PreviewMorphTargetManager = Pick<MorphTargetManager, "isUsingTextureForTargets" | "numMaxInfluencers">;

/** Allow unregistered vertex/UV/group targets in a manually edited model. */
export function enableDynamicMorphCapacityForPreview(managers: readonly PreviewMorphTargetManager[]): void {
    for (const manager of managers) {
        // babylon-mmd sizes a fixed capacity from the bound animation's tracks.
        // Preview can introduce other targets. Babylon's default (0) follows the
        // actual active count, including targets evaluated later by WASM.
        // The next animation bind restores the normal playback optimization.
        if (manager.isUsingTextureForTargets && manager.numMaxInfluencers > 0) {
            manager.numMaxInfluencers = 0;
        }
    }
}
