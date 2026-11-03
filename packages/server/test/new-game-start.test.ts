import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 US1 (research R1): a just-created save runs the original's init script (_std_init) once,
// before its first map, as RunInitScript does: the later versions of the characters start hidden.

const INIT = 9600;
const init = scriptFile(149, ["L1:", ["SetFlag", { flag: { flag: 418 } }], ["LotoIDSet"], ["End"]]);
const data = () => {
  const d = scriptData([init], { 60: mapEvents({ npcs: [npc(0, 1, 2, null, 418), npc(1, 3, 2, null)] }) }, { [INIT]: { file: 149, entry: 0 } });
  return { ...d, newGame: { map: 60, tx: 1, ty: 1, facing: "south" as const, initScript: INIT } };
};
const npcs = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) => {
  const seen = new Set<number>();
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc") seen.add(e.id);
    for (const id of s.removed) seen.delete(id);
  }
  return [...seen].map((id) => t.entity(id)?.data["person"]);
};
const lastSave = (c: ReturnType<ReturnType<typeof story>["connect"]>) => {
  c.conn.send({ type: "leave" });
  return c.saves().at(-1)!.save;
};

describe("new game init script", () => {
  it("hides the characters' later versions before the player first sees the map", () => {
    const t = story(data());
    const a = t.connect();
    t.step(2);
    expect(npcs(t, a)).toEqual([1]);
    const save = lastSave(a);
    expect(save.flags).toContain(418);
    // LotoIDSet: the retail game writes the high half over VAR_LOTO_NUMBER_LO (0x403C).
    expect(save.vars["16444"]).toBeTypeOf("number");
  });

  it("does not run for a save already played", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { rev: 3, playTimeMs: 60_000 } });
    t.step(2);
    expect(npcs(t, a).sort()).toEqual([0, 1]);
    expect(lastSave(a).flags).not.toContain(418);
  });

  it("runs for a story restarted on a played save (spec 024, US7)", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { rev: 9, playTimeMs: 60_000, flags: [960], vars: {} } });
    t.step(2);
    expect(npcs(t, a)).toEqual([1]);
    expect(lastSave(a).flags).toContain(418);
  });

  it("does not run without the extraction's new-game data", () => {
    const t = story({ ...data(), newGame: undefined });
    const a = t.connect();
    t.step(2);
    expect(npcs(t, a).sort()).toEqual([0, 1]);
  });
});
