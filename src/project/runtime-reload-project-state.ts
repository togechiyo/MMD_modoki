import type { MmdModokiProjectFileV1 } from "../types";

export const RUNTIME_RELOAD_PROJECT_STORAGE_KEY = "mmd_modoki.runtimeReloadProject.v1";

export type RuntimeReloadProjectState = {
    project: MmdModokiProjectFileV1;
    projectFilePath: string | null;
    externalLut: {
        path: string | null;
        text: string | null;
    };
    externalWgslToon: {
        path: string | null;
        text: string | null;
    };
};

export function encodeRuntimeReloadProjectState(state: RuntimeReloadProjectState): string {
    return JSON.stringify(state);
}

export function decodeRuntimeReloadProjectState(value: string | null): RuntimeReloadProjectState | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<RuntimeReloadProjectState>;
        if (parsed.project?.format !== "mmd_modoki_project" || parsed.project.version !== 1) {
            return null;
        }
        return {
            project: parsed.project,
            projectFilePath: typeof parsed.projectFilePath === "string" ? parsed.projectFilePath : null,
            externalLut: {
                path: typeof parsed.externalLut?.path === "string" ? parsed.externalLut.path : null,
                text: typeof parsed.externalLut?.text === "string" ? parsed.externalLut.text : null,
            },
            externalWgslToon: {
                path: typeof parsed.externalWgslToon?.path === "string" ? parsed.externalWgslToon.path : null,
                text: typeof parsed.externalWgslToon?.text === "string" ? parsed.externalWgslToon.text : null,
            },
        };
    } catch {
        return null;
    }
}
