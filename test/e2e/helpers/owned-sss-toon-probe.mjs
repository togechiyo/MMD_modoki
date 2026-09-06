import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

// Served through Vite so the probe uses the application's Babylon module instance.
export async function withNeutralToon(capture) {
  const replacement = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, undefined, false, false);
  const scene = replacement.getScene();
  const originals = scene.materials.filter(mat => "toonTexture" in mat).map(mat => [mat, mat.toonTexture]);
  try {
    for (const [mat] of originals) mat.toonTexture = replacement;
    for (let i = 0; i < 12; i++) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
    return await capture();
  } finally {
    for (const [mat, texture] of originals) mat.toonTexture = texture;
    replacement.dispose();
  }
}
