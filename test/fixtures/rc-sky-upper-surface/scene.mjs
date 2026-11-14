// Original primitive geometry; no external model or texture is required.
export const volume = { min: [-32, -32, -32], size: 64 };
export const poses = [1.5, 1.9, 2, 2 + 1e-6, 2.1, 2.2, 3, 4, 5.9, 6, 6.1].map(top => ({ name: `open-top-${top}`, top }));
poses.push({ name: "open-no-lower-floor", top: 2.1, lower: false },
  { name: "covered-sub-cell", top: 2.1, roofGap: .4 },
  { name: "covered-sub-cell-at-grid-epsilon", top: 2 + 1e-6, roofGap: .4 },
  { name: "covered-one-cell", top: 2.1, roofGap: 4 });

// The far wall raises the scene maximum Y without blocking the reference sky
// directions. Geometry underneath the receiver must not become a sky blocker.
export function boxesFor(pose) {
  const boxes = [
    { name: "platform", min: [-8, pose.top - .4, -8], max: [8, pose.top, 8] },
    { name: "far-tall-wall", min: [40, 0, -2], max: [40.2, 16, 2] },
  ];
  if (pose.lower !== false) boxes.push({ name: "lower-floor", min: [-20, -.2, -20], max: [20, 0, 20] });
  if (pose.roofGap) boxes.push({ name: "roof", min: [-32, pose.top + pose.roofGap, -32],
    max: [32, pose.top + pose.roofGap + .2, 32] });
  return boxes;
}

export const candidateMotion = {
  positions: [-10, 0, -10, -10, 0, 20, 20, 0, -10],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], indices: [0, 1, 2],
  heights: [2.2, 2.4, 2.6, 2.8, 3.2], movedIndex: 3, movedHeight: 10,
  focusProbe: [2, 2, 2], receiverPoints: [[2, 1.9, 2], [2, 2.9, 2], [2, 3.3, 2], [2, 10.1, 2]],
};
