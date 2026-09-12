import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

// Original synthetic data, distributed under the repository MIT license.
// Each track has a non-identity rotation so VmdLoader keeps the baked keys.
export function createBakedVmd({ frames = 301, extraBones = 0, movable = false } = {}) {
  const names = ["センター", ...Array.from({ length: extraBones }, (_, i) => `BakeExtra${i}`)];
  const bytes = Buffer.alloc(74 + names.length * frames * 111);
  bytes.write("Vocaloid Motion Data 0002", 0, "ascii");
  bytes.write("Retention probe", 30, "ascii");
  bytes.writeUInt32LE(names.length * frames, 50);
  const interpolation = Buffer.from(
    "14140000141414146b6b6b6b6b6b6b6b"
    + "141414141414146b6b6b6b6b6b6b6b00"
    + "1414141414146b6b6b6b6b6b6b6b0000"
    + "14141414146b6b6b6b6b6b6b6b000000", "hex",
  );
  let offset = 54;
  for (const name of names) {
    for (let frame = 0; frame < frames; frame += 1) {
      iconv.encode(name, "shift_jis").copy(bytes, offset, 0, 15);
      bytes.writeUInt32LE(frame, offset + 15);
      bytes.writeFloatLE(movable ? 0.1 + frame / frames : 0, offset + 19);
      const angle = 0.05 + frame / frames * 0.1;
      bytes.writeFloatLE(Math.sin(angle), offset + 35);
      bytes.writeFloatLE(Math.cos(angle), offset + 43);
      interpolation.copy(bytes, offset + 47);
      offset += 111;
    }
  }
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? "test-results/motion-retention-fixtures");
  mkdirSync(output, { recursive: true });
  for (const [name, options] of [
    ["rotation-only.vmd", {}],
    ["with-extra-bones.vmd", { extraBones: 8 }],
    ["with-translation.vmd", { movable: true }],
  ]) {
    const bytes = createBakedVmd(options);
    const path = resolve(output, name);
    writeFileSync(path, bytes);
    console.log(`${path}: ${bytes.length} bytes`);
  }
}
