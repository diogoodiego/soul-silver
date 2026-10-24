// LZ10 (BIOS LZ77) decompression, used by the compressed members of the sprite archives.

export class Lz10FormatError extends Error {
  override name = "Lz10FormatError";
}

export function decompressLz10(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0x10) throw new Lz10FormatError("Not an LZ10 stream (missing 0x10 header)");
  const size = bytes[1]! | (bytes[2]! << 8) | (bytes[3]! << 16);
  const out = new Uint8Array(size);
  let src = 4;
  let dst = 0;
  while (dst < size) {
    if (src >= bytes.length) throw new Lz10FormatError("LZ10 stream ends before the declared size");
    const flags = bytes[src++]!;
    for (let bit = 7; bit >= 0 && dst < size; bit--) {
      if (((flags >> bit) & 1) === 0) {
        if (src >= bytes.length) throw new Lz10FormatError("LZ10 stream ends before the declared size");
        out[dst++] = bytes[src++]!;
        continue;
      }
      if (src + 1 >= bytes.length) throw new Lz10FormatError("LZ10 stream ends before the declared size");
      const hi = bytes[src++]!;
      const lo = bytes[src++]!;
      const length = (hi >> 4) + 3;
      const from = dst - ((((hi & 15) << 8) | lo) + 1);
      if (from < 0) throw new Lz10FormatError("LZ10 back-reference points before the start of the output");
      for (let i = 0; i < length && dst < size; i++) out[dst++] = out[from + i]!;
    }
  }
  return out;
}
