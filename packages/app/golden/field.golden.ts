// Field probe (spec 025, T026): on the real extraction, one real example of each field-move obstacle
// is blocked before and passable after its move. Local only: `npm run golden`, never in CI.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, createRng, surfable, tileAt, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import { starterMember } from "@soulsilver/shared/progression";
import { applyNewGame, migrate } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";
import { fieldReport, type Check } from "./report";

const stages = process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const VECTORS: Record<Direction, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
const DIRS: Direction[] = ["north", "south", "west", "east"];
/** Cyndaquil, carrying only the move under test. */
const SPECIES = 155;

/** A place to stand: matrix tile, facing the obstacle. */
interface Spot {
  map: number;
  tx: number;
  ty: number;
  face: Direction;
}

const walkable = (lookup: WorldLookup, map: number, tx: number, ty: number) => {
  const m = lookup(String(map));
  const o = m?.origin ?? { tx: 0, ty: 0 };
  const c = m && tileAt(lookup, String(map), 0, (tx - o.tx) * 16 + 8, (ty - o.ty) * 16 + 8);
  return c !== undefined && c.category !== "blocked" && c.category !== "water" && c.category !== "ledge";
};

it("field moves clear real obstacles (spec 025)", () => {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) throw new Error(`Sem extração em ${stages}. Aponte SOULSILVER_DATA para a pasta stages.`);
  const logs: string[] = [];
  const data = loadServerData(stages, (m) => void logs.push(m));
  const lookup = data.world!;
  const start = readNewGameStart(stages, () => undefined)!;
  const progression = data.progression!;

  /** The first object running `script` with a free tile on one side and its own tile walkable once it is gone. */
  function objectSpot(script: number): Spot | undefined {
    for (let map = 0; map < 540; map++) {
      for (const n of data.scripts!.events(map)?.npcs ?? []) {
        if (n.script?.id !== script || !walkable(lookup, map, n.x, n.z)) continue;
        const face = DIRS.find((d) => walkable(lookup, map, n.x - STEP[d][0], n.z - STEP[d][1]));
        if (face) return { map, tx: n.x - STEP[face][0], ty: n.z - STEP[face][1], face };
      }
    }
    return undefined;
  }

  /** The first rock-climb tile with a walkable tile before it along its axis. */
  function wallSpot(): Spot | undefined {
    for (let map = 0; map < 540; map++) {
      const m = lookup(String(map));
      const grid = m?.levels[0];
      if (!grid) continue;
      const o = m.origin ?? { tx: 0, ty: 0 };
      for (let i = 0; i < grid.tiles.length; i++) {
        const b = grid.tiles[i]!.raw & 0xff;
        if (b !== 0x4b && b !== 0x4c) continue;
        const tx = (i % grid.width) + o.tx;
        const ty = Math.floor(i / grid.width) + o.ty;
        for (const face of b === 0x4b ? (["south", "north"] as const) : (["east", "west"] as const)) {
          if (walkable(lookup, map, tx - STEP[face][0], ty - STEP[face][1])) return { map, tx: tx - STEP[face][0], ty: ty - STEP[face][1], face };
        }
      }
    }
    return undefined;
  }

  /**
   * A whirlpool (0x11) or waterfall (0x13) tile with surfable water before it and land before that: stand on
   * the land facing the water (`face`), surf onto it, then face the current (`current`).
   */
  function currentSpot(behavior: number): (Spot & { current: Direction }) | undefined {
    for (let map = 0; map < 540; map++) {
      const m = lookup(String(map));
      const grid = m?.levels[0];
      if (!grid) continue;
      const o = m.origin ?? { tx: 0, ty: 0 };
      const at = (tx: number, ty: number) => tileAt(lookup, String(map), 0, (tx - o.tx) * 16 + 8, (ty - o.ty) * 16 + 8);
      for (let i = 0; i < grid.tiles.length; i++) {
        if ((grid.tiles[i]!.raw & 0xff) !== behavior) continue;
        const cx = (i % grid.width) + o.tx;
        const cy = Math.floor(i / grid.width) + o.ty;
        for (const current of DIRS) {
          const wx = cx - STEP[current][0];
          const wy = cy - STEP[current][1];
          if (!surfable(at(wx, wy))) continue;
          const face = DIRS.find((d) => walkable(lookup, map, wx - STEP[d][0], wy - STEP[d][1]));
          if (face) return { map, tx: wx - STEP[face][0], ty: wy - STEP[face][1], face, current };
        }
      }
    }
    return undefined;
  }

  /** Blocked before, then the move, then past the obstacle: what did not hold, or undefined. With `current`, the player surfs out first. */
  function probe(spot: Spot & { current?: Direction }, moves: number[], badgeSet: number): string | undefined {
    const session = createSession({ seed: 1, world: lookup, log: (m) => void logs.push(m), clock: () => "2026-11-04T12:00:00.000Z", newToken: () => "field", combat: data.combat, companion: data.companion, progression, items: data.items, wild: data.wild, scripts: data.scripts, devTools: true });
    const created = migrate({ schemaVersion: 1, name: "Field", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-04T12:00:00.000Z", rev: 0 });
    if (!created.ok) throw new Error(created.message);
    const member = { ...starterMember(progression.species(SPECIES)!, progression.levelUp(SPECIES), createRng(1), 50), moves };
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => void got.push(m as ServerMessage));
    session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...applyNewGame(created.save, start), party: [member], badgeSet } });
    const welcome = got.find((m) => m.type === "welcome");
    if (welcome?.type !== "welcome") return `o servidor recusou o save: ${JSON.stringify(got.at(-1))}`;
    client.send({ type: "debugScript", on: true });
    client.send({ type: "debugWarp", map: spot.map, tx: spot.tx, ty: spot.ty });
    let seq = 0;
    let read = 0;
    const tick = (dir: Direction | null, buttons = 0) => {
      client.send({ type: "input", seq: ++seq, move: dir ? VECTORS[dir] : { x: 0, y: 0 }, run: false, buttons });
      session.step();
      for (; read < got.length; read++) {
        const m = got[read]!;
        if (m.type === "script") client.send({ type: "script-answer", id: m.id, answer: 0 });
      }
    };
    const me = () => session.world.get(welcome.entityId)!;
    const o = lookup(String(spot.map))?.origin ?? { tx: 0, ty: 0 };
    const tile = () => ({ tx: Math.floor(me().x / 16) + o.tx, ty: Math.floor(me().y / 16) + o.ty });
    for (let i = 0; i < 3; i++) tick(null);
    if (me().area !== String(spot.map)) return `o warp para o mapa ${spot.map} falhou`;
    let face = spot.face;
    if (spot.current) {
      tick(spot.face);
      client.send({ type: "field-mount", mode: "surf" });
      tick(null);
      if (me().data["mode"] !== "surf") return "não montou o surf na água antes da correnteza";
      face = spot.current;
    }
    const from = tile();
    for (let i = 0; i < 20; i++) tick(face);
    if (tile().tx !== from.tx || tile().ty !== from.ty) return `passou antes do golpe (${tile().tx}, ${tile().ty})`;
    tick(null, BUTTON.interact);
    for (let i = 0; i < 300; i++) tick(null);
    for (let i = 0; i < 40; i++) tick(face);
    const moved = Math.abs(tile().tx - from.tx) + Math.abs(tile().ty - from.ty);
    return moved >= 1 ? undefined : `continua bloqueado depois do golpe (${tile().tx}, ${tile().ty})`;
  }

  const cases: { name: string; spot: (Spot & { current?: Direction }) | undefined; moves: number[]; badge: number }[] = [
    { name: "árvore de Cut", spot: objectSpot(10000), moves: [15], badge: 1 },
    { name: "rocha de Rock Smash", spot: objectSpot(10001), moves: [249], badge: 0 },
    { name: "rocha de Strength", spot: objectSpot(10002), moves: [70], badge: 2 },
    { name: "parede de Rock Climb", spot: wallSpot(), moves: [431], badge: 15 },
    // Faced from the water: Surf too.
    { name: "redemoinho", spot: currentSpot(0x11), moves: [57, 250], badge: 6 },
    { name: "cachoeira", spot: currentSpot(0x13), moves: [57, 127], badge: 7 },
  ];
  const checks: Check[] = cases.map((c) => {
    if (!c.spot) return { name: c.name, failed: "nenhum exemplo nos dados extraídos" };
    const where = ` (mapa ${c.spot.map}, ${c.spot.tx}, ${c.spot.ty} olhando ${c.spot.face})`;
    const noBadge = probe(c.spot, c.moves, 0xffff & ~(1 << c.badge));
    return { name: c.name + where, failed: probe(c.spot, c.moves, 0xffff) ?? (noBadge === undefined ? "passou sem a insígnia" : undefined) };
  });
  console.log(fieldReport(checks));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});

