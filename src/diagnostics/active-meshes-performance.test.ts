import { describe, expect, it } from "vitest";
import { ACTIVE_MESHES_PERFORMANCE_SECTIONS, ActiveMeshesPerformance } from "./active-meshes-performance";
import { PerformanceProfiler } from "./performance-profiler";

describe("active mesh evaluation timing", () => {
    it("pairs idle and working sections, including nested source and field times", () => {
        const profiler = new PerformanceProfiler(ACTIVE_MESHES_PERFORMANCE_SECTIONS);
        let now = 0;
        const evaluation = new ActiveMeshesPerformance(profiler, () => now);
        evaluation.begin();
        now += 2;
        evaluation.prepareLighting({ prepareFrame(timing) {
            now += 6;
            timing?.recordSource(2);
            timing?.recordSource(1);
            timing?.recordFieldSubmit(1);
        } }, { prepareFrame(timing) {
            now += 4;
            timing?.recordSource(2);
        } });
        now += 3;
        evaluation.finish();
        evaluation.begin();
        evaluation.prepareLighting(null, null);
        now += 1;
        evaluation.finish();
        const summary = profiler.summarize();
        expect(Object.values(summary).every(section => section.samples === 2)).toBe(true);
        expect(Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, value.avgMs]))).toEqual({
            activeMeshesEvaluation: 8, rcSkyOcclusionPrepare: 3, rcSkyOcclusionSource: 1.5, rcSkyOcclusionFieldSubmit: 0.5,
            rcDiffuseGiPrepare: 2, rcDiffuseGiSource: 1, rcDiffuseGiFieldSubmit: 0, activeMeshesEvaluationOther: 3,
        });
        expect(summary.activeMeshesEvaluationOther.maxMs).toBe(5);
    });

    it("discards a failed evaluation before measuring the next complete one", () => {
        const profiler = new PerformanceProfiler(ACTIVE_MESHES_PERFORMANCE_SECTIONS);
        let now = 0;
        const evaluation = new ActiveMeshesPerformance(profiler, () => now);
        evaluation.begin();
        expect(() => evaluation.prepareLighting({ prepareFrame(timing) {
            now += 5; timing?.recordSource(5);
            throw new Error("render aborted");
        } }, null)).toThrow("render aborted");
        expect(profiler.summarizeAndReset().rcSkyOcclusionSource.samples).toBe(0);
        evaluation.begin();
        now += 3;
        evaluation.finish();
        evaluation.finish();
        expect(profiler.summarize().rcSkyOcclusionSource).toEqual({ samples: 1, avgMs: 0, maxMs: 0 });
        expect(profiler.summarize().activeMeshesEvaluationOther).toEqual({ samples: 1, avgMs: 3, maxMs: 3 });
    });
});
