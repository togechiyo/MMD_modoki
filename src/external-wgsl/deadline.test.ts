import { afterEach, describe, expect, it, vi } from "vitest";
import { beforeDeadline, WgslTimeoutError } from "./deadline";

afterEach(() => vi.useRealTimers());
describe("WGSL GPU wait deadline", () => {
    it("stops a pending native promise and safely consumes its late rejection", async () => {
        vi.useFakeTimers();
        let rejectNative: (error: Error) => void = () => undefined;
        const native = new Promise<void>((_resolve, reject) => { rejectNative = reject; });
        const result = beforeDeadline(native, performance.now() + 15000);
        const assertion = expect(result).rejects.toBeInstanceOf(WgslTimeoutError);
        await vi.advanceTimersByTimeAsync(15001); await assertion;
        rejectNative(new Error("late GPU error")); await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("clears the timer on success and validation failure", async () => {
        vi.useFakeTimers();
        await expect(beforeDeadline(Promise.resolve(42), performance.now() + 15000)).resolves.toBe(42);
        await expect(beforeDeadline(Promise.reject(new Error("invalid WGSL")), performance.now() + 15000)).rejects.toThrow("invalid WGSL");
        expect(vi.getTimerCount()).toBe(0);
    });
    it("aborts a pending GPU wait immediately after device loss", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const result = beforeDeadline(new Promise<void>(() => undefined), performance.now() + 15000, controller.signal);
        controller.abort(new Error("device lost"));
        await expect(result).rejects.toThrow("device lost");
        expect(vi.getTimerCount()).toBe(0);
    });
});
