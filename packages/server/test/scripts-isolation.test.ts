import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 020 US2 (principle VII): one player's story never changes another's.

const leave = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 400 } }], ["HidePerson", { arg0: 0 }], ["End"]]);
const data = () => scriptData([leave], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0, 400)] }) });
const npcs = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) => {
  const seen = new Set<number>();
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc") seen.add(e.id);
    for (const id of s.removed) seen.delete(id);
  }
  return [...seen].map((id) => t.entity(id)?.data["person"]);
};

describe("story per player", () => {
  it("a person hidden by one player's flag stays for the other", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    expect([npcs(t, a), npcs(t, b)]).toEqual([[0], [0]]);
    t.press(a);
    t.step();
    expect([npcs(t, a), npcs(t, b)]).toEqual([[], [0]]);
  });

  it("a player who joins with the flag set never sees the person", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { flags: [400] } });
    t.step();
    expect(npcs(t, a)).toEqual([]);
  });

  it("the same script runs for two players at once, each with their own state", () => {
    const ask = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:1" } }], ["SetFlag", { flag: { flag: 401 } }], ["End"]]);
    const t = story(scriptData([ask], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    t.press(b);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual([401]);
    expect(b.saves().at(-1)!.save.flags).toEqual([]);
  });

  it("others see a player in a script as busy, until it ends, without touching the menu's busy mark", () => {
    const ask = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:1" } }], ["End"]]);
    const t = story(scriptData([ask], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.entity(a.welcome!.entityId)!.data["busy"]).toBe(true);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.entity(a.welcome!.entityId)!.data["busy"]).toBeUndefined();
    a.conn.send({ type: "menu", open: true });
    t.step();
    expect(t.entity(a.welcome!.entityId)!.data["busy"]).toBe(true);
  });

  it("flags and variables survive a reconnect", () => {
    const set = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 402 } }], ["SetVar", { var: { variable: 0x4200 }, val: 9 }], ["End"]]);
    const t = story(scriptData([set], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    t.connect("Host");
    const a = t.connect("Guest");
    t.step();
    t.press(a);
    a.conn.close();
    t.step();
    const back = t.connect("Guest", undefined, { resumeToken: a.welcome!.resumeToken });
    t.step();
    back.conn.send({ type: "leave" });
    expect(back.saves().at(-1)!.save).toMatchObject({ flags: [402], vars: { [0x4200]: 9 } });
  });
});
