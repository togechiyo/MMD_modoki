import { describe, expect, it, vi } from "vitest";
import { EffectPlaybackPreparation } from "./effect-playback-preparation";

function deferred() {
    let resolve: (ready: boolean) => void = () => undefined;
    const promise = new Promise<boolean>(complete => { resolve = complete; });
    return { promise, resolve };
}

describe("effect playback preparation", () => {
    it("starts only after preparation and cancels stale starts", async () => {
        const gate = new EffectPlaybackPreparation();
        const first = deferred();
        const second = deferred();
        const start = vi.fn(), failed = vi.fn();
        gate.run(() => first.promise, start, failed);
        expect(gate.pending).toBe(true);
        expect(start).not.toHaveBeenCalled();
        gate.cancel();
        gate.run(() => second.promise, start, failed);
        first.resolve(true);
        await first.promise;
        expect(start).not.toHaveBeenCalled();
        expect(gate.pending).toBe(true);
        second.resolve(true);
        await second.promise;
        expect(start).toHaveBeenCalledOnce();
        expect(failed).not.toHaveBeenCalled();
        expect(gate.pending).toBe(false);
    });
    it("reports preparation failure without starting playback", async () => {
        const gate = new EffectPlaybackPreparation();
        const start = vi.fn(), failed = vi.fn();
        gate.run(() => Promise.resolve(false), start, failed);
        await Promise.resolve();
        gate.run(() => Promise.reject(new Error("resource failed")), start, failed);
        await Promise.resolve();
        expect(start).not.toHaveBeenCalled();
        expect(failed).toHaveBeenCalledTimes(2);
        expect(gate.pending).toBe(false);
    });
});
