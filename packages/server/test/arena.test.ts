import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ArenaCombatant, ArenaSpec, ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { buildAiData, BUNDLED_AI_CONTENT } from "../src/ai-loader";
import { ARENA_AREA } from "../src/arena";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { createMemoryConnectionPair } from "../src/connection";
import { buildTrainerData } from "../src/trainer-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { RING_SPOTS, type CollisionMap } from "@soulsilver/shared/game";
import { flatWorld, setup } from "./harness";
import { trainer } from "./trainer-fixture";
import { scriptData } from "./scripts-fixture";
import { wildData } from "./wild-fixture";

// The dev arena: the player's trainer and team against an NPC trainer (with a team of the tester's choosing)
// or wild Pokémon, fighting with the AI or standing still as targets. Synthetic species and moves (principle II).

const save = { schemaVersion: 1, name: "Slot", character: "male", area: "a", x: 24, y: 24, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 };
const cyndaquil = { species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.ember.id, MOVES.tackle.id] };
const chikorita = { species: SPECIES.chikorita.id, level: 8, moves: [MOVES.tackle.id] };
const wild = (behavior: "ai" | "idle", team: ArenaCombatant[] = [chikorita]): ArenaSpec => ({ trainer: { name: "Tester", character: "female" }, team: [cyndaquil], foe: { kind: "wild", behavior, team } });

function options(over: Parameters<typeof setup>[0] = {}): Parameters<typeof setup>[0] {
  const ai = buildAiData(BUNDLED_AI_CONTENT);
  const trainers = buildTrainerData({ trainers: [trainer(7, ["sentret"])], classes: [{ id: 5, prizeBase: 4, music: "trainer" }], messages: [], learnsets: [] }, ai.profiles.map((p) => p.id));
  return { scripts: scriptData([], {}), combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), ai, trainers, wild: wildData(), devArena: true, ...over };
}

function enter(over: Parameters<typeof setup>[0], spec: unknown) {
  const t = setup(options(over));
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => got.push(m as ServerMessage));
  t.session.connect(server);
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, arena: spec });
  const welcome = got.find((m): m is Extract<ServerMessage, { type: "welcome" }> => m.type === "welcome");
  let seq = 0;
  const step = (n: number, buttons = 0) => {
    for (let i = 0; i < n; i++) {
      client.send({ type: "input", seq: seq++, move: { x: 0, y: 0 }, run: false, buttons });
      t.session.step();
    }
  };
  const foes = () => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] !== String(welcome?.playerId));
  return { ...t, client, got, welcome, step, foes };
}

describe("dev arena", () => {
  it("puts the player's own trainer, with the arena's team, on the arena field", () => {
    const t = enter({}, wild("idle"));
    const me = t.session.world.get(t.welcome!.entityId)!;
    expect(me).toMatchObject({ kind: "player", area: ARENA_AREA, data: { name: "Tester", character: "female" } });
    const party = t.got.findLast((m) => m.type === "party");
    expect(party?.type === "party" ? party.members.map((m) => [m.species, m.level]) : []).toEqual([[SPECIES.cyndaquil.id, 10]]);
  });

  it("wild, idle: the foes stand still as targets", () => {
    const t = enter({}, wild("idle", [chikorita, chikorita]));
    const before = t.foes().map((e) => [e.x, e.y]);
    t.step(60, 1 << 5);
    expect(t.foes()).toHaveLength(2);
    expect(t.foes().map((e) => [e.x, e.y])).toEqual(before);
    const events = t.got.flatMap((m) => (m.type === "combat-event" ? m.events : []));
    expect(events.some((e) => t.foes().some((f) => f.id === e.attacker))).toBe(false);
  });

  it("wild, AI: the foes are wild Pokémon the AI drives", () => {
    const t = enter({}, wild("ai"));
    const foe = t.foes()[0]!;
    expect(t.session.combat?.get(foe.id)).toMatchObject({ species: SPECIES.chikorita.id, owner: "wild" });
    // The AI walks it about; an idle target never moves.
    const from = { x: foe.x, y: foe.y };
    t.step(400);
    const now = t.session.world.get(foe.id);
    expect(now && (now.x !== from.x || now.y !== from.y)).toBe(true);
  });

  it("NPC trainer: its battle starts with the team the tester chose", () => {
    const t = enter({}, { trainer: { name: "Tester", character: "male" }, team: [cyndaquil], foe: { kind: "trainer", trainer: 7, team: [chikorita] } });
    t.step(200);
    expect(t.got).toContainEqual(expect.objectContaining({ type: "trainerBattleStart", trainerId: 7 }));
    const sent = t.foes().map((e) => t.session.combat?.get(e.id)?.species);
    expect(sent).toEqual([SPECIES.chikorita.id]);
  });

  it("a lost fight brings the player back to the arena's field, not to the story's home", () => {
    const t = enter({}, { trainer: { name: "Tester", character: "male" }, team: [cyndaquil], foe: { kind: "trainer", trainer: 7, team: [chikorita] } });
    t.step(200);
    const mine = t.session.world.all().find((e) => t.session.combat?.get(e.id)?.owner === t.welcome!.playerId)!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(200);
    expect(t.got).toContainEqual(expect.objectContaining({ type: "trainerBattleEnd", result: "lost" }));
    expect(t.session.world.get(t.welcome!.entityId)?.area).toBe(ARENA_AREA);
  });

  it("never sends saves: the arena does not touch the player's progress", () => {
    const t = enter({}, wild("idle"));
    t.step(700);
    t.session.close("closed-by-host");
    expect(t.got.filter((m) => m.type === "save")).toHaveLength(0);
  });

  it("refuses a protocol 17 client, whose arena had the old { a, b } shape, with a version error (protocol 18)", () => {
    const t = setup(options());
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => got.push(m as ServerMessage));
    t.session.connect(server);
    client.send({ type: "hello", protocolVersion: 17, save, arena: wild("idle") });
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(18);
    expect(got).toContainEqual(expect.objectContaining({ type: "reject", code: "protocol-mismatch" }));
  });

  it("is refused without the dev flag", () => {
    const t = enter({ devArena: false }, wild("idle"));
    expect(t.got).toContainEqual(expect.objectContaining({ type: "reject", code: "invalid-message" }));
  });

  it("refuses an unknown species, move or trainer, leaving nothing in the world", () => {
    const cases: [unknown, RegExp][] = [
      [{ ...wild("idle"), team: [{ species: 999, level: 5, moves: [MOVES.tackle.id] }] }, /999/],
      [wild("ai", [{ species: SPECIES.chikorita.id, level: 5, moves: [9999] }]), /9999/],
      [{ ...wild("idle"), foe: { kind: "trainer", trainer: 404, team: [chikorita] } }, /404/],
    ];
    for (const [spec, mention] of cases) {
      const t = enter({}, spec);
      const reject = t.got.find((m) => m.type === "reject");
      expect(reject).toMatchObject({ code: "invalid-message" });
      expect(reject?.type === "reject" ? reject.message : "").toMatch(mention);
      expect(t.session.world.all()).toHaveLength(0);
    }
  });

  it("removes the player and the foes when a guest leaves the arena", () => {
    const t = setup(options());
    t.connect("Host");
    const [server, client] = createMemoryConnectionPair();
    t.session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, arena: wild("idle", [chikorita, chikorita]) });
    expect(t.session.world.all().filter((e) => e.area === ARENA_AREA).length).toBeGreaterThanOrEqual(3);
    client.send({ type: "leave" });
    expect(t.session.world.all().filter((e) => e.area === ARENA_AREA)).toEqual([]);
  });
});

