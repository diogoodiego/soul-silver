import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 025: hasBadge and giveBadge work on the set of badges, not on a count.

const v = (id: number) => ({ variable: id });
const script = scriptFile(100, [
  "L1:",
  ["CheckBadge", { badge: 3, var: v(0x4001) }],
  ["GiveBadge", { badge: 3 }],
  ["CheckBadge", { badge: 3, var: v(0x4002) }],
  ["CheckBadge", { badge: 0, var: v(0x4003) }],
  ["End"],
]);

function talk(badgeSet: number) {
  const t = story(scriptData([script], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
  const a = t.connect(undefined, undefined, { save: { badgeSet } });
  t.step();
  t.press(a);
  t.session.close("closed-by-host");
  return a.saves().at(-1)!.save;
}

describe("badge set", () => {
  it("giving badge 3 sets only that bit, and checking reads that bit", () => {
    const save = talk(0);
    expect(save.badgeSet).toBe(0b1000);
    expect(save.vars).toEqual({ "16386": 1 }); // an absent variable holds 0
  });

  it("a count would say yes to badge 0 here; the set says no", () => {
    expect(talk(0b1000).vars).toEqual({ "16385": 1, "16386": 1 });
  });

  it("keeps the badges already earned", () => {
    expect(talk(0b0101).badgeSet).toBe(0b1101);
  });
});
