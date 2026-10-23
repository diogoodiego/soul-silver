import { MOVE_CATEGORY_KEYS, type MoveRecord, type MoveTargetKey } from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";

// Move record, 16 bytes; see specs/004-game-data-extraction/research.md R4 and R11.

const RECORD_SIZE = 16;

const TARGETS: ReadonlyMap<number, MoveTargetKey> = new Map([
  [0, "selected"],
  [1, "depends"],
  [2, "random"],
  [4, "both-foes"],
  [8, "all-others"],
  [16, "user"],
  [32, "user-side"],
  [64, "field"],
  [128, "foe-side"],
  [256, "ally"],
  [512, "user-or-ally"],
  [1024, "foe"],
]);

export function readMove(bytes: Uint8Array, id: number): MoveRecord {
  if (bytes.length < RECORD_SIZE) throw new Error(`Registro de golpe ${id} com ${bytes.length} bytes (esperado ${RECORD_SIZE})`);
  const at = (offset: number) => bytes[offset]!;

  const category = MOVE_CATEGORY_KEYS[at(2)];
  if (category === undefined) throw new Error(`Categoria de golpe desconhecida (${at(2)}) no golpe ${id}`);

  const targetRaw = readU16(bytes, 8);
  const flagsRaw = at(0x0b);
  const flag = (bit: number) => (flagsRaw & (1 << bit)) !== 0;

  return {
    id,
    name: { catalog: "move-names", index: id },
    type: at(4),
    category,
    power: at(3),
    accuracy: at(5) === 0 ? null : at(5),
    pp: at(6),
    priority: (at(0x0a) << 24) >> 24,
    target: TARGETS.get(targetRaw) ?? "unknown",
    targetRaw,
    flags: {
      contact: flag(0),
      protect: flag(1),
      magicCoat: flag(2),
      snatch: flag(3),
      mirrorMove: flag(4),
      kingsRock: flag(5),
      keepHpBar: flag(6),
      hideShadow: flag(7),
    },
    flagsRaw,
    effect: { id: readU16(bytes, 0), chance: at(7) },
    contest: { effect: at(0x0c), type: at(0x0d) },
  };
}
