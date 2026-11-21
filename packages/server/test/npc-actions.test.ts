import type { NpcAction } from "@soulsilver/shared/game";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { TALK_COOLDOWN_TICKS } from "../src/scripts";
import { buildShopData } from "../src/shop";
import { combatData, SPECIES } from "./combat-fixture";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Block H: the options around the person in front (talk, shop, heal). A clerk's and a nurse's script reach
// their service through a common script, as the ROM's do (std 2048, std 2002); the server reads the role
// from it. Talking runs only the lines; the service opens at once, without the dialogue. Synthetic data.

const MART_STD = 2048;
const NURSE_STD = 2002;
const SPECIAL_STD = 2049;
const people = scriptFile(100, [
  "L1:",
  ["NPCMsg", { msg_id: 1 }],
  ["CallStd", { id: MART_STD }],
  ["End"],
  "L2:",
  ["CallStd", { id: NURSE_STD }],
  ["End"],
  "L3:",
  ["NPCMsg", { msg_id: 3 }],
  ["End"],
  "L4:",
  ["SetVar", { var: { variable: 0x8004 }, val: 2 }],
  ["CallStd", { id: SPECIAL_STD }],
  ["End"],
]);
/** The common scripts: the mart's Buy/Sell/See ya menu, the nurse's question, a department store floor. */
const common = scriptFile(101, [
  "L1:",
  ["MenuInitStdGmm", { arg0: 1, arg1: 1, arg2: 0, arg3: 1, arg4: 0x800c }],
  ["MenuItemAdd", { arg0: 321, arg1: 255, arg2: 0 }],
  ["MenuItemAdd", { arg0: 322, arg1: 255, arg2: 1 }],
  ["MenuItemAdd", { arg0: 323, arg1: 255, arg2: 2 }],
  ["MenuExec"],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "buy" } }],
  ["NPCMsg", { msg_id: 9 }],
  ["End"],
  "buy:",
  ["MartBuy", { arg0: 0x8004 }],
  ["End"],
  "L2:",
  ["NPCMsg", { msg_id: 2 }],
  ["GetMenuChoice", { arg0: 0x800c }],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "heal" } }],
  ["NPCMsg", { msg_id: 8 }],
  ["End"],
  "heal:",
  ["Call", { sub: { label: "machine" } }],
  ["End"],
  "machine:",
  ["HealParty"],
  ["Return"],
  "L3:",
  ["SpecialMartBuy", { arg0: 0x8004 }],
  ["End"],
]);
const std = { [MART_STD]: { file: 101, entry: 0 }, [NURSE_STD]: { file: 101, entry: 1 }, [SPECIAL_STD]: { file: 101, entry: 2 } };
const CENTER = "69";
/** Below the spawn (1, 1): the clerk, else the nurse in a Center; west: someone to chat with; east: a store floor clerk. */
const data = (role: "clerk" | "nurse") =>
  scriptData([people, common], { 60: mapEvents({ npcs: [npc(0, 1, 2, role === "nurse" ? 1 : 0), npc(1, 0, 1, 2), npc(2, 2, 1, 3)] }), [CENTER]: mapEvents({ npcs: [npc(0, 1, 2, role === "nurse" ? 1 : 0)] }) }, std);
const shops = buildShopData(
  [
    { id: 0, items: [{ item: 4, minBadges: 0 }] },
    { id: 3, items: [{ item: 17, minBadges: 0 }] },
  ],
  [
    { id: 4, price: 200, pocket: "balls" },
    { id: 17, price: 300, pocket: "medicine" },
  ],
);
const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (hp: number): PartyMember => ({ species: SPECIES.chikorita.id, level: 5, moves: [33], hp, friendship: 70, experience: 125, ivs: stats(31), evs: stats(0), nature: 0 });

function scene(role: "clerk" | "nurse", inCenter = role === "nurse") {
  const t = story(data(role), { shops, combat: combatData(), ...(inCenter ? { spawn: () => ({ area: CENTER, x: at(1), y: at(1) }) } : {}) });
  const c = t.connect(undefined, undefined, { save: { money: 3000, party: [mon(3)], respawn: null } });
  t.step();
  const person = (id: number) => t.session.world.all().find((e) => e.kind === "npc" && e.data["person"] === id)!;
  const act = (id: number, action: NpcAction) => {
    c.conn.send({ type: "npc-action", npcId: person(id).id, action });
    t.step();
  };
  /** Answers every request the client was sent, in order, with `answer`. */
  const answerAll = (answer?: number) => {
    for (let i = 0; i < 20; i++) {
      const last = t.of(c, "script").at(-1);
      if (!last || (last as { answered?: true }).answered) return;
      (last as { answered?: true }).answered = true;
      c.conn.send({ type: "script-answer", id: last.id, ...(answer === undefined ? {} : { answer }) });
      t.step();
    }
  };
  return { t, c, person, act, answerAll };
}

