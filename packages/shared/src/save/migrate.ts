import type { z } from "zod";
import { newBoxes, newCollection, newItemState, newPhone, SAVE_SCHEMA_VERSION, saveSchema, trainerIdFor, type PartyMember, type Save } from "./schema.ts";

export type SaveFailureCode = "invalid" | "save-too-new";
export type MigrateResult<T = Save> = { ok: true; save: T } | { ok: false; code: SaveFailureCode; message: string };

type Step = (save: Record<string, unknown>) => Record<string, unknown>;

/** Steps from version n to n + 1; every new entry needs a test. */
export const SAVE_MIGRATIONS: Record<number, Step> = {
  // Spec 014: party, money, badges and the blackout respawn point.
  1: (save) => ({ ...save, party: [], money: 3000, badges: 0, respawn: null, schemaVersion: 2 }),
  // Spec 015: bag, Pokédex (the party counts as seen and caught) and temporary storage.
  2: (save) => {
    const species = [...new Set((save["party"] as { species: number }[]).map((m) => m.species))];
    return { ...save, ...newCollection(), storage: [], pokedex: { seen: species, caught: [...species] }, schemaVersion: 3 };
  },
  // Spec 016: IV 31, no EVs and Hardy keep today's stats; medium-fast experience, raised to the real curve on join.
  3: (save) => {
    const upgrade = (m: { level: number }) => ({ ...m, experience: m.level === 1 ? 0 : m.level ** 3, ivs: stats(31), evs: stats(0), nature: 0 });
    return { ...save, party: (save["party"] as { level: number }[]).map(upgrade), storage: (save["storage"] as { level: number }[]).map(upgrade), pending: [], schemaVersion: 4 };
  },
  // Spec 020: no story flags or variables yet.
  4: (save) => ({ ...save, flags: [], vars: {}, schemaVersion: 5 }),
  // Spec 021: no NPC has been moved by an event yet.
  5: (save) => ({ ...save, npcPlacement: {}, schemaVersion: 6 }),
  // Spec 023: the temporary storage (at most 30) fills box 1 in order; the PC item storage starts empty.
  6: ({ storage, ...save }) => {
    const boxes = newBoxes();
    (storage as PartyMember[]).forEach((m, i) => (boxes[0]!.slots[i] = m));
    return { ...save, boxes, pcItems: [], schemaVersion: 7 };
  },
  // Spec 024: no rival name yet; the story state predates the original new-game state.
  7: (save) => ({ ...save, rivalName: "", storyRev: 0, schemaVersion: 8 }),
  // Spec 025: the badge count becomes the set of badges (the first N, the order Johto is earned in); no fly point visited yet.
  8: ({ badges, ...save }) => ({ ...save, badgeSet: (1 << (badges as number)) - 1, flyPoints: [], schemaVersion: 9 }),
  // Spec 026: no number registered yet; the story registers them again as the player goes on.
  9: (save) => ({ ...save, phone: newPhone(), schemaVersion: 10 }),
  // Spec 027: an empty Apricorn Box and Berry Pots; members hold nothing and have no PP Ups (both optional).
  10: (save) => ({ ...save, ...newItemState(), schemaVersion: 11 }),
  // Spec 029: nobody has left a Pokémon at the Day Care yet.
  11: (save) => ({ ...save, daycare: [], schemaVersion: 12 }),
  // Spec 029: no egg waiting; genders are rolled by the server on join, which has the species' ratios.
  12: (save) => ({ ...save, daycareEgg: false, schemaVersion: 13 }),
  13: (save) => ({ ...save, eggWalk: 0, schemaVersion: 14 }),
  // Spec 030.2: an empty photo album; members carry no ribbons until given one.
  14: (save) => ({ ...save, photos: [], schemaVersion: 15 }),
  // Item 030.10: no member came from an in-game trade yet (both fields optional).
  15: (save) => ({ ...save, schemaVersion: 16 }),
  // Item 031.2: nothing roams yet (roamers is optional).
  16: (save) => ({ ...save, schemaVersion: 17 }),
  // Item 031.7: the Seal Case is empty (seals is optional).
  17: (save) => ({ ...save, schemaVersion: 18 }),
  // Item 034.4: nobody is in the Hall of Fame yet (hallOfFame is optional).
  18: (save) => ({ ...save, schemaVersion: 19 }),
  // Block H: an ID for the trainer card; when an old game began is unknown (startedAt is optional).
  19: (save) => ({ ...save, trainerId: trainerIdFor(String(save["name"]), String(save["savedAt"])), schemaVersion: 20 }),
};

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });

export interface MigrateOptions {
  current: number;
  migrations: Record<number, Step>;
  schema: z.ZodType;
}

function invalid(message: string): MigrateResult<never> {
  return { ok: false, code: "invalid", message: `Save inválido: ${message}` };
}

/** Brings any stored save to the current version and validates it. */
export function migrate(raw: unknown): MigrateResult;
export function migrate(raw: unknown, options: MigrateOptions): MigrateResult<unknown>;
export function migrate(raw: unknown, options?: MigrateOptions): MigrateResult<unknown> {
  const current = options?.current ?? SAVE_SCHEMA_VERSION;
  const migrations = options?.migrations ?? SAVE_MIGRATIONS;
  const schema = options?.schema ?? saveSchema;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid("o save não é um objeto");
  let save = raw as Record<string, unknown>;
  const found = save["schemaVersion"];
  if (typeof found !== "number" || !Number.isInteger(found) || found < 1) return invalid("schemaVersion ausente ou inválido");
  if (found > current) {
    return { ok: false, code: "save-too-new", message: `Save da versão ${found}; este app entende até a ${current}. Atualize o jogo.` };
  }
  for (let version = found; version < current; version++) {
    const step = migrations[version];
    if (!step) return invalid(`falta a migração da versão ${version} para ${version + 1}`);
    save = step(save);
  }
  const parsed = schema.safeParse(save);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalid(`${issue?.path.join(".") || "save"}: ${issue?.message ?? "inválido"}`);
  }
  return { ok: true, save: parsed.data };
}
