import { describe, expect, it } from "vitest";
import { canReuseProjectWindow, classifyProjectDrop, projectDropSnapshot } from "./project-drop";

describe("project drop routing", () => {
    const project = { savedAt: "initial", scene: { models: [], currentFrame: 0 }, camera: { distance: 45 }, lighting: { intensity: 1 } };
    const pristine = { initialSnapshot: projectDropSnapshot(project), getCurrentProject: () => project, filePath: null, historyRevision: 0, busy: false };

    it("reuses an untouched window despite a new export timestamp", () => {
        expect(canReuseProjectWindow({ ...pristine, getCurrentProject: () => ({ ...project, savedAt: "later" }) })).toBe(true);
    });
    it.each([
        { ...project, camera: { distance: 30 } },
        { ...project, lighting: { intensity: 2 } },
        { ...project, scene: { models: [{ path: "tofu.pmx" }], currentFrame: 0 } },
        { ...project, assets: { audioPath: "audio.wav" } },
    ])("preserves edited or populated windows", currentProject => {
        expect(canReuseProjectWindow({ ...pristine, getCurrentProject: () => currentProject })).toBe(false);
    });
    it.each([
        { filePath: "empty.modoki.json" },
        { historyRevision: 1 },
        { busy: true },
    ])("preserves opened projects, history, and in-flight work", change => {
        expect(canReuseProjectWindow({ ...pristine, ...change, getCurrentProject: () => { throw new Error("Do not serialize an occupied project"); } })).toBe(false);
    });
    it("recognizes project extensions and rejects ambiguous combined drops", () => {
        expect(classifyProjectDrop(["scene.MODOKI.JSON"])).toBe("project");
        expect(classifyProjectDrop(["scene.MMDPROJ"])).toBe("project");
        expect(classifyProjectDrop(["tofu.pmx", "motion.vmd"])).toBe("assets");
        expect(classifyProjectDrop(["scene.json", "tofu.pmx"])).toBe("mixed");
        expect(classifyProjectDrop(["a.json", "b.mmdproj"])).toBe("mixed");
    });
});