type Data = ReturnType<typeof loadServerData>;
type Record_ = NonNullable<ReturnType<NonNullable<Data["wild"]>["encounter"]>>;

/** The first map whose encounter record passes `wants`, with at least `water` surfable tiles and a walkable tile facing them. */
function shore(data: Data, wants: (r: Record_) => boolean, water: number): Spot | undefined {
  const lookup = data.world!;
  for (let map = 0; map < 540; map++) {
    const m = lookup(String(map));
    const record = m?.encounters === undefined ? undefined : data.wild!.encounter(m.encounters);
    const grid = m?.levels[0];
    if (!m || !grid || !record || !wants(record) || grid.tiles.filter((t) => surfable(t)).length < water) continue;
    const o = m.origin ?? { tx: 0, ty: 0 };
    for (let i = 0; i < grid.tiles.length; i++) {
      const tx = (i % grid.width) + o.tx;
      const ty = Math.floor(i / grid.width) + o.ty;
      if (!walkable(lookup, map, tx, ty)) continue;
      const face = DIRS.find((d) => surfable(tileAt(lookup, String(map), 0, (tx + STEP[d][0] - o.tx) * 16 + 8, (ty + STEP[d][1] - o.ty) * 16 + 8)));
      if (face) return { map, tx, ty, face };
    }
  }
  return undefined;
}

