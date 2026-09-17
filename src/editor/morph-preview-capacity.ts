import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";

type PreviewMorphTargetManager = Pick<MorphTargetManager,
    "isUsingTextureForTargets" | "numMaxInfluencers" | "numInfluencers">;
type PreviewModel = {
    readonly currentAnimation: object | null;
    readonly morph: { readonly morphTargetManagers: readonly PreviewMorphTargetManager[] };
};

/** Keep preview headroom without recompiling on every active-count change. */
export class MorphPreviewCapacityController {
    private readonly states = new WeakMap<PreviewMorphTargetManager, { animation: object | null; capacity: number }>();

    public update(model: PreviewModel | null): void {
        if (!model) return;
        for (const manager of model.morph.morphTargetManagers) {
            if (!manager.isUsingTextureForTargets) continue;
            let state = this.states.get(manager);
            if (!state || state.animation !== model.currentAnimation) {
                // On bind, babylon-mmd sets this to the animation's target union,
                // including group/UV targets. Read it once; never add slack to slack.
                const registered = model.currentAnimation ? manager.numMaxInfluencers : 0;
                state = { animation: model.currentAnimation, capacity: Math.max(8, registered + 4) };
                this.states.set(manager, state);
            }
            // Run after runtime evaluation too: WASM applies preview targets later
            // than the input event, and one group can activate many targets at once.
            const active = manager.numInfluencers;
            if (active > state.capacity) state.capacity = active + 4;
            if (manager.numMaxInfluencers !== state.capacity) {
                manager.numMaxInfluencers = state.capacity;
            }
        }
    }
}
