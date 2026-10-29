import { expect, it } from "vitest";
import { DEFAULT_RC_SKY_OCCLUSION_SETTINGS } from "../render/rc-sky-occlusion-settings";
import { getRcSkyOcclusionUiState } from "./rc-sky-occlusion-ui-state";

const translate = (key: string) => key;
it("displays resolved automatic bounds while retaining saved volume null", () => {
    const settings = { ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS, enabled: true };
    const diagnostics = { status: "ready" as const, reason: null, volume: { min: [-8, 0, -8] as [number, number, number], size: 16 } };
    const state = getRcSkyOcclusionUiState(settings, diagnostics, translate);
    expect(state.volume).toEqual(diagnostics.volume);
    expect(state.automaticVolume).toBe(true);
    if (state.volume) state.volume.min[0] = 100;
    expect(diagnostics.volume.min[0]).toBe(-8);
    expect(settings.volume).toBeNull();
    const fixed = { min: [1, 2, 3] as [number, number, number], size: 4 };
    expect(getRcSkyOcclusionUiState({ ...settings, volume: fixed }, diagnostics, translate)).toMatchObject({ automaticVolume: false, volume: fixed });
});

it("translates known suspension reasons and keeps unknown GPU errors short", () => {
    const state = (status: "unsupported" | "error", reason: string) => getRcSkyOcclusionUiState({ ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS }, { status, reason, volume: null }, translate);
    expect(state("unsupported", "Frame Graph / WebGPU").statusText).toContain("reason.backend");
    expect(state("unsupported", "Scene custom render targets").statusText).toContain("reason.sceneTargets");
    expect(state("unsupported", "Multiple / rig cameras").statusText).toContain("reason.cameras");
    expect(state("unsupported", "PrePass").statusText).toContain("reason.prePass");
    const text = state("error", `shader failure\n  ${"x".repeat(300)}`).statusText;
    expect(text).toContain("status.error: shader failure ");
    expect(text).not.toContain("\n");
    expect(text.split(": ")[1]).toHaveLength(120);
    expect(text.endsWith("…")).toBe(true);
});
