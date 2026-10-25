import { readAscii, readU16, readU32 } from "../binary.ts";
import { decodeTexture } from "../maps/texture.ts";
import type { RgbaImage } from "../maps/png.ts";

// SPA particle files (Nitro SPL, version "12_1"): emitter resources, then SPT1 texture blocks.
// Only the textures are read; emitter behaviour is approximated by the client.

export class SpaFormatError extends Error {
  override name = "SpaFormatError";
}

/** What the client needs to approximate one emitter. Times are in 30 fps frames, distances in fx32 units / 4096. */
export interface SpaEmitter {
  texture: number;
  /** RGB hex: the base colour, and the end colour when the colour animates. */
  color: string;
  colorEnd?: string;
  /** 0–1. */
  alpha: number;
  scale: number;
  /** Scale animation: start and end multipliers of `scale`. */
  scaleFrom: number;
  scaleTo: number;
  count: number;
  interval: number;
  delay: number;
  emitterLife: number;
  particleLife: number;
  radius: number;
  speed: number;
  gravityY: number;
}

// Optional blocks after the 0x58-byte header, in file order, keyed by their flag bit. The sizes
// were checked by walking every SPA of the ROM to its exact resource end (see spa.test.ts).
const BLOCKS: Array<[bit: number, size: number]> = [
  [8, 12], // scale animation
  [9, 12], // colour animation
  [10, 8], // alpha animation
  [11, 12], // texture animation
  [16, 20], // child resource
  [24, 8], // gravity
  [25, 8], // random
  [26, 16], // magnet
  [27, 4], // spin
  [28, 8], // collision plane
  [29, 16], // convergence
];
const HEADER = 0x58;

const rgb = (c: number) => {
  const five = (v: number) => (v << 3) | (v >> 2);
  return [c & 0x1f, (c >> 5) & 0x1f, (c >> 10) & 0x1f].map((v) => five(v).toString(16).padStart(2, "0")).join("");
};

export function readSpaEmitters(bytes: Uint8Array, what: string): SpaEmitter[] {
  if (bytes.length < 0x20 || readAscii(bytes, 0, 4) !== " APS") throw new SpaFormatError(`${what}: falta o cabeçalho SPA`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fx32 = (at: number) => v.getInt32(at, true) / 4096;
  const fx16 = (at: number) => v.getInt16(at, true) / 4096;
  const end = 0x20 + readU32(bytes, 0x10);
  if (end > bytes.length) throw new SpaFormatError(`${what}: recursos passam do fim do arquivo`);
  const emitters: SpaEmitter[] = [];
  let at = 0x20;
  for (let i = 0; i < readU16(bytes, 8); i++) {
    if (at + HEADER > end) throw new SpaFormatError(`${what}: emissor ${i} passa do fim dos recursos`);
    const flags = readU32(bytes, at);
    const misc = readU32(bytes, at + 0x44);
    const e: SpaEmitter = {
      texture: misc >>> 24,
      color: rgb(readU16(bytes, at + 0x22)),
      alpha: ((misc >> 8) & 0x1f) / 31,
      scale: fx32(at + 0x2c),
      scaleFrom: 1,
      scaleTo: 1,
      count: fx32(at + 0x10),
      interval: misc & 0xff,
      delay: readU16(bytes, at + 0x32),
      emitterLife: readU16(bytes, at + 0x3c),
      particleLife: readU16(bytes, at + 0x3e),
      radius: fx32(at + 0x14),
      speed: fx32(at + 0x24) + fx32(at + 0x28),
      gravityY: 0,
    };
    let block = at + HEADER;
    for (const [bit, size] of BLOCKS) {
      if (((flags >>> bit) & 1) === 0) continue;
      if (bit === 8) [e.scaleFrom, e.scaleTo] = [fx16(block), fx16(block + 4)];
      if (bit === 9) [e.color, e.colorEnd] = [rgb(readU16(bytes, block)), rgb(readU16(bytes, block + 2))];
      if (bit === 24) e.gravityY = fx16(block + 2);
      block += size;
    }
    emitters.push(e);
    at = block;
  }
  if (at !== end) throw new SpaFormatError(`${what}: os emissores terminam em 0x${at.toString(16)}, esperado 0x${end.toString(16)}`);
  return emitters;
}

/** Doubles the image, mirrored, across S (x) and/or T (y). */
export function mirror(image: RgbaImage, s: boolean, t: boolean): RgbaImage {
  if (!s && !t) return image;
  const width = image.width * (s ? 2 : 1);
  const height = image.height * (t ? 2 : 1);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = y < image.height ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const sx = x < image.width ? x : width - 1 - x;
      data.set(image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** The textures of one SPA file, in file order. */
export function readSpaTextures(bytes: Uint8Array, what: string): RgbaImage[] {
  if (bytes.length < 0x20 || readAscii(bytes, 0, 4) !== " APS") throw new SpaFormatError(`${what}: falta o cabeçalho SPA`);
  const count = readU16(bytes, 0x0a);
  let at = readU32(bytes, 0x18);
  const images: RgbaImage[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 0x20 > bytes.length || readAscii(bytes, at, 4) !== " TPS") throw new SpaFormatError(`${what}: textura ${i} sem bloco SPT1`);
    const params = readU32(bytes, at + 4);
    const size = readU32(bytes, at + 0x1c);
    if (size < 0x20 || at + size > bytes.length) throw new SpaFormatError(`${what}: textura ${i} passa do fim do arquivo`);
    const block = bytes.subarray(at, at + size);
    // Flip-repeat bits: the texture is a half or a quarter, mirrored by the hardware into the whole shape.
    images.push(
      mirror(decodeTexture(
        {
          name: `${what}.${i}`,
          format: params & 0xf,
          width: 8 << ((params >> 4) & 0xf),
          height: 8 << ((params >> 8) & 0xf),
          color0Transparent: ((params >> 16) & 1) === 1,
          texels: block.subarray(0x20, 0x20 + readU32(bytes, at + 8)),
        },
        block.subarray(readU32(bytes, at + 0x0c)),
      ), ((params >> 14) & 1) === 1, ((params >> 15) & 1) === 1),
    );
    at += size;
  }
  return images;
}
