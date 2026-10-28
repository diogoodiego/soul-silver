// Readers of the trainer class tables and the trainer message table (spec 022, research R4/R10).
// Prize: sPrizeMoneyTbl in overlay 12, (class, base) u16 pairs. Music: in ARM9, a u16 list of
// class | (index << 10) and a list of (transition, sequence) u16 pairs the index points into; a class
// missing from the first list plays the trainer music. Messages: a/0/5/7 member 0, (trainer, kind)
// u16 pairs; pair i is text i of bank 728. Layout and names from pret/pokeheartgold.
import type { TrainerClassRecord, TrainerMessageRecord, TrainerMusic } from "@soulsilver/shared/events";
import { formatTextId } from "@soulsilver/shared/text";
import { readU16 } from "../binary.ts";
import { TRAINER_MESSAGE_BANK } from "./layout.ts";

/** Sequence ids (sndseq.h) of the battle music the class list points at. */
export const SEQ = { trainer: 1117, leader: 1118, rival: 1119, rocket: 1120, champion: 1124, leaderKanto: 1127 } as const;

const MUSIC: ReadonlyMap<number, TrainerMusic> = new Map([
  [SEQ.trainer, "trainer"],
  [SEQ.leader, "leader"],
  [SEQ.leaderKanto, "leader"],
  [SEQ.rival, "rival"],
  [SEQ.rocket, "rocket"],
  [SEQ.champion, "champion"],
]);

export interface TrainerClassTables {
  /** sPrizeMoneyTbl: `classes` pairs. */
  prize: Uint8Array;
  /** The class list, up to the music list that follows it. */
  musicClasses: Uint8Array;
  musicList: Uint8Array;
  classes: number;
}

export function readTrainerClasses(t: TrainerClassTables): TrainerClassRecord[] {
  const prize = new Map<number, number>();
  for (let i = 0; i < t.classes; i++) prize.set(readU16(t.prize, i * 4), readU16(t.prize, i * 4 + 2));
  const music = new Map<number, TrainerMusic>();
  for (let i = 0; i * 2 < t.musicClasses.length; i++) {
    const v = readU16(t.musicClasses, i * 2);
    const seq = readU16(t.musicList, (v >> 10) * 4 + 2);
    // Sequences outside the list (legendaries, the Battle Frontier) are not trainer classes of this spec.
    music.set(v & 0x3ff, MUSIC.get(seq) ?? "trainer");
  }
  return Array.from({ length: t.classes }, (_, id) => {
    const prizeBase = prize.get(id);
    if (prizeBase === undefined) throw new Error(`tabela de prêmio sem a classe ${id}`);
    return { id, prizeBase, music: music.get(id) ?? "trainer" };
  });
}

export function readTrainerMessages(table: Uint8Array): TrainerMessageRecord[] {
  if (table.length % 4 !== 0) throw new Error(`tabela de falas com ${table.length} bytes, não múltiplo de 4`);
  return Array.from({ length: table.length / 4 }, (_, i) => ({ trainer: readU16(table, i * 4), kind: readU16(table, i * 4 + 2), text: formatTextId(TRAINER_MESSAGE_BANK, i) }));
}
