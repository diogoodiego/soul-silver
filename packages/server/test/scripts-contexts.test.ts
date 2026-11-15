import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 020 US1: talking, signs, triggers, entering a map and the frame table start the original scripts.

const talk = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:1" } }], ["CloseMsg"], ["SetFlag", { flag: { flag: 300 } }], ["End"]]);

describe("script contexts", () => {
  it("talking to the person in front runs its script; the player is locked until it ends", () => {
    // The player stands at tile 1,1 facing south: the person is at 1,2.
    const t = story(scriptData([talk], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.of(a, "script")).toEqual([{ type: "script", id: 1, request: { kind: "say", text: "0007:1", buffers: {} } }]);
    expect(t.of(a, "script-lock")).toEqual([{ type: "script-lock", locked: true }]);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.of(a, "script-event")).toEqual([{ type: "script-event", event: { kind: "close-msg" } }]);
    expect(t.of(a, "script-lock").at(-1)).toEqual({ type: "script-lock", locked: false });
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)?.save.flags).toEqual([300]);
  });

  it("talking to nobody runs nothing", () => {
    const t = story(scriptData([talk], { 60: mapEvents({ npcs: [npc(0, 5, 5, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.of(a, "script")).toEqual([]);
  });

  it("a locked player does not move", () => {
    const t = story(scriptData([talk], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    const before = t.entity(a.welcome!.entityId)!;
    t.walk(a, { x: 1, y: 0 }, 10);
    expect(t.entity(a.welcome!.entityId)!.x).toBe(before.x);
  });

  it("a sign in front is read", () => {
    const sign = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:2" } }], ["End"]]);
    const t = story(scriptData([sign], { 60: mapEvents({ signs: [{ script: { id: 1, file: 100, entry: 0 }, kind: 0, x: 1, z: 2, y: 0, dir: 0 }] }) }));
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.of(a, "script")[0]?.request).toMatchObject({ text: "0007:2" });
  });

  it("a trigger runs when the player steps on it while its variable holds the value", () => {
    const trig = scriptFile(100, ["L1:", ["SetVar", { var: { variable: 0x4100 }, val: 1 }], ["SetFlag", { flag: { flag: 301 } }], ["End"]]);
    const t = story(scriptData([trig], { 60: mapEvents({ triggers: [{ script: { id: 1, file: 100, entry: 0 }, x: 1, z: 3, w: 1, h: 1, y: 0, variable: 0x4100, value: 0 }] }) }));
    const a = t.connect();
    t.step();
    t.walk(a, { x: 0, y: 1 }, 40);
    t.walk(a, { x: 0, y: -1 }, 40);
    t.walk(a, { x: 0, y: 1 }, 40);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).toEqual([301]);
    // The variable changed, so walking back over it did nothing more.
    expect(save.vars).toEqual({ [0x4100]: 1 });
  });

  it("entering a map runs its transition script, then the first frame script whose variable matches", () => {
    const level = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 302 } }], ["End"], "L2:", ["SetFlag", { flag: { flag: 303 } }], ["SetVar", { var: { variable: 0x4101 }, val: 1 }], ["End"], "L3:", ["SetFlag", { flag: { flag: 304 } }], ["End"]]);
    const t = story(
      scriptData([level], {
        60: mapEvents({
          levelScripts: {
            onTransition: { id: 1, file: 100, entry: 0 },
            onResume: null,
            onLoad: null,
            frames: [
              { variable: 0x4101, value: 0, script: { id: 2, file: 100, entry: 1 } },
              { variable: 0x4101, value: 0, script: { id: 3, file: 100, entry: 2 } },
            ],
          },
        }),
      }),
    );
    const a = t.connect();
    t.step(5);
    t.session.close("closed-by-host");
    // 304 never runs: the frame table takes the first match, and 303 changed the variable.
    expect(a.saves().at(-1)!.save.flags).toEqual([302, 303]);
  });

  it("a trigger stepped on during a script does not start a second one", () => {
    const both = scriptFile(100, ["L1:", ["NPCMsg", { msg_id: { text: "0007:1" } }], ["End"], "L2:", ["SetFlag", { flag: { flag: 305 } }], ["End"]]);
    const t = story(scriptData([both], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)], triggers: [{ script: { id: 2, file: 100, entry: 1 }, x: 1, z: 1, w: 1, h: 1, y: 0, variable: 0x4100, value: 0 }] }) }));
    const a = t.connect();
    // The player spawns on the trigger, which does not run it (below); talking still works.
    t.step();
    t.press(a);
    t.press(a);
    expect(t.of(a, "script")).toHaveLength(1);
  });

  // Spec 030.5: as the original, whose coordinate events fire on a finished step, arriving on a trigger (a load, a
  // door) does not run it. A save made mid-ride in the Azalea Gym keeps the player on a stop and rode again on load.
  it("arriving on a trigger does not run it; stepping off it and back on does", () => {
    const flag = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 305 } }], ["End"]]);
    const data = () => scriptData([flag], { 60: mapEvents({ triggers: [{ script: { id: 1, file: 100, entry: 0 }, x: 1, z: 1, w: 1, h: 1, y: 0, variable: 0x4100, value: 0 }] }) });
    const flags = (walkOff: boolean) => {
      const t = story(data());
      const a = t.connect();
      t.step(3);
      if (walkOff) {
        t.walk(a, { x: 0, y: 1 }, 8);
        t.walk(a, { x: 0, y: -1 }, 8);
      }
      t.step(3);
      t.session.close("closed-by-host");
      return a.saves().at(-1)!.save.flags;
    };
    expect(flags(false)).not.toContain(305);
    expect(flags(true)).toContain(305);
  });

  it("CallStd reaches global scripts", () => {
    const local = scriptFile(100, ["L1:", ["CallStd", { id: 2000 }], ["End"]]);
    const global = scriptFile(3, ["L1:", ["SetFlag", { flag: { flag: 306 } }], ["End"]]);
    const t = story(scriptData([local, global], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }, { 2000: { file: 3, entry: 0 } }));
    const a = t.connect();
    t.step();
    t.press(a);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual([306]);
  });
});
