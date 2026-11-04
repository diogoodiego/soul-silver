// Field probe (spec 025, T026): on the real extraction, one real example of each field-move obstacle
// is blocked before and passable after its move. Local only: `npm run golden`, never in CI.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, createRng, tileAt, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
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

  /** Blocked before, then the move, then past the obstacle: what did not hold, or undefined. */
  function probe(spot: Spot, move: number, badgeSet: number): string | undefined {
    const session = createSession({ seed: 1, world: lookup, log: (m) => void logs.push(m), clock: () => "2026-11-04T12:00:00.000Z", newToken: () => "field", combat: data.combat, companion: data.companion, progression, items: data.items, wild: data.wild, scripts: data.scripts, devTools: true });
    const created = migrate({ schemaVersion: 1, name: "Field", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-04T12:00:00.000Z", rev: 0 });
    if (!created.ok) throw new Error(created.message);
    const member = { ...starterMember(progression.species(SPECIES)!, progression.levelUp(SPECIES), createRng(1), 50), moves: [move] };
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
    for (let i = 0; i < 20; i++) tick(spot.face);
    if (tile().tx !== spot.tx || tile().ty !== spot.ty) return `passou antes do golpe (${tile().tx}, ${tile().ty})`;
    tick(null, BUTTON.interact);
    for (let i = 0; i < 300; i++) tick(null);
    for (let i = 0; i < 40; i++) tick(spot.face);
    const moved = Math.abs(tile().tx - spot.tx) + Math.abs(tile().ty - spot.ty);
    return moved >= 1 ? undefined : `continua bloqueado depois do golpe (${tile().tx}, ${tile().ty})`;
  }

  const cases: { name: string; spot: Spot | undefined; move: number; badge: number }[] = [
    { name: "árvore de Cut", spot: objectSpot(10000), move: 15, badge: 1 },
    { name: "rocha de Rock Smash", spot: objectSpot(10001), move: 249, badge: 0 },
    { name: "rocha de Strength", spot: objectSpot(10002), move: 70, badge: 2 },
    { name: "parede de Rock Climb", spot: wallSpot(), move: 431, badge: 15 },
  ];
  const checks: Check[] = cases.map((c) => {
    if (!c.spot) return { name: c.name, failed: "nenhum exemplo nos dados extraídos" };
    const where = ` (mapa ${c.spot.map}, ${c.spot.tx}, ${c.spot.ty} olhando ${c.spot.face})`;
    const noBadge = probe(c.spot, c.move, 0xffff & ~(1 << c.badge));
    return { name: c.name + where, failed: probe(c.spot, c.move, 0xffff) ?? (noBadge === undefined ? "passou sem a insígnia" : undefined) };
  });
  // Waterfalls and whirlpools are faced from the water: they wait for surfing (US2).
  checks.push({ name: "redemoinho e cachoeira: dependem do surf (US2)" });
  console.log(fieldReport(checks));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});