describe("the options around a person (block H)", () => {
  it("marks clerks, nurses in a Center and store floor clerks with their role; the rest have none", () => {
    const { person } = scene("clerk");
    expect(person(0).data).toMatchObject({ role: "shop" });
    expect(person(1).data["role"]).toBeUndefined();
    expect(person(2).data).toMatchObject({ role: "shop" });
    expect(scene("nurse").person(0).data).toMatchObject({ role: "heal" });
    // Mom heals too, outside a Center: she is someone to talk to.
    expect(scene("nurse", false).person(0).data["role"]).toBeUndefined();
  });

  it("shop opens the clerk's mart at once, with no line said, and leaving it frees the player", () => {
    const { t, c, act } = scene("clerk");
    act(0, "shop");
    expect(t.of(c, "script")).toEqual([]);
    expect(t.of(c, "shopOpen").at(-1)).toMatchObject({ shopId: 0, mode: "buy" });
    c.conn.send({ type: "shop-buy", item: 4, qty: 1 });
    t.step();
    expect(t.of(c, "shopResult").at(-1)).toMatchObject({ ok: true, money: 2800 });
    c.conn.send({ type: "shop-leave" });
    t.step();
    expect(t.of(c, "script-lock").at(-1)).toEqual({ type: "script-lock", locked: false });
  });

  it("a store floor clerk opens the shop its common script names", () => {
    const { t, c, act } = scene("clerk");
    t.walk(c, { x: 1, y: 0 }, 1);
    act(2, "shop");
    expect(t.of(c, "shopOpen").at(-1)).toMatchObject({ shopId: 3 });
  });

  it("talking to the clerk says the lines and never opens the shop", () => {
    const { t, c, act, answerAll } = scene("clerk");
    act(0, "talk");
    answerAll();
    expect(t.of(c, "shopOpen")).toEqual([]);
    expect(t.of(c, "script").map((m) => m.request.kind)).toEqual(["say", "say"]);
    expect(t.of(c, "script-lock").at(-1)).toEqual({ type: "script-lock", locked: false });
  });

  it("heal heals at once, makes the Center the respawn point and plays the jingle, with no line said", () => {
    const { t, c, act } = scene("nurse");
    act(0, "heal");
    expect(t.of(c, "script")).toEqual([]);
    expect(t.of(c, "healed")).toHaveLength(1);
    t.session.close("closed-by-host");
    const save = c.saves().at(-1)!.save;
    expect(save.party[0]!.hp).toBeGreaterThan(3);
    expect(save.respawn).toEqual({ area: CENTER, x: at(1), y: at(1) });
  });

  it("talking to the nurse says the lines and does not heal", () => {
    const { t, c, act, answerAll } = scene("nurse");
    act(0, "talk");
    answerAll();
    expect(t.of(c, "script").map((m) => m.request.kind)).toEqual(["say", "say"]);
    t.session.close("closed-by-host");
    expect(c.saves().at(-1)!.save.party[0]!.hp).toBe(3);
  });

  it("sell opens the clerk's mart on the sell screen at once", () => {
    const { t, c, act } = scene("clerk");
    act(0, "sell");
    expect(t.of(c, "script")).toEqual([]);
    expect(t.of(c, "shopOpen").at(-1)).toMatchObject({ mode: "sell" });
  });

  it("the interact key is the talk option: the clerk's and the nurse's lines only", () => {
    const clerk = scene("clerk");
    clerk.t.press(clerk.c);
    clerk.answerAll();
    expect(clerk.t.of(clerk.c, "shopOpen")).toEqual([]);
    expect(clerk.t.of(clerk.c, "script").map((m) => m.request.kind)).toEqual(["say", "say"]);
    const nurse = scene("nurse");
    nurse.t.press(nurse.c);
    nurse.answerAll();
    nurse.t.session.close("closed-by-host");
    expect(nurse.c.saves().at(-1)!.save.party[0]!.hp).toBe(3);
  });

  it("talking to anyone else runs their script as the interact key does", () => {
    const { t, c, act, answerAll } = scene("clerk");
    t.walk(c, { x: -1, y: 0 }, 1);
    act(1, "talk");
    answerAll();
    expect(t.of(c, "script").map((m) => m.request.kind)).toEqual(["say"]);
  });

  it("waits a moment after a talk ends before the interact key talks again (the key that closed the last line)", () => {
    const { t, c, answerAll } = scene("clerk");
    t.walk(c, { x: -1, y: 0 }, 1);
    t.press(c);
    answerAll();
    expect(t.of(c, "script")).toHaveLength(1);
    t.press(c);
    expect(t.of(c, "script")).toHaveLength(1);
    t.step(TALK_COOLDOWN_TICKS);
    t.press(c);
    expect(t.of(c, "script")).toHaveLength(2);
  });

  it("refuses a person out of reach and a service the person does not offer", () => {
    const { t, c, act } = scene("clerk");
    act(1, "talk");
    act(0, "heal");
    expect(t.of(c, "script")).toEqual([]);
    expect(t.of(c, "healed")).toEqual([]);
    expect(t.of(c, "shopOpen")).toEqual([]);
  });
});
