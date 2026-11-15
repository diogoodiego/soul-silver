// Day Care egg probe (spec 029, item 029.2, layer 3), on the real extraction: compatibility from the extracted egg
// groups and genders, and the man on Route 34 (scr_seq 265, L1) handing over the egg he holds. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { compatibility, EGG_CYCLE_PX, eggSpecies, makeEgg, makeGiftEgg, type Parent } from "@soulsilver/shared/daycare";
import { BUTTON, createRng, type ServerMessage } from "@soulsilver/shared/game";
import { expForLevel } from "@soulsilver/shared/progression";
import { migrate, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages } from "./obtainable";

const stages = defaultStages();
const ROUTE_34 = 38;
/** The Day Care man stands at (365,410) in matrix tiles; the player talks to him from the south. */
const MAN = { tx: 365, ty: 411 };
const PIDGEY = 16;
const PIDGEOTTO = 17;
const SPEAROW = 21;
const RATTATA = 19;
const DITTO = 132;
const MAGNEMITE = 81;
const TOGEPI = 175;

if (!existsSync(join(stages, "maps"))) throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app e aponte SOULSILVER_DATA para a pasta stages.`);
const data = loadServerData(stages, () => undefined);
const info = (species: number) => data.progression!.species(species)!;
const parent = (species: number, gender?: "male" | "female"): Parent => ({ species, gender, eggGroups: info(species).eggGroups! });

it("compatibility follows the extracted egg groups", () => {
  const rows: [string, number, number][] = [
    ["Pidgey ♂ + Pidgey ♀", compatibility(parent(PIDGEY, "male"), parent(PIDGEY, "female")), 50],
    ["Pidgey ♂ + Spearow ♀ (Flying)", compatibility(parent(PIDGEY, "male"), parent(SPEAROW, "female")), 20],
    ["Pidgey ♂ + Rattata ♀ (sem grupo em comum)", compatibility(parent(PIDGEY, "male"), parent(RATTATA, "female")), 0],
    ["Pidgey ♂ + Pidgey ♂", compatibility(parent(PIDGEY, "male"), parent(PIDGEY, "male")), 0],
    ["Magnemite + Ditto", compatibility(parent(MAGNEMITE), parent(DITTO)), 20],
    ["Ditto + Ditto", compatibility(parent(DITTO), parent(DITTO)), 0],
    ["Togepi ♀ + Ditto (Undiscovered)", compatibility(parent(TOGEPI, "female"), parent(DITTO)), 0],
  ];
  for (const [name, got] of rows) console.log(`  ${name}: ${got}`);
  expect(rows.map((r) => r[1])).toEqual(rows.map((r) => r[2]));
});

it("029.3: inheritance on the extracted data: incense, Light Ball and Everstone", () => {
  const p = data.progression!;
  const rng = createRng(3);
  const mon = (species: number, gender: "male" | "female", held?: number): PartyMember => ({ species, level: 30, moves: [33], hp: 50, friendship: 70, experience: expForLevel(info(species).growthRate, 30), ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 7, gender, ...(held ? { held } : {}) });
  const spec = (m: PartyMember) => ({ ...parent(m.species, m.gender), held: m.held });
  const breed = (mother: PartyMember, father: PartyMember) => {
    const species = eggSpecies(spec(mother), spec(father), (id) => p.preEvolution(id), rng);
    return makeEgg(mother, father, species, { levelUp: (id) => p.levelUp(id), eggMoves: (id) => p.eggMoves(id), machineMoves: (id) => p.machines(id).flatMap((m) => p.machine(m)?.move ?? []), hatchCycles: (id) => info(id).hatchCycles ?? 0, genderRatio: (id) => info(id).gender?.raw ?? 255, hpMax: () => 1 }, rng);
  };
  const MARILL = 183;
  const PIKACHU = 25;
  const SEA_INCENSE = 254;
  const LIGHT_BALL = 236;
  const EVERSTONE = 229;
  const withIncense = breed(mon(MARILL, "female", SEA_INCENSE), mon(MARILL, "male")).species;
  const without = breed(mon(MARILL, "female"), mon(MARILL, "male")).species;
  const pichu = breed(mon(PIKACHU, "female", LIGHT_BALL), mon(PIKACHU, "male"));
  const natures = Array.from({ length: 400 }, () => breed(mon(PIDGEOTTO, "female", EVERSTONE), mon(PIDGEOTTO, "male")).nature).filter((n) => n === 7).length;
  console.log(`  Marill com Incenso do Mar: ${withIncense}; sem: ${without}; Pichu com Light Ball: espécie ${pichu.species}, golpes ${pichu.moves.join(",")}; Everstone: natureza da mãe em ${natures}/400`);
  expect([withIncense, without]).toEqual([298, MARILL]);
  expect(pichu.species).toBe(172);
  expect(pichu.moves).toContain(344);
  expect(natures).toBeGreaterThan(170);
  expect(natures).toBeLessThan(250);
});

it("the Day Care man hands over the egg he holds: Pidgey at level 1 with its hatch cycles", () => {
  const log: string[] = [];
  const session = createSession({ seed: 1, world: data.world!, log: (l) => log.push(l), clock: () => "2026-11-13T12:00:00.000Z", newToken: () => "t", combat: data.combat, companion: data.companion, progression: data.progression, items: data.items, scripts: data.scripts });
  const o = data.world!(String(ROUTE_34))!.origin ?? { tx: 0, ty: 0 };
  const created = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: String(ROUTE_34), x: (MAN.tx - o.tx) * 16 + 8, y: (MAN.ty - o.ty) * 16 + 8, facing: "north", playTimeMs: 0, savedAt: "2026-11-13T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  const asked: string[] = [];
  const later: (() => void)[] = [];
  client.onMessage((m) => {
    const msg = m as ServerMessage;
    got.push(msg);
    if (msg.type !== "script") return;
    asked.push(msg.request.kind);
    // "Yes" to taking the egg.
    const answer = msg.request.kind === "yes-no" || msg.request.kind === "menu" ? 0 : undefined;
    later.push(() => client.send({ type: "script-answer", id: msg.id, ...(answer === undefined ? {} : { answer }) }));
  });
  session.connect(server);
  const pidgey = (gender: "male" | "female"): PartyMember => ({ species: PIDGEOTTO, level: 20, moves: [33], hp: 40, friendship: 70, experience: expForLevel(info(PIDGEOTTO).growthRate, 20), ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0, gender });
  const lead: PartyMember = { ...pidgey("male"), species: RATTATA, gender: "male" };
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...created.save, party: [lead], daycare: [{ mon: pidgey("female"), steps: 300 }, { mon: pidgey("male"), steps: 300 }], daycareEgg: true, storyRev: 99 } satisfies Save });
  if (!got.some((m) => m.type === "welcome")) throw new Error(`recusado: ${JSON.stringify(got.at(-1))}`);
  let seq = 0;
  const tick = (buttons = 0) => {
    for (const a of later.splice(0)) a();
    client.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons });
    session.step();
  };
  for (let i = 0; i < 5; i++) tick();
  tick(BUTTON.interact);
  for (let i = 0; i < 400; i++) tick();
  session.close("closed-by-host");

  const save = got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save").at(-1)!.save;
  const egg = save.party.at(-1)!;
  const missing = log.filter((l) => l.includes("missing script command"));
  console.log(`Ovo: espécie ${egg.species}, nível ${egg.level}, ciclos ${egg.egg?.cycles}, golpes ${egg.moves.join(",")}, gênero ${egg.gender ?? "-"}; homem ainda com ovo: ${save.daycareEgg}`);
  console.log(`Pedidos do script: ${asked.join(", ")}`);
  for (const l of missing) console.log(`  FALTA ${l}`);

  expect(missing).toEqual([]);
  expect(save.daycareEgg).toBe(false);
  expect(save.party).toHaveLength(2);
  expect(egg).toMatchObject({ species: PIDGEY, level: 1, experience: 0, egg: { cycles: info(PIDGEY).hatchCycles } });
});

it("029.4: walking closes the egg cycle and the original hatch script (std 2021) runs to EggHatchAnim", () => {
  const log: string[] = [];
  const session = createSession({ seed: 1, world: data.world!, log: (l) => log.push(l), clock: () => "2026-11-14T12:00:00.000Z", newToken: () => "t", combat: data.combat, companion: data.companion, progression: data.progression, items: data.items, scripts: data.scripts });
  const o = data.world!(String(ROUTE_34))!.origin ?? { tx: 0, ty: 0 };
  const created = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: String(ROUTE_34), x: (MAN.tx - o.tx) * 16 + 8, y: (MAN.ty - o.ty) * 16 + 8, facing: "south", playTimeMs: 0, savedAt: "2026-11-14T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  const asked: string[] = [];
  const later: (() => void)[] = [];
  client.onMessage((m) => {
    const msg = m as ServerMessage;
    got.push(msg);
    if (msg.type !== "script") return;
    asked.push(msg.request.kind === "say" ? `say ${msg.request.text}` : msg.request.kind);
    later.push(() => client.send({ type: "script-answer", id: msg.id }));
  });
  session.connect(server);
  const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
  const lead: PartyMember = { species: RATTATA, level: 20, moves: [33], hp: 40, friendship: 70, experience: expForLevel(info(RATTATA).growthRate, 20), ivs: stats(31), evs: stats(0), nature: 0, gender: "male" };
  const egg: PartyMember = { ...lead, species: TOGEPI, level: 1, experience: 0, gender: "female", egg: { cycles: 0 } };
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...created.save, party: [lead, egg], eggWalk: EGG_CYCLE_PX - 5, storyRev: 99 } satisfies Save });
  if (!got.some((m) => m.type === "welcome")) throw new Error(`recusado: ${JSON.stringify(got.at(-1))}`);
  let seq = 0;
  const tick = (move = { x: 0, y: 0 }) => {
    for (const a of later.splice(0)) a();
    client.send({ type: "input", seq: ++seq, move, run: false, buttons: 0 });
    session.step();
  };
  for (let i = 0; i < 5; i++) tick();
  for (let i = 0; i < 4; i++) tick({ x: 0, y: 1 });
  for (let i = 0; i < 200; i++) tick();
  session.close("closed-by-host");

  const save = got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save").at(-1)!.save;
  const missing = log.filter((l) => l.includes("missing script command") || l.includes("hatch script"));
  console.log(`Pedidos do script: ${asked.join(", ")}`);
  console.log(`Eclodiu: espécie ${save.party[1]!.species}, ovo ${JSON.stringify(save.party[1]!.egg)}, amizade ${save.party[1]!.friendship}, na Pokédex ${save.pokedex.caught.includes(TOGEPI)}`);
  for (const l of missing) console.log(`  FALTA ${l}`);
  expect(missing).toEqual([]);
  expect(asked).toContain("hatch");
  expect(save.party[1]).toMatchObject({ species: TOGEPI, friendship: 120 });
  expect(save.party[1]!.egg).toBeUndefined();
});

it("029.5: gift eggs on the extracted data: the Togepi egg (GiveTogepiEgg) and Primo's Mareep (GiveEgg 179)", () => {
  const p = data.progression!;
  const gift = { levelUp: (id: number) => p.levelUp(id), hatchCycles: (id: number) => info(id).hatchCycles ?? 0, genderRatio: (id: number) => info(id).gender?.raw ?? 255, hpMax: () => 1 };
  const togepi = makeGiftEgg(TOGEPI, gift, createRng(1), 326);
  const mareep = makeGiftEgg(179, gift, createRng(1));
  console.log(`  Togepi: ciclos ${togepi.egg?.cycles}, golpes ${togepi.moves.join(",")}, gênero ${togepi.gender}; Mareep: ciclos ${mareep.egg?.cycles}, golpes ${mareep.moves.join(",")}`);
  expect(togepi).toMatchObject({ species: TOGEPI, level: 1, egg: { cycles: info(TOGEPI).hatchCycles } });
  expect(togepi.moves.at(-1)).toBe(326);
  expect(mareep).toMatchObject({ species: 179, level: 1, egg: { cycles: info(179).hatchCycles } });
});
