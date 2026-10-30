import { afterEach, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { RcDiffuseGiController } from "./rc-diffuse-gi-controller";
import type { RcDiffuseGiSettings } from "./rc-diffuse-gi-settings";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
function fixture(volume: RcDiffuseGiSettings["volume"] = null) {
    const engine = new NullEngine(); engines.push(engine);
    // Readiness/volume checks stop before allocating any GPU resource.
    engine.getCaps().supportComputeShaders = true;
    const scene = new Scene(engine);
    scene.activeCamera = new FreeCamera("camera", Vector3.Zero(), scene);
    const settings: RcDiffuseGiSettings = { enabled: true, strength: 0.5, volume };
    const controller = new RcDiffuseGiController(scene, () => settings, () => true, () => true, () => null);
    return { scene, controller };
}

it("refits an automatic volume when all receivers disappear and return at another position", () => {
    const { scene, controller } = fixture();
    const mesh = new Mesh("receiver", scene);
    mesh.material = new MmdStandardMaterial("receiver", scene);
    mesh.setVerticesData("position", [0, 0, 0, 2, 0, 0, 0, 2, 0]); mesh.setIndices([0, 1, 2]);
    expect(controller.isReadyForCapture).toBe(false);
    const initial = controller.diagnostics.volume;
    expect(initial?.size).toBeCloseTo(2.4);
    mesh.setEnabled(false);
    expect(controller.isReadyForCapture).toBe(true);
    expect(controller.diagnostics.volume).toBeNull();
    mesh.position.x = 20; mesh.setEnabled(true);
    expect(controller.isReadyForCapture).toBe(false);
    expect(controller.diagnostics.volume?.min[0]).toBeCloseTo((initial?.min[0] ?? 0) + 20);
});

it("does not report an orphan material as a receiver even with a saved fixed volume", () => {
    const { scene, controller } = fixture({ min: [-8, -2, -8], size: 16 });
    new MmdStandardMaterial("unattached", scene);
    controller.prepareFrame();
    expect(controller.diagnostics.status).toBe("preparing");
    expect(controller.diagnostics.supportedMaterialCount).toBe(0);
    expect(controller.isReadyForCapture).toBe(true);
});
