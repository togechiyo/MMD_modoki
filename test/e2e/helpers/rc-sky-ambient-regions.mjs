import { expect } from "@playwright/test";
import { projectPoints } from "./rc-diffuse-gi-controls.mjs";

// Insets on the equal-material gold boxes authored by generate-rc-sky-stage.mjs.
// The first lies below the canopy; the second is above every other occluder.
export function skyAmbientRegions(view) {
  return Object.fromEntries(Object.entries({
    canopy: [[-4.4, 1.5, -.4], [-3.6, 1.5, -.4], [-3.6, 1.5, .4], [-4.4, 1.5, .4]],
    open: [[-4.4, 5.7, .6], [-3.6, 5.7, .6], [-3.6, 5.7, 1.4], [-4.4, 5.7, 1.4]],
  }).map(([name, points]) => [name, projectPoints(view, points).map(point => point.slice(0, 2))]));
}

function inside(x, y, polygon) {
  let positive = false, negative = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const side = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    positive ||= side > 0; negative ||= side < 0;
  }
  return !(positive && negative);
}

export function measureSkyAmbientRegions(image, regions) {
  expect([image.width, image.height]).toEqual([640, 360]);
  return Object.fromEntries(Object.entries(regions).map(([name, polygon]) => {
    let pixels = 0;
    const rgb = [0, 0, 0], linear = [0, 0, 0];
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (!inside(x + .5, y + .5, polygon)) continue;
      const index = (y * image.width + x) * 4;
      if (image.data[index + 3] < 250) continue;
      pixels++;
      for (let c = 0; c < 3; c++) {
        rgb[c] += image.data[index + c];
        // Matches the default Babylon/MMD approximate display/linear conversion.
        linear[c] += (image.data[index + c] / 255) ** 2.2;
      }
    }
    expect(pixels, `${name} ROI must contain visible opaque surface`).toBeGreaterThan(25);
    const rgbMean = rgb.map(value => value / pixels), linearMean = linear.map(value => value / pixels);
    return [name, { polygon, pixels, rgbMean, linearMean, mean: rgbMean.reduce((sum, value) => sum + value, 0) / 3 }];
  }));
}

// A roof underside receiving no direct light cannot bounce light onto the box
// top below it. Verify GI where this scene actually has a bounce AND sky shading,
// excluding clipping and requiring a substantial pixel population.
export function measureSkyAmbientGiRetention(base, sky, gi, combined) {
  let pixels = 0, totalGain = 0, totalCombinedGain = 0, totalError = 0;
  for (let i = 0; i < base.data.length; i += 4) {
    const before = [0, 1, 2].map(c => base.data[i + c]);
    const shaded = [0, 1, 2].map(c => sky.data[i + c]);
    const bounced = [0, 1, 2].map(c => gi.data[i + c]);
    if (base.data[i + 3] < 250 || Math.max(...bounced) >= 240
      || !before.some((value, c) => value - shaded[c] > 2)
      || bounced.reduce((sum, value, c) => sum + value - before[c], 0) <= 3) continue;
    pixels++;
    for (let c = 0; c < 3; c++) {
      const gain = (bounced[c] / 255) ** 2.2 - (before[c] / 255) ** 2.2;
      const combinedGain = (combined.data[i + c] / 255) ** 2.2 - (shaded[c] / 255) ** 2.2;
      totalGain += gain; totalCombinedGain += combinedGain; totalError += Math.abs(gain - combinedGain);
    }
  }
  return { pixels, meanGain: totalGain / (pixels * 3), meanCombinedGain: totalCombinedGain / (pixels * 3),
    meanAbsoluteError: totalError / (pixels * 3) };
}
