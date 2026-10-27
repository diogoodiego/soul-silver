import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 020 plan: 4 players running scripts cost at most 1 ms a tick on top of the session.

const busy = scriptFile(100, [
  "L1:",
  ["SetVar", { var: { variable: 0x4001 }, val: 0 }],
  "L2:",
  ["AddVar", { var: { variable: 0x4001 }, var_or_addend: 1 }],
  ["CompareVarToValue", { var: { variable: 0x4001 }, val: 200 }],
  ["GoToIf", { condition: 0, dest: { label: "L2" } }],
  ["NPCMsg", { msg_id: { text: "0007:1" } }],
  ["End"],
]);

describe("scripts performance", () => {
  it("4 players each running a 600-command script every few ticks stay under 1 ms a tick (median)", () => {
    const t = story(scriptData([busy], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const players = [t.connect(), t.connect(), t.connect(), t.connect()];
    t.step();
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      for (const p of players) {
        const ask = t.of(p, "script").at(-1);
        if (ask) p.conn.send({ type: "script-answer", id: ask.id });
      }
      const start = performance.now();
      t.press(players[i % 4]!);
      times.push((performance.now() - start) / 2);
    }
    // The median, so a scheduler or GC pause while the whole suite runs in parallel does not decide it.
    const median = times.sort((x, y) => x - y)[times.length >> 1]!;
    expect(t.of(players[0]!, "script").length).toBeGreaterThan(10);
    expect(median).toBeLessThan(1);
  });
});
