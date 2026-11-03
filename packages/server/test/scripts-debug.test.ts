import { describe, expect, it } from "vitest";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";
import { member } from "./trainer-fixture";

// Spec 020 US4, FR-011: the script debugger.

const file = scriptFile(100, ["L1:", ["CheckFlag", { flag: { flag: 600 } }], ["GoToIf", { condition: 1, dest: { label: "S" } }], ["NPCMsg", { msg_id: { text: "0007:1" } }], ["End"], "S:", ["NPCMsg", { msg_id: { text: "0007:2" } }], ["End"]]);
const data = () => scriptData([file], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });

describe("script debugger", () => {
  it("only clients that asked get where their script is, with flags and variables", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    a.conn.send({ type: "debugScript", on: true });
    t.press(a);
    t.press(b);
    expect(t.of(b, "script-debug")).toEqual([]);
    expect(t.of(a, "script-debug").at(-1)).toEqual({ type: "script-debug", at: { file: 100, entry: 0, pc: 2, command: "NPCMsg", depth: 1 }, flags: [], vars: {}, objects: [{ id: 0, sprite: 3, hideFlag: null, visible: true }], triggers: [], changes: [] });
  });

  it("changes a flag in development builds, and the next event sees it", () => {
    const t = story(data(), { devTools: true });
    const a = t.connect();
    t.step();
    a.conn.send({ type: "debugScript", on: true });
    a.conn.send({ type: "debugSetFlag", flag: 600, on: true });
    t.press(a);
    expect(t.of(a, "script").at(-1)?.request).toMatchObject({ text: "0007:2" });
  });

  it("refuses flag changes without the debugger on, or outside development builds", () => {
    const off = story(data(), { devTools: true });
    const a = off.connect();
    a.conn.send({ type: "debugSetFlag", flag: 600, on: true });
    off.step();
    off.press(a);
    expect(off.of(a, "script").at(-1)?.request).toMatchObject({ text: "0007:1" });

    const release = story(data());
    const b = release.connect();
    b.conn.send({ type: "debugScript", on: true });
    b.conn.send({ type: "debugSetFlag", flag: 600, on: true });
    release.step();
    release.press(b);
    expect(release.of(b, "script").at(-1)?.request).toMatchObject({ text: "0007:1" });
  });

  it("teleports in development builds with the debugger on (spec 024), and refuses otherwise", () => {
    const where = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) => {
      const e = t.session.world.get(c.welcome!.entityId)!;
      return { area: e.area, x: e.x, y: e.y };
    };
    const dev = story(data(), { devTools: true });
    const a = dev.connect();
    a.conn.send({ type: "debugScript", on: true });
    a.conn.send({ type: "debugWarp", map: 61, tx: 3, ty: 4 });
    dev.step();
    expect(where(dev, a)).toEqual({ area: "61", x: at(3), y: at(4) });

    const off = story(data(), { devTools: true });
    const b = off.connect();
    b.conn.send({ type: "debugWarp", map: 61, tx: 3, ty: 4 });
    off.step();
    expect(where(off, b).area).toBe("60");

    const release = story(data());
    const c = release.connect();
    c.conn.send({ type: "debugScript", on: true });
    c.conn.send({ type: "debugWarp", map: 61, tx: 3, ty: 4 });
    release.step();
    expect(where(release, c).area).toBe("60");
  });

  it("sets the party's HP in development builds with the debugger on (spec 024, the Center check), and refuses otherwise", () => {
    const hp = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) => {
      t.session.close("closed-by-host");
      return c.saves().at(-1)!.save.party.map((m) => m.hp);
    };
    const party = [member("cyndaquil", 10, 30), member("sentret", 10, 25)];

    const dev = story(data(), { devTools: true });
    const a = dev.connect(undefined, undefined, { save: { party } });
    a.conn.send({ type: "debugScript", on: true });
    a.conn.send({ type: "debugSetHp", hp: 3 });
    dev.step();
    expect(hp(dev, a)).toEqual([3, 3]);

    const off = story(data(), { devTools: true });
    const b = off.connect(undefined, undefined, { save: { party } });
    b.conn.send({ type: "debugSetHp", hp: 3 });
    off.step();
    expect(hp(off, b)).toEqual([30, 25]);
    expect(off.logs.some((l) => l.includes("Refused debugSetHp"))).toBe(true);
  });
});
