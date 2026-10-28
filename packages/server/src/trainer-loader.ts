import type { TrainerClassRecord, TrainerMessageRecord, TrainerRecord } from "@soulsilver/shared/events";
import type { LearnsetRecord } from "@soulsilver/shared/game-data";
import { parseTrainerFile, type AiFlagsTable, type ClassProfiles, type TrainerFileKind, type TrainerTuning } from "@soulsilver/shared/trainer";
import aiFlagsJson from "../../../content/trainer/ai-flags.json" with { type: "json" };
import classProfilesJson from "../../../content/trainer/class-profiles.json" with { type: "json" };
import tuningJson from "../../../content/trainer/tuning.json" with { type: "json" };

// Trainer battle data (spec 022): the extracted trainers, classes and lines, and content/trainer. Any
// problem stops the load with file, field and reason.

export type TrainerContent = Record<TrainerFileKind, unknown>;

export interface ExtractedForTrainers {
  trainers: TrainerRecord[];
  /** Prize and music per class; a class missing here pays nothing and plays the trainer music. */
  classes: TrainerClassRecord[];
  messages: TrainerMessageRecord[];
  /** Default moves for team members the original gives none. */
  learnsets: Pick<LearnsetRecord, "id" | "levelUp">[];
}

/** A trainer's lines as text ids (bank 728); undefined when the original has none. */
export interface TrainerLines {
  intro: string | undefined;
  defeat: string | undefined;
  after: string | undefined;
}

export interface TrainerData {
  trainer(id: number): TrainerRecord | undefined;
  trainerClass(id: number): TrainerClassRecord | undefined;
  lines(trainer: number): TrainerLines;
  levelUp(species: number): LearnsetRecord["levelUp"];
  aiFlags: AiFlagsTable;
  classes: ClassProfiles;
  tuning: TrainerTuning;
}

/** Message kinds (trainer_message.h): a single trainer's, then the first trainer's of a double. */
const KINDS = { intro: [0, 3], defeat: [1, 4], after: [2, 5] } as const;

const FILES: Record<TrainerFileKind, string> = { aiFlags: "ai-flags.json", classProfiles: "class-profiles.json", tuning: "tuning.json" };

function parse(kind: TrainerFileKind, value: unknown): unknown {
  const result = parseTrainerFile(kind, value, FILES[kind]);
  if (!result.ok) throw new Error(`content/trainer/${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

/** `profileIds`: the combat AI profiles (content/ai/profiles.json) a trainer profile may name. */
export function buildTrainerData(extracted: ExtractedForTrainers, profileIds: readonly string[], content: TrainerContent = BUNDLED_TRAINER_CONTENT): TrainerData {
  const aiFlags = parse("aiFlags", content.aiFlags) as AiFlagsTable;
  const classes = parse("classProfiles", content.classProfiles) as ClassProfiles;
  const check = (file: string, path: string, id: string | undefined) => {
    if (id !== undefined && !profileIds.includes(id)) throw new Error(`content/trainer/${file}: ${path}.combat: perfil ${id} não existe em content/ai/profiles.json`);
  };
  check("class-profiles.json", "value.default", classes.default.combat);
  for (const [k, p] of Object.entries(classes.classes)) check("class-profiles.json", `value.classes.${k}`, p.combat);
  for (const [k, p] of Object.entries(aiFlags.bits)) check("ai-flags.json", `value.bits.${k}`, p.combat);
  const trainers = new Map(extracted.trainers.map((t) => [t.id, t]));
  const classInfo = new Map(extracted.classes.map((c) => [c.id, c]));
  const learnsets = new Map(extracted.learnsets.map((l) => [l.id, l.levelUp]));
  const messages = new Map<number, Map<number, string>>();
  for (const m of extracted.messages) {
    const of = messages.get(m.trainer) ?? new Map<number, string>();
    if (!of.has(m.kind)) of.set(m.kind, m.text);
    messages.set(m.trainer, of);
  }
  const line = (trainer: number, kinds: readonly number[]) => kinds.map((k) => messages.get(trainer)?.get(k)).find((t) => t !== undefined);
  return {
    trainer: (id) => trainers.get(id),
    trainerClass: (id) => classInfo.get(id),
    lines: (t) => ({ intro: line(t, KINDS.intro), defeat: line(t, KINDS.defeat), after: line(t, KINDS.after) }),
    levelUp: (species) => learnsets.get(species) ?? [],
    aiFlags,
    classes,
    tuning: parse("tuning", content.tuning) as TrainerTuning,
  };
}

/** content/trainer as bundled with the app. */
export const BUNDLED_TRAINER_CONTENT: TrainerContent = { aiFlags: aiFlagsJson, classProfiles: classProfilesJson, tuning: tuningJson };
