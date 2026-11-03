import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 US5 (FR-010, data-model FlagChange): the last 64 flag and variable changes, with the script that made them.

const talk = (lines: Parameters<typeof scriptFile>[1]) => scriptData([scriptFile(100, ["L1:", ...lines, ["End"]])], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });
const changes = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) => (t.of(c, "script-debug").at(-1)?.changes ?? []).map(({ kind, id, value, script }) => ({ kind, id, value, script }));

describe("flag history", () => {
  it("records each change with the script that made it", () => {
    const t = story(talk([["SetFlag", { flag: { flag: 600 } }], ["SetVar", { var: { variable: 0x4100 }, val: 7 }], ["ClearFlag", { flag: { flag: 600 } }]]));
    const a = t.connect();
    a.conn.send({ type: "debugScript", on: true });
    t.step();
    t.press(a);
    t.step();
    expect(changes(t, a)).toEqual([
      { kind: "flag", id: 600, value: 1, script: "0100:0" },
      { kind: "var", id: 0x4100, value: 7, script: "0100:0" },
      { kind: "flag", id: 600, value: 0, script: "0100:0" },
    ]);
  });

  it("skips writes that change nothing", () => {
    const t = story(talk([["SetFlag", { flag: { flag: 600 } }]]));
    const a = t.connect("A", undefined, { save: { flags: [600] } });
    a.conn.send({ type: "debugScript", on: true });
    t.step();
    t.press(a);
    t.step();
    expect(changes(t, a)).toEqual([]);
  });

  it("marks the debugger's own flag changes as dev", () => {
    const t = story(talk([]), { devTools: true });
    const a = t.connect();
    a.conn.send({ type: "debugScript", on: true });
    a.conn.send({ type: "debugSetFlag", flag: 700, on: true });
    t.step(2);
    expect(changes(t, a)).toEqual([{ kind: "flag", id: 700, value: 1, script: "dev" }]);
  });

  it("keeps only the latest 64, oldest first", () => {
    const t = story(talk(Array.from({ length: 70 }, (_, i) => ["SetFlag", { flag: { flag: 1000 + i } }] as [string, Record<string, unknown>])));
    const a = t.connect();
    a.conn.send({ type: "debugScript", on: true });
    t.step();
    t.press(a);
    t.step();
    const list = changes(t, a);
    expect(list).toHaveLength(64);
    expect([list[0]?.id, list.at(-1)?.id]).toEqual([1006, 1069]);
  });

  it("keeps the history while the debugger is off", () => {
    const t = story(talk([["SetFlag", { flag: { flag: 600 } }]]));
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "debugScript", on: true });
    t.step();
    expect(changes(t, a).map((c) => c.id)).toEqual([600]);
  });
});
