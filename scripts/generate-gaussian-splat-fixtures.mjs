// Four authored colored Gaussians. CC0; no third-party geometry or decoder.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "../test/fixtures/accessory");
const points = [[-4, -4, 0], [4, -4, 0], [-4, -12, 0], [4, -12, 0]];
const colors = [[240, 30, 30], [30, 240, 30], [30, 30, 240], [240, 220, 30]];
const scales = [1.8, 1.3, 1.8];
const raw = Buffer.alloc(points.length * 32);
points.forEach((point, i) => {
  [...point, ...scales].forEach((value, axis) => raw.writeFloatLE(value, i * 32 + axis * 4));
  raw.set([...colors[i], 210, 255, 128, 128, 128], i * 32 + 24);
});
writeFileSync(resolve(root, "gaussian-color.splat"), raw);

const properties = ["x", "y", "z", "scale_0", "scale_1", "scale_2", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "rot_0", "rot_1", "rot_2", "rot_3", ...Array.from({ length: 24 }, (_, i) => `f_rest_${i}`)];
const header = `ply\nformat binary_little_endian 1.0\ncomment 自作CC0 Gaussian fixture (SH degree 2)\nelement vertex ${points.length}\n${properties.map(name => `property float ${name}`).join("\n")}\nend_header\n`;
const body = Buffer.alloc(points.length * properties.length * 4);
points.forEach((point, i) => {
  const values = [...point, ...scales.map(Math.log), ...colors[i].map(value => (value / 255 - 0.5) / 0.28209479177387814), Math.log(210 / 45), 1, 0, 0, 0, ...Array(24).fill(0)];
  values.forEach((value, axis) => body.writeFloatLE(value, (i * properties.length + axis) * 4));
});
writeFileSync(resolve(root, "gaussian-color.ply"), Buffer.concat([Buffer.from(header), body]));
const asciiRow = [...Array(10).fill(0), 1, 0, 0, 0, ...Array(24).fill(0)].join(" ") + "\n";
writeFileSync(resolve(root, "gaussian-ascii.ply"), header.replace("binary_little_endian", "ascii") + asciiRow.repeat(points.length));

for (const version of [2, 3]) {
  const spz = Buffer.alloc(16 + points.length * (version === 3 ? 20 : 19));
  spz.writeUInt32LE(0x5053474e, 0);
  spz.writeUInt32LE(version, 4);
  spz.writeUInt32LE(points.length, 8);
  spz[13] = 12;
  let offset = 16;
  for (const point of points) for (const value of point) { spz.writeIntLE(value * 4096, offset, 3); offset += 3; }
  spz.fill(210, offset, offset + points.length);
  offset += points.length;
  for (const color of colors) for (const value of color) spz[offset++] = Math.round(127.5 + (value / 255 - 0.5) / 0.282 * 0.15 * 255);
  for (const _point of points) for (const scale of scales) spz[offset++] = Math.round(Math.log(scale) * 16 + 160);
  for (const _point of points) {
    if (version === 3) { spz.writeUInt32LE(0xc0000000, offset); offset += 4; }
    else { spz.fill(128, offset, offset + 3); offset += 3; }
  }
  writeFileSync(resolve(root, version === 3 ? "gaussian-color.spz" : "gaussian-color-v2.spz"), gzipSync(spz));
}
