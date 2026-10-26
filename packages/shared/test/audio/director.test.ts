import { describe, expect, it } from "vitest";
import { desiredMusic, type MusicState } from "../../src/audio/director.ts";

// Spec 018, research R3 and R4.

const MUSIC = { title: 1, wildBattle: 2, victory: 3 };
const game = (patch: Partial<MusicState> = {}): MusicState => ({ screen: "game", musicDay: 10, musicNight: 11, night: false, inCombat: false, victory: false, ...patch });

describe("desiredMusic (US1)", () => {
  it("plays the title music on the title screen", () => {
    expect(desiredMusic(game({ screen: "title" }), MUSIC)).toBe(1);
  });

  it("plays the map's day or night music", () => {
    expect(desiredMusic(game(), MUSIC)).toBe(10);
    expect(desiredMusic(game({ night: true }), MUSIC)).toBe(11);
  });

  it("gives the same id for two maps with the same music, so it does not restart", () => {
    expect(desiredMusic(game({ musicNight: 99 }), MUSIC)).toBe(desiredMusic(game(), MUSIC));
  });

  it("is silent when the map has no music", () => {
    expect(desiredMusic(game({ musicDay: 0 }), MUSIC)).toBeNull();
  });
});

describe("desiredMusic (US2)", () => {
  it("plays the wild battle music in combat", () => {
    expect(desiredMusic(game({ inCombat: true }), MUSIC)).toBe(2);
  });

  it("plays the victory fanfare until it ends", () => {
    expect(desiredMusic(game({ victory: true }), MUSIC)).toBe(3);
    expect(desiredMusic(game({ victory: false }), MUSIC)).toBe(10);
  });

  it("puts the title above everything", () => {
    expect(desiredMusic(game({ screen: "title", inCombat: true, victory: true }), MUSIC)).toBe(1);
  });
});
