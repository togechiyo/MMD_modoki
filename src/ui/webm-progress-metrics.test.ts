import { describe, expect, it } from "vitest";
import { advanceWebmProgressMetrics, formatEtaSeconds } from "./webm-progress-metrics";

describe("WebM progress metrics", () => {
    it("calculates rendering rate and ETA from encoded-frame samples", () => {
        const first = advanceWebmProgressMetrics(null, "job-1", {
            encoded: 10,
            total: 100,
            timestampMs: 1_000,
        });
        const next = advanceWebmProgressMetrics(first.state, "job-1", {
            encoded: 30,
            total: 100,
            timestampMs: 5_000,
        });

        expect(next.framesPerSecond).toBe(5);
        expect(next.etaSeconds).toBe(14);
    });

    it("resets samples for another job and ignores duplicate encoded counts", () => {
        const first = advanceWebmProgressMetrics(null, "job-1", {
            encoded: 1,
            total: 20,
            timestampMs: 1_000,
        });
        const duplicate = advanceWebmProgressMetrics(first.state, "job-1", {
            encoded: 1,
            total: 20,
            timestampMs: 2_000,
        });
        const otherJob = advanceWebmProgressMetrics(duplicate.state, "job-2", {
            encoded: 5,
            total: 20,
            timestampMs: 3_000,
        });

        expect(duplicate.state.samples).toHaveLength(1);
        expect(duplicate.framesPerSecond).toBeNull();
        expect(otherJob.state.samples).toHaveLength(1);
        expect(otherJob.framesPerSecond).toBeNull();
    });

    it("uses only the latest ten seconds for a moving rendering rate", () => {
        const old = advanceWebmProgressMetrics(null, "job-1", {
            encoded: 0,
            total: 200,
            timestampMs: 0,
        });
        const recent = advanceWebmProgressMetrics(old.state, "job-1", {
            encoded: 100,
            total: 200,
            timestampMs: 20_000,
        });
        const next = advanceWebmProgressMetrics(recent.state, "job-1", {
            encoded: 110,
            total: 200,
            timestampMs: 21_000,
        });

        expect(next.state.samples).toHaveLength(2);
        expect(next.framesPerSecond).toBe(10);
        expect(next.etaSeconds).toBe(9);
    });

    it("formats compact ETA values", () => {
        expect(formatEtaSeconds(null)).toBe("--");
        expect(formatEtaSeconds(8.4)).toBe("8s");
        expect(formatEtaSeconds(65)).toBe("1m 05s");
        expect(formatEtaSeconds(3_726)).toBe("1h 02m");
    });
});
