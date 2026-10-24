// Readers of the wild encounter records (0xC4 bytes, wild_encounter.h) and of the headbutt tables.
// See specs/008-events-scripts-encounters/research.md R0 and data-model.md.
import type { EncounterRecord, EncounterSlot, HeadbuttRecord } from "@soulsilver/shared/events";
import { readU16 } from "../binary.ts";
import { SLOT_CHANCES } from "./layout.ts";

const RECORD_SIZE = 0xc4;
const HEADBUTT_HEADER = 76;
const TREE_GROUP = 24;

/** Species and form share a u16: the species in the low 10 bits, the form in the top 6. */
const splitSpecies = (raw: number) => ({ species: raw & 0x3ff, form: raw >> 10 });

function slot(raw: number, minLevel: number, maxLevel: number, chance: number): EncounterSlot {
  return { ...splitSpecies(raw), minLevel, maxLevel, chance };
}

/** `count` slots of (min level, max level, species) at `at`, or undefined when no slot has a species. */
function levelSlots(b: Uint8Array, at: number, chances: readonly number[]): EncounterSlot[] | undefined {
  const slots = chances.map((chance, i) => slot(readU16(b, at + i * 4 + 2), b[at + i * 4]!, b[at + i * 4 + 1]!, chance));
  return slots.some((s) => s.species !== 0) ? slots : undefined;
}

export function readEncounter(b: Uint8Array, id: number): EncounterRecord {
  if (b.length !== RECORD_SIZE) throw new Error(`encounter ${id}: has ${b.length} bytes, expected ${RECORD_SIZE}`);
  const grassFor = (at: number) => SLOT_CHANCES.land.map((chance, i) => slot(readU16(b, at + i * 2), b[8 + i]!, b[8 + i]!, chance));
  const morning = grassFor(0x14);
  const day = grassFor(0x2c);
  const night = grassFor(0x44);
  const sounds = { hoenn: [readU16(b, 0x5c), readU16(b, 0x5e)], sinnoh: [readU16(b, 0x60), readU16(b, 0x62)] };
  const swarm = { grass: readU16(b, 0xbc), surf: readU16(b, 0xbe), fish: readU16(b, 0xc2) };
  const nightFish = readU16(b, 0xc0);
  const surf = levelSlots(b, 0x64, SLOT_CHANCES.surf);
  const rockSmash = levelSlots(b, 0x78, SLOT_CHANCES.rockSmash);
  const oldRod = levelSlots(b, 0x80, SLOT_CHANCES.fishing);
  const goodRod = levelSlots(b, 0x94, SLOT_CHANCES.fishing);
  const superRod = levelSlots(b, 0xa8, SLOT_CHANCES.fishing);
  const any = (...lists: { species: number }[][]) => lists.some((list) => list.some((s) => s.species !== 0));
  return {
    id,
    rates: { walking: b[0]!, surfing: b[1]!, rockSmash: b[2]!, oldRod: b[3]!, goodRod: b[4]!, superRod: b[5]! },
    ...(any(morning, day, night) ? { grass: { morning, day, night } } : {}),
    ...(surf ? { surf } : {}),
    ...(rockSmash ? { rockSmash } : {}),
    ...(oldRod ? { oldRod } : {}),
    ...(goodRod ? { goodRod } : {}),
    ...(superRod ? { superRod } : {}),
    ...(Object.values(sounds).some((pair) => pair.some((v) => v !== 0)) ? { sounds } : {}),
    ...(Object.values(swarm).some((v) => v !== 0) ? { swarm } : {}),
    ...(nightFish !== 0 ? { nightFish } : {}),
  };
}

/** One headbutt member: tree counts, three tables of six slots, then six coordinate pairs per tree group. Null when the map has no trees. */
export function readHeadbutt(b: Uint8Array, mapId: number): HeadbuttRecord | null {
  if (b.length === 4) return null;
  const regular = readU16(b, 0);
  const secret = readU16(b, 2);
  const expected = HEADBUTT_HEADER + (regular + secret) * TREE_GROUP;
  if (regular + secret === 0 || b.length !== expected) throw new Error(`headbutt ${mapId}: has ${b.length} bytes, expected ${expected} for ${regular} regular and ${secret} secret tree groups`);
  const table = (at: number) => {
    const slots = SLOT_CHANCES.headbutt.map((chance, i) => slot(readU16(b, at + i * 4), b[at + i * 4 + 2]!, b[at + i * 4 + 3]!, chance));
    return slots.some((s) => s.species !== 0) ? slots : [];
  };
  const groups = (first: number, count: number) =>
    Array.from({ length: count }, (_, g) =>
      Array.from({ length: 6 }, (_, i): [number, number] => {
        const at = HEADBUTT_HEADER + (first + g) * TREE_GROUP + i * 4;
        return [(readU16(b, at) << 16) >> 16, (readU16(b, at + 2) << 16) >> 16];
      }).filter(([x, z]) => !(x === -1 && z === -1)),
    );
  return { id: mapId, common: table(4), rare: table(28), secret: table(52), regularTrees: groups(0, regular), secretTrees: groups(regular, secret) };
}
