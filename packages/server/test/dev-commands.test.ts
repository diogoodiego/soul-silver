import { describe, expect, it } from "vitest";
import { scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 025: the development commands that set up a field-move scene. Same gate as debugWarp: a
// development build with the script debugger on; anything else changes nothing and is logged.

const data = () => scriptData([scriptFile(100, ["L1:", ["End"]])], {});
const mon = { species: 25, level: 5, moves: [84], hp: 20, friendship: 70, experience: 125, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };

type Run = (c: ReturnType<ReturnType<typeof story>["connect"]>) => void;

function result(setup: "dev" | "no-debugger" | "release", send: Run) {
  const t = story(data(), setup === "release" ? {} : { devTools: true });
  const c = t.connect(undefined, undefined, { save: { party: [structuredClone(mon)], badgeSet: 0b1, bag: [{ item: 4, count: 2 }] } });
  if (setup !== "no-debugger") c.conn.send({ type: "debugScript", on: true });
  send(c);
  t.step();
  t.session.close("closed-by-host");
  return { save: c.saves().at(-1)!.save, logs: t.logs };
}

describe("development commands (spec 025)", () => {
  it("debugGiveBadge sets only that badge bit", () => {
    expect(result("dev", (c) => c.conn.send({ type: "debugGiveBadge", badge: 3 })).save.badgeSet).toBe(0b1001);
  });

  it("debugTeachMove puts the move in the member's slot and keeps the rest", () => {
    const { save } = result("dev", (c) => c.conn.send({ type: "debugTeachMove", slot: 0, move: 15 }));
    expect(save.party[0]!.moves).toEqual([84, 15]);
  });

  it("debugTeachMove replaces the last move when the member knows four", () => {
    const t = story(data(), { devTools: true });
    const c = t.connect(undefined, undefined, { save: { party: [{ ...structuredClone(mon), moves: [1, 2, 3, 4] }] } });
    c.conn.send({ type: "debugScript", on: true });
    c.conn.send({ type: "debugTeachMove", slot: 0, move: 15 });
    t.step();
    t.session.close("closed-by-host");
    expect(c.saves().at(-1)!.save.party[0]!.moves).toEqual([1, 2, 3, 15]);
  });

  it("debugTeachMove into an empty slot changes nothing", () => {
    expect(result("dev", (c) => c.conn.send({ type: "debugTeachMove", slot: 3, move: 15 })).save.party[0]!.moves).toEqual([84]);
  });

  it("debugGiveItem adds to a row or opens one", () => {
    const first = result("dev", (c) => c.conn.send({ type: "debugGiveItem", item: 4, count: 5 })).save.bag;
    expect(first).toEqual([{ item: 4, count: 7 }]);
    const second = result("dev", (c) => c.conn.send({ type: "debugGiveItem", item: 78, count: 1 })).save.bag;
    expect(second).toEqual([{ item: 4, count: 2 }, { item: 78, count: 1 }]);
  });

  it.each([
    ["with the debugger off", "no-debugger"],
    ["in a release build", "release"],
  ] as const)("refuses all three %s, changes nothing and logs it", (_, setup) => {
    for (const msg of [
      { type: "debugGiveBadge", badge: 3 },
      { type: "debugTeachMove", slot: 0, move: 15 },
      { type: "debugGiveItem", item: 78, count: 1 },
    ] as const) {
      const { save, logs } = result(setup, (c) => c.conn.send(msg));
      expect(save.badgeSet).toBe(0b1);
      expect(save.party[0]!.moves).toEqual([84]);
      expect(save.bag).toEqual([{ item: 4, count: 2 }]);
      expect(logs.some((l) => l.includes(`Refused ${msg.type}`))).toBe(true);
    }
  });
});
