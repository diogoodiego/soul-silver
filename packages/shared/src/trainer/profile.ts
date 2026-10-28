import type { AiFlagsTable, ClassProfiles, ProfilePatch, TrainerProfile } from "./schemas.ts";

// The trainer's AI profile (spec 022, research R5): the class entry over the default, then each set
// flag bit from the lowest to the highest, so a higher bit wins where two disagree.

/** `base` with the fields `patch` sets. */
const over = <T extends object>(base: T, patch: { [K in keyof T]?: T[K] | undefined } | undefined): T => ({ ...base, ...Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined)) });

function apply(p: TrainerProfile, patch: ProfilePatch | undefined): TrainerProfile {
  if (!patch) return p;
  return { combat: patch.combat ?? p.combat, switch: over(p.switch, patch.switch), item: over(p.item, patch.item) };
}

export function trainerProfile(trainer: { classId: number; aiFlags: number }, flags: AiFlagsTable, classes: ClassProfiles): TrainerProfile {
  let p = apply(classes.default, classes.classes[String(trainer.classId)]);
  for (let bit = 0; bit < 32; bit++) if ((trainer.aiFlags >>> bit) & 1) p = apply(p, flags.bits[String(bit)]);
  return p;
}
