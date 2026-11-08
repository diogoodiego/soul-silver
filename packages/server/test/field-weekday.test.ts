import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 026, US2 and layer 2: a person shown on one weekday only, the way the original does it. The
// map's transition script reads the session clock and sets the person's hide flag (Route 29's
// Tuscany, scr_seq_0225_R29.s). The clock is the session's; the flag is each player's.

const HIDE = 207;
const level = scriptFile(100, [
  "L1:",
  ["GetWeekday", { arg0: 0x4000 }],
  ["CompareVarToValue", { var: { variable: 0x4000 }, val: 2 }],
  ["GoToIf", { condition: 5, dest: { label: "L3" } }],
  ["ClearFlag", { flag: { flag: HIDE } }],
  ["End"],
  "L2:",
  ["NPCMsg", { msg_id: { text: "0007:1" } }],
  ["End"],
  "L3:",
  ["SetFlag", { flag: { flag: HIDE } }],
  ["End"],
]);
const data = () => scriptData([level], { 60: mapEvents({ npcs: [npc(0, 1, 2, 1, HIDE)], levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] } }) });
// 2026-11-01 is a Sunday.
const day = (weekday: number) => new Date(2026, 10, 1 + weekday, 12);

function game(weekday: number) {
  let now = day(weekday);
  const t = story(data(), { now: () => now });
  const shown = (c: ReturnType<typeof t.connect>) => {
    const seen = new Set<number>();
    for (const s of c.states()) {
      for (const e of s.spawned) if (e.kind === "npc") seen.add(e.id);
      for (const id of s.removed) seen.delete(id);
    }
    return seen.size;
  };
  return { t, shown, setDay: (d: number) => (now = day(d)) };
}

describe("a weekday event (spec 026, US2)", () => {
  it("shows the person on Tuesday and runs their script, for both players", () => {
    const g = game(2);
    const a = g.t.connect("A");
    const b = g.t.connect("B");
    g.t.step(2);
    expect([g.shown(a), g.shown(b)]).toEqual([1, 1]);
    g.t.press(a);
    expect(g.t.of(a, "script")).toHaveLength(1);
  });

  it.each([0, 1, 3, 4, 5, 6])("hides the person on weekday %i", (weekday) => {
    const g = game(weekday);
    const a = g.t.connect("A");
    const b = g.t.connect("B");
    g.t.step(2);
    expect([g.shown(a), g.shown(b)]).toEqual([0, 0]);
    g.t.press(a);
    expect(g.t.of(a, "script")).toHaveLength(0);
  });

  it("checks the day again on entering the map, not while the player stays", () => {
    const g = game(2);
    const a = g.t.connect("A");
    g.t.step(2);
    g.setDay(3);
    g.t.step(20);
    // Still Tuesday's map for A, who has not left it (the original reads the clock on map load).
    expect(g.shown(a)).toBe(1);
    // B enters on Wednesday: B's own flag hides the person for B, and A's view does not change.
    const b = g.t.connect("B");
    g.t.step(2);
    expect([g.shown(a), g.shown(b)]).toEqual([1, 0]);
    // A enters again from a save made on Tuesday: the transition script runs with Wednesday.
    g.t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).not.toContain(HIDE);
    const h = game(3);
    const again = h.t.connect("A", undefined, { save });
    h.t.step(2);
    expect(h.shown(again)).toBe(0);
  });
});
