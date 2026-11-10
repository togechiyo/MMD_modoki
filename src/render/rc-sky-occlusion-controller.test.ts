import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RcSkyOcclusionController } from "./rc-sky-occlusion-controller";
import type { RcSkyOcclusionSettings } from "./rc-sky-occlusion-settings";

it("keeps automatic bounds during look edits and refits only when requested", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    // Readiness resolves the volume without allocating a GPU field.
    engine.getCaps().supportComputeShaders = true;
    scene.activeCamera = new FreeCamera("camera", Vector3.Zero(), scene);
    const mesh = CreateBox("receiver", { size: 2 }, scene);
    mesh.material = new StandardMaterial("receiver", scene);
    const settings: RcSkyOcclusionSettings = { enabled: true, strength: 0.75, minimum: 0.2, volume: null };
    const controller = new RcSkyOcclusionController(scene, () => settings, () => true, () => true);
    try {
        expect(controller.isReadyForCapture).toBe(false);
        const initial = controller.diagnostics.volume;
        expect(initial).not.toBeNull();
        mesh.position.x = 20; settings.strength = 0.25; settings.minimum = 0.4;
        controller.settingsChanged(false);
        expect(controller.isReadyForCapture).toBe(false);
        expect(controller.diagnostics.volume).toEqual(initial);
        controller.settingsChanged(true);
        expect(controller.isReadyForCapture).toBe(false);
        expect(controller.diagnostics.volume?.min[0]).toBeCloseTo((initial?.min[0] ?? 0) + 20);
        mesh.position.x = 40;
        controller.settingsChanged();
        expect(controller.isReadyForCapture).toBe(false);
        expect(controller.diagnostics.volume?.min[0]).toBeCloseTo((initial?.min[0] ?? 0) + 40);
    } finally {
        controller.dispose(); scene.dispose(); engine.dispose();
    }
});
