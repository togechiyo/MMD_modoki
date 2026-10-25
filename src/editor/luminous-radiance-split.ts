import type { SerializedEffectInstances, EffectInstance } from "./frame-graph-effect-instances";
import type { SerializedEffectAnimations } from "./effect-scene-track-store";
import type { FrameGraphPostEffectStackEntry } from "../shared/frame-graph-post-effect-stack";
import type { LuminousRadianceSettings } from "../render/luminous-radiance-settings";
import type { ProjectEffectState, ProjectKeyframeBundle } from "../types";
import { normalizeLuminousRadiance } from "../render/luminous-radiance-settings";

/** Only the old Luminous enabled channel controlled RC. Glow sliders never did. */
export function splitLuminousRadianceAnimation(animation: SerializedEffectAnimations | undefined, enabled = true): SerializedEffectAnimations {
    const result: SerializedEffectAnimations = { version: 1, tracks: [] };
    if (animation?.version !== 1 || !Array.isArray(animation.tracks)) return result;
    const value = (raw: unknown): { enabled: boolean } => ({ enabled: enabled && !!raw && typeof raw === "object" && (raw as { enabled?: unknown }).enabled === true });
    for (const raw of animation.tracks) {
        if (!raw || typeof raw !== "object") continue;
        const track = raw as { effectId?: string; valueVersion?: number; base?: unknown; keys?: Array<{ frame: number; value: unknown }>; preview?: { frame: number; value: unknown } };
        if (track.effectId !== "luminous" || track.valueVersion !== 1) continue;
        result.tracks.push({ effectId: "luminousRadiance", valueVersion: 1, base: value(track.base),
            keys: track.keys?.map(key => ({ frame: key.frame, value: value(key.value) })) ?? [],
            ...(track.preview ? { preview: { frame: track.preview.frame, value: value(track.preview.value) } } : {}),
        });
    }
    return result;
}

/** Recognize the old nested field, so new saves and undo snapshots are idempotent. */
export function splitLuminousRadianceInstances(state: SerializedEffectInstances): SerializedEffectInstances {
    const result = structuredClone(state), ids = new Set(state.instances.map(item => item?.instanceId));
    const instances: EffectInstance[] = [];
    for (const item of result.instances) {
        const radiance = item?.type === "luminous" ? item.fixedSettings?.radiance : undefined;
        if (radiance && (radiance.enabled || radiance.strength !== 1 || radiance.range !== 12)) {
            const stem = `${item.instanceId.slice(0, 170)}-rc`;
            let id = stem, suffix = 2;
            while (ids.has(id)) id = `${stem}-${suffix++}`;
            ids.add(id);
            instances.push({ instanceId: id, type: "luminousRadiance", label: `${item.label.slice(0, 77)} RC`,
                settings: { enabled: item.settings.enabled && radiance.enabled },
                fixedSettings: { radiance: { ...radiance, enabled: true } },
                animation: splitLuminousRadianceAnimation(item.animation, radiance.enabled),
            });
            const position = result.order.indexOf(item.instanceId);
            if (position >= 0) result.order.splice(position, 0, id);
        }
        if (radiance) delete item.fixedSettings;
        instances.push(item);
    }
    result.instances = instances;
    return result;
}

export function splitLuminousRadianceStack(stack: readonly FrameGraphPostEffectStackEntry[] | undefined, radiance: LuminousRadianceSettings, glowEnabled: boolean): FrameGraphPostEffectStackEntry[] {
    const result = stack?.map(entry => ({ ...entry })) ?? [];
    if (result.some(entry => entry.id === "luminousRadiance") || (!radiance.enabled && radiance.strength === 1 && radiance.range === 12)) return result;
    const position = result.findIndex(entry => entry.id === "luminous");
    result.splice(position < 0 ? result.length : position, 0, { id: "luminousRadiance", enabled: radiance.enabled && (position < 0 ? glowEnabled : result[position].enabled) });
    return result;
}

type RadianceProject = {
    effects: Pick<ProjectEffectState, "luminousRadiance" | "luminousRadianceEncodingVersion" | "glowEnabled" | "frameGraphPostStack" | "frameGraphInstances">;
    keyframes?: Pick<ProjectKeyframeBundle, "effectAnimations">;
};
export function splitLuminousRadianceProject<T extends RadianceProject>(data: T): T {
    const radiance = normalizeLuminousRadiance(data.effects.luminousRadiance);
    if (data.effects.luminousRadianceEncodingVersion === 2 || (!radiance.enabled && radiance.strength === 1 && radiance.range === 12) || data.effects.frameGraphPostStack?.some(entry => entry.id === "luminousRadiance")) return data;
    const stack = splitLuminousRadianceStack(data.effects.frameGraphPostStack, radiance, data.effects.glowEnabled === true);
    const animation = data.keyframes?.effectAnimations as SerializedEffectAnimations | undefined;
    const tracks = animation?.tracks?.some(raw => !!raw && typeof raw === "object" && (raw as { effectId?: unknown }).effectId === "luminousRadiance")
        ? [] : splitLuminousRadianceAnimation(animation, radiance.enabled).tracks;
    const instances = data.effects.frameGraphInstances;
    const order = instances ? [...instances.order] : undefined;
    if (order && !order.includes("luminousRadiance")) {
        const index = order.indexOf("luminous");
        order.splice(index < 0 ? order.length : index, 0, "luminousRadiance");
    }
    return { ...data, effects: { ...data.effects, luminousRadianceEncodingVersion: 2, frameGraphPostStack: stack,
        ...(instances ? { frameGraphInstances: { ...instances, order: order ?? [] } } : {}),
    }, ...(tracks.length && animation?.version === 1 ? { keyframes: { ...data.keyframes, effectAnimations: { ...animation, tracks: [...animation.tracks, ...tracks] } } } : {}) };
}
