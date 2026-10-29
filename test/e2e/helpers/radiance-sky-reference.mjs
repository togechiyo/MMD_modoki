// Independent CPU oracle for the original opaque, axis-aligned box fixtures. This module has no
// Babylon/WGSL/runtime imports. Distances are world units; box faces are two-sided surfaces.
export const SKY_REFERENCE_SELF_HIT_EPSILON = 1e-4;

function vector(value, name) {
  const result = Array.from(value ?? []);
  if (result.length !== 3 || !result.every(Number.isFinite)) throw new TypeError(`${name} must contain three finite numbers`);
  return result;
}

function normalizeBoxes(boxes) {
  return boxes.map((box, index) => {
    let min, max;
    if (box.min && box.max) {
      min = vector(box.min, `boxes[${index}].min`); max = vector(box.max, `boxes[${index}].max`);
    } else {
      const center = vector(box.center, `boxes[${index}].center`), size = vector(box.size, `boxes[${index}].size`);
      min = center.map((value, axis) => value - size[axis] / 2);
      max = center.map((value, axis) => value + size[axis] / 2);
    }
    if (min.some((value, axis) => value > max[axis])) throw new RangeError(`boxes[${index}] has reversed bounds`);
    return { min, max };
  });
}

// Return the first actual face crossing, rather than treating an origin inside a solid box as a
// t=0 hit. This also skips the floor's coincident top face but can still hit its bottom face.
function nearestSurface(origin, direction, boxes, minDistance, maxDistance) {
  let nearest = Infinity;
  for (const { min, max } of boxes) {
    let entry = -Infinity, exit = Infinity, missed = false;
    for (let axis = 0; axis < 3; axis++) {
      if (direction[axis] === 0) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) { missed = true; break; }
      } else {
        const first = (min[axis] - origin[axis]) / direction[axis], second = (max[axis] - origin[axis]) / direction[axis];
        entry = Math.max(entry, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
        if (entry > exit) { missed = true; break; }
      }
    }
    if (missed) continue;
    const hit = entry >= minDistance ? entry : exit >= minDistance ? exit : Infinity;
    if (hit <= maxDistance && hit < nearest) nearest = hit;
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/** Nearest two-sided box-face hit in world units, or null. Non-unit directions are normalized. */
export function traceBoxRay(origin, direction, boxes, { minDistance = SKY_REFERENCE_SELF_HIT_EPSILON, maxDistance = Infinity } = {}) {
  const point = vector(origin, "origin"), ray = vector(direction, "direction"), length = Math.hypot(...ray);
  if (length === 0) throw new RangeError("direction must be nonzero");
  if (!Number.isFinite(minDistance) || minDistance < 0 || !(maxDistance >= 0)) throw new RangeError("Invalid ray interval");
  if (maxDistance < minDistance) return null;
  return nearestSurface(point, ray.map(value => value / length), normalizeBoxes(boxes), minDistance, maxDistance);
}

/** Equal-solid-angle upper-hemisphere cell centers. upperRows is half of a full-sphere row count. */
export function createSkyReferenceDirections({ columns = 8, upperRows = 2 } = {}) {
  if (![columns, upperRows].every(value => Number.isInteger(value) && value > 0)) throw new RangeError("Direction dimensions must be positive integers");
  const result = [];
  for (let row = 0; row < upperRows; row++) {
    const y = 1 - (row + 0.5) / upperRows, radius = Math.sqrt(1 - y * y);
    for (let column = 0; column < columns; column++) {
      const azimuth = (column + 0.5) / columns * Math.PI * 2;
      result.push({ direction: [radius * Math.cos(azimuth), y, radius * Math.sin(azimuth)], weight: y });
    }
  }
  return result;
}

function configuration(boxes, options) {
  const { columns = 8, upperRows = 2, nearDistance = 16 / 18, volumeMin = [-8, 0, -8], volumeSize = 16,
    minDistance = SKY_REFERENCE_SELF_HIT_EPSILON } = options;
  const min = vector(volumeMin, "volumeMin"), size = typeof volumeSize === "number" ? [volumeSize, volumeSize, volumeSize] : vector(volumeSize, "volumeSize");
  if (!size.every(value => Number.isFinite(value) && value > 0)) throw new RangeError("volumeSize must be positive");
  if (!Number.isFinite(nearDistance) || nearDistance < 0 || !Number.isFinite(minDistance) || minDistance < 0) throw new RangeError("Invalid near distance or self-hit epsilon");
  return { boxes: normalizeBoxes(boxes), directions: createSkyReferenceDirections({ columns, upperRows }),
    columns, upperRows, nearDistance, minDistance, volumeMin: min, volumeMax: min.map((value, axis) => value + size[axis]), volumeSize: size };
}

function counters() {
  return { rayCount: 0, hitCount: 0, nearHitCount: 0, nearMissCount: 0, endpointOutsideCount: 0,
    weightSum: 0, visibleWeight: 0, nearHitWeight: 0, nearMissWeight: 0, endpointOutsideWeight: 0 };
}

function samplePoint(point, config) {
  const counts = counters();
  for (const { direction, weight } of config.directions) {
    const hit = nearestSurface(point, direction, config.boxes, config.minDistance, Infinity);
    counts.rayCount++; counts.weightSum += weight;
    if (hit === null) counts.visibleWeight += weight;
    else counts.hitCount++;
    if (hit !== null && hit <= config.nearDistance) {
      counts.nearHitCount++; counts.nearHitWeight += weight;
    } else {
      counts.nearMissCount++; counts.nearMissWeight += weight;
      // Count only paths that would actually sample a field after the near segment. Boundaries
      // are inside, matching the closed volume; do not include near hits in the fallback count.
      const endpoint = point.map((value, axis) => value + direction[axis] * config.nearDistance);
      if (endpoint.some((value, axis) => value < config.volumeMin[axis] || value > config.volumeMax[axis])) {
        counts.endpointOutsideCount++; counts.endpointOutsideWeight += weight;
      }
    }
  }
  return counts;
}

function summarize(counts, points = 1) {
  return { ...counts, points, visibility: counts.visibleWeight / counts.weightSum,
    // Equal-solid-angle quadrature of integral(V * cos(theta) dOmega), normalized visibility is / PI.
    cosineIntegral: counts.visibleWeight * 2 * Math.PI / counts.rayCount,
    nearHitFraction: counts.nearHitCount / counts.rayCount,
    endpointOutsideFraction: counts.endpointOutsideCount / counts.rayCount,
    endpointOutsideFractionOfNearMisses: counts.nearMissCount ? counts.endpointOutsideCount / counts.nearMissCount : 0,
    nearHitWeightedFraction: counts.nearHitWeight / counts.weightSum,
    endpointOutsideWeightedFractionOfNearMisses: counts.nearMissWeight ? counts.endpointOutsideWeight / counts.nearMissWeight : 0 };
}

/** Arbitrary point; 8x2=16 rays matches the diagnostic, 32x16=512 and 64x32=2048 resolve angular error. */
export function integrateSkyReference(point, boxes, options = {}) {
  const position = vector(point, "point"), config = configuration(boxes, options);
  return { point: position, columns: config.columns, upperRows: config.upperRows, nearDistance: config.nearDistance,
    ...summarize(samplePoint(position, config)) };
}

/** Reuse one compiled fixture/direction set for selected points, e.g. either side of a wall or an opening. */
export function integrateSkyReferencePoints(points, boxes, options = {}) {
  const config = configuration(boxes, options);
  return points.map(point => {
    const position = vector(point, "point");
    return { point: position, columns: config.columns, upperRows: config.upperRows, nearDistance: config.nearDistance,
      ...summarize(samplePoint(position, config)) };
  });
}

/** Scalar row-major visibility grid plus whole-grid near-hit/fallback counters. Row increases world Z. */
export function integrateSkyReferenceGrid(boxes, options = {}) {
  const { resolution = 64, planeY = 0.05 } = options, config = configuration(boxes, options);
  if (!Number.isInteger(resolution) || resolution <= 0 || !Number.isFinite(planeY)) throw new RangeError("Invalid diagnostic grid");
  const values = new Float32Array(resolution * resolution), totals = counters();
  for (let row = 0; row < resolution; row++) for (let column = 0; column < resolution; column++) {
    const point = [config.volumeMin[0] + (column + 0.5) / resolution * config.volumeSize[0], planeY,
      config.volumeMin[2] + (row + 0.5) / resolution * config.volumeSize[2]];
    const counts = samplePoint(point, config);
    values[row * resolution + column] = counts.visibleWeight / counts.weightSum;
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }
  return { values, resolution, planeY, columns: config.columns, upperRows: config.upperRows, nearDistance: config.nearDistance,
    totals: summarize(totals, resolution * resolution) };
}

/** Convenience scalar grid for comparison with channel G in the GPU diagnostic RGBA buffer. */
export function createSkyReferenceGrid(boxes, options = {}) { return integrateSkyReferenceGrid(boxes, options).values; }

/** Signed bias is the supplied channel minus the independent CPU reference. No automatic row flip. */
export function compareSkyReferenceGrid(reference, pixels, { channel = 1, stride = 4 } = {}) {
  if (!Number.isInteger(stride) || stride < 1 || !Number.isInteger(channel) || channel < 0 || channel >= stride
    || pixels.length !== reference.length * stride) throw new RangeError("Grid/channel dimensions do not match");
  let sum = 0, maximum = 0, signed = 0, nonFinite = 0;
  for (let i = 0; i < reference.length; i++) {
    const delta = pixels[i * stride + channel] - reference[i];
    if (!Number.isFinite(delta)) { nonFinite++; continue; }
    sum += Math.abs(delta); maximum = Math.max(maximum, Math.abs(delta)); signed += delta;
  }
  const valid = reference.length - nonFinite;
  return { pixels: reference.length, nonFinite, absoluteMean: sum / (valid || 1), absoluteMax: maximum, signedBias: signed / (valid || 1) };
}
