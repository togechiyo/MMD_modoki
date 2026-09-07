import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Camera } from "@babylonjs/core/Cameras/camera";

const value = (data, i) => {
  if (!(data instanceof Uint16Array)) return data[i];
  const h = data[i], e = (h >> 10) & 31, m = h & 1023;
  return (h & 32768 ? -1 : 1) * (e === 0 ? 2 ** -14 * m / 1024 : 2 ** (e - 15) * (1 + m / 1024));
};

/** Exercise GPU bone textures with a deterministic jump, without a private VMD. */
export async function probeJump() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const position = scene.textures.find(item => item.name === "owned-sss-position");
  const signal = scene.textures.find(item => item.name === "owned-sss-signal");
  const entry = scene.textures.find(item => item.name === "owned-sss-entry");
  const camera = position.activeCamera;
  const savedCamera = Object.fromEntries(["mode", "orthoLeft", "orthoRight", "orthoTop", "orthoBottom"].map(key => [key, camera[key]]));
  Object.assign(camera, { mode: Camera.ORTHOGRAPHIC_CAMERA, orthoLeft: -2.5, orthoRight: 2.5, orthoBottom: -2.5, orthoTop: 2.5 });
  const entryRender = entry.customRenderFunction;
  let shadowFrame = -1;
  const shadowObservers = scene.lights.flatMap(light => Array.from(light.getShadowGenerators()?.values() ?? []))
    .map(generator => generator.getShadowMap()).filter(Boolean)
    .map(target => ({ target, observer: target.onAfterUnbindObservable.add(() => { shadowFrame = scene.getFrameId(); }) }));
  const meshes = position.renderList.filter(mesh => mesh.getTotalVertices() > 0);
  const originals = meshes.map(mesh => mesh.skeleton);
  const receiveShadows = meshes.map(mesh => mesh.receiveShadows);
  const skeleton = new Skeleton("sss-jump", "sss-jump", scene);
  const bone = new Bone("root", skeleton, null, Matrix.Identity());
  meshes.forEach(mesh => { mesh.skeleton = skeleton; });
  const samples = [];
  let requestedY = 0;
  const animate = scene.onBeforeRenderObservable.add(() => bone.setPosition(new Vector3(0, requestedY, 0)));
  let capturedY = 0;
  let capturedShadowFrame = -1;
  let unblurObservers = [];
  // Observe the already uploaded CPU mirror, without getters that prepare bones.
  const capture = position.onBeforeRenderObservable.add(() => { capturedY = skeleton._transformMatrices?.[13]; });
  const signalCapture = signal.onBeforeBindObservable.add(() => { capturedShadowFrame = shadowFrame; });
  const frame = () => new Promise(resolve => scene.onAfterRenderObservable.addOnce(() => {
    const drawnY = skeleton._transformMatrices?.[13];
    const captureY = capturedY;
    const shadowsCurrent = capturedShadowFrame === scene.getFrameId();
    Promise.all([position.readPixels(), signal.readPixels()]).then(([pixels, light]) => {
      let minimumY = Infinity;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0) minimumY = Math.min(minimumY, pixels[i + 1]);
      resolve({ requestedY, capturedY: captureY, drawnY, minimumY, pixels, light, shadowsCurrent });
    });
  }));
  try {
    for (let i = 0; i < 4; i++) await frame();
    const { width, height } = position.getSize();
    for (const [transmission, shadows, blur] of [[true, true, true], [false, true, false], [false, false, false], [false, false, true]]) {
      entry.customRenderFunction = transmission ? entryRender : () => {};
      meshes.forEach(mesh => { mesh.receiveShadows = shadows; });
      unblurObservers = blur ? [] : signal.postProcesses.map(pass => pass.onApplyObservable.add(effect => effect.setFloat2("axis", 0, 0)));
      requestedY = 0; await frame();
      await scene.whenReadyAsync();
      const baseline = await frame();
      for (const offset of [0, 40, -30, 35, -20, 0]) {
        requestedY = offset * 5 / height;
        const { pixels, light, ...sample } = await frame();
        let count = 0, max = 0, sum = 0;
        for (let y = Math.max(0, -offset); y < Math.min(height, height - offset); y++) for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4, j = ((y + offset) * width + x) * 4;
          if (baseline.pixels[i + 3] <= 0 || baseline.pixels[i + 3] !== pixels[j + 3]) continue;
          if (Math.abs(pixels[j + 1] - baseline.pixels[i + 1] - requestedY) > 0.001) continue;
          const difference = Math.max(...[0, 1, 2].map(c => Math.abs(value(light, j + c) - value(baseline.light, i + c))));
          count++; max = Math.max(max, difference); sum += difference;
        }
        samples.push({ ...sample, transmission, shadows, blur, count, max, mean: sum / Math.max(1, count) });
      }
      unblurObservers.forEach((observer, i) => signal.postProcesses[i].onApplyObservable.remove(observer));
      unblurObservers = [];
    }
    return { boneTexture: skeleton.isUsingTextureForMatrices, shadowMaps: shadowObservers.length, samples };
  } finally {
    scene.onBeforeRenderObservable.remove(animate);
    position.onBeforeRenderObservable.remove(capture);
    signal.onBeforeBindObservable.remove(signalCapture);
    shadowObservers.forEach(({ target, observer }) => target.onAfterUnbindObservable.remove(observer));
    meshes.forEach((mesh, i) => { mesh.skeleton = originals[i]; mesh.receiveShadows = receiveShadows[i]; });
    unblurObservers.forEach((observer, i) => signal.postProcesses[i].onApplyObservable.remove(observer));
    skeleton.dispose();
    Object.assign(camera, savedCamera);
    entry.customRenderFunction = entryRender;
  }
}
