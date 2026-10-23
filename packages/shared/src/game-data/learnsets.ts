import { z } from "zod";
import { fileSchema, id, int } from "./common.ts";

// learnsets.json, machines.json, tutors.json; see data-model.md and research R5.

export const learnsetRecord = z.strictObject({
  /** Same id as the species or form record. */
  id: id(),
  /** (level, move) pairs in the original order. The level is a 7-bit field; the report flags 0 or above 100. */
  levelUp: z.array(z.strictObject({ level: int(0, 127), move: id() })),
  /** Ids of compatible machines, increasing. */
  machines: z.array(id()),
  /** Egg moves; empty for forms and for species without any. */
  egg: z.array(id()),
  /** Ids of compatible tutors, increasing. */
  tutors: z.array(id()),
});
export const learnsetsFile = fileSchema("learnsets", learnsetRecord);
export type LearnsetRecord = z.infer<typeof learnsetRecord>;

export const machineRecord = z
  .strictObject({
    /** 1–92 are TM01–TM92, 93–100 are HM01–HM08. */
    id: int(1, 100),
    kind: z.enum(["tm", "hm"]),
    number: int(1, 92),
    move: id(),
  })
  .superRefine((machine, ctx) => {
    if (machine.kind === "hm" && machine.number > 8) {
      ctx.addIssue({ code: "custom", path: ["number"], message: "esperado número de HM entre 1 e 8" });
    }
  });
export const machinesFile = fileSchema("machines", machineRecord);
export type MachineRecord = z.infer<typeof machineRecord>;

export const tutorRecord = z.strictObject({
  /** Position in the game's list; also the bit in the compatibility table. */
  id: int(0, 255),
  move: id(),
  /** Battle Points; 0 is free. */
  cost: int(0, 255),
  /** Original place/tutor identifier. */
  area: int(0, 255),
});
export const tutorsFile = fileSchema("tutors", tutorRecord);
export type TutorRecord = z.infer<typeof tutorRecord>;
