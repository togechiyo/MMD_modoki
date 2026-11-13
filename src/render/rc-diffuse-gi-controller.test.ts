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
    return { scene, controller, settings };
}

it("keeps origin-centered domains independent of mesh scale, placement, camera and look edits", () => {
    const { scene, controller, settings } = fixture();
    const mesh = new Mesh("receiver", scene);
    mesh.material = new MmdStandardMaterial("receiver", scene);
    mesh.setVerticesData("position", [0, 0, 0, 2, 0, 0, 0, 2, 0]); mesh.setIndices([0, 1, 2]);
    expect(controller.isReadyForCapture).toBe(false);
    const initial = controller.diagnostics.volumes;
    expect(initial).toEqual([
        { min: [-64, -64, -64], size: 128 },
        { min: [-1024, -1024, -1024], size: 2048 },
        { min: [-16384, -16384, -16384], size: 32768 },
    ]);
    expect(controller.diagnostics.spatialMode).toBe("origin");
    mesh.position.x = 20000; mesh.scaling.setAll(10000); settings.strength = 0.25;
    if (scene.activeCamera) scene.activeCamera.position.z = -15000;
    controller.settingsChanged(false);
    expect(controller.isReadyForCapture).toBe(false);
    expect(controller.diagnostics.volumes).toEqual(initial);
    controller.settingsChanged(true);
    expect(controller.isReadyForCapture).toBe(false);
    expect(controller.diagnostics.volumes).toEqual(initial);
    // A remote receiving object must not dilute the fixed origin resolution.
    const remote = new Mesh("remote receiver", scene);
    remote.material = mesh.material;
    remote.setVerticesData("position", [0, 0, 0, 2, 0, 0, 0, 2, 0]); remote.setIndices([0, 1, 2]);
    remote.position.x = 100000;
    controller.settingsChanged();
    expect(controller.isReadyForCapture).toBe(false);
    expect(controller.diagnostics.volumes).toEqual(initial);
});

it("disables absent receivers and restores the same origin domains after they move and return", () => {
    const { scene, controller } = fixture();
    const mesh = new Mesh("receiver", scene);
    mesh.material = new MmdStandardMaterial("receiver", scene);
    mesh.setVerticesData("position", [0, 0, 0, 2, 0, 0, 0, 2, 0]); mesh.setIndices([0, 1, 2]);
    expect(controller.isReadyForCapture).toBe(false);
    const initial = controller.diagnostics.volumes;
    expect(initial).toHaveLength(3);
    mesh.setEnabled(false);
    expect(controller.isReadyForCapture).toBe(true);
    expect(controller.diagnostics.volume).toBeNull();
    mesh.position.x = 20; mesh.setEnabled(true);
    expect(controller.isReadyForCapture).toBe(false);
    expect(controller.diagnostics.volumes).toEqual(initial);
});

it("retains a saved manual cube and restores origin domains when manual settings are removed", () => {
    const manual = { min: [-8, -2, -8] as [number, number, number], size: 16 };
    const { scene, controller, settings } = fixture(manual);
    const mesh = new Mesh("receiver", scene);
    mesh.material = new MmdStandardMaterial("receiver", scene);
    mesh.setVerticesData("position", [0, 0, 0, 2, 0, 0, 0, 2, 0]); mesh.setIndices([0, 1, 2]);
    mesh.position.x = 5000; mesh.scaling.setAll(50);
    controller.settingsChanged();
    expect(controller.diagnostics.spatialMode).toBe("manual");
    expect(controller.diagnostics.volumes).toEqual([manual]);
    expect(controller.isReadyForCapture).toBe(false);
    settings.volume = null; controller.settingsChanged();
    expect(controller.diagnostics.spatialMode).toBe("origin");
    expect(controller.diagnostics.volumes).toHaveLength(3);
    expect(controller.diagnostics.volume).toEqual({ min: [-64, -64, -64], size: 128 });
    settings.volume = manual; controller.settingsChanged();
    expect(controller.diagnostics.volumes).toEqual([manual]);
});

it("does not report an orphan material as a receiver even with a saved fixed volume", () => {
    const { scene, controller } = fixture({ min: [-8, -2, -8], size: 16 });
    new MmdStandardMaterial("unattached", scene);
    controller.prepareFrame();
    expect(controller.diagnostics.status).toBe("preparing");
    expect(controller.diagnostics.supportedMaterialCount).toBe(0);
    expect(controller.isReadyForCapture).toBe(true);
});
