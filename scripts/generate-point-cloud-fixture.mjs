import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Self-authored colored wave, CC0. No external data or random input.
const rows = [];
for (let y = 0; y <= 20; y += 1) {
  for (let x = 0; x <= 20; x += 1) {
    const z = (2 * Math.sin(x * Math.PI / 10) * Math.cos(y * Math.PI / 10)).toFixed(4);
    rows.push(`${x - 10} ${y + 2} ${z} ${Math.round(x * 255 / 20)} ${Math.round(y * 255 / 20)} 192`);
  }
}
const header = ["ply", "format ascii 1.0", "comment Self-authored color wave point cloud, CC0", `element vertex ${rows.length}`,
  "property float x", "property float y", "property float z", "property uchar red", "property uchar green", "property uchar blue", "end_header"];
writeFileSync(resolve(import.meta.dirname, "../test/fixtures/accessory/color-point-cloud.ply"), `${[...header, ...rows].join("\n")}\n`);
