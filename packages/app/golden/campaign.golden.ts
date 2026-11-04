// The golden path (spec 024 US6, research R7): a new game played on the server, in plain Node, from the
// bedroom to the Zephyr Badge, with the real extraction. Local only: `npm run golden`, never in CI.
// On the way it checks specs 020–023 against the real ROM: trainer battles fought by the spec 019 bot,
// the Cherrygrove mart, Center and PC, and a second player's NPCs following their own flags.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, createRng, findDuplicates, tileAt, type PcSlot, type ServerMessage } from "@soulsilver/shared/game";
import type { Direction } from "@soulsilver/shared/maps";
import { memberStats } from "@soulsilver/shared/progression";
import { applyNewGame, badgeCount, migrate, type Save } from "@soulsilver/shared/save";
import { SCRIPT_HANDLERS } from "@soulsilver/shared/script";
import { prize } from "@soulsilver/shared/trainer";
import { createMemoryConnectionPair, createReferenceBot, createSession, SOLID, type Combatant, type WildData } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";
import { failedCheck, MILESTONES, type Milestone } from "./milestones";
import { optionalMissing, report, type Check } from "./report";

const stages = process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const VECTORS: Record<Direction, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
/** What the pilot types when a script asks for the rival's name; nicknames it leaves empty. */
const RIVAL = "Silver";
/** The starter machine offers Chikorita, Cyndaquil, Totodile: Cyndaquil, strong against Sprout Tower's Bellsprout. */
const STARTER_PICK = 1;
const POTION = 17;
const CANCEL = -1;
const POKE_BALL = 4;
/** Where the second player waits, in New Bark Town (map 60), away from the first player's path. */
const SECOND = { map: 60, tx: 690, ty: 402 };

type Got<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

