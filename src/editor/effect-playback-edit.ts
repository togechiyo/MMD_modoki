import type { EffectInstanceDiff } from "../actions/effect-instance-command";
import type { InstanceFixedSettings } from "./frame-graph-instance-fixed-settings";

const equal = (before: unknown, after: unknown): boolean => JSON.stringify(before) === JSON.stringify(after);
const omit = (value: object, fields: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value).filter(([field]) => !fields.includes(field)));

/** Fixed colors and RC values do not change the prepared effect resources. */
export function isEffectInstanceFixedPlaybackValueEdit(before: InstanceFixedSettings | undefined, after: InstanceFixedSettings | undefined): boolean {
    if (!equal(omit(before ?? {}, ["color", "shadowColor", "radiance"]), omit(after ?? {}, ["color", "shadowColor", "radiance"]))) return false;
    const previous = before?.radiance, next = after?.radiance;
    if (!previous || !next) return previous === next;
    return equal(omit(previous, ["strength", "range", "softness"]), omit(next, ["strength", "range", "softness"]));
}

/** Key presence is checked by the manager; this only classifies the command's changes. */
export function isEffectInstancePlaybackValueDiff(diff: EffectInstanceDiff): boolean {
    return equal(diff.beforeOrder, diff.afterOrder) && diff.changes.every(({ instanceId, before, after }) => {
        if (!before || !after || before.instanceId !== instanceId || after.instanceId !== instanceId) return false;
        return equal(omit(before, ["settings", "bloomColor", "fixedSettings"]), omit(after, ["settings", "bloomColor", "fixedSettings"]))
            && isEffectInstanceFixedPlaybackValueEdit(before.fixedSettings, after.fixedSettings);
    });
}

/** Scene RC volume and quality changes remain unavailable during playback. */
export function isRcPlaybackValuePatch(settings: object): boolean {
    return Object.keys(settings).every(field => ["enabled", "strength", "opacity", "fill", "skyBrightness", "minimum"].includes(field));
}
