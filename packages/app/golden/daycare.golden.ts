// Day Care probe (spec 029, item 029.1, layer 3), on the real extraction: the lady's script (scr_seq 265) run by the
// headless server in the Day Care (map 331). Leave a member, walk in the room, take it back paying 100 plus 100 per
// level. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import { expForLevel, levelFor } from "@soulsilver/shared/progression";
import { migrate, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages } from "./obtainable";

const stages = defaultStages();
const DAY_CARE = 331;
/** In front of the lady's counter: she is at (3,5), the counter is row 6. */
const COUNTER = { tx: 3, ty: 7 };
const PIDGEY = 16;
const SENTRET = 161;
const RATTATA = 19;
const MONEY = 3000;
/** Walks between the room's west, south and north walls, 10 tiles a lap. */
const LAPS = 6;

if (!existsSync(join(stages, "maps"))) throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app e aponte SOULSILVER_DATA para a pasta stages.`);
const data = loadServerData(stages, () => undefined);
const rate = (species: number) => data.progression!.species(species)!.growthRate;

const member = (species: number, level: number): PartyMember => {
  const moves = (data.progression?.levelUp(species) ?? []).filter((l) => l.level <= level).map((l) => l.move).slice(-4);
  return { species, level, moves: moves.length ? moves : [33], hp: 20, friendship: 70, experience: expForLevel(rate(species), level), ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
};

it("leaves a Pokémon with the Day Care lady, walks, and takes it back grown for the original price", () => {
  const log: string[] = [];
  const session = createSession({ seed: 1, world: data.world!, log: (l) => log.push(l), clock: () => "2026-11-13T12:00:00.000Z", newToken: () => "t", combat: data.combat, companion: data.companion, progression: data.progression, items: data.items, scripts: data.scripts });
  const created = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: String(DAY_CARE), x: COUNTER.tx * 16 + 8, y: COUNTER.ty * 16 + 8, facing: "north", playTimeMs: 0, savedAt: "2026-11-13T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  /** Answers for the questions of the talk in progress, in order: yes-no and menus 0 yes / 1 no, the party pick a slot. */
  const choices: number[] = [];
  const asked: string[] = [];
  const later: (() => void)[] = [];
  client.onMessage((m) => {
    const msg = m as ServerMessage;
    got.push(msg);
    if (msg.type !== "script") return;
    const kind = msg.request.kind;
    asked.push(kind);
    const answer = kind === "yes-no" || kind === "menu" || kind === "party" ? choices.shift() : undefined;
    later.push(() => client.send({ type: "script-answer", id: msg.id, ...(answer === undefined ? {} : { answer }) }));
  });
  session.connect(server);
  // storyRev 99: no new-game script runs.
  const party = [member(SENTRET, 6), member(PIDGEY, 5), member(RATTATA, 6)];
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...created.save, party, money: MONEY, storyRev: 99 } satisfies Save });
  if (!got.some((m) => m.type === "welcome")) throw new Error(`recusado: ${JSON.stringify(got.at(-1))}`);

  let seq = 0;
  const me = () => session.world.all().find((e) => e.kind === "player")!;
  const tile = () => ({ x: Math.floor(me().x / 16), y: Math.floor(me().y / 16) });
  let tiles = 0;
  let last = `${tile().x},${tile().y}`;
  const tick = (move = { x: 0, y: 0 }, buttons = 0) => {
    for (const a of later.splice(0)) a();
    client.send({ type: "input", seq: ++seq, move, run: false, buttons });
    session.step();
    const now = `${tile().x},${tile().y}`;
    if (now !== last) tiles++;
    last = now;
  };
  const talk = (answers: number[]) => {
    choices.push(...answers);
    tick({ x: 0, y: 0 }, BUTTON.interact);
    for (let i = 0; i < 400; i++) tick();
  };
  /** Walks until the player stops moving (a wall) or `until` holds. */
  const walk = (move: { x: number; y: number }, until: () => boolean = () => false) => {
    let still = 0;
    for (let i = 0; i < 400 && still < 10 && !until(); i++) {
      const before = `${me().x},${me().y}`;
      tick(move);
      still = `${me().x},${me().y}` === before ? still + 1 : 0;
    }
  };

  for (let i = 0; i < 5; i++) tick();
  // Leave Pidgey (slot 1): "yes", the party pick, then "no" to leaving another.
  talk([0, 1, 1]);
  const afterDeposit = tiles;
  walk({ x: -1, y: 0 });
  for (let lap = 0; lap < LAPS; lap++) {
    walk({ x: 0, y: 1 });
    walk({ x: 0, y: -1 });
  }
  walk({ x: 1, y: 0 }, () => tile().x === COUNTER.tx);
  for (let i = 0; i < 4; i++) tick({ x: 0, y: -1 });
  const walked = tiles - afterDeposit;
  // "No" to leaving another, "yes" to taking it back, "yes" to the price.
  talk([1, 0, 0]);
  session.close("closed-by-host");

  const save = got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save").at(-1)!.save;
  const back = save.party.at(-1)!;
  const experience = Math.min(expForLevel(rate(PIDGEY), 5) + walked, expForLevel(rate(PIDGEY), 100));
  const level = levelFor(rate(PIDGEY), experience);
  const learned = (data.progression?.levelUp(PIDGEY) ?? []).filter((l) => l.level > 5 && l.level <= level).map((l) => l.move);
  const missing = log.filter((l) => l.includes("missing script command"));
  console.log(`Creche: ${walked} tiles andados, Pidgey ${back.species === PIDGEY ? "de volta" : "AUSENTE"} no nível ${back.level} (${back.experience} XP), golpes ${back.moves.join(",")}, dinheiro ${MONEY} → ${save.money}`);
  console.log(`Pedidos do script: ${asked.join(", ")}`);
  for (const l of missing) console.log(`  FALTA ${l}`);

  expect(missing).toEqual([]);
  expect(asked).toContain("party");
  expect(walked).toBeGreaterThanOrEqual(LAPS * 10);
  expect(save.daycare).toEqual([]);
  expect(back).toMatchObject({ species: PIDGEY, experience, level });
  expect(level).toBeGreaterThan(5);
  for (const move of learned) expect(back.moves).toContain(move);
  expect(save.money).toBe(MONEY - (level - 5 + 1) * 100);
});
