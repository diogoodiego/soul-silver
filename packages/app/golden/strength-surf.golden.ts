// Strength and Surf places (item 031.4), on the real extraction: Route 42's coord trigger (scr_seq 252, var 0x4091)
// hands over HM04 at Mt. Mortar's entrance, and Union Cave B2F's Lapras (scr_seq 58) shows only on Fridays and
// starts its wild battle. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, createRng, type ServerMessage } from "@soulsilver/shared/game";
import { starterMember } from "@soulsilver/shared/progression";
import { applyNewGame, migrate } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";

const stages = process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const ROUTE_42 = 44;
const STRENGTH_SCENE = 0x4091;
const HM04 = 423;
const UNION_CAVE_B2F = 154;
const LAPRAS_HIDDEN = 778;
const LAPRAS = 131;

function play(opts: { now: Date; map: number; tile: { x: number; z: number }; facing: "north" | "west"; move: { x: number; y: number }; vars?: Record<number, number>; interact?: boolean }) {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) throw new Error(`Sem extração em ${stages}. Aponte SOULSILVER_DATA para a pasta stages.`);
  const logs: string[] = [];
  const data = loadServerData(stages, (m) => void logs.push(m));
  const start = readNewGameStart(stages, () => undefined)!;
  const progression = data.progression!;
  const session = createSession({ seed: 1, world: data.world!, log: (m) => void logs.push(m), clock: () => opts.now.toISOString(), now: () => opts.now, newToken: () => "s", combat: data.combat, companion: data.companion, progression, items: data.items, wild: data.wild, scripts: data.scripts, trainers: data.trainers, devTools: true });
  const created = migrate({ schemaVersion: 1, name: "Strength", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: opts.now.toISOString(), rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const game = applyNewGame(created.save, start);
  const member = starterMember(progression.species(155)!, progression.levelUp(155), createRng(1), 30);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => void got.push(m as ServerMessage));
  session.connect(server);
  const o = data.world!(String(opts.map))!.origin!;
  const at = { area: String(opts.map), x: (opts.tile.x - o.tx) * 16 + 8, y: (opts.tile.z - o.ty) * 16 + 8, facing: opts.facing, playTimeMs: 1000, rev: 1 };
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...game, ...at, party: [member], badgeSet: 15, vars: { ...game.vars, ...opts.vars } } });
  if (got.find((m) => m.type === "welcome")?.type !== "welcome") throw new Error(`o servidor recusou o save: ${JSON.stringify(got.at(-1))}`);
  let seq = 0;
  let read = 0;
  let lapras = false;
  for (let i = 0; i < 20 * 30; i++) {
    const press = opts.interact && i === 10 ? BUTTON.interact : 0;
    client.send({ type: "input", seq: ++seq, move: i < 20 ? opts.move : { x: 0, y: 0 }, run: false, buttons: press });
    session.step();
    lapras ||= session.world.all().some((e) => e.kind === "pokemon" && e.data["species"] === LAPRAS && e.data["owner"] !== "player");
    for (; read < got.length; read++) {
      const m = got[read]!;
      if (m.type === "script") client.send({ type: "script-answer", id: m.id, answer: 0 });
    }
  }
  session.close("closed-by-host");
  const save = got.filter((m) => m.type === "save").at(-1)?.save ?? game;
  // The probe drops the player on Lapras's water without surfing (no surf state in a save): "cannot move" is that.
  return { save, lapras, scriptErrors: logs.filter((l) => /script/i.test(l) && !/cannot move after/.test(l)) };
}

it("Route 42's man hands over HM04 at Mt. Mortar's entrance (item 031.4)", () => {
  // The trigger column is x 434, z 172–176; walk west into it from the tile east of it.
  const r = play({ now: new Date(2026, 10, 15, 12), map: ROUTE_42, tile: { x: 435, z: 173 }, facing: "west", move: { x: -1, y: 0 } });
  expect(r.save.vars[STRENGTH_SCENE]).toBe(1);
  expect(r.save.bag.find((b) => b.item === HM04)?.count).toBe(1);
  expect(r.scriptErrors).toEqual([]);
});

it("Union Cave B2F's Lapras is there on Fridays only (item 031.4)", () => {
  // Person 3 at (18, 88): south of it facing north, then A.
  const sunday = play({ now: new Date(2026, 10, 15, 12), map: UNION_CAVE_B2F, tile: { x: 18, z: 89 }, facing: "north", move: { x: 0, y: 0 }, interact: true });
  expect(sunday.save.flags).toContain(LAPRAS_HIDDEN);
  expect(sunday.lapras).toBe(false);
  const friday = play({ now: new Date(2026, 10, 20, 12), map: UNION_CAVE_B2F, tile: { x: 18, z: 89 }, facing: "north", move: { x: 0, y: 0 }, interact: true });
  expect(friday.save.flags).not.toContain(LAPRAS_HIDDEN);
  expect(friday.lapras).toBe(true);
  expect([...sunday.scriptErrors, ...friday.scriptErrors]).toEqual([]);
});
