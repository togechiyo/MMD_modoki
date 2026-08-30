import { describe, expect, it } from "vitest";
import { resolveFrameGraphBackendRebuildAction } from "./frame-graph-backend-rebuild-state";

describe("resolveFrameGraphBackendRebuildAction", () => {
    it("waits while the current FrameGraph controller is still building", () => {
        expect(resolveFrameGraphBackendRebuildAction({
            pending: true,
            backendActive: true,
            controllerReady: false,
        })).toBe("wait");
    });

    it("rebuilds only after the current controller becomes ready", () => {
        expect(resolveFrameGraphBackendRebuildAction({
            pending: true,
            backendActive: true,
            controllerReady: true,
        })).toBe("rebuild");
    });

    it("cancels a pending rebuild after the backend becomes inactive", () => {
        expect(resolveFrameGraphBackendRebuildAction({
            pending: true,
            backendActive: false,
            controllerReady: false,
        })).toBe("cancel");
    });

    it("does nothing without a pending rebuild", () => {
        expect(resolveFrameGraphBackendRebuildAction({
            pending: false,
            backendActive: true,
            controllerReady: true,
        })).toBe("idle");
    });
});
