import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings, settingsPatch } from "../src/settings.ts";

// The test arena's menu comes back as it was left, even after the app closes.

const arena = {
  name: "Teste",
  character: "female",
  mine: [{ species: 155, level: 10, moves: [33, 0, 43, 0] }],
  foeKind: "trainer",
  behavior: "idle",
  trainerId: 20,
  theirs: [{ species: 152, level: 10, moves: [33, 75, 45, 77] }],
  ring: 61,
  leader: 21,
};

describe("arena setting", () => {
  it("starts empty and old settings files get it empty", () => {
    expect(DEFAULT_SETTINGS.arena).toBeNull();
    expect(readSettings({ crt: false }).arena).toBeNull();
  });

  it("keeps the whole menu, with the empty move slots, through the file", () => {
    expect(settingsPatch.safeParse({ arena }).success).toBe(true);
    expect(readSettings(JSON.parse(JSON.stringify({ arena }))).arena).toEqual(arena);
  });

  it("keeps the open field and no gym leader", () => {
    const { ring: _ring, leader: _leader, ...open } = arena;
    expect(settingsPatch.safeParse({ arena: { ...open, ring: undefined, leader: undefined } }).success).toBe(true);
    expect(readSettings(JSON.parse(JSON.stringify({ arena: open }))).arena).toEqual(open);
  });

  it("keeps the legendary at the end", () => {
    const { leader: _leader, ...rest } = arena;
    const legendary = { ...rest, legendary: 249 };
    expect(settingsPatch.safeParse({ arena: legendary }).success).toBe(true);
    expect(readSettings(JSON.parse(JSON.stringify({ arena: legendary }))).arena).toEqual(legendary);
  });

  it("drops a broken arena on its own, leaving the other settings", () => {
    const row = arena.mine[0]!;
    for (const bad of [{ ...arena, mine: [] }, { ...arena, mine: [{ ...row, level: 101 }] }, { ...arena, mine: [{ ...row, moves: [33] }] }, { ...arena, theirs: Array(7).fill(row) }, { ...arena, foeKind: "x" }, 3]) {
      const read = readSettings({ crt: false, arena: bad });
      expect(read.arena).toBeNull();
      expect(read.crt).toBe(false);
    }
  });
});
