import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each([
    [true, undefined, false],
    [true, "1", true],
    [false, "1", false],
] as const)("enables only explicit development opt-in (dev=%s, flag=%s)", async (dev, flag, expected) => {
    vi.resetModules();
    vi.stubEnv("DEV", dev);
    vi.stubEnv("VITE_MMD_EFFECT_TIMELINE", flag);
    const { EFFECT_TIMELINE_ENABLED } = await import("./effect-timeline-availability");
    expect(EFFECT_TIMELINE_ENABLED).toBe(expected);
});
