import { createTofuModel, writePmx } from "../../../scripts/generate-external-parent-test-models.mjs";

// Original project-generated geometry; dim emission exposes the luminous cutoff.
export function createDimLuminousFixture() {
  const model = createTofuModel();
  for (const material of model.materialGroups) {
    material.diffuse = [0.15, 0.12, 0.1, 1];
    material.ambient = [0, 0, 0];
    material.edge = false;
  }
  return writePmx(model);
}

// Keep the tested tofu topology; move its front marker 0.8 units toward the camera.
export function createOffsetDepthFixture() {
  const model = createTofuModel();
  model.modelName = "Offset depth fixture";
  const positions = [[-1.2, 0.5, -2.2], [1.2, 0.5, -2.2], [0, 2.5, -2.2]];
  for (const [index, vertex] of model.vertices.slice(-3).entries()) {
    vertex.position = positions[index];
    vertex.normal = [0, 0, -1];
  }
  return writePmx(model);
}
