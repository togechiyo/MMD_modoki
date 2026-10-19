import iconv from "iconv-lite";

// Original MIT fixtures. No downloaded model or motion data.
export function createMorphVmd() {
  const bytes = Buffer.alloc(50 + 4 + 4 + 2 * 23 + 4 * 4);
  bytes.write("Vocaloid Motion Data 0002");
  bytes.write("Reproduction", 30);
  bytes.writeUInt32LE(2, 54);
  for (let i = 0; i < 2; i++) {
    const offset = 58 + i * 23;
    iconv.encode("表情テスト", "shift_jis").copy(bytes, offset);
    bytes.writeUInt32LE(i * 30, offset + 15);
    bytes.writeFloatLE(i, offset + 19);
  }
  return bytes;
}

export function createSwatchBmp(rgb) {
  const bytes = Buffer.alloc(70);
  bytes.write("BM"); bytes.writeUInt32LE(70, 2); bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(2, 18); bytes.writeInt32LE(2, 22);
  bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28); bytes.writeUInt32LE(16, 34);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) bytes.set([...rgb].reverse(), 54 + y * 8 + x * 3);
  return bytes;
}
