export type FrameGraphBackendRebuildAction = "idle" | "cancel" | "wait" | "rebuild";

export function resolveFrameGraphBackendRebuildAction(options: {
    pending: boolean;
    backendActive: boolean;
    controllerReady: boolean;
}): FrameGraphBackendRebuildAction {
    if (!options.pending) {
        return "idle";
    }
    if (!options.backendActive) {
        return "cancel";
    }
    return options.controllerReady ? "rebuild" : "wait";
}
