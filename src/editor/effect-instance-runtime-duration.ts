import { Observable } from "@babylonjs/core/Misc/observable";
import type { IMmdRuntimeAnimatable } from "babylon-mmd/esm/Runtime/IMmdRuntimeAnimatable";

/** Contributes an editor-only animation duration without overriding model/audio duration. */
export class EffectInstanceRuntimeDuration implements IMmdRuntimeAnimatable {
    readonly onAnimationDurationChangedObservable = new Observable<number>();
    private duration = 0;
    get animationFrameTimeDuration(): number { return this.duration; }
    animate(): void { /* The manager evaluates effect values during its frame update. */ }
    setDuration(frames: number): void {
        const next = Math.max(0, Math.floor(frames));
        if (next === this.duration) return;
        this.duration = next;
        this.onAnimationDurationChangedObservable.notifyObservers(next);
    }
}
