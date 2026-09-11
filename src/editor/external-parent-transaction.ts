import type { KeyframeTransaction } from "../actions/keyframe-transaction";
import type { CommandDirection } from "../actions/command-types";
import type { ModelExternalParentKeyframeLike, ModelExternalParentKeyframePayload } from "../shared/model-external-parent";
import { selectModelExternalParentKeyframeAtFrame, wouldCreateModelExternalParentCycle } from "../shared/model-external-parent";

export type ExternalParentModel = {
    instanceId: string; path: string; boneNames: readonly string[];
    keys: readonly ModelExternalParentKeyframeLike[];
    fallback: ModelExternalParentKeyframePayload | null;
};
export type ExternalParentIssue = { code: string; frame?: number; operationIndex?: number };

/** Validate the final timeline, including release-key deletion and future cycles, before any write. */
export function validateExternalParentTransaction(
    models: readonly ExternalParentModel[], diff: KeyframeTransaction, direction: CommandDirection,
): ExternalParentIssue | null {
    const destination = direction === "apply" ? "after" : "before";
    const ownerId = diff.owner.kind === "model" ? diff.owner.modelInstanceId : null;
    const childIndex = models.findIndex(model => model.instanceId === ownerId);
    const keys = models.map(model => [...model.keys]);
    // Remove all touched slots first, so moving a key doesn't depend on input order.
    if (childIndex >= 0) for (const item of diff.items) {
        if (!["root", "semi-standard", "bone"].includes(item.track.category)) continue;
        keys[childIndex] = keys[childIndex].filter(key => key.frame !== item.frame || key.childBoneName !== item.track.name);
    }
    for (const [operationIndex, item] of diff.items.entries()) {
        const value = item[destination];
        if (!value || !("externalParent" in value) || !value.externalParent) continue;
        const parent = value.externalParent;
        const modelId = "parentModelInstanceId" in parent ? parent.parentModelInstanceId : "modelInstanceId" in parent ? parent.modelInstanceId : null;
        const path = "parentModelPath" in parent ? parent.parentModelPath : "modelPath" in parent ? parent.modelPath : null;
        const bone = "parentBoneName" in parent ? parent.parentBoneName : "boneName" in parent ? parent.boneName : null;
        const issue = (code: string): ExternalParentIssue => ({ code, frame: item.frame, operationIndex });
        if (modelId || path || bone) {
            const found = models.filter(model => model.instanceId === modelId && model.path === path);
            if (found.length !== 1) return issue("EXTERNAL_PARENT_TARGET_CHANGED");
            if ((value.kind !== "camera" || bone !== null) && found[0].boneNames.filter(name => name === bone).length !== 1) return issue("BONE_NOT_UNIQUE");
        }
        if (value.kind !== "bone" && value.kind !== "movableBone") continue;
        if (childIndex < 0 || !("childBoneName" in parent) || parent.childBoneName !== item.track.name) return issue("EXTERNAL_PARENT_CHILD_MISMATCH");
        if (models[childIndex].boneNames.filter(name => name === parent.childBoneName).length !== 1) return issue("BONE_NOT_UNIQUE");
        if (keys[childIndex].some(key => key.frame === item.frame)) return issue("EXTERNAL_PARENT_FRAME_CONFLICT");
        keys[childIndex].push({ ...parent, frame: item.frame });
    }
    if (childIndex < 0) return null;
    keys.forEach(entries => entries.sort((a, b) => a.frame - b.frame));
    const frames = new Set([0, ...keys.flatMap(entries => entries.map(key => key.frame))]);
    for (const frame of [...frames].sort((a, b) => a - b)) {
        const links = new Map<number, { parentModelIndex: number }>();
        for (const [index, model] of models.entries()) {
            // Removing the last key must yield no link, not resurrect the evaluated last pose.
            const parent = keys[index].length ? selectModelExternalParentKeyframeAtFrame(keys[index], frame)
                : index === childIndex && model.keys.length ? null : model.fallback;
            if (!parent?.parentModelInstanceId && !parent?.parentModelPath) continue;
            const parentIndex = models.findIndex(candidate => parent.parentModelInstanceId
                ? candidate.instanceId === parent.parentModelInstanceId : candidate.path === parent.parentModelPath);
            if (parentIndex < 0) continue; // Existing unresolved project references are inactive.
            links.set(index, { parentModelIndex: parentIndex });
        }
        for (const [index, link] of links) {
            if (wouldCreateModelExternalParentCycle(index, link.parentModelIndex, links)) return { code: "EXTERNAL_PARENT_CYCLE", frame };
        }
    }
    return null;
}
