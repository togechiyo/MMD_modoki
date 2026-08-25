import { describe, expect, it } from "vitest";
import type { MmdModokiProjectFileV1 } from "../types";
import {
    decodeRuntimeReloadProjectState,
    encodeRuntimeReloadProjectState,
    type RuntimeReloadProjectState,
} from "./runtime-reload-project-state";

const project = {
    format: "mmd_modoki_project",
    version: 1,
    savedAt: "2026-08-25T00:00:00.000Z",
} as MmdModokiProjectFileV1;

describe("runtime reload project state", () => {
    it("round-trips the in-memory project and external effect sources", () => {
        const state: RuntimeReloadProjectState = {
            project,
            projectFilePath: "C:/projects/scene.mmdproj",
            externalLut: { path: "C:/luts/look.cube", text: "LUT_3D_SIZE 2" },
            externalWgslToon: { path: "C:/shaders/toon.wgsl", text: "return color;" },
        };

        expect(decodeRuntimeReloadProjectState(encodeRuntimeReloadProjectState(state))).toEqual(state);
    });

    it("rejects malformed or unrelated session data", () => {
        expect(decodeRuntimeReloadProjectState("not json")).toBeNull();
        expect(decodeRuntimeReloadProjectState(JSON.stringify({ project: { format: "other", version: 1 } }))).toBeNull();
    });
});
