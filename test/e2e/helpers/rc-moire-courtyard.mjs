import { expect } from "@playwright/test";
import { writePmx } from "../../../scripts/generate-external-parent-test-models.mjs";
import { project } from "./rc-diffuse-gi-controls.mjs";

const back = (bottom, top) => [[34,bottom,128],[-34,bottom,128],[-34,top,128],[34,top,128]];
const left = (bottom, top) => [[-34,bottom,128],[-34,bottom,52],[-34,top,52],[-34,top,128]];
const roof = [[-34,117,128],[-34,117,71],[-8,117,71],[-8,117,128]];
export const directions = [[-.2,-.65,.72],[-.2,-.65,.51]];
export const regions = {
  whiteBack: [[-12,93,128],[23,93,128],[23,108,128],[-12,108,128]],
  grayBack: [[-12,72,128],[23,72,128],[23,88,128],[-12,88,128]],
  whiteSide: [[-34,93,80],[-34,93,116],[-34,108,116],[-34,108,80]],
  graySide: [[-34,74,80],[-34,74,116],[-34,88,116],[-34,88,80]],
};

export function makeCourtyard({ noToon = true, gray = .45, white = .84 } = {}) {
  const vertices = [], materialGroups = [];
  function quad(name, positions, normal, color) {
    const first = vertices.length;
    for (const position of positions) vertices.push({ position, normal, uv: [0,0], boneIndex: 0 });
    materialGroups.push({ name, englishName: name, diffuse: color, ambient: [.2,.2,.2],
      edge: false, doubleSided: true, indices: [0,1,2,0,2,3].map(id => first + id) });
  }
  for (const [name, bottom, top, albedo] of [["Gray",55,90,gray],["White",90,128,white]]) {
    quad(`${name} back`, back(bottom,top), [0,0,-1], [albedo,albedo,albedo,1]);
    quad(`${name} side`, left(bottom,top), [1,0,0], [albedo,albedo,albedo,1]);
  }
  quad("Opaque canopy", roof, [0,-1,0], [.84,.84,.84,1]);
  quad("Cyan floor", [[-34,55,52],[-34,55,128],[34,55,128],[34,55,52]], [0,1,0], [.04,.62,.7,1]);
  const name = "Untextured opaque courtyard";
  return writePmx({ modelName: name, englishModelName: name, comment: "Original procedural test geometry",
    vertices, materialGroups, noToon, bones: [{ name: "Center", englishName: "Center", parentBoneIndex: -1 }] });
}

export function measureRegion(image, projected, reference) {
  const points = projected.map(([x,y]) => [x * image.width / 640, y * image.height / 360]);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const dark = new Set();
  let pixels = 0, rgbSum = 0, medianDeviation = 0, clipped = 0, absoluteChange = 0;
  function value(id) { return (image.data[id * 4] + image.data[id * 4 + 1] + image.data[id * 4 + 2]) / 3; }
  const neighbors = [-image.width-1,-image.width,-image.width+1,-1,1,image.width-1,image.width,image.width+1];
  for (let y = Math.max(1, Math.ceil(Math.min(...ys))); y < Math.min(image.height - 1, Math.max(...ys)); y++) {
    for (let x = Math.max(1, Math.ceil(Math.min(...xs))); x < Math.min(image.width - 1, Math.max(...xs)); x++) {
      const sides = points.map(([px,py], i) => {
        const [qx,qy] = points[(i + 1) % points.length];
        return (qx - px) * (y + .5 - py) - (qy - py) * (x + .5 - px);
      });
      if (sides.some(v => v < 0) && sides.some(v => v > 0)) continue;
      const id = y * image.width + x, color = value(id);
      if (color >= 254.5) clipped++;
      if (reference) {
        for (let c = 0; c < 3; c++) absoluteChange += Math.abs(image.data[4 * id + c] - reference.data[4 * id + c]);
      }
      const sorted = neighbors.map(step => value(id + step)).sort((a,b) => a-b);
      const deviation = (sorted[3] + sorted[4]) / 2 - color;
      if (deviation >= 5) dark.add(id);
      medianDeviation += Math.abs(deviation);
      rgbSum += color; pixels++;
    }
  }
  expect(pixels).toBeGreaterThan(100);
  return { dark, stats: { pixels, mean: rgbSum / pixels, meanAbsDeviation: medianDeviation / pixels, darkCount: dark.size, clipped,
    ...(reference && { shadowToggleRgbMae: absoluteChange / (pixels * 3) }) } };
}

export async function changeDirection(page, values) {
  if (!await page.locator("#light-direction-y").isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
  for (const [i,axis] of ["x","y","z"].entries()) {
    const input = page.locator(`#light-direction-${axis} + .range-number-input`);
    await input.fill(String(values[i])); await input.press("Enter");
  }
  const light = (await project(page)).lighting;
  expect([light.x, light.y, light.z]).toEqual(values);
}

export async function shadow(page, enabled) {
  if ((await project(page)).lighting.shadowEnabled === enabled) return;
  const command = page.locator('[data-menu-command="view.toggleShadow"]');
  await page.locator('.app-menu-group:has([data-menu-command="view.toggleShadow"]) > .app-menu-trigger').click();
  await command.click();
  expect((await project(page)).lighting.shadowEnabled).toBe(enabled);
}
