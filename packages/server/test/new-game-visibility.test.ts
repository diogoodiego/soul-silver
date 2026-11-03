import { findDuplicates } from "@soulsilver/shared/game";
import { applyNewGame, migrate } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 US3: after a new game, each character shows once. The objects follow New Bark Town and the
// player's house in the original: the friend (hide flags 418, 744), the Marill (417, 744) and Mom (678).

const INIT = 9600;
const object = (id: number, sprite: number, entry: number | null, hideFlag: number) => ({ ...npc(id, id, 2, entry, hideFlag), sprite });
const newBark = mapEvents({ npcs: [object(3, 1032, 5, 417), object(4, 101, 4, 418), object(7, 365, null, 678), object(8, 101, 4, 744), object(9, 1032, 5, 744)] });
const house = mapEvents({ map: 63, npcs: [object(0, 365, 1, 0)] });
const init = scriptFile(149, ["L1:", ["SetFlag", { flag: { flag: 418 } }], ["SetFlag", { flag: { flag: 678 } }], ["SetFlag", { flag: { flag: 744 } }], ["End"]]);
const start = { map: 64, tx: 1, ty: 1, facing: "south" as const };
const data = () => ({ ...scriptData([init], { 60: newBark, 63: house }, { [INIT]: { file: 149, entry: 0 } }), newGame: { ...start, initScript: INIT } });

function newGame(area: string) {
  const base = migrate({ schemaVersion: 1, name: "A", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-10-28T12:00:00.000Z", rev: 0 });
  if (!base.ok) throw new Error(base.message);
  return { ...applyNewGame(base.save, start), area };
}

type Test = ReturnType<typeof story>;
const shown = (t: Test, c: ReturnType<Test["connect"]>) => {
  const seen = new Set<number>();
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc") seen.add(e.id);
    for (const id of s.removed) seen.delete(id);
  }
  return [...seen].map((id) => t.entity(id)?.data["person"] as number).sort((a, b) => a - b);
};
const duplicates = (events: typeof newBark, people: number[]) => findDuplicates(events.npcs, (o) => people.includes(o.id)).map((g) => g.map((o) => o.id));

describe("characters after a new game", () => {
  it("shows each character once in New Bark Town", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: newGame("60") });
    t.step(2);
    expect(shown(t, a)).toEqual([3]);
    expect(duplicates(newBark, shown(t, a))).toEqual([]);
  });

  it("shows Mom once in the house", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: newGame("63") });
    t.step(2);
    expect(shown(t, a)).toEqual([0]);
    expect(duplicates(house, shown(t, a))).toEqual([]);
  });

  it("follows each player's own flags on a shared map", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: newGame("60") });
    const b = t.connect("B", undefined, { save: { rev: 3, playTimeMs: 60_000, area: "60", x: at(1), y: at(1) } });
    t.step(2);
    expect(duplicates(newBark, shown(t, a))).toEqual([]);
    expect(duplicates(newBark, shown(t, b))).toEqual([[3, 9], [4, 8]]);
  });
});
