import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

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
    expect(t.of(a, "script-debug").at(-1)).toEqual({ type: "script-debug", at: { file: 100, entry: 0, pc: 2, command: "NPCMsg", depth: 1 }, flags: [], vars: {} });
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
});
