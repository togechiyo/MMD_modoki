import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

/** Cast shadows must enter the shared Skin diffusion and affect the final image. */
export async function probeCastShadow(capture) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const position = scene.textures.find(item => item.name === "owned-sss-position");
  const signal = scene.textures.find(item => item.name === "owned-sss-signal");
  const meshes = position.renderList.filter(mesh => mesh.getTotalVertices() > 0);
  const previous = meshes.map(mesh => mesh.receiveShadows);
  const generators = scene.lights.flatMap(light => Array.from(light.getShadowGenerators()?.values() ?? []));
  const blocker = CreateBox("sss-shadow-probe", { width: 0.4, height: 1.3, depth: 0.2 }, scene);
  blocker.position.set(-0.5, 2, -1);
  generators.forEach(generator => generator.addShadowCaster(blocker));
  const signals = [], captures = [];
  try {
    for (const shadows of [true, false]) {
      meshes.forEach(mesh => { mesh.receiveShadows = shadows; });
      await scene.whenReadyAsync();
      for (let i = 0; i < 8; i++) await new Promise(resolve => requestAnimationFrame(resolve));
      signals.push(await signal.readPixels());
      captures.push(await capture(shadows));
    }
    let differingSignalValues = 0;
    for (let i = 0; i < signals[0].length; i++) if (signals[0][i] !== signals[1][i]) differingSignalValues++;
    return { differingSignalValues, captures };
  } finally {
    meshes.forEach((mesh, i) => { mesh.receiveShadows = previous[i]; });
    generators.forEach(generator => generator.removeShadowCaster(blocker));
    blocker.dispose(false, false);
  }
}
