import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 024 US2 (T020): the starter comes from the lab's script, into an empty party, and the
// script marks the milestone itself (FLAG_GOT_STARTER, 0x6A), as 843:12 does.

describe("the lab gives the starter", () => {
  it("adds the pick to the empty party and the script sets FLAG_GOT_STARTER", () => {
    const host = fakeHost();
    expect(host.party).toEqual([]);
    const runner = createRunner(host, SCRIPT_HANDLERS, { file: makeScript([["ChooseStarter"], ["SetFlag", { flag: { flag: 0x6a } }], ["End"]]), entry: 0 });
    expect(runner.step()).toEqual({ kind: "blocked", request: { kind: "starter", species: [152, 155, 158] } });
    expect(runner.resume(2)).toEqual({ kind: "done" });
    expect(host.party).toEqual([{ species: 158, level: 5, hp: 1 }]);
    expect(host.flags.has(0x6a)).toBe(true);
  });

  // ScrCmd_NicknameInput: the naming screen for the party member in the var; an empty name keeps the species'.
  it.each([
    { typed: "Fogo", nickname: "Fogo" },
    { typed: "", nickname: undefined },
  ])("NicknameInput names the starter ($typed)", ({ typed, nickname }) => {
    const host = fakeHost({ party: [{ species: 155, level: 5, hp: 20 }] });
    const lines: Parameters<typeof makeScript>[0] = [["NicknameInput", { arg0: 0, arg1: 0x4001 }], ["End"]];
    const runner = createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 });
    expect(runner.step()).toEqual({ kind: "blocked", request: { kind: "name", purpose: "nickname", species: 155 } });
    expect(runner.resume(0, typed)).toEqual({ kind: "done" });
    expect(host.party[0]!.nickname).toBe(nickname);
  });

  it("BufferPartyMonNick says the nickname, or the species without one", () => {
    const host = fakeHost({ party: [{ species: 155, level: 5, hp: 20, nickname: "Fogo" }, { species: 152, level: 5, hp: 20 }] });
    const lines: Parameters<typeof makeScript>[0] = [["BufferPartyMonNick", { slot: 0, party_pos: 0 }], ["BufferPartyMonNick", { slot: 1, party_pos: 1 }], ["NPCMsg", { msg_id: 9 }], ["End"]];
    const state = createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step();
    expect(state).toMatchObject({ kind: "blocked", request: { kind: "say", buffers: { 0: { kind: "name", name: "Fogo" }, 1: { kind: "species", id: 152 } } } });
  });
});
