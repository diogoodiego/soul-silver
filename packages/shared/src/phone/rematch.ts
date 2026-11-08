import { REMATCH_NONE, REMATCH_SKIP, type PhoneBook } from "./schemas.ts";

// Which team a rematch fights (spec 026, research R7.4), after overlay_26_022598C0.c:
// TryGetRematchTrainerIdByBaseTrainerId and the three helpers it calls.

/** EventFlagCheck_RematchGroup: the story opens rematch step `n` with FLAG_UNK_97B + n. */
export const REMATCH_GROUP_FLAG = (n: number) => 0x97b + n;

/** The trainer id of the rematch with `base`; 0 when it has no rematch row. */
export function rematchTrainer(sets: PhoneBook["rematchSets"], base: number, beaten: (trainer: number) => boolean, groupOpen: (n: number) => boolean): number {
  const set = sets.find((s) => s.base === base);
  if (!set) return 0;
  const row = [set.base, ...set.sequence];
  // GetIndexOfFirstUnbeatenRematch
  let step = 5;
  for (let i = 1; i < 6; i++) {
    const t = row[i]!;
    if (t === REMATCH_NONE) {
      step = i - 1;
      break;
    }
    if (t !== REMATCH_SKIP && !beaten(t)) {
      step = i;
      break;
    }
  }
  // CheckUnlockedRematchGroup, GetPreviousRematchIndexForTrainer
  if (step !== 0 && !groupOpen(step)) {
    let back = 0;
    for (let i = step - 1; i > 0; i--) {
      if (row[i] !== REMATCH_SKIP) {
        back = i;
        break;
      }
    }
    step = back;
  }
  return row[step]!;
}
