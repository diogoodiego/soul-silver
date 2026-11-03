import { describe, expect, it } from "vitest";
import { desiredMusic, type MusicState, type MusicTracks } from "../../src/audio/director.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { createRunner } from "../../src/script/runner.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 024 US4 (research R3): TempBGM leaves the map's music alone, and ScrCmd_729 reads the companion.

const run = (lines: Parameters<typeof makeScript>[0], host = fakeHost()) => {
  createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 }).step();
  return host;
};

const tracks: MusicTracks = { title: 1, wildBattle: 2, victory: 3, trainerBattle: 4, rivalBattle: 5, leaderBattle: 6, rocketBattle: 7, championBattle: 8, trainerVictory: 9, leaderVictory: 10 };
const state = (over: Partial<MusicState> = {}): MusicState => ({ screen: "game", musicDay: 20, musicNight: 21, night: false, inCombat: false, victory: false, ...over });

describe("TempBGM", () => {
  it("plays the sequence, and ResetBGM gives the map's music back", () => {
    const host = run([["TempBGM", { arg0: 1030 }], ["ResetBGM"], ["End"]]);
    expect(host.events).toEqual([{ kind: "bgm", id: 1030 }, { kind: "bgm-reset" }]);
  });

  it("wins over the map's music, and the map's music is back without it", () => {
    expect(desiredMusic(state({ scriptMusic: 1030 }), tracks)).toBe(1030);
    expect(desiredMusic(state(), tracks)).toBe(20);
  });

  it("is silence when a script stopped the music", () => {
    expect(desiredMusic(state({ scriptMusic: null }), tracks)).toBeNull();
  });

  it("gives way to a battle", () => {
    expect(desiredMusic(state({ scriptMusic: 1030, inCombat: true }), tracks)).toBe(2);
  });
});

describe("ScrCmd_729", () => {
  it("is 1 while the companion follows the player", () => {
    const host = fakeHost({ companionOut: () => true });
    expect(run([["ScrCmd_729", { arg0: 0x4001 }], ["End"]], host).vars.get(0x4001)).toBe(1);
  });

  it("is 0 with the party's lead in its ball", () => {
    const host = fakeHost({ party: [{ species: 155, level: 5, hp: 20 }], companionOut: () => false, vars: new Map([[0x4001, 1]]) });
    expect(run([["ScrCmd_729", { arg0: 0x4001 }], ["End"]], host).vars.get(0x4001)).toBe(0);
  });
});
