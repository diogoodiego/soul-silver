import { describe, expect, it } from "vitest";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 032.3: the Route 43 gate's Rocket toll (map 245, scr_seq 256) on a synthetic map (principle II). Entering resets the
// guard (onTransition, unless flag 202 says the Rockets left); the frame script then charges 1000, or all the player has.

const GUARD = 0x410f;
const code = scriptFile(100, [
  "L1:",
  ["CheckFlag", { flag: { flag: 202 } }],
  ["GoToIf", { condition: 1, dest: { label: "L3" } }],
  ["SetVar", { var: { variable: GUARD }, val: 0 }],
  ["End"],
  "L2:",
  ["ApplyMovement", { arg0: 0, movement: { movement: "M1" } }],
  ["WaitMovement"],
  ["NPCMsg", { msg_id: { text: "0007:0" } }],
  ["HasEnoughMoneyImmediate", { arg0: 32780, arg1: 1000 }],
  ["CompareVarToValue", { var: { variable: 32780 }, val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "L4" } }],
  ["NPCMsg", { msg_id: { text: "0007:1" } }],
  ["CloseMsg"],
  "L4:",
  ["SubMoneyImmediate", { arg0: 1000 }],
  ["SetVar", { var: { variable: GUARD }, val: 1 }],
  "L3:",
  ["End"],
], { M1: [{ action: "EmoteExclamationMark", count: 1 }, { action: "WalkFasterSouth", count: 1 }] });

function gate(saves: { money: number; flags?: number[]; vars?: Record<number, number> }[]) {
  const events = mapEvents({
    npcs: [npc(0, 3, 3, null)],
    levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [{ variable: GUARD, value: 0, script: { id: 2, file: 100, entry: 1 } }] },
  });
  const t = story(scriptData([code], { 60: events }), { spawn: (n) => ({ area: "60", x: at(n), y: at(8) }) });
  const players = saves.map((s) => t.connect(undefined, undefined, { save: s }));
  // Every request answered, as the client does once it showed it.
  const answered = players.map(() => 0);
  for (let i = 0; i < 60; i++) {
    players.forEach((p, k) => {
      while (answered[k]! < t.of(p, "script").length) p.conn.send({ type: "script-answer", id: t.of(p, "script")[answered[k]!++]!.id });
    });
    t.step();
  }
  t.session.close("closed-by-host");
  return players.map((p) => p.saves().at(-1)!.save);
}

describe("the Rocket toll at the Route 43 gate (item 032.3)", () => {
  it("takes 1000 from each player who walks in, once per entry", () => {
    const [a, b] = gate([{ money: 1500 }, { money: 3000 }]);
    expect(a!.money).toBe(500);
    expect(b!.money).toBe(2000);
    expect(a!.vars[GUARD]).toBe(1);
  });

  it("takes all a player has when it is short of 1000", () => {
    expect(gate([{ money: 400 }])[0]!.money).toBe(0);
  });

  it("charges again on the next entry, the guard back at 0", () => {
    expect(gate([{ money: 1500, vars: { [GUARD]: 1 } }])[0]!.money).toBe(500);
  });

  it("charges nothing once the Rockets left (flag 202)", () => {
    expect(gate([{ money: 1500, flags: [202], vars: { [GUARD]: 1 } }])[0]!.money).toBe(1500);
  });
});
