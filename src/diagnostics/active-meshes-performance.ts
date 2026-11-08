import type { PerformanceProfiler } from "./performance-profiler";

/** Synchronous CPU wall time inside the active-mesh observer. */
export type RcPrepareTiming = {
    recordSource(durationMs: number): void;
    recordFieldSubmit(durationMs: number): void;
};

export const ACTIVE_MESHES_PERFORMANCE_SECTIONS = [
    "activeMeshesEvaluation", "rcSkyOcclusionPrepare", "rcSkyOcclusionSource", "rcSkyOcclusionFieldSubmit",
    "rcDiffuseGiPrepare", "rcDiffuseGiSource", "rcDiffuseGiFieldSubmit", "activeMeshesEvaluationOther",
    "rcSkyAmbientPrepare", "rcSkyAmbientSource", "rcSkyAmbientFieldSubmit",
] as const;

type Section = typeof ACTIVE_MESHES_PERFORMANCE_SECTIONS[number];
type Controller = { prepareFrame(timing?: RcPrepareTiming): void };

class PrepareTimes implements RcPrepareTiming {
    total = 0;
    source = 0;
    fieldSubmit = 0;
    recordSource(ms: number): void { this.source += ms; }
    recordFieldSubmit(ms: number): void { this.fieldSubmit += ms; }
    reset(): void { this.total = 0; this.source = 0; this.fieldSubmit = 0; }
}

/** Publish the parent and its parts together, once per completed evaluation (including idle effects). */
export class ActiveMeshesPerformance {
    private startMs: number | null = null;
    private readonly sky = new PrepareTimes();
    private readonly gi = new PrepareTimes();
    private readonly ambient = new PrepareTimes();

    constructor(private readonly profiler: Pick<PerformanceProfiler<Section>, "record">,
        private readonly now: () => number = () => performance.now()) {}

    begin(): void {
        this.sky.reset();
        this.gi.reset();
        this.ambient.reset();
        this.startMs = this.now();
    }

    prepareLighting(sky: Controller | null, gi: Controller | null, ambient: Controller | null = null): void {
        const start = this.now();
        sky?.prepareFrame(this.sky);
        const afterSky = this.now();
        gi?.prepareFrame(this.gi);
        const afterGi = this.now();
        ambient?.prepareFrame(this.ambient);
        const afterAmbient = this.now();
        this.sky.total += afterSky - start;
        this.gi.total += afterGi - afterSky;
        this.ambient.total += afterAmbient - afterGi;
    }

    finish(): void {
        if (this.startMs === null) return;
        const total = this.now() - this.startMs;
        this.startMs = null;
        this.profiler.record("activeMeshesEvaluation", total);
        this.profiler.record("rcSkyOcclusionPrepare", this.sky.total);
        this.profiler.record("rcSkyOcclusionSource", this.sky.source);
        this.profiler.record("rcSkyOcclusionFieldSubmit", this.sky.fieldSubmit);
        this.profiler.record("rcDiffuseGiPrepare", this.gi.total);
        this.profiler.record("rcDiffuseGiSource", this.gi.source);
        this.profiler.record("rcDiffuseGiFieldSubmit", this.gi.fieldSubmit);
        this.profiler.record("rcSkyAmbientPrepare", this.ambient.total);
        this.profiler.record("rcSkyAmbientSource", this.ambient.source);
        this.profiler.record("rcSkyAmbientFieldSubmit", this.ambient.fieldSubmit);
        this.profiler.record("activeMeshesEvaluationOther", Math.max(0, total - this.sky.total - this.gi.total - this.ambient.total));
    }
}