/** A session with the player at `spot`, turned to the water without stepping in (water stops a walker). */
function play(data: Data, spot: Spot, name: string, extra: object, moves = [57]) {
  const logs: string[] = [];
  const progression = data.progression!;
  const session = createSession({ seed: 1, world: data.world!, log: (m) => void logs.push(m), clock: () => "2026-11-04T12:00:00.000Z", newToken: () => name, combat: data.combat, companion: data.companion, progression, items: data.items, wild: data.wild, scripts: data.scripts, devTools: true });
  const created = migrate({ schemaVersion: 1, name, character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-04T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const member = { ...starterMember(progression.species(SPECIES)!, progression.levelUp(SPECIES), createRng(1), 50), moves };
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => void got.push(m as ServerMessage));
  session.connect(server);
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...applyNewGame(created.save, readNewGameStart(stages, () => undefined)!), party: [member], badgeSet: 0xffff, ...extra } });
  client.send({ type: "debugScript", on: true });
  client.send({ type: "debugWarp", map: spot.map, tx: spot.tx, ty: spot.ty });
  let seq = 0;
  const tick = (dir: Direction | null = null) => {
    client.send({ type: "input", seq: ++seq, move: dir ? VECTORS[dir] : { x: 0, y: 0 }, run: false, buttons: 0 });
    session.step();
  };
  for (let i = 0; i < 3; i++) tick();
  tick(spot.face);
  return { session, client, got, tick };
}

const extracted = () => {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) throw new Error(`Sem extração em ${stages}. Aponte SOULSILVER_DATA para a pasta stages.`);
  return loadServerData(stages, () => undefined);
};

