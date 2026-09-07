import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { inspectOwnedSssFrame } from "/src/render/owned-sss.ts";

export async function probeMotion(capture, animateBones = false, fixedCamera = false, jump = false) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  const target = scene.textures.find(item => item.name === "owned-sss-position");
  const camera = target.activeCamera;
  const meshes = target.renderList;
  const initialAlpha = camera.alpha;
  const scales = meshes.map(mesh => mesh.scaling.clone());
  const skeletons = [...new Set(meshes.map(mesh => mesh.skeleton).filter(Boolean))];
  const bones = animateBones ? skeletons.flatMap(skeleton => skeleton.bones)
    .filter(bone => /^(左腕|右腕)$/.test(bone.name))
    .map(bone => ({ bone, rotation: bone.getRotationQuaternion().clone() })) : [];
  const roots = animateBones && jump ? skeletons.flatMap(skeleton => skeleton.bones.filter(bone => bone.getParent() === null))
    .map(bone => ({ bone, position: bone.getPosition().clone() })) : [];
  let frame = 0;
  let capturing = false;
  const samples = [];
  // Deliberately register after SSS, as a late camera/pose synchronization can be.
  const motion = scene.onBeforeRenderObservable.add(() => {
    camera.alpha = initialAlpha + (fixedCamera ? 0 : Math.sin(frame * 0.15) * 0.3);
    if (!animateBones) meshes.forEach((mesh, i) => mesh.scaling.copyFrom(scales[i]).scaleInPlace(1 + Math.sin(frame * 0.17) * 0.02));
    bones.forEach(({ bone, rotation }, i) => bone.setRotationQuaternion(rotation.multiply(Quaternion.RotationAxis(Vector3.Forward(), Math.sin(frame * 0.1 + i) * 0.3))));
    roots.forEach(({ bone, position }) => bone.setPosition(position.add(new Vector3(0, Math.sin(frame * 0.45) * 0.8, 0))));
    if (!capturing) frame++;
  });
  const sample = target.onBeforeRenderObservable.add(() => {
    const state = inspectOwnedSssFrame();
    const actual = camera.getViewMatrix().multiply(camera.getProjectionMatrix()).m;
    samples.push({ error: Math.max(...state.viewMatrix.map((value, i) => Math.abs(value - actual[i]))), radius: state.lightRadius, cameraAlpha: camera.alpha });
  });
  try {
    const captures = [];
    for (let i = 0; i < 48; i++) {
      await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
      if (capture && [8, 24, 40].includes(i)) {
        capturing = true;
        try { captures.push(await capture(i)); } finally { capturing = false; }
      }
    }
    return { samples, captures, animatedBones: bones.map(({ bone }) => bone.name), jumpingBones: roots.map(({ bone }) => bone.name) };
  } finally {
    scene.onBeforeRenderObservable.remove(motion);
    target.onBeforeRenderObservable.remove(sample);
    camera.alpha = initialAlpha;
    meshes.forEach((mesh, i) => mesh.scaling.copyFrom(scales[i]));
    bones.forEach(({ bone, rotation }) => bone.setRotationQuaternion(rotation));
    roots.forEach(({ bone, position }) => bone.setPosition(position));
  }
}
