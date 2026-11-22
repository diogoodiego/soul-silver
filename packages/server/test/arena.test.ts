import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ArenaCombatant, ArenaSpec, ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { buildAiData, BUNDLED_AI_CONTENT } from "../src/ai-loader";
import { ARENA_AREA, LEADER_SPOT } from "../src/arena";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { createMemoryConnectionPair } from "../src/connection";
import { buildTrainerData } from "../src/trainer-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { computeStats } from "@soulsilver/shared/combat";
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

describe("dev arena with a gym leader at the end", () => {
  const FALKNER = 20;
  // Synthetic team, unlike any override of the spec; trainer 7 says a line when it loses.
  const leaderTeam = trainer(FALKNER, ["sentret", "chikorita"]).team.map((m) => ({ ...m, difficulty: 50, level: m.level + 6 }));
  const withLeader = (line: boolean, over: Parameters<typeof setup>[0] = {}): Parameters<typeof setup>[0] => {
    const records = [trainer(7, ["sentret"]), trainer(FALKNER, [], { team: leaderTeam })];
    const messages = line ? [{ trainer: 7, kind: 1, text: "0728:71" }] : [];
    return { trainers: buildTrainerData({ trainers: records, classes: [{ id: 5, prizeBase: 4, music: "trainer" }], messages, learnsets: [] }, buildAiData(BUNDLED_AI_CONTENT).profiles.map((p) => p.id)), ...over };
  };
  const trainerFirst: ArenaSpec = { trainer: { name: "Tester", character: "male" }, team: [{ ...cyndaquil, level: 60 }], foe: { kind: "trainer", trainer: 7, team: [chikorita] }, leader: FALKNER };
  type T = ReturnType<typeof enter>;
  const people = (t: T) => t.session.world.all().filter((e) => e.kind === "npc");
  const started = (t: T) => t.got.flatMap((m) => (m.type === "trainerBattleStart" ? [m.trainerId] : []));
  const foesOf = (t: T) => t.session.world.all().flatMap((e) => t.session.combat?.get(e.id) ?? []).filter((c) => c.owner === "trainer" || c.owner === "wild");
  const knockOut = (t: T) => foesOf(t).forEach((c) => (c.hp = 0));

  it("comes only once the trainer is beaten, with the story's team", () => {
    const t = enter(withLeader(false), trainerFirst);
    t.step(100);
    expect(started(t)).toEqual([7]);
    expect(people(t)).toEqual([]);
    knockOut(t);
    t.step(50);
    expect(people(t).map((e) => [e.area, e.data["sprite"]])).toEqual([[ARENA_AREA, 352]]);
    t.step(60);
    expect(started(t)).toEqual([7, FALKNER]);
    for (const [i, m] of leaderTeam.entries()) {
      const c = foesOf(t)[0]!;
      const last = i === leaderTeam.length - 1;
      const own = computeStats(c.species === SPECIES.sentret.id ? SPECIES.sentret.baseStats : SPECIES.chikorita.baseStats, m.level, { ivs: { hp: 6, attack: 6, defense: 6, speed: 6, specialAttack: 6, specialDefense: 6 } }).hp;
      // Its last one is the boss: a bar of its own and twice the HP.
      expect([c.boss, c.hp, c.stats.hp]).toEqual([last, own * (last ? 2 : 1), own * (last ? 2 : 1)]);
      expect(foesOf(t).map((c) => [c.species, c.level])).toEqual([[m.species, m.level]]);
      knockOut(t);
      t.step(50);
    }
    expect(t.got.filter((m) => m.type === "trainerBattleEnd" && m.result === "won")).toHaveLength(2);
    t.step(200);
    expect(started(t)).toEqual([7, FALKNER]);
  });

  it("waits for the beaten trainer's line to be closed", () => {
    const t = enter(withLeader(true), trainerFirst);
    t.step(100);
    knockOut(t);
    t.step(200);
    expect(people(t)).toHaveLength(1);
    expect(started(t)).toEqual([7]);
    t.client.send({ type: "trainer-ready" });
    t.step(60);
    expect(started(t)).toEqual([7, FALKNER]);
  });

  it("comes once every wild foe is down, in the ring too", () => {
    const grid: CollisionMap = { width: 20, height: 20, tiles: Array.from({ length: 400 }, () => ({ category: "free" as const, raw: 0 })) };
    const t = enter(withLeader(false, { world: (id) => ({ ...flatWorld(grid)(id)!, areaType: "indoor" as const }) }), { ...wild("idle", [chikorita, chikorita]), ring: 52, leader: FALKNER });
    const area = t.session.world.get(t.welcome!.entityId)!.area;
    t.step(60);
    foesOf(t)[0]!.hp = 0;
    t.step(60);
    expect(people(t)).toEqual([]);
    knockOut(t);
    t.step(100);
    expect(people(t).map((e) => ({ area: e.area, x: e.x, y: e.y }))).toEqual([{ area, ...RING_SPOTS.trainer }]);
    expect(started(t)).toEqual([FALKNER]);
  });

  it("does not come after a lost fight", () => {
    const t = enter(withLeader(false), trainerFirst);
    t.step(100);
    const mine = t.session.world.all().find((e) => t.session.combat?.get(e.id)?.owner === t.welcome!.playerId)!;
    t.session.combat!.get(mine.id)!.hp = 0;
    t.step(400);
    expect(t.got).toContainEqual(expect.objectContaining({ type: "trainerBattleEnd", result: "lost" }));
    expect(started(t)).toEqual([7]);
    expect(people(t)).toEqual([]);
  });

  it("refuses a leader who is not one or is not in the extraction, leaving nothing in the world", () => {
    for (const leader of [7, 21]) {
      const t = enter(withLeader(false), { ...wild("idle"), leader });
      expect(t.got.find((m) => m.type === "reject")).toMatchObject({ code: "invalid-message", message: expect.stringMatching(String(leader)) as string });
      expect(t.session.world.all()).toEqual([]);
    }
  });

  it("leaves with the player", () => {
    const t = setup(options(withLeader(false)));
    t.connect("Host");
    const [server, client] = createMemoryConnectionPair();
    t.session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, arena: { ...wild("idle"), leader: FALKNER } });
    for (const e of t.session.world.all()) {
      const c = t.session.combat?.get(e.id);
      if (c?.owner === "wild") c.hp = 0;
    }
    t.session.step();
    expect(t.session.world.all().some((e) => e.kind === "npc" && e.area === ARENA_AREA)).toBe(true);
    client.send({ type: "leave" });
    expect(t.session.world.all().filter((e) => e.area === ARENA_AREA)).toEqual([]);
  });
});

