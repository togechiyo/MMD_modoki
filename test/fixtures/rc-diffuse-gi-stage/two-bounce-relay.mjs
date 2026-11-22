import { writePmx } from "../../../scripts/generate-external-parent-test-models.mjs";

/** Original procedural fixture. The two coplanar floor patches cannot light each other directly. */
export function twoBounceRelayPmx(sourceColor, relayColor, scale = 1) {
  const vertices = [], materialGroups = [];
  function panel(name, rgb, normal, corners) {
    const start = vertices.length;
    for (const corner of corners) vertices.push({ position: corner.map(value => value * scale), normal, uv: [0, 0] });
    materialGroups.push({
      name, englishName: name, diffuse: [...rgb, 1], ambient: [0, 0, 0], edge: false, doubleSided: true,
      indices: [0, 1, 2, 0, 2, 3].map(i => i + start),
    });
  }
  panel("Source", sourceColor, [0, 1, 0], [[-7, 0, 5], [-2.6, 0, 5], [-2.6, 0, -5], [-7, 0, -5]]);
  panel("Receiver", [0.65, 0.65, 0.65], [0, 1, 0], [[-1.4, 0, 5], [3, 0, 5], [3, 0, -5], [-1.4, 0, -5]]);
  panel("Baffle", [0, 0, 0], [1, 0, 0], [[-2, 0, 6], [-2, 0, -6], [-2, 0.9, -6], [-2, 0.9, 6]]);
  panel("Overhead relay", relayColor, [0, -1, 0], [[-4.5, 4, -5], [2, 4, -5], [2, 4, 5], [-4.5, 4, 5]]);
  return writePmx({ modelName: "Two-bounce relay", englishModelName: "Two-bounce relay", noToon: true,
    comment: "Original untextured RC GI fixture: two floor patches, a black baffle and an overhead reflector.",
    vertices, materialGroups });
}
