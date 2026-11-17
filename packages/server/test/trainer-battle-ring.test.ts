import { describe, expect, it } from "vitest";
import { RING_SPOTS, ringSource } from "@soulsilver/shared/game";
import { arenaSetup, at, FACING, member, trainer, trainerNpc } from "./trainer-fixture";

// Item V.3: a trainer battle indoors is fought in a ring of its own; the player comes back where they stood after it.

describe("trainer battles in a ring", () => {
  it("takes the player and a copy of the trainer to a ring, and brings the player back after", () => {
    const t = arenaSetup({ indoor: true, trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    const id = a.welcome!.entityId;
    t.step(8);
    t.untilStart(a);
    const before = { x: at(1), y: at(1) };
    const me = t.session.world.get(id)!;
    const [start] = t.of(a, "trainerBattleStart");
    expect(ringSource(me.area)).toBe("60");
    expect(start!.arena).toMatchObject({ area: me.area, x: RING_SPOTS.center.x, y: RING_SPOTS.center.y });
    expect(me).toMatchObject({ x: RING_SPOTS.player.x, y: RING_SPOTS.player.y, facing: "east" });
    // Its Pokémon, the player's and a stand-in for the trainer, all in the ring; the trainer itself stays home.
    expect(t.foes().map((e) => e.area)).toEqual([me.area]);
    const inRing = t.session.world.all().filter((e) => e.area === me.area);
    expect(inRing.filter((e) => e.kind === "npc")).toEqual([expect.objectContaining({ x: RING_SPOTS.trainer.x, y: RING_SPOTS.trainer.y, facing: "west", data: { sprite: 3 } })]);
    expect(inRing.some((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId))).toBe(true);
    expect(t.session.world.all().filter((e) => e.kind === "npc" && e.area === "60")).toHaveLength(1);

    t.knockOut();
    t.step(3);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "won" })]);
    expect(t.session.world.get(id)).toMatchObject({ area: "60", ...before });
    expect(t.session.world.all().filter((e) => ringSource(e.area) !== undefined)).toEqual([]);
  });

  it("fights outdoors where the player stands, as before", () => {
    const t = arenaSetup({ trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    t.untilStart(a);
    expect(t.of(a, "trainerBattleStart")[0]!.arena.area).toBe("60");
    expect(t.session.world.get(a.welcome!.entityId)!.area).toBe("60");
  });

  it("a gym leader's scripted battle: the ring, then the script goes on back home", () => {
    const t = arenaSetup({ indoor: true, trainers: [trainer(7, ["sentret"])], script: ["L1:", ["TrainerBattle", { trainer: { trainer: 7 }, arg1: 0, arg2: 0, arg3: 0 }], ["CheckBattleWon", { var: { variable: 0x4001 } }], ["End"]], spawns: [{ x: at(0), y: at(1) }] });
    const a = t.join(undefined, { facing: "north" });
    t.step();
    t.press(a, t.BUTTON.interact);
    t.step();
    const me = t.session.world.get(a.welcome!.entityId)!;
    expect(ringSource(me.area)).toBe("60");
    // The person talked to stands in for the trainer.
    expect(t.session.world.all().filter((e) => e.kind === "npc" && e.area === me.area)).toHaveLength(1);
    t.knockOut();
    t.step(3);
    expect(t.session.world.get(a.welcome!.entityId)).toMatchObject({ area: "60", x: at(0), y: at(1) });
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save).toMatchObject({ area: "60", vars: { "16385": 1 } });
  });

  it("a save during the fight keeps the place the player left, never the ring", () => {
    const t = arenaSetup({ indoor: true, trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)] });
    const a = t.join();
    t.step(8);
    t.untilStart(a);
    t.idle(a, 3);
    const saves = a.saves();
    expect(saves.length).toBeGreaterThan(0);
    for (const s of saves) expect(s.save).toMatchObject({ area: "60", x: at(1), y: at(1) });
  });

  it("each player fights in a ring of their own", () => {
    const t = arenaSetup({
      indoor: true,
      trainers: [trainer(1, ["sentret"]), trainer(2, ["sentret"])],
      npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5), trainerNpc(1, 8, 5, 2, FACING.north, 5)],
      spawns: [{ x: at(1), y: at(1) }, { x: at(8), y: at(1) }],
    });
    const a = t.join("Ana");
    const b = t.join("Bia");
    t.step(8);
    t.untilStart(a);
    t.untilStart(b);
    const areaA = t.session.world.get(a.welcome!.entityId)!.area;
    const areaB = t.session.world.get(b.welcome!.entityId)!.area;
    expect(ringSource(areaA)).toBe("60");
    expect(ringSource(areaB)).toBe("60");
    expect(areaA).not.toBe(areaB);
  });

  it("a loss blacks the player out to the Pokémon Center, not back to the building", () => {
    const t = arenaSetup({ indoor: true, trainers: [trainer(1, ["sentret"])], npcs: [trainerNpc(0, 1, 5, 1, FACING.north, 5)], party: [member("cyndaquil", 30, 1)] });
    const a = t.join(undefined, { respawn: { area: "99", x: at(3), y: at(3) } });
    t.step(8);
    t.untilStart(a);
    const id = a.welcome!.entityId;
    const mine = t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId))!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(5);
    expect(t.of(a, "trainerBattleEnd")).toEqual([expect.objectContaining({ result: "lost" })]);
    expect(t.session.world.get(id)).toMatchObject({ area: "99", x: at(3), y: at(3) });
  });
});
