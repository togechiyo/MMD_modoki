import { describe, expect, it, vi } from "vitest";
import { ExperimentalPostFxController } from "../../src/ui/experimental-postfx-controller";
import type { MmdManager } from "../../src/mmd-manager";

describe("experimental postfx panel reconnect", () => {
    it("reflects Frame Graph settings without edits or resetting disabled effects", () => {
        const state = {
            getPostEffectBackend: () => "frameGraph",
            postEffectMotionBlurEnabled: true, postEffectMotionBlurStrength: 0.4, postEffectMotionBlurSamples: 24,
            postEffectSsrEnabled: false, postEffectSsrStrength: 1.5, postEffectSsrStep: 4,
            postEffectVlsEnabled: false, postEffectVlsExposure: 0.6, postEffectVlsDecay: 0.8,
        };
        const set = vi.fn(() => { throw new Error("panel reconnect must not change runtime"); });
        const manager = new Proxy(state, { set }) as unknown as MmdManager;
        const elements = new Map<string, { value: string; textContent: string; addEventListener: ReturnType<typeof vi.fn> }>();
        const root = { querySelector: (selector: string) => {
            const element = { value: "", textContent: "", addEventListener: vi.fn() };
            elements.set(selector, element);
            return element;
        } } as unknown as ParentNode;
        const dispatchAction = vi.fn();
        const controller = new ExperimentalPostFxController({ mmdManager: manager, dispatchAction });
        expect(controller.connect(root)).toBe(true);
        expect(controller.connect(root)).toBe(true);
        expect(set).not.toHaveBeenCalled();
        expect(dispatchAction).not.toHaveBeenCalled();
        expect(elements.get('input[data-postfx="motion-blur-strength"]')?.value).toBe("40");
        expect(elements.get('span[data-postfx-val="motion-blur-strength"]')?.textContent).toBe("0.40");
        expect(elements.get('input[data-postfx="ssr-strength"]')?.value).toBe("0");
        expect(elements.get('input[data-postfx="motion-blur-strength"]')?.addEventListener).toHaveBeenCalledWith("input", expect.any(Function));
    });
});
