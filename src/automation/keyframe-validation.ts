import type { MmdManager } from "../mmd-manager";
import type { Timeline } from "../timeline";
import { keyframeValuesEqual, type KeyframeTransaction } from "../actions/keyframe-transaction";
import { AutomationError } from "./contracts";

export function validateAutomationKeyframes(manager: MmdManager, timeline: Timeline, diff: KeyframeTransaction): void {
    const tracks = timeline.getKeyframeTracks();
    for (const item of diff.items) {
        if (tracks.filter(track => track.category === item.track.category && track.name === item.track.name).length !== 1) throw new AutomationError("TRACK_NOT_UNIQUE");
        const payload = item.after;
        // External-parent links need separate cycle/dependency transactions; do not silently drop them.
        for (const value of [item.before, payload]) {
            if (value && "externalParent" in value && value.externalParent && Object.values(value.externalParent).some(v => v !== null && v !== undefined)) throw new AutomationError("EXTERNAL_PARENT_KEY_UNSUPPORTED");
        }
        if (!payload) continue;
        const boneCategory = ["root", "semi-standard", "bone"].includes(item.track.category);
        if (!boneCategory && item.track.category !== payload.kind) throw new AutomationError("KEY_KIND_MISMATCH");
        if (boneCategory) {
            if (diff.owner.kind !== "model" || (payload.kind !== "bone" && payload.kind !== "movableBone")) throw new AutomationError("KEY_KIND_MISMATCH");
            const info = manager.getActiveModelInfo();
            if (info?.boneNames.filter(name => name === item.track.name).length !== 1) throw new AutomationError("BONE_NOT_UNIQUE");
            const controls = info.boneControlInfos?.find(control => control.name === item.track.name);
            const movable = controls?.movable ?? item.track.category === "root";
            if ((payload.kind === "movableBone") !== movable) throw new AutomationError("KEY_KIND_MISMATCH");
            if (controls && !controls.rotatable) {
                const previous = item.before;
                const rotations = previous && "rotations" in previous ? previous.rotations : [0, 0, 0, 1];
                if (!keyframeValuesEqual(rotations, payload.rotations)) throw new AutomationError("BONE_CONTROL_LOCKED");
            }
        }
        if (payload.kind === "property") {
            const propertyTrack = tracks.find(track => track.category === "property");
            const first = propertyTrack?.frames.length ? manager.readTimelineKeyframePayload(item.track, propertyTrack.frames[0]) : null;
            const expected = first?.kind === "property" ? first.ikStates : manager.getActiveModelIkStates();
            if (!keyframeValuesEqual(payload.ikStates.map(item => item.boneName), expected.map(item => item.boneName))) throw new AutomationError("IK_TRACKS_MISMATCH");
        }
    }
}