it("surfing on real water meets the map's surf table (spec 025, US2)", () => {
  const data = extracted();
  const lookup = data.world!;
  // A real body of water: wild ones spawn out of view.
  const spot = shore(data, (r) => !!r.surf?.length && !!r.rates.surfing, 200);
  const checks: Check[] = [];
  if (!spot) checks.push({ name: "surf", failed: "nenhuma margem com tabela de surf nos dados extraídos" });
  else {
    const table = new Set(data.wild!.encounter(lookup(String(spot.map))!.encounters!)!.surf!.map((s) => s.species));
    const { session, client, got, tick } = play(data, spot, "Surf", {});
    client.send({ type: "field-mount", mode: "surf" });
    tick();
    const surfing = got.some((m) => m.type === "player-mode" && m.mode === "surf");
    // Every wild Pokémon that appears on the water in 2 minutes.
    const seen = new Set<number>();
    const species: number[] = [];
    for (let i = 0; i < 20 * 120; i++) {
      tick();
      for (const e of session.world.all()) {
        if (e.kind !== "pokemon" || seen.has(e.id) || session.combat?.get(e.id)?.owner !== "wild") continue;
        seen.add(e.id);
        if (surfable(tileAt(lookup, e.area, 0, e.x, e.y))) species.push(e.data["species"] as number);
      }
    }
    const strays = species.filter((s) => !table.has(s));
    const where = ` (mapa ${spot.map}, ${spot.tx}, ${spot.ty} olhando ${spot.face}; ${species.length} encontros na água)`;
    checks.push({ name: "surf" + where, failed: !surfing ? "não montou" : species.length === 0 ? "nenhum encontro na água" : strays.length ? `espécies fora da tabela de surf: ${strays.join(", ")}` : undefined });
  }
  console.log(fieldReport(checks));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});

it("fishing on real water hooks each rod's species from the map's table (spec 025, US3)", () => {
  const data = extracted();
  const lookup = data.world!;
  const RODS = { old: 445, good: 446, super: 447 } as const;
  const spot = shore(data, (r) => (["oldRod", "goodRod", "superRod"] as const).every((k) => !!r[k]?.length && !!r.rates[k]), 1);
  const checks: Check[] = [];
  if (!spot) checks.push({ name: "pesca", failed: "nenhuma margem com as três tabelas de pesca nos dados extraídos" });
  else {
    const record = data.wild!.encounter(lookup(String(spot.map))!.encounters!)!;
    const { session, client, got, tick } = play(data, spot, "Pesca", { bag: Object.values(RODS).map((item) => ({ item, count: 1 })) });
    for (const rod of Object.keys(RODS) as (keyof typeof RODS)[]) {
      const table = new Set(record[`${rod}Rod`]!.map((s) => s.species));
      const species: number[] = [];
      let casts = 0;
      // Casts until 10 hooks, reeling in on the bite; each catch is taken off the water before the next.
      while (species.length < 10 && casts < 100) {
        casts++;
        got.length = 0;
        client.send({ type: "field-fish", rod });
        tick();
        for (let i = 0; i < 200 && !got.some((m) => m.type === "field-fishing" && m.state !== "waiting"); i++) tick();
        if (!got.some((m) => m.type === "field-fishing" && m.state === "bite")) continue;
        const before = new Set(session.world.all().map((e) => e.id));
        client.send({ type: "field-reel" });
        tick();
        const fish = session.world.all().find((e) => !before.has(e.id) && e.kind === "pokemon");
        if (fish) {
          species.push(fish.data["species"] as number);
          session.combat?.remove(session.world, fish.id);
          session.world.remove(fish.id);
        }
      }
      const strays = species.filter((s) => !table.has(s));
      const where = ` ${rod} (mapa ${spot.map}, ${spot.tx}, ${spot.ty} olhando ${spot.face}; ${species.length} fisgados em ${casts} lances)`;
      checks.push({ name: "pesca" + where, failed: species.length === 0 ? "nada fisgado" : strays.length ? `espécies fora da tabela da vara: ${strays.join(", ")}` : undefined });
    }
  }
  console.log(fieldReport(checks));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});

