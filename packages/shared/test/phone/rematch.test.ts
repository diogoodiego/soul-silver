import { describe, expect, it } from "vitest";
import { rematchTrainer, REMATCH_GROUP_FLAG } from "../../src/phone/rematch.ts";

// Spec 026, research R7.4 (overlay_26_022598C0.c, TryGetRematchTrainerIdByBaseTrainerId): the first step of the
// row not beaten yet, held back to the last step before it while its group's flag (FLAG_UNK_97B + step) is off.

const JOEY = { base: 8, sequence: [8, 279, 280, 510, 0] as [number, number, number, number, number] };
const SETS = [JOEY, { base: 414, sequence: [414, 303, 446, 602, 0] as [number, number, number, number, number] }, { base: 7, sequence: [7, 0xffff, 9, 0, 0] as [number, number, number, number, number] }];
const pick = (base: number, beaten: number[], groups: number[]) => rematchTrainer(SETS, base, (t) => beaten.includes(t), (n) => groups.includes(n));

describe("rematchTrainer", () => {
  it("is 0 for a trainer with no rematch row", () => {
    expect(pick(99, [], [])).toBe(0);
  });

  it("fights the first unbeaten step when its group is open", () => {
    expect(pick(8, [8], [2])).toBe(279);
    expect(pick(8, [8, 279], [2, 3])).toBe(280);
    expect(pick(8, [8, 279, 280, 510], [2, 3, 4])).toBe(510);
  });

  it("holds back to the step before while the group's flag is off", () => {
    expect(pick(8, [8], [])).toBe(8);
    expect(pick(8, [8, 279], [2])).toBe(279);
  });

  it("skips a 0xFFFF step and starts from the first column when nothing was beaten", () => {
    expect(pick(7, [7], [3])).toBe(9);
    expect(pick(7, [7], [])).toBe(7);
    expect(pick(8, [], [])).toBe(8);
  });

  it("reads the group flags from FLAG_UNK_97B", () => {
    expect(REMATCH_GROUP_FLAG(2)).toBe(0x97d);
  });
});