function pilot() {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) {
    throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app (ou npm run extract) e aponte SOULSILVER_DATA para a pasta stages.`);
  }
  const logs: string[] = [];
  const log = (m: string) => void logs.push(m);
  const data = loadServerData(stages, log);
  const start = readNewGameStart(stages, log)!;
  const missing: string[] = [];
  const hit = new Set<string>();
  const stuck: string[] = [];
  // Wild Pokémon only while the pilot catches or trains: elsewhere they would only slow the path.
  let wildOn = false;
  // The spawn caps are read on every attempt (the maps' spawn zones are cached on the first look): 0 holds them back.
  const gate = (rules: WildData["spawn"]): WildData["spawn"] => Object.create(rules, { defaultCap: { get: () => (wildOn ? rules.defaultCap : 0) }, capByMap: { get: () => (wildOn ? rules.capByMap : {}) } }) as WildData["spawn"];
  const wild = data.wild && { ...data.wild, spawn: gate(data.wild.spawn) };
  const session = createSession({
    seed: 1,
    world: data.world!,
    log,
    clock: () => "2026-11-03T12:00:00.000Z",
    newToken: () => "golden",
    combat: data.combat,
    companion: data.companion,
    progression: data.progression,
    items: data.items,
    wild,
    scripts: data.scripts,
    trainers: data.trainers,
    shops: data.shops,
    intro: true,
    devTools: true,
    onMissingCommand: (m) => {
      missing.push(`${m.command} (${m.file}:${m.entry})`);
      hit.add(m.command);
    },
    onStuck: (s) => void stuck.push(`${s.file}:${s.entry} no mapa ${s.area} (${s.x}, ${s.z}), pessoas ${JSON.stringify(s.people)}`),
  });
  const newGame = (name: string) => {
    const created = migrate({ schemaVersion: 1, name, character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-03T12:00:00.000Z", rev: 0 });
    if (!created.ok) throw new Error(created.message);
    return applyNewGame(created.save, start);
  };
  /** A client on the session: what it got, its latest save and debugger view, and the entities it was sent. */
  const join_ = (save: Save) => {
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => void got.push(m as ServerMessage));
    session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save });
    client.send({ type: "debugScript", on: true });
    const welcome = got.find((m): m is Got<"welcome"> => m.type === "welcome");
    if (!welcome) throw new Error(`O servidor recusou o save: ${JSON.stringify(got.at(-1))}`);
    return { client, got, welcome, read: 0, seq: 0, save: undefined as Save | undefined, debug: undefined as Got<"script-debug"> | undefined, seen: new Map<number, Got<"state">["spawned"][number]>() };
  };
  const one = join_(newGame("Gold"));
  // The second player starts their own story where it begins, then waits in New Bark Town (spec 020 isolation).
  const second = newGame("Kris");
  const o = data.world!(String(SECOND.map))?.origin ?? { tx: 0, ty: 0 };
  const two = join_({ ...second, area: String(SECOND.map), x: (SECOND.tx - o.tx) * 16 + 8, y: (SECOND.ty - o.ty) * 16 + 8 });
  const { client, got, welcome } = one;

  let locked = false;
  let fighting = false;
  let steps = 0;
  /** Holds the bot back (the player throws a ball instead). */
  let hold = false;
  const bot = createReferenceBot(createRng(0x5eed));
  /** Every trainer battle of the first player, by battle id. */
  const battles = new Map<number, { trainer: number; result?: string; prize?: number }>();
  /** Trainers that spotted the first player, in order. */
  const spotted: number[] = [];
  /** Answers to the next menus and yes/no questions (CANCEL backs out of a menu); 0 once they run out. */
  const answers: number[] = [];
  const services: ServerMessage[] = [];
  const visited = new Set<number>();
  let lastScript: string | null = null;
  const me = () => session.world.get(welcome.entityId)!;
  const origin = () => data.world!(me().area)?.origin ?? { tx: 0, ty: 0 };
  const tile = () => ({ map: me().area, tx: Math.floor(me().x / 16) + origin().tx, ty: Math.floor(me().y / 16) + origin().ty });
  const hpMax = (m: Save["party"][number]) => {
    const species = data.combat?.species(m.species);
    return species ? memberStats(species.baseStats, m).hp : m.hp;
  };

  /** Reads what a client got; both answer scripts and the progression queue as a player would. */
  function drain(c: typeof one, first: boolean): void {
    for (; c.read < c.got.length; c.read++) {
      const m = c.got[c.read]!;
      if (m.type === "script") {
        const r = m.request;
        const queued = first && (r.kind === "menu" || r.kind === "yes-no") ? (answers.shift() ?? 0) : 0;
        // -1 cancels a menu: one past its last entry.
        const answer = r.kind === "starter" ? STARTER_PICK : queued === CANCEL && r.kind === "menu" ? r.items.length : queued;
        c.client.send({ type: "script-answer", id: m.id, answer, ...(r.kind === "name" && r.purpose === "rival" ? { text: first ? RIVAL : "Kris" } : {}) });
      } else if (m.type === "progression") {
        if (m.item.kind === "evolve") c.client.send({ type: "evolve-answer", accept: true });
        else if (m.item.kind === "learn" && (m.moves?.length ?? 0) >= 4) {
          // Forgets the weakest move when the new one hits harder, as a player would.
          const power = (id: number) => data.combat?.move(id)?.power ?? 0;
          const weakest = m.moves!.reduce((w, id, i) => (power(id) < power(m.moves![w]!) ? i : w), 0);
          c.client.send({ type: "learn-answer", forget: power(m.item.move) > power(m.moves![weakest]!) ? weakest : null });
        } else c.client.send({ type: "progression-ack" });
      } else if (m.type === "save") c.save = m.save;
      else if (m.type === "script-debug") c.debug = m;
      else if (m.type === "state") {
        if (m.full) c.seen.clear();
        for (const e of m.spawned) c.seen.set(e.id, e);
        for (const id of m.removed) c.seen.delete(id);
      }
      if (!first) continue;
      if (m.type === "script-lock") locked = m.locked;
      else if (m.type === "trainerSpotted") {
        spotted.push(m.trainerId);
        client.send({ type: "trainer-ready" });
      } else if (m.type === "trainerBattleStart" && m.player === welcome.playerId) {
        fighting = true;
        battles.set(m.battleId, { trainer: m.trainerId });
      } else if (m.type === "trainerBattleEnd" && battles.has(m.battleId)) {
        fighting = false;
        Object.assign(battles.get(m.battleId)!, { result: m.result, prize: m.prize ?? 0 });
      } else if (m.type === "script-debug" && m.at && m.at.file >= 0) lastScript = `${m.at.file}:${m.at.entry}`;
      else if (m.type.startsWith("shop") || m.type.startsWith("pc")) services.push(m);
    }
  }

  /** One tick, as both clients: the first moves and fights trainer battles with the spec 019 bot, the second stands still. */
  function tick(move: Direction | null = null, buttons = 0): void {
    const fight = hold ? undefined : botInput();
    client.send({ type: "input", seq: ++one.seq, move: fight?.move ?? (move ? VECTORS[move] : { x: 0, y: 0 }), run: false, buttons: fight?.buttons ?? buttons });
    two.client.send({ type: "input", seq: ++two.seq, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    session.step();
    steps++;
    visited.add(Number(me().area));
    // Answers reach the server at once and its next request lands in `got` within this loop.
    drain(one, true);
    drain(two, false);
  }

  /** Whether the first player's Pokémon is out fighting (a trainer battle or a wild one). */
  const inCombat = () => session.world.all().some((e) => e.kind === "pokemon" && session.combat?.get(e.id)?.owner === welcome.playerId);

  /** The bot's input for the player's Pokémon against the nearest of the trainer's; none between send-outs. */
  function botInput() {
    const side = (c: Combatant) => ({ x: session.world.get(c.entityId)!.x, y: session.world.get(c.entityId)!.y, c });
    const all = session.world.all().flatMap((e) => {
      const c = e.kind === "pokemon" ? session.combat?.get(e.id) : undefined;
      return c ? [c] : [];
    });
    const mine = all.find((c) => c.owner === welcome.playerId && c.hp > 0);
    if (!mine) return undefined;
    const me = side(mine);
    const foes = all.filter((c) => c.owner !== welcome.playerId && c.hp > 0 && c.battle === mine.battle).map(side);
    const foe = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    return foe ? bot(me, foe, steps + 1) : undefined;
  }

  /** Steps until no script or battle holds the player for `quiet` ticks. */
  function settle(quiet = 40, max = 12000): void {
    let calm = 0;
    for (let i = 0; i < max && calm < quiet; i++) {
      tick();
      calm = locked || fighting ? 0 : calm + 1;
    }
  }

  /** Steps until `done`, at most `max` ticks; whether it came true. */
  function until(done: () => boolean, max = 600): boolean {
    for (let i = 0; i < max && !done(); i++) tick();
    return done();
  }

  /** The next save of the first player. */
  function fresh(): Save {
    const before = one.save;
    until(() => one.save !== before, 700);
    return one.save!;
  }

  function warp(map: number, tx: number, ty: number): void {
    client.send({ type: "debugWarp", map, tx, ty });
    settle();
  }

  function walk(dir: Direction, tiles: number): void {
    const from = tile();
    const moved = () => Math.abs(tile().tx - from.tx) + Math.abs(tile().ty - from.ty);
    for (let i = 0; i < tiles * 16 && moved() < tiles && !locked; i++) tick(dir);
    // To the tile's center, where triggers and interact look.
    for (let i = 0; i < 4 && !locked; i++) tick(dir);
    settle();
  }

  /** Turns to `dir` without leaving the tile and presses interact; `wait` false leaves the script running (a shop, the PC). */
  function talk(dir: Direction, wait = true): void {
    tick(dir);
    tick();
    tick(null, BUTTON.interact);
    tick();
    if (wait) settle();
  }

  const count = (save: Save, item: number) => save.bag.find((b) => b.item === item)?.count ?? 0;
  const lastService = <T extends ServerMessage["type"]>(type: T) => services.findLast((m): m is Got<T> => m.type === type);

  /**
   * A trainer battle as the game has it (specs 019 and 022): fought by the bot to the end the script receives,
   * then the defeated flag, the prize against the formula and the money, and no second challenge on `again`.
   */
  function battle(name: string, trainers: number[], moneyBefore: number, again: () => void): Check {
    const fail = (failed: string): Check => ({ name, failed });
    const b = [...battles.values()].filter((x) => trainers.includes(x.trainer)).at(-1);
    if (!b) return fail("a luta não começou");
    if (b.result !== "won") return fail(`luta ${b.result ?? "sem fim"} (time: ${one.save?.party.map((m) => `${m.species} nv${m.level} ${m.hp} PS`).join(", ")})`);
    const after = fresh();
    const flag = (data.trainers?.tuning.trainerFlagBase ?? 0) + b.trainer;
    if (!after.flags.includes(flag)) return fail(`flag ${flag} de treinador derrotado desligada`);
    const record = data.trainers!.trainer(b.trainer)!;
    const formula = prize({ prizeBase: data.trainers!.trainerClass(record.class.id)?.prizeBase ?? 0, team: record.team, double: record.doubleBattle });
    if (b.prize !== formula || after.money - moneyBefore !== formula) return fail(`prêmio ${b.prize}, dinheiro ${after.money - moneyBefore >= 0 ? "+" : ""}${after.money - moneyBefore}, fórmula ${formula}`);
    const fought = battles.size;
    const seen = spotted.length;
    again();
    if (battles.size !== fought || spotted.length !== seen) return fail("desafiou de novo");
    return { name: `${name}: treinador ${b.trainer}, flag ${flag}, prêmio ${formula}, sem novo desafio` };
  }

  /**
   * A route trainer (person `npc` of `map` in the extraction): from the farthest walkable tile of its line of sight,
   * one step closer, as a player walking by; the trainer spots, walks up and challenges.
   */
  function routeTrainer(name: string, map: number, npc: number): Check {
    const person = data.scripts?.events(map)?.npcs.find((n) => n.id === npc);
    if (!person?.trainer) return { name, failed: `pessoa ${npc} do mapa ${map} não é treinador na extração` };
    const look = [VECTORS.north, VECTORS.south, VECTORS.west, VECTORS.east][person.facing] ?? VECTORS.south;
    const toward = (Object.keys(VECTORS) as Direction[]).find((d) => VECTORS[d].x === -look.x && VECTORS[d].y === -look.y)!;
    const o = data.world!(String(map))?.origin ?? { tx: 0, ty: 0 };
    const people = new Set(session.world.all().filter((e) => e.kind === "npc" && e.area === String(map)).map((e) => `${Math.floor(e.x / 16) + o.tx},${Math.floor(e.y / 16) + o.ty}`));
    const free = (tx: number, ty: number) => !people.has(`${tx},${ty}`) && !SOLID.has(tileAt(data.world!, String(map), 0, (tx - o.tx) * 16 + 8, (ty - o.ty) * 16 + 8)?.category ?? "blocked");
    const sight = person.param[0] ?? 1;
    const d = [...Array(sight).keys()].map((i) => sight + 1 - i).find((k) => free(person.x + look.x * k, person.z + look.y * k) && free(person.x + look.x * (k - 1), person.z + look.y * (k - 1)));
    // Its sight blocked (by people of a scene still standing, say), a player walks up beside it and talks.
    const side = d === undefined ? (Object.keys(VECTORS) as Direction[]).find((dir) => free(person.x + VECTORS[dir].x, person.z + VECTORS[dir].y)) : undefined;
    if (d === undefined && !side) return { name, failed: `treinador ${person.trainer} sem linha de visão livre nem lado livre para conversar` };
    const opposite = (dir: Direction) => (Object.keys(VECTORS) as Direction[]).find((x) => VECTORS[x].x === -VECTORS[dir].x && VECTORS[x].y === -VECTORS[dir].y)!;
    const money = fresh().money;
    const pass = () => {
      if (d !== undefined) {
        warp(map, person.x + look.x * d, person.z + look.y * d);
        walk(toward, 1);
      } else {
        warp(map, person.x + VECTORS[side!].x, person.z + VECTORS[side!].y);
        talk(opposite(side!));
      }
    };
    pass();
    return battle(name, [person.trainer], money, pass);
  }

  const wilds = () => session.world.all().filter((e) => e.kind === "pokemon" && session.combat?.get(e.id)?.owner === "wild" && e.area === me().area);
  /** The wild Pokémon nearest the player, once one shows within `max` ticks. */
  function nearestWild(max = 400, from = me()) {
    until(() => wilds().length > 0, max);
    const p = from;
    return wilds().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  }
  /** Walks toward entity `id` until within `stopPx`, a fight starts or it is gone. */
  function approach(id: number, stopPx: number, max = 300): void {
    for (let i = 0; i < max && !inCombat(); i++) {
      const t = session.world.get(id);
      const p = me();
      if (!t || t.area !== p.area || Math.hypot(t.x - p.x, t.y - p.y) <= stopPx) return;
      tick(Math.abs(t.x - p.x) > Math.abs(t.y - p.y) ? (t.x > p.x ? "east" : "west") : t.y > p.y ? "south" : "north");
    }
  }

  /** Walks toward the nearest wild one and, within 10 tiles, sends the Pokémon out with the combat button; the bot closes in. */
  function engage(): boolean {
    const target = nearestWild();
    if (!target) return false;
    approach(target.id, 64, 600);
    const t = session.world.get(target.id);
    if (!t || Math.hypot(t.x - me().x, t.y - me().y) > 160) return false;
    tick(null, BUTTON.combat);
    tick();
    return inCombat();
  }

  /** Levels the lead up to `level` against wild Pokémon in the grass of `map` around (tx, ty), with the bot, as a player would. */
  function train(level: number, map = 33, tx = 635, ty = 397): void {
    const lead = () => one.save?.party.find((m) => m.hp > 0)?.level ?? 0;
    for (let round = 0; round < 200 && lead() < level; round++) {
      if (round % 6 === 0) heal();
      warp(map, tx, ty);
      wildOn = true;
      // The bot takes the fight against the wild one nearest its Pokémon.
      if (engage()) until(() => !inCombat(), 3000);
      if (inCombat()) {
        tick(null, BUTTON.recall);
        until(() => !inCombat(), 100);
      }
      wildOn = false;
      settle();
      fresh();
    }
    heal();
  }

  /** Every party member's HP back at the Cherrygrove nurse (map 69: she stands at (8, 11), the counter is row 12). */
  function heal(): void {
    warp(69, 8, 13);
    talk("north");
  }

  /** The isolation check (spec 020): the NPCs the second player sees follow their own flags, not the first player's. */
  function isolation(): string | undefined {
    const at = session.world.get(two.welcome.entityId)?.area;
    if (at !== String(SECOND.map)) return `o segundo jogador saiu de New Bark (mapa ${at})`;
    const flags = new Set(two.save?.flags ?? []);
    const objects = two.debug?.objects ?? [];
    if (!objects.length) return "o segundo jogador não recebeu os objetos do mapa";
    const hidden = (o: (typeof objects)[number]) => !!o.hideFlag && flags.has(o.hideFlag);
    const wrong = objects.filter((o) => o.visible === hidden(o));
    if (wrong.length) return `objetos ${wrong.map((o) => o.id).join(", ")} não seguem as flags do segundo jogador`;
    const sent = [...two.seen.values()].filter((e) => e.kind === "npc" && e.area === String(SECOND.map)).map((e) => e.data["person"] as number);
    const extra = sent.filter((id) => objects.some((o) => o.id === id && hidden(o)));
    if (extra.length) return `o segundo jogador recebeu personagens escondidos pelas flags dele: ${extra.join(", ")}`;
    return undefined;
  }
  /** How many of New Bark's hide flags the two players disagree on, so the isolation check is not empty. */
  const differing = () => {
    const a = new Set(one.save?.flags ?? []);
    const b = new Set(two.save?.flags ?? []);
    return (two.debug?.objects ?? []).filter((o) => o.hideFlag && a.has(o.hideFlag) !== b.has(o.hideFlag)).length;
  };

  return {
    session,
    logs,
    missing,
    hit,
    visited,
    stuck,
    battles,
    data,
    answers,
    services,
    tile,
    settle,
    until,
    fresh,
    warp,
    walk,
    talk,
    battle,
    routeTrainer,
    train,
    nearestWild,
    approach,
    engage,
    heal,
    isolation,
    differing,
    count,
    hpMax,
    lastService,
    get save() {
      return one.save;
    },
    setWild(on: boolean) {
      wildOn = on;
    },
    setHold(on: boolean) {
      hold = on;
    },
    inCombat,
    me,
    playerId: welcome.playerId,
    recent: () => [...new Set(got.slice(-200).map((m) => m.type))].filter((t) => t !== "state"),
    tick,
    send: (m: Parameters<typeof client.send>[0]) => client.send(m),
    /** Waits for the next save and checks the milestone; the failure text when it does not hold. */
    check(m: Milestone): string | undefined {
      const save = fresh();
      if (!save) return "nenhum save recebido";
      const events = data.scripts?.events(Number(me().area));
      const shown = new Set(one.debug?.objects.filter((o) => o.visible).map((o) => o.id));
      const duplicates = events ? findDuplicates(events.npcs, (o) => shown.has(o.id)).map((g) => g.map((o) => o.id)) : [];
      return failedCheck(m, { save, duplicates, ...(data.trainers ? { trainerFlagBase: data.trainers.tuning.trainerFlagBase } : {}) });
    },
    failure(m: Milestone, check: string) {
      return { milestone: m, check, lastScript, position: tile(), triggers: one.debug?.triggers ?? [], save: one.save! };
    },
  };
}

type Pilot = ReturnType<typeof pilot>;

/**
 * The Cherrygrove mart (spec 023, map 68; the clerk behind the counter at (2, 6)), in one conversation as a player has
 * it: buy (the stock the extraction gives for now, then a Potion), the clerk's menu again, sell it, then quit.
 */
function shop(p: Pilot): Check {
  const name = "loja de Cherrygrove";
  const fail = (failed: string): Check => ({ name, failed });
  const before = p.fresh();
  /** The next shop screen the clerk opens after service message `n`. */
  const next = (n = p.services.length) => {
    p.until(() => p.services.slice(n).some((m) => m.type === "shopOpen"));
    return p.services.slice(n).find((m): m is Got<"shopOpen"> => m.type === "shopOpen");
  };
  const result = () => {
    const n = p.services.length;
    p.until(() => p.services.slice(n).some((m) => m.type === "shopResult"));
    return p.lastService("shopResult");
  };
  // The clerk's menu: buy, then sell when it comes back, then quit.
  p.answers.push(0, 1, 2);
  p.warp(68, 4, 6);
  const n = p.services.length;
  p.talk("west", false);
  const buying = next(n);
  if (buying?.mode !== "buy") return fail(`a loja não abriu para compra (${JSON.stringify(buying)})`);
  const record = p.data.shops?.shop(buying.shopId);
  const expected = (record?.items ?? []).filter((i) => i.minBadges <= badgeCount(before.badgeSet)).map((i) => i.item);
  const offered = buying.stock.map((s) => s.item);
  if (JSON.stringify(offered) !== JSON.stringify(expected)) return fail(`estoque oferecido ${offered.join(", ")}, extraído ${expected.join(", ")}`);
  const price = buying.stock.find((s) => s.item === POTION)?.price ?? 0;
  p.send({ type: "shop-buy", item: POTION, qty: 1 });
  const bought = result();
  const mid = p.fresh();
  if (!bought?.ok || bought.money !== before.money - price || mid.money !== bought.money || p.count(mid, POTION) !== p.count(before, POTION) + 1) return fail(`compra: ${JSON.stringify(bought)}, dinheiro ${mid.money}, Potions ${p.count(mid, POTION)}`);
  p.send({ type: "shop-leave" });
  const selling = next();
  if (selling?.mode !== "sell") return fail(`o menu do vendedor não voltou à venda (${JSON.stringify(selling)})`);
  const sale = selling.stock.find((s) => s.item === POTION)?.price ?? 0;
  p.send({ type: "shop-sell", item: POTION, qty: 1 });
  const sold = result();
  p.send({ type: "shop-leave" });
  p.settle();
  p.answers.length = 0;
  const after = p.fresh();
  if (!sold?.ok || after.money !== mid.money + sale || p.count(after, POTION) !== p.count(before, POTION)) return fail(`venda: ${JSON.stringify(sold)}, dinheiro ${after.money}, Potions ${p.count(after, POTION)}`);
  return { name: `${name}: loja ${buying.shopId}, ${offered.length} itens; Potion comprada por ${price} e vendida por ${sale}` };
}

/** The Cherrygrove Center (spec 023): HP lowered by the development command, then the nurse. */
function center(p: Pilot): Check {
  const name = "Centro de Cherrygrove";
  const fail = (failed: string): Check => ({ name, failed });
  p.send({ type: "debugSetHp", hp: 1 });
  const low = p.fresh();
  if (low.party.some((m) => m.hp !== 1)) return fail(`o comando de desenvolvimento não baixou o HP (${low.party.map((m) => m.hp).join(", ")})`);
  p.heal();
  const after = p.fresh();
  const short = after.party.filter((m) => m.hp !== p.hpMax(m));
  if (short.length) return fail(`HP ${after.party.map((m) => `${m.hp}/${p.hpMax(m)}`).join(", ")}`);
  if (after.respawn?.area !== "69") return fail(`ponto de retorno ${JSON.stringify(after.respawn)}`);
  // Status lives only in combat (the save keeps none), so leaving the Center there is none to clear.
  return { name: `${name}: HP máximo, sem status salvo, retorno no mapa 69` };
}

/** The PC (spec 023): a wild Pokémon caught on Route 29, deposited in the Cherrygrove PC and withdrawn. */
function pc(p: Pilot): Check {
  const name = "PC de Cherrygrove";
  const fail = (failed: string): Check => ({ name, failed });
  const before = p.fresh();
  p.send({ type: "select-ball", item: POKE_BALL });
  p.warp(33, 635, 397);
  p.setWild(true);
  // As a player: walks up to the nearest wild one, sends the Pokémon out, lets the bot weaken its foe, then holds back
  // and throws a ball (balls aim themselves at the nearest wild one).
  let caught = false;
  const grew = () => (p.save?.party.length ?? 0) > before.party.length;
  for (let i = 0; i < 40 && !caught && p.count(p.save ?? before, POKE_BALL) > 0; i++) {
    // A fight that went nowhere ends with the recall button.
    if (p.inCombat()) {
      p.tick(null, BUTTON.recall);
      p.until(() => !p.inCombat(), 100);
    }
    if (!p.engage()) continue;
    // The bot fights the wild one nearest its Pokémon: that is the one to weaken and catch.
    const mine = p.session.world.all().find((x) => x.kind === "pokemon" && p.session.combat?.get(x.id)?.owner === p.playerId);
    const foe = mine && p.nearestWild(1, mine);
    if (!foe) continue;
    p.until(() => {
      const f = p.session.combat?.get(foe.id);
      return !f || f.hp <= f.stats.hp * 0.6 || !p.inCombat();
    }, 1500);
    if (!p.session.combat?.get(foe.id)?.hp || !p.inCombat()) continue;
    p.setHold(true);
    p.tick(null, BUTTON.throw);
    p.tick();
    p.until(grew, 300);
    p.setHold(false);
    p.fresh();
    caught = grew();
  }
  p.setWild(false);
  p.settle();
  if (!caught) return fail("nenhum selvagem capturado na Rota 29");
  const party = p.fresh().party;
  // The Center's PC (the tile at (11, 12)): Someone's PC, then the storage; afterwards, back out of both menus.
  const pcOpen = () => {
    p.answers.push(0, 0, CANCEL, CANCEL);
    p.warp(69, 11, 13);
    const n = p.services.length;
    p.talk("north", false);
    p.until(() => p.services.slice(n).some((m) => m.type === "pcOpen"));
    return p.lastService("pcOpen");
  };
  const opened = pcOpen();
  if (!opened) return fail("o PC não abriu");
  const move = (from: PcSlot, to: PcSlot) => {
    const n = p.services.length;
    p.send({ type: "pc-move", from, to });
    p.until(() => p.services.length > n);
    return p.lastService("pcResult");
  };
  const deposited = move({ where: "party", index: party.length - 1 }, { where: "box", box: 0, index: 0 });
  if (!deposited?.ok) return fail(`depósito recusado (${deposited?.reason})`);
  const mid = p.fresh();
  if (mid.party.length !== party.length - 1) return fail(`depois do depósito o time tem ${mid.party.length}`);
  const withdrawn = move({ where: "box", box: 0, index: 0 }, { where: "party", index: 5 });
  if (!withdrawn?.ok) return fail(`retirada recusada (${withdrawn?.reason})`);
  p.send({ type: "pc-leave" });
  p.settle();
  p.answers.length = 0;
  const after = p.fresh();
  if (JSON.stringify(after.party.map((m) => m.species)) !== JSON.stringify(party.map((m) => m.species))) return fail(`time ${after.party.map((m) => m.species).join(", ")}, esperado ${party.map((m) => m.species).join(", ")}`);
  return { name: `${name}: espécie ${party.at(-1)!.species} capturada, depositada e retirada` };
}

/** Trains for a leader: the lead two levels over the trainer's strongest, then healed. */
const ready = (p: Pilot, trainer: number) => p.train(Math.max(...(p.data.trainers?.trainer(trainer)?.team ?? []).map((m) => m.level)) + 2);

/**
 * With GOLDEN_SAVES set to a folder, writes the save reached here (`<name>.json`): the app walkthrough (spec 024,
 * layer 4) loads them to film the leaders' fights with a party the bot trained, which a keyboard run cannot.
 */
function keep(p: Pilot, name: string): void {
  const dir = process.env["GOLDEN_SAVES"];
  if (dir) writeFileSync(join(dir, `${name}.json`), JSON.stringify(p.fresh(), null, 2));
}

/** Checks of specs 020–023 made on the way, in order. */
const checks: Check[] = [];

/** How each milestone is reached from the one before: inputs, and teleports over the long walks. */
const STEPS: Record<number, (p: Pilot) => void> = {
  // The init script runs on join.
  1: (p) => p.settle(),
  // Downstairs: Mom's scene starts from the map's frame table.
  2: (p) => p.warp(63, 3, 4),
  3: (p) => {
    // Out of the house door: the friend's scene (842:3).
    p.warp(60, 695, 397);
    // In the lab door and up: Elm's call (843:11) on row 10, then the starter machine (843:12).
    p.warp(61, 4, 12);
    p.walk("north", 2);
    p.warp(61, 8, 5);
    p.talk("north");
  },
  4: (p) => {
    // Leaving the lab: the aide's Potions (843:3) on row 11, the friend at the door (842:8), Mom's Pokégear
    // (845:1), Elm at the west exit (842:2).
    p.warp(61, 4, 9);
    p.walk("south", 2);
    p.warp(60, 684, 394);
    p.warp(63, 7, 7);
    p.talk("west");
    p.warp(60, 677, 398);
    p.walk("west", 1);
    // Cherrygrove from Route 29: the guide's tour (850:1), then the trigger it leaves on (850:2).
    p.warp(67, 567, 398);
    p.walk("west", 1);
    p.warp(67, 548, 386);
    p.walk("north", 1);
    // The guide showed the mart and the Center: both, with the real data.
    checks.push(shop(p), center(p));
  },
  5: (p) => {
    // North on Route 30 for the first time: the trainers' scene (227:2) plays on row 354.
    p.warp(34, 558, 355);
    p.walk("north", 1);
    // Mr. Pokémon's house, on the door mat as the door leaves the player: 229:1 from the frame table walks him to (4, 8).
    p.warp(143, 4, 9);
  },
  6: (p) => {
    // Back in Cherrygrove from Route 30: the rival (850:3), then the officer in the lab (843:2).
    const money = p.fresh().money;
    p.warp(67, 576, 399);
    p.walk("west", 1);
    // The officer's scene does not touch money: the rival's prize is all of the difference.
    p.warp(61, 4, 12);
    checks.push(
      p.battle("luta do rival (Cherrygrove)", [495, 496, 497], money, () => {
        p.warp(67, 576, 399);
        p.walk("west", 1);
      }),
    );
  },
  // The same scene goes on to take the egg.
  7: (p) => p.settle(),
  // Route 29 heading east: the friend's catching tutorial (225:1).
  8: (p) => {
    p.warp(33, 665, 398);
    p.walk("east", 1);
  },
  9: (p) => {
    // After the tutorial's Poké Balls: a catch and the PC.
    checks.push(pc(p));
    // North to Violet: Route 30 (Youngster Joey and Mikey show once the egg is delivered; Bug Catcher Don), then Route 31 (Bug Catcher Wade).
    checks.push(p.routeTrainer("luta Joey (Rota 30)", 34, 4), p.routeTrainer("luta Mikey (Rota 30)", 34, 5), p.routeTrainer("luta Don (Rota 30)", 34, 3));
    checks.push(p.routeTrainer("luta Wade (Rota 31)", 35, 5));
    ready(p, 290);
    keep(p, "antes-li");
    // Sprout Tower 3F: the rival's scene (18:1) on the way, then Elder Li (18:2).
    p.warp(156, 13, 18);
    p.walk("north", 1);
    const money = p.fresh().money;
    p.warp(156, 12, 10);
    p.talk("north");
    checks.push(p.battle("luta Li (Sprout Tower)", [290], money, () => p.talk("north")));
  },
  // Violet Gym: Falkner (859:1), past the gym's trainers.
  10: (p) => {
    ready(p, 20);
    keep(p, "antes-falkner");
    const money = p.fresh().money;
    p.warp(135, 15, 5);
    p.talk("north");
    checks.push(p.battle("luta Falkner (ginásio de Violet)", [20], money, () => p.talk("north")));
  },
};

it("goes from the bedroom to the Zephyr Badge", () => {
  const p = pilot();
  const reached: Milestone[] = [];
  let shared = 0;
  const isolation: Check[] = [];
  const optional = () => {
    const events = JSON.parse(readFileSync(join(stages, "events", "events", "report.json"), "utf8")) as { commands: { name: string; maps: number[] }[] };
    // The stretch: the maps the run went through and the ones their doors lead to (its houses and optional rooms).
    const maps = new Set([...p.visited].flatMap((m) => [m, ...(p.data.scripts?.events(m)?.warps.map((w) => w.destMap) ?? [])]));
    return optionalMissing(events.commands, maps, (n) => SCRIPT_HANDLERS.has(n), p.hit);
  };
  const extra = () => ({ checks: [...checks, ...isolation], optional: optional() });
  for (const m of MILESTONES) {
    const step = STEPS[m.n];
    const check = step ? (step(p), p.check(m)) : "passos do marco não escritos";
    const apart = p.isolation();
    if (apart) isolation.push({ name: `isolamento no marco ${m.n}`, failed: apart });
    shared = Math.max(shared, p.differing());
    if (check) {
      const tail = [`  comandos faltando: ${p.missing.join(", ") || "nenhum"}`, `  travado depois de: ${p.stuck.join("; ") || "nenhum"}`, "  log do servidor:", ...p.logs.slice(-8).map((l) => `    ${l}`)];
      expect.fail([report(reached, MILESTONES.length, p.failure(m, check), extra()), ...tail].join("\n"));
    }
    reached.push(m);
  }
  if (!isolation.length) isolation.push({ name: `isolamento (spec 020): em ${MILESTONES.length} marcos o segundo jogador viu New Bark pelas próprias flags; até ${shared} flags de esconder diferentes das do primeiro` });
  const text = report(reached, MILESTONES.length, undefined, extra());
  console.log(text);
  expect(checks.filter((c) => c.failed), text).toEqual([]);
  expect(isolation.filter((c) => c.failed), text).toEqual([]);
  expect(shared, "as flags dos dois jogadores nunca diferiram em New Bark: o isolamento não foi posto à prova").toBeGreaterThan(0);
  expect(p.missing).toEqual([]);
  expect(p.stuck).toEqual([]);
  // Timeouts, refused teleports and scripts cut short all log: the path plays clean or fails.
  expect(p.logs).toEqual([]);
});
