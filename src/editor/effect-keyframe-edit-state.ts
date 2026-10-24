import type { EffectValue } from "./effect-keyframe-definitions";
import type { SectionKeyframeButtonState } from "../ui/section-keyframe-button";

function equal(a: EffectValue, b: EffectValue): boolean {
    const fields = Object.keys(a);
    return fields.length === Object.keys(b).length && fields.every(field => {
        const x = a[field], y = b[field];
        return typeof x === "number" && typeof y === "number" ? Math.abs(x - y) < 1e-8 : x === y;
    });
}

/** Only public value edits create a pending key; fixed settings and reorders do not. */
export class EffectKeyframeEditState {
    private frame: number | null = null;
    private readonly baselines = new Map<string, EffectValue>();

    reset(): void { this.frame = null; this.baselines.clear(); }

    mark(id: string, frame: number, before: EffectValue, after: EffectValue): void {
        this.setFrame(frame);
        if (!equal(before, after) && !this.baselines.has(id)) this.baselines.set(id, { ...before });
    }

    state(id: string, frame: number, current: EffectValue, registered: EffectValue | null): SectionKeyframeButtonState {
        this.setFrame(frame);
        if (registered) return equal(current, registered) ? "registered" : "dirty";
        const baseline = this.baselines.get(id);
        return baseline && !equal(current, baseline) ? "dirty" : "none";
    }

    private setFrame(frame: number): void {
        frame = Math.max(0, Math.floor(frame));
        if (frame === this.frame) return;
        this.frame = frame;
        this.baselines.clear();
    }
}
