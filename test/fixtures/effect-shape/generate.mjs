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
