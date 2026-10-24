// Readers of a map's zone event file (npcs, warps, coordinate triggers, signs) and of its level
// script file. See specs/008-events-scripts-encounters/research.md R0 and data-model.md.
import type { MapEventsFile } from "@soulsilver/shared/events";
import { readU16, readU32 } from "../binary.ts";
import { LEVEL_SCRIPT } from "./layout.ts";

type Raw<T> = Omit<T, "script"> & { script: number };

/** A zone file as stored: script ids are not resolved yet and npcs have no trainer link. */
export interface RawZone {
  objects: Raw<Omit<MapEventsFile["npcs"][number], "trainer">>[];
  warps: MapEventsFile["warps"];
  triggers: Raw<MapEventsFile["triggers"][number]>[];
  signs: Raw<MapEventsFile["signs"][number]>[];
}

const s16 = (value: number) => (value << 16) >> 16;
const s32 = (value: number) => value | 0;

/** The four counted lists of a zone file: signs (20 bytes), objects (32), warps (12), triggers (16). */
export function readZone(bytes: Uint8Array, name: string): RawZone {
  try {
    let o = 0;
    const list = <T>(size: number, read: (at: number) => T): T[] => {
      const count = readU32(bytes, o);
      o += 4;
      if (o + count * size > bytes.length) throw new RangeError(`list of ${count} entries of ${size} bytes at offset 0x${(o - 4).toString(16)} runs past the file`);
      const items = Array.from({ length: count }, (_, i) => read(o + i * size));
      o += count * size;
      return items;
    };
    const signs = list(20, (a) => ({ script: readU16(bytes, a), kind: readU16(bytes, a + 2), x: s32(readU32(bytes, a + 4)), z: s32(readU32(bytes, a + 8)), y: s32(readU32(bytes, a + 12)), dir: readU16(bytes, a + 16) }));
    const objects = list(32, (a) => ({
      id: readU16(bytes, a),
      sprite: readU16(bytes, a + 2),
      movement: readU16(bytes, a + 4),
      type: readU16(bytes, a + 6),
      hideFlag: readU16(bytes, a + 8),
      script: readU16(bytes, a + 10),
      facing: s16(readU16(bytes, a + 12)),
      param: [readU16(bytes, a + 14), readU16(bytes, a + 16), readU16(bytes, a + 18)] as [number, number, number],
      xRange: s16(readU16(bytes, a + 20)),
      yRange: s16(readU16(bytes, a + 22)),
      x: readU16(bytes, a + 24),
      z: readU16(bytes, a + 26),
      y: s32(readU32(bytes, a + 28)),
    }));
    const warps = list(12, (a) => ({ x: readU16(bytes, a), z: readU16(bytes, a + 2), destMap: readU16(bytes, a + 4), destAnchor: readU16(bytes, a + 6), y: readU32(bytes, a + 8) }));
    const triggers = list(16, (a) => ({
      script: readU16(bytes, a),
      x: s16(readU16(bytes, a + 2)),
      z: s16(readU16(bytes, a + 4)),
      w: readU16(bytes, a + 6),
      h: readU16(bytes, a + 8),
      y: readU16(bytes, a + 10),
      value: readU16(bytes, a + 12),
      variable: readU16(bytes, a + 14),
    }));
    if (o !== bytes.length) throw new RangeError(`${bytes.length - o} bytes left after the four lists`);
    return { objects, warps, triggers, signs };
  } catch (error) {
    throw new Error(`${name}: ${(error as Error).message}`, { cause: error });
  }
}

export interface RawLevelScripts {
  onTransition: number | null;
  onResume: number | null;
  onLoad: number | null;
  frames: { variable: number; value: number; script: number }[];
}

/** Level script records: u8 type, then a u16 script id (types 2 to 4) or a u32 frame table offset (type 1); 0 ends. */
export function readLevelScripts(bytes: Uint8Array, name: string): RawLevelScripts {
  const result: RawLevelScripts = { onTransition: null, onResume: null, onLoad: null, frames: [] };
  try {
    for (let o = 0; ; o += 5) {
      const type = bytes[o];
      if (type === undefined) throw new RangeError(`record list ends at offset 0x${o.toString(16)} without a 0 byte`);
      if (type === 0) return result;
      if (type === LEVEL_SCRIPT.frameTable) {
        for (let row = o + 5 + readU32(bytes, o + 1); ; row += 6) {
          const variable = readU16(bytes, row);
          if (variable === 0) break;
          result.frames.push({ variable, value: readU16(bytes, row + 2), script: readU16(bytes, row + 4) });
        }
      } else if (type === LEVEL_SCRIPT.onTransition) result.onTransition = readU16(bytes, o + 1);
      else if (type === LEVEL_SCRIPT.onResume) result.onResume = readU16(bytes, o + 1);
      else if (type === LEVEL_SCRIPT.onLoad) result.onLoad = readU16(bytes, o + 1);
      else throw new RangeError(`unknown record type ${type} at offset 0x${o.toString(16)}`);
    }
  } catch (error) {
    throw new Error(`${name}: ${(error as Error).message}`, { cause: error });
  }
}
