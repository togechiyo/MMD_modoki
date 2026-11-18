type SummarySource = {
    target: unknown; editRevision: number; assetRevision: number; frame: number; playing: boolean; busy: boolean;
    status: unknown; timelineTarget: unknown; timelineScope: unknown; undoId: string | null; redoId: string | null;
    materialMode: string; backend: string; assetCount: number;
} & ({ models: readonly unknown[] } | { modelCount: number });

/** Keep permission, blockers and revision guards; omit camera and model descriptions. Always freshly observed. */
export function summarizeAutomationContext(context: SummarySource) {
    return { target: context.target, editRevision: context.editRevision, assetRevision: context.assetRevision,
        frame: context.frame, playing: context.playing, busy: context.busy, status: context.status,
        timelineTarget: context.timelineTarget, timelineScope: context.timelineScope, undoId: context.undoId, redoId: context.redoId,
        materialMode: context.materialMode, backend: context.backend,
        modelCount: "modelCount" in context ? context.modelCount : context.models.length, assetCount: context.assetCount, modelContentShared: false };
}
