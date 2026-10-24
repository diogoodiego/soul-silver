import type { MapAnimation } from "@soulsilver/shared/maps";
import { readAscii, readU16, readU32 } from "../binary.ts";
import { readDictionary, readNitroBlocks } from "./nitro.ts";

// Texture animations of the ROM, from a/1/0/6: texture scroll (BTA0/SRT0) and texture pattern
// (BTP0/PAT0). Layouts confirmed on every file of the ROM (research.md R7). Playback is not
// done here: this reads the data the overworld needs to play them.

export class AnimationFormatError extends Error {
  override name = "AnimationFormatError";
}

const CONSTANT = 0x20000000;
const S16 = 0x10000000;

const s16 = (b: Uint8Array, o: number) => (readU16(b, o) << 16) >> 16;
const fixed = (value: number) => value / 4096;

type Scroll = Extract<MapAnimation, { type: "scroll" }>;
type Track = Scroll["scaleS"];

function fail(message: string): never {
  throw new AnimationFormatError(message);
}

/** One 8-byte track: flags (frame count, constant bit, s16 bit) and a value or data offset. */
function readTrack(b: Uint8Array, entry: number, anim: number, rotation: false, name: string, duration: number): Track;
function readTrack(b: Uint8Array, entry: number, anim: number, rotation: true, name: string, duration: number): Scroll["rotation"];
function readTrack(b: Uint8Array, entry: number, anim: number, rotation: boolean, name: string, duration: number): Track | Scroll["rotation"] {
  const flags = readU32(b, entry);
  const value = readU32(b, entry + 4);
  if (flags & CONSTANT) {
    if (!rotation) return { constant: fixed(value | 0) };
    return { constant: [fixed((value << 16) >> 16), fixed(value >> 16)] };
  }
  const frames = flags & 0xffff;
  if (frames !== duration) fail(`${name}: a trilha tem ${frames} quadros, a animação tem ${duration}`);
  // Rotation always stores a (sin, cos) pair per frame, 4 bytes; other tracks s16 or s32.
  const size = rotation || !(flags & S16) ? 4 : 2;
  const at = anim + value;
  if (at + frames * size > b.length) fail(`${name}: os quadros passam do fim do arquivo`);
  if (rotation) {
    return { values: Array.from({ length: frames }, (_, i) => [fixed(s16(b, at + i * 4)), fixed(s16(b, at + i * 4 + 2))] as [number, number]) };
  }
  return { values: Array.from({ length: frames }, (_, i) => fixed(size === 2 ? s16(b, at + i * 2) : readU32(b, at + i * 4) | 0)) };
}

function readScroll(b: Uint8Array, block: number): Scroll[] {
  return readDictionary(b, block + 8).flatMap((animation) => {
    const a = block + readU32(animation.data, 0);
    const duration = readU16(b, a + 4);
    return readDictionary(b, a + 8).map((material): Scroll => {
      const entry = material.data.byteOffset - b.byteOffset;
      const at = (track: number) => entry + track * 8;
      return {
        type: "scroll",
        material: material.name,
        duration,
        scaleS: readTrack(b, at(0), a, false, material.name, duration),
        scaleT: readTrack(b, at(1), a, false, material.name, duration),
        rotation: readTrack(b, at(2), a, true, material.name, duration),
        translateS: readTrack(b, at(3), a, false, material.name, duration),
        translateT: readTrack(b, at(4), a, false, material.name, duration),
      };
    });
  });
}

function readPattern(b: Uint8Array, block: number): MapAnimation[] {
  return readDictionary(b, block + 8).flatMap((animation) => {
    const a = block + readU32(animation.data, 0);
    const names = (at: number, count: number) => Array.from({ length: count }, (_, i) => readAscii(b, a + at + i * 16, 16));
    const textures = names(readU16(b, a + 8), b[a + 6]!);
    const palettes = names(readU16(b, a + 10), b[a + 7]!);
    return readDictionary(b, a + 12).map((material): MapAnimation => {
      const count = readU16(material.data, 0);
      const at = a + readU16(material.data, 6);
      if (at + count * 4 > b.length) fail(`${material.name}: os quadros passam do fim do arquivo`);
      const keys = Array.from({ length: count }, (_, i) => ({ frame: readU16(b, at + i * 4), texture: b[at + i * 4 + 2]!, palette: b[at + i * 4 + 3]! }));
      keys.forEach((key, i) => {
        if (key.texture >= textures.length) fail(`${material.name}: o quadro ${key.frame} usa a texture ${key.texture}, que não existe`);
        if (key.palette >= palettes.length) fail(`${material.name}: o quadro ${key.frame} usa a palette ${key.palette}, que não existe`);
        if (i > 0 && key.frame <= keys[i - 1]!.frame) fail(`${material.name}: os quadros devem crescer (${keys[i - 1]!.frame}, ${key.frame})`);
      });
      return { type: "pattern", material: material.name, duration: readU16(b, a + 4), textures, palettes, keys };
    });
  });
}

/** Every material animation of a BTA0 or BTP0 file, in file order; other files give none. */
export function readAnimations(bytes: Uint8Array): MapAnimation[] {
  if (bytes.length < 4) return [];
  const magic = readAscii(bytes, 0, 4);
  if (magic !== "BTA0" && magic !== "BTP0") return [];
  const block = readNitroBlocks(bytes, magic).get(magic === "BTA0" ? "SRT0" : "PAT0");
  if (block === undefined) return [];
  return magic === "BTA0" ? readScroll(bytes, block) : readPattern(bytes, block);
}
