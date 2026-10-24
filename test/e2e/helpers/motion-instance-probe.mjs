import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

let latestGraph;
const observations = [];
const execute = FrameGraph.prototype.execute;
FrameGraph.prototype.execute = function () {
  latestGraph = this;
  const frame = Number(document.querySelector("#current-frame")?.value ?? 0);
  for (const task of this.tasks) if (task.name.startsWith("motionBlur-fx-")) observations.push({ frame, name: task.name, disabled: task.disabled, strength: task.postProcess.motionStrength, samples: task.postProcess.motionBlurSamples });
  if (observations.length > 5000) observations.splice(0, 1000);
  return execute.call(this);
};

export function motionInstanceState() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = texture.getScene(); texture.dispose();
  return { observations: [...observations], tasks: latestGraph?.tasks.filter(task => task.name.startsWith("motionBlur-fx-")).map(task => ({ name: task.name, disabled: task.disabled, strength: task.postProcess.motionStrength, samples: task.postProcess.motionBlurSamples })),
    skeletons: scene.skeletons.map(skeleton => ({ bones: skeleton.bones.length, boneTexture: skeleton.useTextureToStoreBoneMatrices })) };
}
export function resetMotionInstanceObservations() { observations.length = 0; }
