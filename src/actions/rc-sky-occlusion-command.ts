import { cloneRcSkyOcclusionSettings, type RcSkyOcclusionSettings } from "../render/rc-sky-occlusion-settings";

export type RcSkyOcclusionEditState = { settings: RcSkyOcclusionSettings; track: unknown | null; stackIndex: number | null };
export type RcSkyOcclusionCommandDiff = {
    type: "effect.rcSkyOcclusion";
    before: RcSkyOcclusionEditState;
    after: RcSkyOcclusionEditState;
};

export function cloneRcSkyOcclusionEditState(state: RcSkyOcclusionEditState): RcSkyOcclusionEditState {
    return { settings: cloneRcSkyOcclusionSettings(state.settings), track: structuredClone(state.track), stackIndex: state.stackIndex };
}

export function rcSkyOcclusionEditStatesEqual(a: RcSkyOcclusionEditState, b: RcSkyOcclusionEditState): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Seek/play can discard preview, and undoing a first key leaves an empty track. Neither is an authored conflict. */
export function canApplyRcSkyOcclusionEditState(current: RcSkyOcclusionEditState, expected: RcSkyOcclusionEditState): boolean {
    if (current.stackIndex !== expected.stackIndex) return false;
    if (JSON.stringify(current.settings) !== JSON.stringify(expected.settings)) return false;
    if (JSON.stringify(current.track) === JSON.stringify(expected.track)) return true;
    const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
    const actual = record(current.track);
    // A different live preview may be a newer edit; only its disappearance is benign.
    if (actual && "preview" in actual) return false;
    const authored = (state: RcSkyOcclusionEditState): unknown => {
        const track = record(state.track);
        if (!track) return state.track;
        const copy = { ...track }; delete copy.preview;
        const base = { enabled: state.settings.enabled, strength: state.settings.strength };
        if (Array.isArray(copy.keys) && copy.keys.length === 0 && JSON.stringify(copy.base) === JSON.stringify(base)
            && Object.keys(copy).every(key => key === "base" || key === "keys")) return null;
        return copy;
    };
    return JSON.stringify(authored(current)) === JSON.stringify(authored(expected));
}

export function buildRcSkyOcclusionCommandDiff(before: RcSkyOcclusionEditState, after: RcSkyOcclusionEditState): RcSkyOcclusionCommandDiff | null {
    return rcSkyOcclusionEditStatesEqual(before, after) ? null
        : { type: "effect.rcSkyOcclusion", before: cloneRcSkyOcclusionEditState(before), after: cloneRcSkyOcclusionEditState(after) };
}
