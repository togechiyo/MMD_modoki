import { cloneRcDiffuseGiSettings, type RcDiffuseGiSettings } from "../render/rc-diffuse-gi-settings";

export type RcDiffuseGiEditState = { settings: RcDiffuseGiSettings; track: unknown | null };
export type RcDiffuseGiCommandDiff = {
    type: "effect.rcDiffuseGi";
    before: RcDiffuseGiEditState;
    after: RcDiffuseGiEditState;
};

export function cloneRcDiffuseGiEditState(state: RcDiffuseGiEditState): RcDiffuseGiEditState {
    return { settings: cloneRcDiffuseGiSettings(state.settings), track: structuredClone(state.track) };
}

export function rcDiffuseGiEditStatesEqual(a: RcDiffuseGiEditState, b: RcDiffuseGiEditState): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Seek/play can discard preview, and undoing a first key leaves an empty track. Neither is an authored conflict. */
export function canApplyRcDiffuseGiEditState(current: RcDiffuseGiEditState, expected: RcDiffuseGiEditState): boolean {
    if (JSON.stringify(current.settings) !== JSON.stringify(expected.settings)) return false;
    if (JSON.stringify(current.track) === JSON.stringify(expected.track)) return true;
    const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
    const actual = record(current.track);
    // A different live preview may be a newer edit; only its disappearance is benign.
    if (actual && "preview" in actual) return false;
    const authored = (state: RcDiffuseGiEditState): unknown => {
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

export function buildRcDiffuseGiCommandDiff(before: RcDiffuseGiEditState, after: RcDiffuseGiEditState): RcDiffuseGiCommandDiff | null {
    return rcDiffuseGiEditStatesEqual(before, after) ? null
        : { type: "effect.rcDiffuseGi", before: cloneRcDiffuseGiEditState(before), after: cloneRcDiffuseGiEditState(after) };
}
