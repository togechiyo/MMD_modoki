import { expect, it } from "vitest";
import { DEFAULT_RC_SKY_AMBIENT_SETTINGS } from "../render/rc-sky-ambient-settings";
import { getRcSkyAmbientUiState, rcSkyAmbientQualityToSlider, rcSkyAmbientRangeScaleToSlider, rcSkyAmbientSliderToQuality, rcSkyAmbientSliderToRangeScale } from "./rc-sky-ambient-ui-state";

const translate = (key: string) => key;

it("maps the range slider symmetrically around the original volume", () => {
    for (const [position, scale] of [[0, 0.25], [25, 0.5], [50, 1], [75, 2], [100, 4]]) {
        expect(rcSkyAmbientSliderToRangeScale(position)).toBe(scale);
        expect(rcSkyAmbientRangeScaleToSlider(scale)).toBe(position);
    }
    expect(rcSkyAmbientSliderToRangeScale(-50)).toBe(0.25);
    expect(rcSkyAmbientSliderToRangeScale(200)).toBe(4);
    expect(rcSkyAmbientSliderToRangeScale(Number.NaN)).toBe(1);
    expect(rcSkyAmbientRangeScaleToSlider(0)).toBe(50);
    expect(rcSkyAmbientRangeScaleToSlider(Number.NaN)).toBe(50);
});

it("selects only the three quality presets and defaults invalid positions to standard", () => {
    expect([0, 50, 100].map(rcSkyAmbientSliderToQuality)).toEqual(["low", "standard", "high"]);
    expect([rcSkyAmbientQualityToSlider("low"), rcSkyAmbientQualityToSlider("standard"), rcSkyAmbientQualityToSlider("high")]).toEqual([0, 50, 100]);
    expect(rcSkyAmbientSliderToQuality(-10)).toBe("low");
    expect(rcSkyAmbientSliderToQuality(200)).toBe("high");
    expect(rcSkyAmbientSliderToQuality(Number.NaN)).toBe("standard");
});

it("displays resolved automatic bounds while retaining saved volume null", () => {
    const settings = { ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true };
    const diagnostics = { status: "ready" as const, reason: null, volume: { min: [-8, 0, -8] as [number, number, number], size: 16 } };
    const state = getRcSkyAmbientUiState(settings, diagnostics, translate);
    expect(state.volume).toEqual(diagnostics.volume);
    expect(state.automaticVolume).toBe(true);
    if (state.volume) state.volume.min[0] = 100;
    expect(diagnostics.volume.min[0]).toBe(-8);
    expect(settings.volume).toBeNull();
    const fixed = { min: [1, 2, 3] as [number, number, number], size: 4 };
    expect(getRcSkyAmbientUiState({ ...settings, volume: fixed }, diagnostics, translate)).toMatchObject({ automaticVolume: false, volume: fixed });
});

it("translates known suspension reasons and keeps unknown GPU errors short", () => {
    const state = (status: "unsupported" | "error", reason: string) => getRcSkyAmbientUiState({ ...DEFAULT_RC_SKY_AMBIENT_SETTINGS }, { status, reason, volume: null }, translate);
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
