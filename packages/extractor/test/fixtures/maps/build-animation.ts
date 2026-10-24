import { ByteWriter } from "../byte-writer.ts";
import { buildBlock, buildDictionary, buildNitroFile, u32Bytes } from "./build-nitro.ts";

// Synthetic texture animations (BTA0/SRT0 and BTP0/PAT0) in the layout confirmed on the ROM
// (specs/006-map-prerender/research.md R7), independent of the code under test.

/** One scroll track: constant (raw u32), or per-frame s16/s32 values, 4.12 fixed point. */
export type TrackSpec =
  | { kind: "const"; value: number }
  | { kind: "s16" | "s32"; values: number[] };

export interface ScrollMaterial {
  name: string;
  /** scale S, scale T, rotation, translation S, translation T. */
  tracks: [TrackSpec, TrackSpec, TrackSpec, TrackSpec, TrackSpec];
}

const fx = (v: number) => Math.round(v * 4096);

/** A rotation as the raw u32 the ROM stores: sin in the low half, cos in the high half. */
export const rotation = (sin: number, cos: number) => ((fx(cos) & 0xffff) << 16) | (fx(sin) & 0xffff);

function animationBlock(block: string, container: string, animations: Uint8Array[], names: string[]): Uint8Array {
  const dictLength = buildDictionary(names.map((name) => ({ name, data: new Uint8Array(4) })), 4).length;
  const body = new ByteWriter();
  let at = 8 + dictLength;
  const entries = animations.map((a, i) => {
    const entry = { name: names[i]!, data: u32Bytes(at) };
    at += a.length;
    return entry;
  });
  body.raw(buildDictionary(entries, 4));
  for (const a of animations) body.raw(a);
  return buildNitroFile(container, [buildBlock(block, body.toBytes())]);
}

export function scrollAnimation(duration: number, materials: ScrollMaterial[]): Uint8Array {
  const dictLength = buildDictionary(materials.map((m) => ({ name: m.name, data: new Uint8Array(40) })), 40).length;
  const cursor = 8 + dictLength;
  const data = new ByteWriter();
  const entries = materials.map((m) => {
    const w = new ByteWriter();
    m.tracks.forEach((track, i) => {
      if (track.kind === "const") {
        const flags = (i === 2 ? 0x20000000 : 0x30000000) | duration;
        w.u32(flags).u32(track.value);
        return;
      }
      w.u32((track.kind === "s16" ? 0x10000000 : 0) | track.values.length).u32(cursor + data.length);
      for (const v of track.values) {
        if (track.kind === "s16") data.u16(fx(v));
        else data.u32(fx(v));
      }
    });
    return { name: m.name, data: w.toBytes() };
  });
  const anim = new ByteWriter().ascii("M\0AT").u16(duration).u16(1).raw(buildDictionary(entries, 40)).raw(data.toBytes());
  return anim.toBytes();
}

export interface PatternMaterial {
  name: string;
  /** frame, texture index, palette index. */
  keys: [number, number, number][];
}

export function patternAnimation(duration: number, textures: string[], palettes: string[], materials: PatternMaterial[]): Uint8Array {
  const dictLength = buildDictionary(materials.map((m) => ({ name: m.name, data: new Uint8Array(8) })), 8).length;
  const names = (list: string[]) => {
    const w = new ByteWriter();
    for (const n of list) w.ascii(n).raw(new Uint8Array(16 - n.length));
    return w.toBytes();
  };
  let cursor = 12 + dictLength;
  const keys = new ByteWriter();
  const entries = materials.map((m) => {
    const entry = { name: m.name, data: new ByteWriter().u16(m.keys.length).u16(0).u16(0).u16(cursor + keys.length).toBytes() };
    for (const [frame, texture, palette] of m.keys) keys.u16(frame).u8(texture).u8(palette);
    return entry;
  });
  const texNames = names(textures);
  const palNames = names(palettes);
  const texAt = cursor + keys.length;
  cursor = texAt + texNames.length;
  return new ByteWriter()
    .ascii("M\0PT").u16(duration).u8(textures.length).u8(palettes.length).u16(texAt).u16(cursor)
    .raw(buildDictionary(entries, 8)).raw(keys.toBytes()).raw(texNames).raw(palNames)
    .toBytes();
}

export const scrollFile = (names: string[], animations: Uint8Array[]) => animationBlock("SRT0", "BTA0", animations, names);
export const patternFile = (names: string[], animations: Uint8Array[]) => animationBlock("PAT0", "BTP0", animations, names);