describe("dev arena with a legendary at the end", () => {
  const RAIKOU = SPECIES.raikou.id;
  const raikou = (t: ReturnType<typeof enter>) => t.session.world.all().filter((e) => e.data["species"] === RAIKOU);
  const knockOut = (t: ReturnType<typeof enter>) => t.foes().forEach((e) => (t.session.combat!.get(e.id)!.hp = 0));

  it("comes once every wild foe is down, at its level, where the leader would; only once", () => {
    const t = enter({}, { ...wild("idle", [chikorita, chikorita]), legendary: RAIKOU });
    t.step(60);
    expect(raikou(t)).toEqual([]);
    knockOut(t);
    for (let i = 0; i < 100 && raikou(t).length === 0; i++) t.step(1);
    expect(raikou(t)).toMatchObject([{ area: ARENA_AREA, data: { level: 40, owner: "wild", move1: MOVES.tackle.id } }]);
    expect(Math.hypot(raikou(t)[0]!.x - LEADER_SPOT.x, raikou(t)[0]!.y - LEADER_SPOT.y)).toBeLessThan(16);
    t.session.combat!.get(raikou(t)[0]!.id)!.hp = 0;
    t.step(100);
    expect(raikou(t)).toHaveLength(1);
  });

  it("comes after a beaten trainer, once the battle is over", () => {
    const t = enter({}, { trainer: { name: "Tester", character: "male" }, team: [{ ...cyndaquil, level: 60 }], foe: { kind: "trainer", trainer: 7, team: [chikorita] }, legendary: RAIKOU });
    t.step(100);
    expect(raikou(t)).toEqual([]);
    knockOut(t);
    t.step(150);
    expect(t.got).toContainEqual(expect.objectContaining({ type: "trainerBattleEnd", result: "won" }));
    expect(raikou(t)).toHaveLength(1);
  });

  it("refuses a species that is not legendary, or not in the extraction", () => {
    for (const legendary of [152, 249]) {
      const t = enter({}, { ...wild("idle"), legendary });
      expect(t.got.find((m) => m.type === "reject")).toMatchObject({ code: "invalid-message", message: expect.stringMatching(String(legendary)) as string });
    }
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