it("a real dark cave is lit by Flash, and Fly lists and reaches only visited points (spec 025, US4)", () => {
  const data = extracted();
  const lookup = data.world!;
  const darkWeather = [11, 12];
  const checks: Check[] = [];
  /** The walkable tile nearest the middle of the first map that passes `wants` (corners are often the void around a cave). */
  function ground(wants: (map: number) => boolean): Spot | undefined {
    for (let map = 0; map < 540; map++) {
      const m = lookup(String(map));
      const grid = m?.levels[0];
      if (!m || !grid || !wants(map)) continue;
      const o = m.origin ?? { tx: 0, ty: 0 };
      const tiles = grid.tiles.map((_, i) => ({ tx: (i % grid.width) + o.tx, ty: Math.floor(i / grid.width) + o.ty, i }));
      const middle = (t: { i: number }) => Math.hypot((t.i % grid.width) - grid.width / 2, Math.floor(t.i / grid.width) - grid.height / 2);
      const best = tiles.filter((t) => walkable(lookup, map, t.tx, t.ty)).sort((a, b) => middle(a) - middle(b))[0];
      if (best) return { map, tx: best.tx, ty: best.ty, face: "south" };
    }
    return undefined;
  }

  const cave = ground((map) => darkWeather.includes(lookup(String(map))?.weather ?? -1));
  if (!cave) checks.push({ name: "caverna escura", failed: "nenhum mapa com clima de escuridão nos dados extraídos" });
  else {
    const { client, got, tick } = play(data, cave, "Flash", {}, [148]);
    const lit = () => got.filter((m) => m.type === "field-lit").at(-1);
    client.send({ type: "field-use", move: "flash" });
    tick();
    const on = lit();
    client.send({ type: "debugWarp", map: 60, tx: 695, ty: 398 });
    for (let i = 0; i < 3; i++) tick();
    const off = lit();
    const where = ` (mapa ${cave.map}, ${cave.tx}, ${cave.ty}, clima ${lookup(String(cave.map))?.weather})`;
    checks.push({ name: "caverna escura" + where, failed: on?.type !== "field-lit" || !on.lit ? "Flash não iluminou" : off?.type !== "field-lit" || off.lit ? "a luz não apagou ao sair" : undefined });
  }

  const points = data.scripts?.flyPoints ?? [];
  const town = points[0] && ground((map) => map === points[0]!.map && lookup(String(map))?.areaType === "outdoor");
  if (!town || points.length < 3) checks.push({ name: "Fly", failed: "fly-points.json sem pontos suficientes ou sem cidade aberta" });
  else {
    const visited = [String(points[0]!.map), String(points[2]!.map)];
    const { session, client, got, tick } = play(data, town, "Fly", { flyPoints: visited }, [19]);
    client.send({ type: "field-use", move: "fly" });
    tick();
    const listed = got.find((m) => m.type === "field-fly-map");
    const areas = listed?.type === "field-fly-map" ? listed.points.map((p) => p.area).sort() : [];
    client.send({ type: "field-fly", area: visited[1]! });
    for (let i = 0; i < 3; i++) tick();
    const me = session.world.all().find((e) => e.kind === "player")!;
    const landed = me.area === visited[1] && walkable(lookup, Number(me.area), Math.floor(me.x / 16) + (lookup(me.area)?.origin?.tx ?? 0), Math.floor(me.y / 16) + (lookup(me.area)?.origin?.ty ?? 0));
    const name = ` (visitados ${visited.join(", ")} de ${points.length} pontos; pousou em ${me.area})`;
    checks.push({ name: "Fly" + name, failed: areas.join() !== [...visited].sort().join() ? `lista ${areas.join(", ")}` : !landed ? "não pousou num tile livre do ponto" : undefined });
  }
  console.log(fieldReport(checks));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});
