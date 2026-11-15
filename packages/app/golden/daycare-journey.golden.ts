// Day Care journey probe (spec 029, item 029.6, layer 3), on the real extraction and one headless session: leave a
// compatible pair with the lady (map 331, scr_seq 265), walk in the room until the man holds an egg, take it from him
// on Route 34, walk back in until it hatches through the original hatch script (std 2021). The baby's species and
// moves must follow the rules from the ROM's data. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import { migrate, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages } from "./obtainable";

const stages = defaultStages();
const DAY_CARE = 331;
const ROUTE_34 = 38;
/** In front of the lady's counter (she is at 3,5). */
const COUNTER = { tx: 3, ty: 7 };
/** The man stands at (365,410) on Route 34, west of the Day Care door (368,410). */
const MAN = { tx: 365, ty: 411 };
const PIDGEY = 16;
const PIDGEOTTO = 17;
const SENTRET = 161;
const RATTATA = 19;

if (!existsSync(join(stages, "maps"))) throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app e aponte SOULSILVER_DATA para a pasta stages.`);
const data = loadServerData(stages, () => undefined);
const p = data.progression!;
const info = (species: number) => p.species(species)!;
const machineMoves = (species: number) => p.machines(species).flatMap((m) => p.machine(m)?.move ?? []);
const levelOne = (species: number) => p.levelUp(species).filter((l) => l.level <= 1).map((l) => l.move);

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const member = (species: number, level: number, moves: number[], gender: "male" | "female"): PartyMember => ({ species, level, moves, hp: 30, friendship: 70, experience: expForLevel(info(species).growthRate, level), ivs: stats(20), evs: stats(0), nature: 0, gender });

it("leaves a pair at the Day Care, takes the egg from the man and walks until a Pidgey hatches by the rules", () => {
  // The father knows a Pidgey egg move and a machine move; both know a level-up move of Pidgey.
  const eggMove = p.eggMoves(PIDGEY)[0]!;
  const machine = machineMoves(PIDGEY).find((m) => !levelOne(PIDGEY).includes(m))!;
  const shared = p.levelUp(PIDGEY).find((l) => l.level > 1)!.move;
  const father = member(PIDGEY, 15, [eggMove, machine, shared], "male");
  const mother = member(PIDGEOTTO, 20, [shared, 33], "female");

  const log: string[] = [];
  const session = createSession({ seed: 7, world: data.world!, log: (l) => log.push(l), clock: () => "2026-11-14T12:00:00.000Z", newToken: () => "t", combat: data.combat, companion: data.companion, progression: data.progression, items: data.items, scripts: data.scripts });
  const created = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: String(DAY_CARE), x: COUNTER.tx * 16 + 8, y: COUNTER.ty * 16 + 8, facing: "north", playTimeMs: 0, savedAt: "2026-11-14T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  const choices: number[] = [];
  const asked: string[] = [];
  const later: (() => void)[] = [];
  client.onMessage((m) => {
    const msg = m as ServerMessage;
    got.push(msg);
    if (msg.type !== "script") return;
    const kind = msg.request.kind;
    asked.push(msg.request.kind === "hatch" ? `hatch ${msg.request.species}` : msg.request.kind === "say" ? `say ${msg.request.text}` : kind);
    const answer = kind === "yes-no" || kind === "menu" || kind === "party" ? choices.shift() : undefined;
    later.push(() => client.send({ type: "script-answer", id: msg.id, ...(answer === undefined ? {} : { answer }) }));
  });
  session.connect(server);
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...created.save, party: [member(SENTRET, 10, [33], "male"), member(RATTATA, 10, [33], "male"), father, mother], money: 10000, storyRev: 99 } satisfies Save });
  if (!got.some((m) => m.type === "welcome")) throw new Error(`recusado: ${JSON.stringify(got.at(-1))}`);

  let seq = 0;
  const me = () => session.world.all().find((e) => e.kind === "player")!;
  const origin = (area: string) => data.world!(area)?.origin ?? { tx: 0, ty: 0 };
  /** The player's tile, in matrix tiles on Route 34 and room tiles in the Day Care. */
  const where = () => {
    const e = me();
    const o = origin(e.area);
    return { area: Number(e.area), x: Math.floor(e.x / 16) + o.tx, y: Math.floor(e.y / 16) + o.ty };
  };
  const tick = (move = { x: 0, y: 0 }, buttons = 0) => {
    for (const a of later.splice(0)) a();
    client.send({ type: "input", seq: ++seq, move, run: false, buttons });
    session.step();
  };
  const talk = (answers: number[]) => {
    choices.push(...answers);
    tick({ x: 0, y: 0 }, BUTTON.interact);
    for (let i = 0; i < 600; i++) tick();
  };
  /** Walks until blocked, `until` holds, or the area changes. */
  const walk = (move: { x: number; y: number }, until: () => boolean = () => false) => {
    const area = me().area;
    let still = 0;
    for (let i = 0; i < 600 && still < 10 && !until() && me().area === area; i++) {
      const before = `${me().x},${me().y}`;
      tick(move);
      still = `${me().x},${me().y}` === before ? still + 1 : 0;
    }
    for (let i = 0; i < 30; i++) tick();
  };
  const tiles = (n: number) => {
    // Laps between the room's west wall and its middle, on rows 7 and 8, away from the counter.
    let walked = 0;
    while (walked < n) {
      const from = where();
      walk({ x: 0, y: 1 }, () => where().y >= 9);
      walk({ x: 0, y: -1 }, () => where().y <= 7);
      walked += Math.max(2, Math.abs(where().y - from.y) + 2);
    }
  };
  const step = (label: string) => console.log(`  ${label}: ${JSON.stringify(where())}`);

  for (let i = 0; i < 5; i++) tick();
  step("início");
  // "Yes", the father (slot 2); "yes" to another, the mother (slot 2 again once the father left). The lady keeps
  // you from leaving your last two Pokémon (CountAliveMonsAndPC), hence Rattata.
  talk([0, 2, 0, 2]);
  step("depois de deixar");
  console.log(`  perguntas ao deixar: ${asked.join(", ")}`);
  walk({ x: -1, y: 0 }, () => where().x <= 1);
  // Enough steps for several egg rolls (one every 256, 50% each for the same species group, different species).
  tiles(256 * 8);
  step("depois das voltas");
  // Out through the door at (3,12).
  walk({ x: 0, y: 1 }, () => where().y >= 11);
  for (let i = 0; i < 3; i++) tick({ x: 0, y: 1 });
  step("linha 11");
  walk({ x: 1, y: 0 }, () => where().x >= 3);
  step("x 3");
  walk({ x: 0, y: 1 });
  for (let i = 0; i < 60; i++) tick();
  step("fora");
  walk({ x: -1, y: 0 }, () => where().x <= MAN.tx);
  for (let i = 0; i < 3; i++) tick({ x: 0, y: -1 });
  step("diante do homem");
  const atMan = where();
  // "Yes" to taking the egg.
  talk([0, 0]);
  const afterMan = asked.length;
  // Back in: east to the door, north into it.
  walk({ x: 1, y: 0 }, () => where().x >= 368);
  walk({ x: 0, y: -1 });
  step("de volta");
  walk({ x: 0, y: -1 }, () => where().y <= 8);
  walk({ x: -1, y: 0 }, () => where().x <= 1);
  // Pidgey: 15 cycles; it hatches on the 16th, 255 steps each. Laps until it does, at most twice that.
  const cycles = info(PIDGEY).hatchCycles!;
  const hatched = () => asked.includes(`hatch ${PIDGEY}`);
  for (let i = 0; i < 2 * (cycles + 1) && !hatched(); i++) tiles(255);
  for (let i = 0; i < 600; i++) tick();
  step("fim");
  session.close("closed-by-host");

  const save = got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save").at(-1)!.save;
  const baby = save.party.at(-1)!;
  const expected = [...new Set([...levelOne(PIDGEY), eggMove, machine, shared])].slice(-4);
  const missing = log.filter((l) => l.includes("missing script command") || l.includes("hatch script"));
  console.log(`Pedidos com o homem e depois: ${asked.slice(afterMan - 6).join(", ")}`);
  console.log(`Creche: ${save.daycare.map((s) => `${s.mon.species}/${s.mon.gender}`).join(" + ")}; ovo esperando ${save.daycareEgg}`);
  console.log(`Filhote: espécie ${baby.species}, nível ${baby.level}, ovo ${JSON.stringify(baby.egg)}, golpes ${baby.moves.join(",")} (esperados ${expected.join(",")}), amizade ${baby.friendship}, Pokédex ${save.pokedex.caught.includes(PIDGEY)}`);
  for (const l of missing) console.log(`  FALTA ${l}`);

  expect(missing).toEqual([]);
  expect(atMan).toEqual({ area: ROUTE_34, x: MAN.tx, y: MAN.ty });
  expect(save.daycare.map((s) => s.mon.species)).toEqual([PIDGEY, PIDGEOTTO]);
  expect(asked).toContain(`hatch ${PIDGEY}`);
  expect(baby).toMatchObject({ species: PIDGEY, level: 1, friendship: 120 });
  expect(baby.egg).toBeUndefined();
  expect(baby.moves).toEqual(expected);
  expect(save.pokedex.caught).toContain(PIDGEY);
}, 600_000);
