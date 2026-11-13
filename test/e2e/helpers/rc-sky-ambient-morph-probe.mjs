import { MmdManager } from "/src/mmd-manager.ts";

// Observe the normal GUI/producer path without changing caster selection or poses.
let manager;
const getSettings = MmdManager.prototype.getRcSkyAmbientSettings;
MmdManager.prototype.getRcSkyAmbientSettings = function (...args) {
  manager = this;
  return getSettings.apply(this, args);
};

export function skyMorphState() {
  const entry = manager?.sceneModels[0], controller = manager?.rcSkyAmbientController;
  if (!entry || !controller) return null;
  const source = manager.modelSourceAnimationsByModel.get(entry.model);
  return {
    frame: manager.currentFrame,
    diagnostics: { ...controller.diagnostics },
    providerReady: Boolean(controller.view),
    runtimeAnimations: entry.model.runtimeAnimations.size,
    boneKeyCount: [...(source?.boneTracks ?? []), ...(source?.movableBoneTracks ?? [])]
      .reduce((count, track) => count + track.frameNumbers.length, 0),
    morphTracks: (source?.morphTracks ?? []).map(track => ({
      name: track.name, frames: Array.from(track.frameNumbers), weights: Array.from(track.weights),
    })),
    weights: Object.fromEntries(["庇移動モーフ", "材質テスト"].map(name => [name, entry.model.morph.getMorphWeight(name)])),
  };
}

export function disposeSkyMorphProbe() {
  MmdManager.prototype.getRcSkyAmbientSettings = getSettings;
  manager = undefined;
}
