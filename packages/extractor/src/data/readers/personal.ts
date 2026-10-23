import { EGG_GROUP_KEYS, GROWTH_RATE_KEYS, type SpeciesRecord } from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";
import type { DataLayout } from "../layout.ts";

// Personal record, 44 bytes; see specs/004-game-data-extraction/research.md R3.

const RECORD_SIZE = 44;

function gender(raw: number): SpeciesRecord["gender"] {
  if (raw === 0) return { kind: "male-only", raw };
  if (raw === 254) return { kind: "female-only", raw };
  if (raw === 255) return { kind: "genderless", raw };
  return { kind: "mixed", raw };
}

/** Reads one personal record. `personalIndex` is the member number (1–493 species, 496–507 forms). */
export function readPersonal(bytes: Uint8Array, personalIndex: number, layout: DataLayout): SpeciesRecord {
  if (bytes.length < RECORD_SIZE) {
    throw new Error(`Registro personal ${personalIndex} com ${bytes.length} bytes (esperado ${RECORD_SIZE})`);
  }
  const at = (offset: number) => bytes[offset]!;

  const eggGroup = (offset: number) => {
    const key = EGG_GROUP_KEYS[at(offset) - 1];
    if (key === undefined) throw new Error(`Grupo de ovo desconhecido (${at(offset)}) no registro ${personalIndex}`);
    return key;
  };
  const growthRate = GROWTH_RATE_KEYS[at(0x13)];
  if (growthRate === undefined) throw new Error(`Grupo de crescimento desconhecido (${at(0x13)}) no registro ${personalIndex}`);

  const evs = readU16(bytes, 0x0a);
  const ev = (stat: number) => (evs >> (2 * stat)) & 3;
  const form = layout.forms.find((f) => f.personalIndex === personalIndex);
  const species = form?.species ?? personalIndex;
  const item = (offset: number) => readU16(bytes, offset) || null;
  const firstEgg = eggGroup(0x14);
  const secondEgg = eggGroup(0x15);

  return {
    id: personalIndex,
    species,
    form: form?.form ?? 0,
    name: { catalog: "species-names", index: species },
    baseStats: {
      hp: at(0),
      attack: at(1),
      defense: at(2),
      speed: at(3),
      specialAttack: at(4),
      specialDefense: at(5),
    },
    types: at(6) === at(7) ? [at(6)] : [at(6), at(7)],
    abilities: at(0x17) === 0 ? [at(0x16)] : [at(0x16), at(0x17)],
    catchRate: at(8),
    baseExperience: at(9),
    evYield: {
      hp: ev(0),
      attack: ev(1),
      defense: ev(2),
      speed: ev(3),
      specialAttack: ev(4),
      specialDefense: ev(5),
    },
    gender: gender(at(0x10)),
    growthRate,
    eggGroups: firstEgg === secondEgg ? [firstEgg] : [firstEgg, secondEgg],
    heldItems: { common: item(0x0c), rare: item(0x0e) },
    hatchCycles: at(0x11),
    baseFriendship: at(0x12),
    safariFleeRate: at(0x18),
    color: { id: at(0x19) & 0x7f, flip: (at(0x19) & 0x80) !== 0 },
    forms: form ? [] : layout.forms.filter((f) => f.species === species).map((f) => f.personalIndex),
  };
}
