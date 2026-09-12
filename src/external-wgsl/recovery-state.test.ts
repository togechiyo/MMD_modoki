import { describe, expect, it, vi } from "vitest";
import { WgslRecoveryGuard } from "./recovery-state";

describe("WGSL recovery marker", () => {
    it("persists before execution and blocks a new process after an unclean exit", () => {
        let marker = false;
        const persist = (value: boolean) => { marker = value; };
        const first = new WgslRecoveryGuard(marker, persist);
        first.arm(1); expect(marker).toBe(true);
        const next = new WgslRecoveryGuard(marker, persist);
        expect(() => next.arm(1)).toThrow(/disabled/);
        next.allow(); next.arm(1); next.close(1);
        expect(marker).toBe(false);
    });
    it("keeps another window's marker and a failure latch through normal close", () => {
        const persist = vi.fn(); const guard = new WgslRecoveryGuard(false, persist);
        guard.arm(1); guard.arm(2); guard.close(1);
        expect(persist).toHaveBeenLastCalledWith(true);
        guard.fail(); guard.close(2);
        expect(persist).toHaveBeenLastCalledWith(true);
        expect(guard.blocked).toBe(true);
    });
    it("does not arm if persistence fails", () => {
        const guard = new WgslRecoveryGuard(false, () => { throw new Error("disk full"); });
        expect(() => guard.arm(1)).toThrow("disk full");
        expect(guard.isActive(1)).toBe(false);
    });
    it("keeps command-line safe mode locked even after an explicit allow", () => {
        const guard = new WgslRecoveryGuard(false, vi.fn(), true);
        expect(() => guard.allow()).toThrow(/--disable-external-wgsl/);
        expect(() => guard.arm(1)).toThrow(/disabled/);
    });
});
