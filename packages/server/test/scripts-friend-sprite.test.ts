import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 021: sprite ids 101+ are drawn with the sprite in the player's variable 0x4020+, so the friend
// (Lyra or Ethan) is the other protagonist for each player.

const transition = scriptFile(100, ["L1:", ["GetFriendSprite", { arg0: 0x4020 }], ["End"]]);
const data = () => scriptData([transition], { 60: mapEvents({ npcs: [{ ...npc(0, 1, 2, null), sprite: 101 }], levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] } }) });

const spriteSeen = (c: ReturnType<ReturnType<typeof story>["connect"]>) => {
  let sprite: unknown;
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc") sprite = e.data["sprite"];
    for (const d of s.changed) if (d.data?.["sprite"] !== undefined) sprite = d.data["sprite"];
  }
  return sprite;
};

describe("variable sprites", () => {
  it("shows each player the friend that matches their own character", () => {
    const t = story(data());
    const boy = t.connect("Gold", undefined, { save: { character: "male" } });
    const girl = t.connect("Kris", undefined, { save: { character: "female" } });
    t.step(3);
    expect(spriteSeen(boy)).toBe(239);
    expect(spriteSeen(girl)).toBe(238);
  });
});
