import { describe, expect, it } from "vitest";
import { startFight } from "./ai-fight";
import { combatSetup, MOVES } from "./combat-fixture";

// Spec 021 US4 (FR-012): a player in a cutscene, and their Pokémon, are out of reach; wild AIs let go.

const shelter = (world: ReturnType<typeof combatSetup>["world"], id: number) => {
  const e = world.get(id)!;
  world.update({ ...e, data: { ...e.data, cutscene: true } });
};

describe("cutscene shelter in combat", () => {
  it("a sheltered target takes no damage and is not pushed", () => {
    const s = combatSetup();
    const a = s.spawn("cyndaquil", [MOVES.tackle.id], { x: 100, y: 100 }, "wild");
    const b = s.spawn("chikorita", [MOVES.tackle.id], { x: 120, y: 100 }, 1);
    shelter(s.world, b);
    const [hp, at] = [s.hp(b), s.pos(b)];
    s.press(a, 1, { x: 1, y: 0 });
    s.step(30);
    expect([s.hp(b), s.pos(b)]).toEqual([hp, at]);
  });

  it("a wild Pokémon drops the threat on sheltered bodies and lands nothing on them", () => {
    let landed = 0;
    let target: number | null | undefined;
    const f = startFight({
      seed: 3,
      wild: { species: "chikorita", level: 10, moves: [MOVES.tackle.id] },
      starter: { species: "cyndaquil", level: 10, moves: [MOVES.tackle.id] },
      maxTicks: 100,
      watch(fight, tick, hits) {
        if (tick === 60) for (const e of fight.world.all()) if (e.id !== fight.wild) shelter(fight.world, e.id);
        if (tick > 60) landed += hits.filter((h) => h.kind === "hit" && h.target !== fight.wild).length;
        if (tick === 100) target = fight.ai.debug("field", fight.world.get(fight.wild)!, 10_000)[0]?.target;
      },
    });
    f.run();
    expect(landed).toBe(0);
    expect(target).toBeNull();
  });
});
