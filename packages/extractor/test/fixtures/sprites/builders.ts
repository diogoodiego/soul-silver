// Synthetic NCGR / NCLR / LZ10 builders. No ROM data (principle II).

const u16 = (v: number) => [v & 255, v >> 8];
const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** NCGR with 4 or 8 bpp pixels stored as given (already tiled or scanned). */
export function buildNcgr(opts: { tilesWide: number; tilesHigh: number; bpp?: 4 | 8; scanned?: boolean; data: Uint8Array | number[] }): Uint8Array {
  const data = [...opts.data];
  const rahc = [
    ...ascii("RAHC"),
    ...u32(0x20 + data.length),
    ...u16(opts.tilesHigh),
    ...u16(opts.tilesWide),
    ...u32((opts.bpp ?? 4) === 4 ? 3 : 4),
    ...u32(0),
    ...u32(opts.scanned ? 1 : 0),
    ...u32(data.length),
    ...u32(0x18),
    ...data,
  ];
  return new Uint8Array([...ascii("RGCN"), 0xff, 0xfe, 0, 1, ...u32(0x10 + rahc.length), ...u16(0x10), ...u16(1), ...rahc]);
}

/** NCLR from BGR555 words. */
export function buildNclr(colors: number[]): Uint8Array {
  const body = colors.flatMap((c) => u16(c));
  const ttlp = [...ascii("TTLP"), ...u32(0x18 + body.length), ...u32(3), ...u32(0), ...u32(body.length), ...u32(0x10), ...body];
  return new Uint8Array([...ascii("RLCN"), 0xff, 0xfe, 0, 1, ...u32(0x10 + ttlp.length), ...u16(0x10), ...u16(1), ...ttlp]);
}

/** BGR555 from 5-bit channels. */
export const bgr555 = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);

/** Encrypts pixel bytes the way the Gen 4 sprites are stored (inverse of decryptPokemonPixels). */
export function encryptPokemonPixels(plain: Uint8Array, seed = 0x1234): Uint8Array {
  if (plain[0] !== 0 || plain[1] !== 0) throw new Error("The first word of the plain pixels must be 0: it stores the seed");
  const out = new Uint8Array(plain.length);
  let key = seed;
  for (let i = 0; i + 1 < plain.length; i += 2) {
    const word = (plain[i]! | (plain[i + 1]! << 8)) ^ (key & 0xffff);
    out[i] = word & 255;
    out[i + 1] = word >> 8;
    key = (Math.imul(key, 0x41c64e6d) + 0x6073) >>> 0;
  }
  return out;
}

/** LZ10 stream with only literals, or with the given (length, distance) copies after them. */
export function buildLz10(plain: Uint8Array, copies: { at: number; length: number; distance: number }[] = []): Uint8Array {
  const body: number[] = [];
  let i = 0;
  while (i < plain.length) {
    const flagAt = body.length;
    body.push(0);
    for (let bit = 7; bit >= 0 && i < plain.length; bit--) {
      const copy = copies.find((c) => c.at === i);
      if (copy) {
        body[flagAt] = body[flagAt]! | (1 << bit);
        body.push(((copy.length - 3) << 4) | ((copy.distance - 1) >> 8), (copy.distance - 1) & 255);
        i += copy.length;
      } else body.push(plain[i++]!);
    }
  }
  return new Uint8Array([0x10, plain.length & 255, (plain.length >> 8) & 255, plain.length >> 16, ...body]);
}

/** Trainer sprites run the stream backwards: the last word of the plain data must be 0 (it stores the seed). */
export function encryptTrainerPixels(plain: Uint8Array, seed = 0x4321): Uint8Array {
  if (plain.at(-2) !== 0 || plain.at(-1) !== 0) throw new Error("The last word of the plain pixels must be 0: it stores the seed");
  const out = new Uint8Array(plain.length);
  let key = seed;
  for (let i = plain.length - 2; i >= 0; i -= 2) {
    const word = (plain[i]! | (plain[i + 1]! << 8)) ^ (key & 0xffff);
    out[i] = word & 255;
    out[i + 1] = word >> 8;
    key = (Math.imul(key, 0x41c64e6d) + 0x6073) >>> 0;
  }
  return out;
}
