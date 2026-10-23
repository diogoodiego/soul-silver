/**
 * Test-only BLZ (backward LZ) encoder, the inverse of `decompressBlz` (research R2).
 *
 * The decoder reads the stream from the end of the file towards the start. Each flag byte
 * covers up to 8 items, MSB first (1 = match, 0 = literal). A match is two bytes, high byte
 * first: `((len - 3) << 12) | (disp - 3)`. Data is also produced back to front.
 */
export function encodeBlz(plain: Uint8Array, prefix: Uint8Array = new Uint8Array()): Uint8Array {
  const n = plain.length;
  const decodeOrder: number[] = [];
  let flagPos = -1;
  let bitsLeft = 0;

  const startItem = (isMatch: boolean) => {
    if (bitsLeft === 0) {
      flagPos = decodeOrder.length;
      decodeOrder.push(0);
      bitsLeft = 8;
    }
    bitsLeft--;
    if (isMatch) decodeOrder[flagPos] = decodeOrder[flagPos]! | (1 << bitsLeft);
  };

  let p = n;
  while (p > 0) {
    let bestLen = 0;
    let bestDisp = 0;
    const maxDisp = Math.min(4098, n - p);
    for (let disp = 3; disp <= maxDisp; disp++) {
      let len = 0;
      while (len < 18 && len < p && plain[p - 1 - len] === plain[p - 1 - len + disp]) len++;
      if (len > bestLen) {
        bestLen = len;
        bestDisp = disp;
      }
    }
    if (bestLen >= 3) {
      startItem(true);
      const pos = ((bestLen - 3) << 12) | (bestDisp - 3);
      decodeOrder.push(pos >> 8, pos & 0xff);
      p -= bestLen;
    } else {
      startItem(false);
      decodeOrder.push(plain[p - 1]!);
      p -= 1;
    }
  }

  const compressed = decodeOrder.length;
  const region = Uint8Array.from(decodeOrder).reverse();
  const file = new Uint8Array(prefix.length + compressed + 8);
  file.set(prefix, 0);
  file.set(region, prefix.length);
  const view = new DataView(file.buffer);
  view.setUint32(prefix.length + compressed, ((8 << 24) | (compressed + 8)) >>> 0, true);
  view.setInt32(prefix.length + compressed + 4, n - compressed - 8, true);
  return file;
}

export const ARM9_PARAMS_MAGIC = Uint8Array.of(0x21, 0x06, 0xc0, 0xde, 0xde, 0xc0, 0x06, 0x21);
export const ARM9_PARAMS_OFFSET = 0x20;
export const ARM9_PREFIX_SIZE = 0x60;

/**
 * Builds an ARM9 image like the real one: an uncompressed head holding the module params,
 * a BLZ-compressed body, and a few trailing bytes after the compressed region.
 * `expected` is what decompression must return.
 */
export function encodeArm9(
  plainBody: Uint8Array,
  loadAddress = 0x02000000,
  trailer: Uint8Array = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
): { file: Uint8Array; expected: Uint8Array } {
  const prefix = new Uint8Array(ARM9_PREFIX_SIZE).map((_, i) => (i * 7 + 1) & 0xff);
  prefix.set(ARM9_PARAMS_MAGIC, ARM9_PARAMS_OFFSET + 0x1c);
  const compressedEnd = encodeBlz(plainBody, prefix).length;
  new DataView(prefix.buffer).setUint32(ARM9_PARAMS_OFFSET + 0x14, loadAddress + compressedEnd, true);
  const compressed = encodeBlz(plainBody, prefix);
  return {
    file: Uint8Array.from([...compressed, ...trailer]),
    expected: Uint8Array.from([...prefix, ...plainBody, ...trailer]),
  };
}
