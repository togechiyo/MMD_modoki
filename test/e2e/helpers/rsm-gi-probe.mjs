import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { GlobalIlluminationController } from "/src/render/global-illumination-controller.ts";

let controller, rsmFrames = 0;
function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = texture.getScene(); texture.dispose(); return current;
}

// Observe the application's controller when the fixture is supplied; no production test hook.
export function observeRsmGiController() {
  const sync = GlobalIlluminationController.prototype.syncSceneModels;
  GlobalIlluminationController.prototype.syncSceneModels = function (...args) {
    controller = this; GlobalIlluminationController.prototype.syncSceneModels = sync;
    return sync.apply(this, args);
  };
}

export async function addRsmMultiMaterialProbe({ kinds = ["standard", "mmd"] } = {}) {
  if (!controller) throw new Error("App GI controller was not observed");
  const current = scene();
  const mmd = current.materials.find(material => "toonTexture" in material);
  if (!mmd) throw new Error("MMD fixture is missing");
  for (const [index, kind] of kinds.entries()) {
    const mesh = CreateBox(`rsm-${kind}-multi`, { size: 2 }, current);
    mesh.position.set(index * 4 - 2, 1, 0);
    const material = new MultiMaterial(`rsm-${kind}-group`, current);
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([210, 180, 140, 255]), 1, 1, current, false, false);
    texture.gammaSpace = true;
    material.subMaterials = [0, 1].map(channel => {
      const name = `rsm-${kind}-${channel}`;
      const child = kind === "mmd" ? mmd.clone(name) : kind === "pbr" ? new PBRMaterial(name, current) : new StandardMaterial(name, current);
      const color = kind === "pbr" ? child.albedoColor : child.diffuseColor;
      color.set(channel ? 0.1 : 0.8, 0.1, channel ? 0.8 : 0.1);
      if (kind === "pbr") { child.albedoTexture = texture; child.metallic = 0; child.roughness = 1; }
      else child.diffuseTexture = texture;
      child.backFaceCulling = false;
      return child;
    });
    mesh.material = material; mesh.subMeshes = [];
    new SubMesh(0, 0, mesh.getTotalVertices(), 0, 18, mesh);
    new SubMesh(1, 0, mesh.getTotalVertices(), 18, 18, mesh);
    // Fixture supply only: the boxes participate in the same app controller as the loaded PMX.
    controller.registerSceneModel({ mesh });
  }
  controller.giRsm.rsm._mrt.onBeforeBindObservable.add(() => rsmFrames++);
  await current.whenReadyAsync();
}

// The legacy GI toolbar control is hidden. Exercise its controller without adding a public UI route.
export async function setRsmGiEnabled(enabled) {
  controller.setEnabled(enabled);
  const current = scene(); await current.whenReadyAsync();
  for (let frame = 0; frame < 12; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
}

export async function readRsmGiProbe({ readTextures = false } = {}) {
  const current = scene(), rsm = controller.giRsm.rsm;
  const result = {
    enabled: controller.isEnabled(), pending: controller.isPending(), rsmEnabled: rsm.enable, rsmFrames,
    activeTargets: current.customRenderTargets.filter(target => target.name.startsWith("RSMmrt_")).map(target => target.name),
    clones: [...rsm._regularMatToMatWithPlugin].map(([source, clone]) => ({
      source: source.name, clone: clone.name, sourceClass: source.getClassName(),
      children: clone.subMaterials?.map((child, index) => ({
        separate: child !== source.subMaterials[index],
        rsmPlugin: !!child?.pluginManager?.getPlugin("RSMCreate")?.isEnabled,
        originalPlugin: !!source.subMaterials[index]?.pluginManager?.getPlugin("RSMCreate"),
      })),
    })),
  };
  if (readTextures) {
    result.textures = [];
    for (const texture of rsm._mrt.textures.slice(0, 3)) {
      const pixels = await texture.readPixels();
      if (!pixels) throw new Error(`Missing RSM readback: ${texture.name}`);
      let signal = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) signal += Math.abs(pixels[offset]) + Math.abs(pixels[offset + 1]) + Math.abs(pixels[offset + 2]);
      result.textures.push({ name: texture.name, signal });
    }
  }
  return result;
}
