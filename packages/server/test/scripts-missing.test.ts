import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 020 US3, SC-003: a command nobody implemented ends that player's script, unlocks them and is logged.

describe("missing commands", () => {
  it.each([
    ["an unknown name", ["NotImplementedYet"]],
    ["a raw command", { raw: true as const, id: 999 }],
    ["a bridge nothing implements", ["TrainerBattle", { trainer: { trainer: 1 }, arg1: 0, arg2: 0, arg3: 0 }]],
  ])("%s ends the script within the tick, unlocks the player and is logged", (_, command) => {
    const file = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:1" } }], command as never, ["SetFlag", { flag: { flag: 500 } }], ["End"]]);
    const missing: unknown[] = [];
    const t = story(scriptData([file], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), { onMissingCommand: (m) => missing.push(m) });
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.of(a, "script-lock").at(-1)).toEqual({ type: "script-lock", locked: false });
    expect(missing).toEqual([expect.objectContaining({ file: 100, entry: 0, index: 1, player: a.welcome!.playerId })]);
    expect(t.logs.some((l) => l.includes("missing script command"))).toBe(true);
    // The rest of the script never ran, and the other player was never touched.
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual([]);
    expect(t.of(b, "script-lock")).toEqual([]);
  });

  it("an aborted script (bad jump) also unlocks and is logged", () => {
    const file = scriptFile(100, ["L1:", ["GoTo", { dest: { label: "L9" } }]]);
    const t = story(scriptData([file], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.of(a, "script-lock").at(-1)?.locked ?? false).toBe(false);
    expect(t.logs.some((l) => l.includes("L9"))).toBe(true);
  });

  it("a script that points at a file the extraction lacks is logged, not thrown", () => {
    const t = story(scriptData([], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.logs.some((l) => l.includes("100"))).toBe(true);
  });
});
