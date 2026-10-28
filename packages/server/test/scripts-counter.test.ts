import type { CollisionMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { flatWorld } from "./harness";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 023: clerks and nurses stand behind a counter (behavior 0x80); talking to the counter talks
// to whoever is on the far side, as in the original.

const talk = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 330 } }], ["End"]]);
const data = () => scriptData([talk], { 60: mapEvents({ npcs: [npc(0, 1, 3, 0)] }) });

/** 16×16 free tiles; (1, 2) is a counter (blocked + behavior 0x80) or a plain wall. */
function grid(raw: number): CollisionMap {
  const tiles = Array.from({ length: 256 }, () => ({ category: "free" as const, raw: 0 }));
  tiles[2 * 16 + 1] = { category: "blocked", raw } as never;
  return { width: 16, height: 16, tiles };
}

function talkSouth(raw: number) {
  const t = story(data(), { world: flatWorld(grid(raw)) });
  const c = t.connect();
  t.step();
  t.press(c);
  t.session.close("closed-by-host");
  return c.saves().at(-1)!.save.flags;
}

describe("talking across a counter", () => {
  it("reaches the person behind a counter tile", () => {
    expect(talkSouth(0x8080)).toContain(330);
  });

  it("does not reach past a wall", () => {
    expect(talkSouth(0x8000)).not.toContain(330);
  });
});