describe("dev arena in a ring built from an indoor map (item V.3)", () => {
  const grid: CollisionMap = { width: 20, height: 20, tiles: Array.from({ length: 400 }, () => ({ category: "free" as const, raw: 0 })) };
  // 52 is a building, 53 a route; anything else is not in the extraction.
  const world = (id: string) => (id === "52" ? { ...flatWorld(grid)(id)!, areaType: "indoor" as const } : id === "53" ? { ...flatWorld(grid)(id)!, areaType: "outdoor" as const } : undefined);
  const trainerSpec = (ring: number): ArenaSpec => ({ trainer: { name: "Tester", character: "male" }, team: [cyndaquil], foe: { kind: "trainer", trainer: 7, team: [chikorita] }, ring });

  it("puts the player in a ring of the chosen map, west, with the wild foes inside it", () => {
    const t = enter({ world }, { ...wild("idle", [chikorita, chikorita]), ring: 52 });
    const me = t.session.world.get(t.welcome!.entityId)!;
    expect(me.area).toMatch(/^ring:52:\d+$/);
    expect({ x: me.x, y: me.y }).toEqual(RING_SPOTS.player);
    expect(t.foes().map((e) => e.area)).toEqual([me.area, me.area]);
  });

  it("fights a trainer battle in that same ring, without a ring inside the ring", () => {
    const t = enter({ world }, trainerSpec(52));
    const area = t.session.world.get(t.welcome!.entityId)!.area;
    t.step(200);
    const start = t.got.find((m): m is Extract<ServerMessage, { type: "trainerBattleStart" }> => m.type === "trainerBattleStart");
    expect(start?.arena.area).toBe(area);
    expect(t.session.world.get(t.welcome!.entityId)!.area).toBe(area);
  });

  it("a lost fight brings the player back to the ring, where the arena started", () => {
    const t = enter({ world }, trainerSpec(52));
    const area = t.session.world.get(t.welcome!.entityId)!.area;
    t.step(200);
    const mine = t.session.world.all().find((e) => t.session.combat?.get(e.id)?.owner === t.welcome!.playerId)!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(200);
    expect(t.got).toContainEqual(expect.objectContaining({ type: "trainerBattleEnd", result: "lost" }));
    expect(t.session.world.get(t.welcome!.entityId)?.area).toBe(area);
  });

  it("refuses a map that is not indoors or is not in the extraction, leaving nothing in the world", () => {
    for (const ring of [53, 99]) {
      const t = enter({ world }, { ...wild("idle"), ring });
      expect(t.got.find((m) => m.type === "reject")).toMatchObject({ code: "invalid-message" });
      expect(t.session.world.all()).toEqual([]);
    }
  });
});
