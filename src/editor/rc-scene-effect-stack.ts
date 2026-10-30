import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { normalizeRcDiffuseGiSettings } from "../render/rc-diffuse-gi-settings";
import { normalizeRcSkyOcclusionSettings } from "../render/rc-sky-occlusion-settings";
import { normalizeFrameGraphPostEffectStack, type FrameGraphPostEffectStackEntry } from "../shared/frame-graph-post-effect-stack";

export type RcSceneEffectId = "rcSkyOcclusion" | "rcDiffuseGi";
export const isRcSceneEffectId = (id: string): id is RcSceneEffectId => id === "rcSkyOcclusion" || id === "rcDiffuseGi";

/** Restore only this singleton's position, preserving all other authored entries. */
export function withRcSceneEffectStackIndex(ids: readonly string[], id: RcSceneEffectId, index: number | null): string[] {
    const next = ids.filter(candidate => candidate !== id);
    if (index !== null && Number.isFinite(index)) next.splice(Math.max(0, Math.min(next.length, Math.floor(index))), 0, id);
    return next;
}

/** Old projects had lighting/keys without cards. The marker makes an authored deletion authoritative. */
export function migrateRcSceneEffectStack(input: {
    rcSceneEffectsInStack?: boolean;
    stack?: readonly unknown[];
    lighting: { rcSkyOcclusion?: unknown; rcDiffuseGi?: unknown };
    animations?: unknown;
}): FrameGraphPostEffectStackEntry[] {
    const stack = normalizeFrameGraphPostEffectStack(input.stack);
    if (input.rcSceneEffectsInStack === true) return stack;
    const tracks = new EffectSceneTrackStore(false, ["rcSkyOcclusion", "rcDiffuseGi"]);
    tracks.restore(input.animations);
    const settings = { rcSkyOcclusion: normalizeRcSkyOcclusionSettings(input.lighting.rcSkyOcclusion),
        rcDiffuseGi: normalizeRcDiffuseGiSettings(input.lighting.rcDiffuseGi) };
    for (const id of ["rcSkyOcclusion", "rcDiffuseGi"] as const) {
        if ((settings[id].enabled || tracks.has(id)) && !stack.some(entry => entry.id === id)) {
            stack.push({ id, enabled: settings[id].enabled });
        }
    }
    return stack;
}
