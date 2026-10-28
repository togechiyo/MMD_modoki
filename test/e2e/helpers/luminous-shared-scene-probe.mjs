import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { MeshRadianceBvh } from "/src/render/mesh-radiance-bvh.ts";
import { radianceTask } from "./luminous-radiance-probe.mjs";

function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = texture.getScene(); texture.dispose(); return current;
}

export function clearSharedRadianceProbe() {
  for (const mesh of [...scene().meshes]) if (mesh.name.startsWith("rc-")) mesh.dispose();
}

// Read-only identity observation. Different ranges retain independent field/receiver histories.
export function sharedRadianceBindings(taskNames) {
  const receivers = taskNames.map(name => radianceTask(name));
  const keys = ["triangles", "nodes", "emissionPixels", "probeEpochs", "radianceField", "outputGi", "previousGi"];
  return {
    receiverCount: receivers.length,
    distinct: Object.fromEntries(keys.map(key => [key, new Set(receivers.map(task => task.computeShader._bindings[key].object)).size])),
    volumes: receivers.map(task => Array.from(task.getUniformBuffer("params").getData().slice(0, 8))),
  };
}

let firstResumedContact;
export function watchResumedRadianceContact(receiverName) {
  firstResumedContact = null;
  const task = radianceTask(receiverName), execute = task.execute;
  task.execute = function (...args) {
    const result = execute.apply(this, args), values = task.getUniformBuffer("params").getData();
    firstResumedContact = {
      volumeMin: Array.from(values.slice(0, 3)), volumeSize: Array.from(values.slice(4, 7)),
      dirtyMin: Array.from(values.slice(52, 56)), dirtyMax: Array.from(values.slice(56, 60)),
    };
    task.execute = execute;
    return result;
  };
}

export function resumedRadianceContact() { return firstResumedContact; }

// Observe complete application graph executions while translating original fixture geometry. This observes real
// BVH updates/uploads rather than counting update requests that may hit a shared-frame cache.
export async function measureSharedRadianceScene(taskNames, { frames = 4 } = {}) {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  const position = source.position.clone();
  const buffers = new Set(taskNames.flatMap(name => {
    const bindings = radianceTask(name).computeShader._bindings;
    return [bindings.triangles.object, bindings.nodes.object];
  }));
  const originalUpdate = MeshRadianceBvh.prototype.update, originalUpload = StorageBuffer.prototype.update, originalExecute = FrameGraph.prototype.execute;
  const result = { frames, bvhUpdates: 0, bufferUploads: 0, uploadedBytes: 0, bvhPerFrame: [], dispatches: { cascades: 0, receiver: 0 } };
  const undoDispatches = [];
  for (const name of taskNames) for (const suffix of ["Receiver", "Cascade0", "Cascade1", "Cascade2", "Cascade3"]) {
    const task = radianceTask(name.replace(/Receiver$/, suffix)), shader = task.computeShader;
    const originalDispatch = shader.dispatch;
    shader.dispatch = function (...args) {
      if (args[0] > 0 && args[1] > 0 && args[2] > 0) result.dispatches[suffix === "Receiver" ? "receiver" : "cascades"]++;
      return originalDispatch.apply(this, args);
    };
    undoDispatches.push(() => { shader.dispatch = originalDispatch; });
  }
  MeshRadianceBvh.prototype.update = function (...args) { result.bvhUpdates++; return originalUpdate.apply(this, args); };
  StorageBuffer.prototype.update = function (data, offset, length) {
    if (buffers.has(this)) { result.bufferUploads++; result.uploadedBytes += length ?? data.byteLength; }
    return originalUpload.call(this, data, offset, length);
  };
  try {
    await new Promise(resolve => {
      FrameGraph.prototype.execute = function (...args) {
        if (!this.tasks.some(task => taskNames.includes(task.name))) return originalExecute.apply(this, args);
        source.position.x = position.x + (result.bvhPerFrame.length + 1) * 0.025;
        const before = result.bvhUpdates, value = originalExecute.apply(this, args);
        result.bvhPerFrame.push(result.bvhUpdates - before);
        if (result.bvhPerFrame.length === frames) resolve();
        return value;
      };
    });
    return result;
  } finally {
    MeshRadianceBvh.prototype.update = originalUpdate; StorageBuffer.prototype.update = originalUpload;
    FrameGraph.prototype.execute = originalExecute;
    for (const undo of undoDispatches) undo();
    source.position.copyFrom(position);
  }
}
