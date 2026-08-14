export type ModelExternalParentLink = {
    parentModelIndex: number;
};

export type ModelExternalParentKeyframePayload = {
    childBoneName: string;
    parentModelInstanceId?: string | null;
    parentModelPath: string | null;
    parentBoneName: string | null;
};

export type ModelExternalParentKeyframeLike = ModelExternalParentKeyframePayload & {
    frame: number;
};

export function isModelExternalParentStateForChildBone(
    state: Pick<ModelExternalParentKeyframePayload, "childBoneName"> | null | undefined,
    childBoneName: string | null | undefined,
): boolean {
    return Boolean(state && childBoneName && state.childBoneName === childBoneName);
}

export function selectModelExternalParentKeyframeAtFrame<T extends ModelExternalParentKeyframeLike>(
    keyframes: readonly T[],
    frame: number,
): T | null {
    const normalized = Math.max(0, Math.floor(frame));
    let selected: T | null = null;
    for (const entry of keyframes) {
        if (entry.frame > normalized) break;
        selected = entry;
    }
    return selected;
}

export function wouldCreateModelExternalParentCycle(
    childModelIndex: number,
    parentModelIndex: number,
    linksByChildModelIndex: ReadonlyMap<number, ModelExternalParentLink>,
): boolean {
    if (childModelIndex === parentModelIndex) return true;

    const visited = new Set<number>();
    let cursor: number | null = parentModelIndex;
    while (cursor !== null) {
        if (cursor === childModelIndex) return true;
        if (visited.has(cursor)) return true;
        visited.add(cursor);
        cursor = linksByChildModelIndex.get(cursor)?.parentModelIndex ?? null;
    }
    return false;
}
