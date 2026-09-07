import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";

const frames = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
function numberAt(data, i) {
  if (!(data instanceof Uint16Array)) return data[i];
  const h = data[i], e = (h >> 10) & 31, m = h & 1023;
  return (h & 32768 ? -1 : 1) * (e === 0 ? 2 ** -14 * m / 1024 : 2 ** (e - 15) * (1 + m / 1024));
}

export async function probeBleed(sameMesh = false) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const target = name => scene.textures.find(item => item.name === `owned-sss-${name}`);
  const entry = target("entry"), position = target("position"), signal = target("signal");
  const entryRender = entry.customRenderFunction;
  // Isolate diffusion: suppress the transmission capture, without changing lights.
  entry.customRenderFunction = () => {};
  const originals = position.renderList.filter(mesh => mesh.getTotalVertices() > 0);
  const clones = originals.map(mesh => {
    const clone = mesh.clone("owned-sss-moving-surface", null, true);
    clone.skeleton = null;
    clone.scaling.setAll(0.35);
    clone.position.set(0.8, 1, -0.7);
    clone.setEnabled(false);
    return clone;
  });
  const merged = sameMesh ? originals.map((mesh, i) => {
    const combined = Mesh.MergeMeshes([mesh, clones[i]], false, true, undefined, false, true);
    const visible = Float32Array.from(combined.getVerticesData(VertexBuffer.PositionKind));
    const hidden = visible.slice();
    for (let j = mesh.getTotalVertices() * 3 + 2; j < hidden.length; j += 3) hidden[j] -= 100;
    combined.setVerticesData(VertexBuffer.PositionKind, hidden, true);
    mesh.setEnabled(false);
    return { combined, visible, hidden };
  }) : [];
  const setVisible = visible => {
    if (sameMesh) merged.forEach(item => {
      item.combined.updateVerticesData(VertexBuffer.PositionKind, visible ? item.visible : item.hidden, true);
    });
    else clones.forEach(mesh => mesh.setEnabled(visible));
  };
  const read = async () => ({ positions: await position.readPixels(), light: await signal.readPixels() });
  const compare = (a, b) => {
    let count = 0, changed = 0, max = 0, sum = 0;
    for (let i = 0; i < a.positions.length; i += 4) {
      if (a.positions[i + 3] <= 0 || a.positions[i + 3] !== b.positions[i + 3]) continue;
      if ([0, 1, 2].some(c => Math.abs(a.positions[i + c] - b.positions[i + c]) > 0.0001)) continue;
      const delta = Math.max(...[0, 1, 2].map(c => Math.abs(numberAt(a.light, i + c) - numberAt(b.light, i + c))));
      count++; if (delta > 0.01) changed++; sum += delta; max = Math.max(max, delta);
    }
    return { count, changed, max, mean: sum / Math.max(1, count) };
  };
  const result = {};
  try {
    for (const blur of [true, false]) {
      const observers = blur ? [] : signal.postProcesses.map(pass => pass.onApplyObservable.add(effect => effect.setFloat2("axis", 0, 0)));
      setVisible(false); await frames(); const before = await read();
      setVisible(true); await frames(); const after = await read();
      result[blur ? "blur" : "unblurred"] = compare(before, after);
      if (!blur) {
        const { width, height } = position.getSize();
        const intermediate = await scene.getEngine()._readTexturePixels(signal.postProcesses[1].inputTexture.texture, width, height);
        let aligned = 0, flipped = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4 + 3;
          const j = ((height - 1 - y) * width + x) * 4 + 3;
          const mask = numberAt(intermediate, i) !== 0;
          if (mask !== (after.positions[i] > 0)) aligned++;
          if (mask !== (after.positions[j] > 0)) flipped++;
        }
        result.orientation = { aligned, flipped };
      }
      observers.forEach((observer, i) => signal.postProcesses[i].onApplyObservable.remove(observer));
    }
    return result;
  } finally {
    entry.customRenderFunction = entryRender;
    merged.forEach(({ combined }) => combined.dispose(false, false));
    originals.forEach(mesh => mesh.setEnabled(true));
    clones.forEach(mesh => mesh.dispose(false, false));
  }
}
