import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const width = 8;
const height = 8;
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/accessory/tofu-uv-mtl.png",
);

const colors = {
  topLeft: [240, 91, 120, 255],
  topRight: [82, 199, 184, 255],
  bottomLeft: [103, 137, 232, 255],
  bottomRight: [242, 193, 78, 255],
};

const scanlines = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y += 1) {
  const rowStart = y * (1 + width * 4);
  scanlines[rowStart] = 0;
  for (let x = 0; x < width; x += 1) {
    const isTop = y < height / 2;
    const isLeft = x < width / 2;
    const color = isTop
      ? (isLeft ? colors.topLeft : colors.topRight)
      : (isLeft ? colors.bottomLeft : colors.bottomRight);
    const pixelStart = rowStart + 1 + x * 4;
    scanlines.set(color, pixelStart);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  createChunk("IHDR", ihdr),
  createChunk("IDAT", deflateSync(scanlines, { level: 9 })),
  createChunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(outputPath, png);
console.log(`Generated ${outputPath} (${width}x${height}, RGBA)`);
