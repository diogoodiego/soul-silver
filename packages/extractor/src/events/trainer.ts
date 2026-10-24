// Reader of one trainer: the 20-byte data record and the team file (trainer_data.h).
// See specs/008-events-scripts-encounters/research.md R0 and data-model.md.
import type { TrainerRecord } from "@soulsilver/shared/events";
import { formatTextId } from "@soulsilver/shared/text";
import { readU16, readU32 } from "../binary.ts";
import { TRAINER_CLASS_BANK, TRAINER_NAME_BANK } from "./layout.ts";

const DATA_SIZE = 20;
const WITH_MOVES = 1;
const WITH_ITEM = 2;

/** The trainer, or null for the empty placeholder (no Pokémon) that fills slot 0. */
export function readTrainer(data: Uint8Array, team: Uint8Array, id: number): TrainerRecord | null {
  if (data.length !== DATA_SIZE) throw new Error(`trainer ${id}: data has ${data.length} bytes, expected ${DATA_SIZE}`);
  const type = data[0]!;
  if (type > WITH_MOVES + WITH_ITEM) throw new Error(`trainer ${id}: unknown type ${type}`);
  const count = data[3]!;
  if (count === 0) return null;

  const size = 8 + (type & WITH_ITEM ? 2 : 0) + (type & WITH_MOVES ? 8 : 0);
  const expected = count * size;
  // The archive pads each member up to a multiple of four bytes.
  if (team.length < expected || team.length > ((expected + 3) & ~3)) throw new Error(`trainer ${id}: team has ${team.length} bytes, expected ${expected} (${count} x ${size})`);

  return {
    id,
    class: { id: data[1]!, text: formatTextId(TRAINER_CLASS_BANK, data[1]!) },
    name: formatTextId(TRAINER_NAME_BANK, id),
    items: [0, 1, 2, 3].map((i) => readU16(data, 4 + i * 2)).filter((item) => item !== 0),
    aiFlags: readU32(data, 12),
    doubleBattle: readU32(data, 16) !== 0,
    team: Array.from({ length: count }, (_, i) => {
      const o = i * size;
      const species = readU16(team, o + 4);
      const item = type & WITH_ITEM ? readU16(team, o + 6) : 0;
      const movesAt = o + 6 + (type & WITH_ITEM ? 2 : 0);
      return {
        difficulty: team[o]!,
        genderOverride: team[o + 1]! & 0x0f,
        abilityOverride: team[o + 1]! >> 4,
        level: readU16(team, o + 2),
        species: species & 0x3ff,
        form: species >> 10,
        item: item === 0 ? null : item,
        moves: type & WITH_MOVES ? [0, 1, 2, 3].map((m) => readU16(team, movesAt + m * 2)) : null,
        capsule: readU16(team, o + size - 2),
      };
    }),
  };
}
