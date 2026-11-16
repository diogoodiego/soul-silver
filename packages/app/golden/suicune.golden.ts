// Suicune at Cianwood (item 031.2): on the real extraction, the scene of scr_seq 875 runs from its trigger once the
// Burned Tower set var 0x4076 to 1: Suicune shows, flees (flag 481) and Eusine comes. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { createRng, type ServerMessage } from "@soulsilver/shared/game";
import { starterMember } from "@soulsilver/shared/progression";
import { applyNewGame, migrate } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";

const stages = process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const CIANWOOD = 75;
const SIGHTINGS = 0x4076;
const SUICUNE_GONE = 481;

it("Suicune appears at Cianwood and flees, with Eusine (item 031.2)", () => {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) throw new Error(`Sem extração em ${stages}. Aponte SOULSILVER_DATA para a pasta stages.`);
  const logs: string[] = [];
  const data = loadServerData(stages, (m) => void logs.push(m));
  const start = readNewGameStart(stages, () => undefined)!;
  const progression = data.progression!;
  const trigger = data.scripts!.events(CIANWOOD)!.triggers.find((g) => g.variable === SIGHTINGS)!;
  const session = createSession({ seed: 1, world: data.world!, log: (m) => void logs.push(m), clock: () => "2026-11-15T12:00:00.000Z", newToken: () => "suicune", combat: data.combat, companion: data.companion, progression, items: data.items, wild: data.wild, scripts: data.scripts, trainers: data.trainers, devTools: true });
  const created = migrate({ schemaVersion: 1, name: "Suicune", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-15T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const game = applyNewGame(created.save, start);
  const member = starterMember(progression.species(155)!, progression.levelUp(155), createRng(1), 30);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => void got.push(m as ServerMessage));
  session.connect(server);
  // As the Burned Tower leaves it (scr_seq 24): one sighting so far, Suicune shown at Cianwood.
  const o = data.world!(String(CIANWOOD))!.origin!;
  const at = { area: String(CIANWOOD), x: (trigger.x - o.tx) * 16 + 8, y: (trigger.z + 2 - o.ty) * 16 + 8, facing: "north" as const, playTimeMs: 1000, rev: 1 };
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...game, ...at, party: [member], badgeSet: 15, vars: { ...game.vars, [SIGHTINGS]: 1 }, flags: game.flags.filter((f) => f !== SUICUNE_GONE) } });
  const welcome = got.find((m) => m.type === "welcome");
  if (welcome?.type !== "welcome") throw new Error(`o servidor recusou o save: ${JSON.stringify(got.at(-1))}`);
  let seq = 0;
  let read = 0;
  for (let i = 0; i < 20 * 60; i++) {
    client.send({ type: "input", seq: ++seq, move: i < 20 ? { x: 0, y: -1 } : { x: 0, y: 0 }, run: false, buttons: 0 });
    session.step();
    // Eusine's battle (trainer 498) is not under test: his Pokémon go down as they come out.
    for (const e of session.world.all()) if (e.kind === "pokemon" && e.data["owner"] === "trainer") session.combat!.get(e.id)!.hp = 0;
    for (; read < got.length; read++) {
      const m = got[read]!;
      if (m.type === "script") client.send({ type: "script-answer", id: m.id, answer: 0 });
    }
  }
  session.close("closed-by-host");
  const save = got.filter((m) => m.type === "save").at(-1)!.save;
  expect(save.flags).toContain(SUICUNE_GONE);
  expect(save.vars[SIGHTINGS]).toBe(2);
  expect(got.some((m) => m.type === "trainerBattleStart" && m.trainerId === 498)).toBe(true);
  expect(got.some((m) => m.type === "trainerBattleEnd" && m.result === "won")).toBe(true);
  expect(logs.filter((l) => /script/i.test(l))).toEqual([]);
});
