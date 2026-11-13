import { timeOfDay, wildMoves } from "@soulsilver/shared/wild";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import {
  BUTTON,
  clientMessage,
  createRng,
  protocolMismatchMessage,
  stepMovement,
  unstick,
  type CloseReason,
  type NoticeCode,
  type PlayerInput,
  type RecordingEvent,
  type RejectCode,
  type Rng,
  type ServerMessage,
  type ArenaSpec,
  type WorldLookup,
  type TradeOffer,
} from "@soulsilver/shared/game";
import type { Decision } from "@soulsilver/shared/ai";
import { TICKS_PER_S } from "@soulsilver/shared/combat";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { npcOccupied } from "@soulsilver/shared/npc";
import { leadIndex } from "@soulsilver/shared/companion";
import { expForLevel, memberStats } from "@soulsilver/shared/progression";
import { migrate, newBoxes, newCollection, newProgress, STORY_REV, storyUnstarted, type PartyMember, type Save } from "@soulsilver/shared/save";
import { buildAiData, BUNDLED_AI_CONTENT, type AiData } from "./ai-loader";
import { ARENA_AREA, ARENA_MAP, ARENA_SPAWN, arenaMember, foeSpot, trainerMember } from "./arena";
import { createCombat, type Combat } from "./combat";
import type { CombatData } from "./combat-loader";
import { createCaptures, type Catcher } from "./capture";
import { createCompanions, type Trainer } from "./companion";
import type { CompanionData } from "./companion-loader";
import type { Connection } from "./connection";
import { bundledItemRules, createItems, itemStateOf, reorderParty, type ItemRules, type ItemsData } from "./items";
import { placeOf } from "@soulsilver/shared/companion";
import type { ItemState } from "@soulsilver/shared/save";
import { createProgression, type Learner, type Progression, type ProgressionData } from "./progression";
import { createReplica, replicate, type Replica } from "./replication";
import { createNpcs } from "./npcs";
import { createScripts, type ScriptData, type Scripts, type StuckPlayer } from "./scripts";
import type { MissingCommand } from "@soulsilver/shared/script";
import { startPosition } from "./start";
import { createPcs } from "./pc";
import { createTrades } from "./trade";
import { createDuels } from "./duel";
import { createShops, type ShopData, type Shops } from "./shop";
import { createTrainerBattles, type TrainerBattles } from "./trainer-battle";
import type { TrainerData } from "./trainer-loader";
import { bundledFieldData, createField, type FieldData } from "./field";
import { createFishing } from "./fishing";
import { createWilds } from "./wild";
import { createSessionClock, SUNDAY_NOON } from "./clock";
import { createPhone, scriptedCallOf } from "./phone";
import { createRadio, GB_SOUNDS } from "./radio";
import { capFor } from "@soulsilver/shared/radio";
import { BUNDLED_TIME_BANDS, type WildData } from "./wild-loader";
import { createWorld, type World } from "./world";

// One match of 1 to 4 players (spec 010, 012). Pure: time only advances through step().

export const MAX_PLAYERS = 4;
const MAX_QUEUED_INPUTS = 10;
const TICK_MS = 50;
/** 10 s at 20 Hz. */
const DEFAULT_TIMEOUT_TICKS = 200;
/** The clock goes out every 5 s of real time (spec 026); the clients run it on in between. */
const GEAR_MAP_EVERY_TICKS = TICKS_PER_S;
const CLOCK_EVERY_TICKS = 5 * TICKS_PER_S;
/** A save goes to each player every 30 s of play (FR-006 allows up to 60 s). */
const SAVE_INTERVAL_TICKS = 600;
/** A dropped guest keeps the seat for 2 minutes (FR-020). */
const RESERVE_TICKS = 2400;
/** The final saves get 3 s to be acknowledged before the session closes (FR-021). */
const CLOSE_WAIT_TICKS = 60;

export interface Spawn {
  area: string;
  x: number;
  y: number;
  level: number;
  facing: Direction;
}

/**
 * Spec 028.3: the host's book of trades whose save a client never acknowledged, kept across sessions (a file, in
 * the app). Keyed by the player's name; shortcut: two friends with one name share an entry, add an id if that happens.
 */
export interface TradeLedger {
  get(name: string): Save | undefined;
  put(name: string, save: Save): void;
  remove(name: string): void;
}

export interface SessionOptions {
  /** Spec 028.3: without it, a trade unsaved on a client survives only while this session lasts. */
  tradeLedger?: TradeLedger | undefined;
  seed: number;
  /** Maps by id; an unknown map is open ground. */
  world: WorldLookup;
  log(message: string): void;
  /** Ticks without any message before a player is dropped. */
  timeoutTicks?: number;
  /** Everything that changes the world from outside, in order (research R9). */
  onRecord?(event: RecordingEvent): void;
  /** Checks that depend on the world (spec 012, FR-018); returns a message to refuse the save. */
  validateSave?(save: Save): string | undefined;
  /** ISO timestamp for emitted saves; the simulation itself never reads a clock. */
  clock: () => string;
  /** A fresh unguessable reconnect token. */
  newToken: () => string;
  /** Combat rules and data (spec 013); without them there is no combat. */
  combat?: CombatData | undefined;
  /** Accept hellos that ask for the dev arena (development builds only). */
  devArena?: boolean | undefined;
  /** Companion rules (spec 014); without them nobody follows and the combat button does nothing. */
  companion?: CompanionData | undefined;
  /** The host's clock (spec 026): the session's time for every player; a Sunday noon when omitted, so tests never depend on the hour. */
  now?: (() => Date) | undefined;
  /** Development builds: the party a save with none starts with, so the companion can be tried before the starter event exists. */
  devParty?: PartyMember[] | undefined;
  /** Wild Pokémon and capture (spec 015); they need combat too. */
  wild?: WildData | undefined;
  /** Combat AI data (spec 019); the bundled content/ai when omitted. */
  ai?: AiData | undefined;
  /** Every AI decision, for the host's decision log (spec 019, FR-034). */
  onDecision?: ((d: Decision) => void) | undefined;
  /** Development builds: the bag a save with none starts with, so capture can be tried. */
  devBag?: Save["bag"] | undefined;
  /** Experience, levels, moves and evolution (spec 016); without it nobody grows. */
  progression?: ProgressionData | undefined;
  /** Item data for using items from the bag (spec 017); without it every item is unavailable. */
  items?: ItemsData | undefined;
  /** Poké Mart stock and prices (spec 023); without them a clerk's script ends as missing. */
  shops?: ShopData | undefined;
  /** Event scripts (spec 020); without them nobody talks and nothing triggers. */
  scripts?: ScriptData | undefined;
  /** Ticks a script waits for a client's answer before letting the player go. */
  scriptTimeoutTicks?: number | undefined;
  /** Runs Prof. Oak's introduction for new saves (spec 021). */
  intro?: boolean | undefined;
  /** Every command a script reached that nothing implements (spec 020, FR-008). */
  onMissingCommand?: ((m: MissingCommand & { player: number }) => void) | undefined;
  /** A script left the player unable to move (spec 024). */
  onStuck?: ((s: StuckPlayer) => void) | undefined;
  /** Development builds: the script debugger may change flags. */
  devTools?: boolean | undefined;
  /** Trainer battles (spec 022); they need combat, the companion rules and scripts too. */
  trainers?: TrainerData | undefined;
  /** Field-move rules and locomotion classes (spec 025); the bundled content when omitted. */
  field?: FieldData | undefined;
  /** Item effects and tuning (spec 027); the bundled content/items when omitted. */
  itemRules?: ItemRules | undefined;
}

/** A save but the parts snapshot() fills at save time. */
type BeforeScript = Omit<Save, "playTimeMs" | "savedAt" | "rev" | "boxes" | "pcItems">;

interface Player {
  id: number;
  entityId: number;
  conn: Connection | undefined;
  lastInputSeq: number;
  /** Sorted by seq. */
  queue: PlayerInput[];
  lastSeenTick: number;
  replica: Replica;
  token: string;
  /** The save this player joined with: identity fields (name, character) come from it. */
  base: Save;
  /** Play time at joinTick. */
  playTimeMs: number;
  joinTick: number;
  rev: number;
  /** The save state captured when the running script started; undefined between scripts. */
  beforeScript?: BeforeScript | undefined;
  lastArea: string;
  /** Spec 028.3: rev of the save a trade sent, until the client acknowledges it. */
  tradeRev?: number | undefined;
  /** Spec 028.5: the progress from before a duel, given back when it ends; saves taken meanwhile use it. */
  duelBackup?: Pick<Save, "party" | "bag" | "money" | "pending" | "pokedex"> | undefined;
  /** Rev of a save sent while closing that has not been acknowledged yet. */
  pendingAck: number | undefined;
  gone: boolean;
  /** In the dev arena: its wild foes' entities (a trainer's battle keeps its own). Arena players never get saves. */
  arenaFoes: number[] | undefined;
  /** Asked for the AI debug overlay (spec 019). */
  debugAi: boolean;
  /** Party, money, badges and respawn point, changed in place by the companion rules; bag, Pokédex and PC boxes by capture. */
  progress: Trainer["progress"] & Catcher["progress"] & Learner["progress"] & Pick<Save, "pcItems" | "flyPoints" | "escape" | "phone"> & ItemState;
  /** Story flags and variables (spec 020), changed by this player's scripts only. */
  flags: Set<number>;
  vars: Map<number, number>;
  /** Buttons held on the last input, to see presses. */
  buttons: number;
  /** The full menu is open (spec 017); with a running script, it shows the player as busy. */
  menuOpen: boolean;
  /** The Pokégear is open (spec 026): busy as the menu, and its map is kept fresh. */
  gearOpen: boolean;
}

interface Reserved {
  token: string;
  base: Save;
  spawn: Spawn;
  until: number;
  /** Spec 028.3: a trade changed this progress and its save was never acknowledged: the seat does not expire, and the player gets this progress back even without the token. */
  tradeUnsaved: boolean;
}

export interface Session {
  readonly state: "open" | "closing" | "closed";
  readonly tick: number;
  /** Connected plus reserved players: the seats taken. */
  readonly occupied: number;
  readonly world: World;
  readonly rng: Rng;
  readonly combat: Combat | undefined;
  connect(conn: Connection): void;
  /** Advances one tick: timeouts, inputs, simulation, then state to every client. */
  step(): void;
  /** Sends the final saves, waits for their acks (up to 3 s), then closes. */
  close(reason: CloseReason): void;
  /** Sends to every connected player. */
  broadcast(msg: ServerMessage): void;
  /** Connectionless players, for replay. Returns the player id. */
  join(name: string, spawn: Spawn): number;
  leave(playerId: number): void;
  enqueue(playerId: number, input: PlayerInput): void;
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase("en");

export function createSession(options: SessionOptions): Session {
  const world = createWorld();
  const lookup: WorldLookup = (id) => (id === ARENA_AREA ? ARENA_MAP : options.world(id));
  const rng = createRng(options.seed);
  const timeoutTicks = options.timeoutTicks ?? DEFAULT_TIMEOUT_TICKS;
  const { clock } = options;
  const time = createSessionClock(options.now ?? SUNDAY_NOON);
  const bands = options.wild?.spawn.timeBands ?? BUNDLED_TIME_BANDS;
  const fieldData = options.field ?? bundledFieldData();
  const combat = options.combat ? createCombat({ data: options.combat, rng, lookup: lookup, crossesWater: (species) => fieldData.locomotion(species) !== "terrestrial" }) : undefined;
  const companions = options.companion
    ? createCompanions({
        data: options.companion,
        combat,
        combatData: options.combat,
        lookup: lookup,
        world,
        rng,
        time: () => timeOfDay(time.hour(), bands),
        home: () => startPosition(lookup),
        busy: (id): boolean => progression?.busy(id) ?? false,
        detail: (m) => memberDetail(m),
        stowed: (id) => field.riding(id),
        extras: (m) => ({ held: items.heldFor(m), cooldownMul: items.cooldownMulFor(m) }),
        launchable: (id, species) => field.launchable(id, species),
        pin: (id, center, radiusPx) => {
          const c = wilds?.ai.get(id);
          if (c) Object.assign(c, { home: { x: center.x, y: center.y }, leashPx: radiusPx });
        },
        log: (message) => options.log(message),
      })
    : undefined;
  const progression: Progression | undefined =
    options.progression && companions
      ? createProgression({ data: options.progression, inCombat: (id) => companions.inCombat(id), active: (id) => companions.active(id), refresh: (id) => companions.refresh(id) })
      : undefined;
  const ai = options.ai ?? buildAiData(BUNDLED_AI_CONTENT);
  const aiDebugEvery = Math.max(1, Math.round(TICKS_PER_S / ai.tuning.debug.hz));
  const aiDebugRadiusPx = ai.tuning.debug.radiusTiles * MAP_TILE_PX;
  const wilds =
    options.wild && combat && options.combat
      ? createWilds({
          data: options.wild,
          ai,
          // A player's trainer or Pokémon: its owner's Repel (spec 027).
          repel: (body) => {
            const owner = body.kind === "player" ? [...players.values()].find((p) => p.entityId === body.id)?.id : Number(body.data["owner"]);
            return owner === undefined || Number.isNaN(owner) ? 0 : items.repelLevel(owner);
          },
          combat,
          combatData: options.combat,
          lookup: lookup,
          world,
          rng,
          hour: time.hour,
          // The radio of the players standing in the area (spec 026), thinned by a Repel or the Black Flute (spec 027).
          cap: (area, base) => {
            const here = [...players.values()].filter((p) => world.get(p.entityId)?.area === area);
            const radioCap = capFor(base, here.map((p) => radio.factor(p.id, area, { gbSounds: p.progress.bag.some((b) => b.item === GB_SOUNDS), nationalDex: false })));
            return Math.round(radioCap * Math.min(1, ...here.map((p) => items.density(p.id))));
          },
          onDecision: options.onDecision,
          onFaint: (id, species, level) => progression?.faint(id, species, level),
          onRemove: (id) => progression?.forget(id),
          log: (message) => options.log(message),
        })
      : undefined;
  const captures =
    wilds && options.wild && combat && options.combat
      ? createCaptures({ data: options.wild, wilds, combat, combatData: options.combat, world, lookup: lookup, rng, hour: time.hour, controlled: (id) => companions?.controlled(id) })
      : undefined;
  const hpMax = (m: PartyMember) => {
    const species = options.combat?.species(m.species);
    return species ? memberStats(species.baseStats, m).hp : m.hp;
  };
  /** What the party screen shows beyond HP (spec 017); undefined without the species data. */
  function memberDetail(m: PartyMember) {
    const base = options.combat?.species(m.species);
    const growth = options.progression?.species(m.species);
    if (!base) return undefined;
    const rate = growth?.growthRate;
    return {
      moves: [...m.moves],
      stats: memberStats(base.baseStats, m),
      nature: m.nature,
      exp: m.experience,
      ...(rate ? { expNext: expForLevel(rate, Math.min(100, m.level + 1)) } : {}),
      ...(growth?.abilities ? { ability: growth.abilities[0] } : {}),
      ...(m.held !== undefined ? { held: m.held } : {}),
      ...(m.ppUps ? { ppUps: [...m.ppUps] } : {}),
    };
  }
  // shortcut: no National Pokédex yet, so Pokémon Music never plays the Hoenn and Sinnoh tunes; read it when the Pokédex has one.
  const radio = createRadio({ hour: time.hour, weekday: time.weekday });
  /** In a script, a menu, a fight or a decision: field actions and calls wait (spec 025, spec 026). */
  const busyOf = (id: number): boolean => {
    const p = players.get(id);
    return !p || p.menuOpen || p.gearOpen || (scripts?.busy(id) ?? false) || (companions?.inCombat(id) ?? false) || (trainerBattles?.locked(id) ?? false) || (progression?.busy(id) ?? false);
  };
  // Its own generator, so calls never shift the rolls of the simulation (replays, principle IV).
  const phone = createPhone({
    book: options.scripts?.phone,
    world,
    rng: createRng((options.seed ^ 0x026) >>> 0),
    weekday: time.weekday,
    hour: time.hour,
    bands,
    rings: (area) => lookup(area)?.incomingCalls ?? true,
    busy: busyOf,
    now: clock,
    trainerFlag: (t) => (options.trainers?.tuning.trainerFlagBase ?? 0) + t,
    onScriptedEnd: (id) => scripts?.callEnded(id),
    mapsec: (area) => lookup(area)?.mapsec,
    team: (trainer) => options.trainers?.trainer(trainer)?.team.map((m) => m.species) ?? [],
    // getRandomEncounterSlot: the grass of the band, or a Fisherman's Good Rod (its 4th slot the night fish at night).
    wild: (map, band, fisherman) => {
      const index = lookup(String(map))?.encounters;
      const e = index === undefined ? undefined : options.wild?.encounter(index);
      if (!e) return [];
      if (!fisherman) return (e.grass?.[(["morning", "day", "night"] as const)[band]!] ?? []).map((x) => x.species);
      const rod = (e.goodRod ?? []).map((x) => x.species);
      if (band === 2 && e.nightFish !== undefined && rod.length > 3) rod[3] = e.nightFish;
      return rod;
    },
  });
  const npcs = options.scripts ? createNpcs({ world, lookup: lookup, seed: options.seed, log: (message) => options.log(message) }) : undefined;
  const scripts: Scripts | undefined = options.scripts
    ? createScripts({
        data: options.scripts,
        rockSmashItems: fieldData.rules.rockSmashItems,
        world,
        lookup: lookup,
        npcs,
        progression: options.progression,
        items: options.items,
        seed: options.seed,
        hpMax,
        weekday: time.weekday,
        hour: time.hour,
        phone,
        scriptedCall: scriptedCallOf,
        machineMove: (item) => progression?.machineMove(item),
        apricorns: (id) => items.apricorns(id),
        timeoutTicks: options.scriptTimeoutTicks,
        intro: options.intro,
        devTools: options.devTools,
        changed(playerId, what) {
          if (what === "party") companions?.refresh(playerId);
          else if (captures) captures.refresh(playerId);
          else {
            const p = players.get(playerId);
            p?.conn?.send({ type: "bag", items: p.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
          }
        },
        onMissing: options.onMissingCommand,
        onStuck: options.onStuck,
        onStart: (playerId) => {
          const p = players.get(playerId);
          if (p) p.beforeScript = capture(p);
        },
        battle: (playerId, trainer, partner): boolean => trainerBattles?.startScripted(playerId, trainer, partner) ?? false,
        shop: (playerId, shop, sell): boolean => shops?.open(playerId, shop, sell) ?? false,
        pc: (playerId): boolean => pcs.open(playerId),
        fieldWild:
          wilds && options.wild
            ? {
                encounter: (area) => {
                  const table = lookup(area)?.encounters;
                  return table === undefined ? undefined : options.wild!.encounter(table);
                },
                spawn(area, x, y, species, level) {
                  try {
                    wilds.place(area, x, y, { species, level, moves: wildMoves(options.wild!.levelUp(species), level) }, tick);
                    return true;
                  } catch (error) {
                    options.log(`Wild ${species} out of a rock or tree on map ${area} not spawned: ${(error as Error).message}`);
                    return false;
                  }
                },
              }
            : undefined,
        trainerFlagBase: options.trainers?.tuning.trainerFlagBase,
        talkTrainer: (playerId, npc): boolean => trainerBattles?.talk(playerId, npc) ?? false,
        log: (message) => options.log(message),
      })
    : undefined;
  const shops: Shops | undefined = options.shops
    ? createShops({
        data: options.shops,
        changed(playerId) {
          const p = players.get(playerId);
          p?.conn?.send({ type: "bag", items: p.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
        },
        onClose: (playerId) => scripts?.serviceClosed(playerId),
        log: (message) => options.log(message),
      })
    : undefined;
  const pcs = createPcs({
    changed(playerId, what) {
      const p = players.get(playerId);
      if (what === "party") companions?.refresh(playerId);
      else if (captures) captures.refresh(playerId);
      else p?.conn?.send({ type: "bag", items: p.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
    }, onClose: (playerId) => scripts?.serviceClosed(playerId), pocketOf: options.items && ((item) => options.items!.item(item)?.pocket) });
  /** Spec 028.2: trades between players standing near each other on the same map. */
  const TRADE_RANGE_PX = 48;
  const trades = createTrades({
    // Combat (wild, trainer, a duel to come) or a cutscene; a menu does not count.
    busy: (id) => {
      const presence = world.get(players.get(id)?.entityId ?? -1)?.data["presence"];
      return presence === "combat" || presence === "cutscene";
    },
    near(a, b) {
      const [ea, eb] = [world.get(players.get(a)?.entityId ?? -1), world.get(players.get(b)?.entityId ?? -1)];
      return !!ea && !!eb && ea.area === eb.area && Math.hypot(ea.x - eb.x, ea.y - eb.y) <= TRADE_RANGE_PX;
    },
    holdings: (id) => ({ party: players.get(id)?.progress.party.length ?? 0, bag: players.get(id)?.progress.bag ?? [] }),
    commit: (a, giveA, b, giveB) => commitTrade(a, giveA, b, giveB),
    send: (id, msg) => players.get(id)?.conn?.send(msg),
  });

  /** Spec 028.5: duels between players, in an arena like a trainer battle's (spec 022); nothing is won or lost. */
  const DUEL_BATTLE_BASE = 1_000_000;
  let duelBattles = 0;
  const duels = createDuels({
    busy: (id) => {
      const presence = world.get(players.get(id)?.entityId ?? -1)?.data["presence"];
      return presence === "combat" || presence === "cutscene" || trades.of(id) !== undefined;
    },
    near: (a, b) => {
      const [ea, eb] = [world.get(players.get(a)?.entityId ?? -1), world.get(players.get(b)?.entityId ?? -1)];
      return !!ea && !!eb && ea.area === eb.area && Math.hypot(ea.x - eb.x, ea.y - eb.y) <= TRADE_RANGE_PX;
    },
    send: (id, msg) => players.get(id)?.conn?.send(msg),
    begin(a, b, rules) {
      const [pa, pb] = [players.get(a), players.get(b)];
      const [ea, eb] = [world.get(pa?.entityId ?? -1), world.get(pb?.entityId ?? -1)];
      if (!pa || !pb || !ea || !eb || !companions) return undefined;
      // Between the two players, as wide as a trainer battle's.
      const arena = { area: ea.area, x: (ea.x + eb.x) / 2, y: (ea.y + eb.y) / 2, radiusPx: (options.trainers?.tuning.arenaRadiusTiles ?? 4) * MAP_TILE_PX };
      const battle = DUEL_BATTLE_BASE + ++duelBattles;
      for (const p of [pa, pb]) {
        const { party, bag, money, pending, pokedex } = p.progress;
        p.duelBackup = structuredClone({ party, bag, money, pending, pokedex });
        // The first `team` members; at level 50, every one at full HP for it.
        p.progress.party = party.slice(0, rules.team).map((m) => {
          const fighter = structuredClone(m);
          if (rules.level === "50") {
            fighter.level = 50;
            fighter.hp = hpMax(fighter);
          }
          return fighter;
        });
        p.progress.pending = [];
      }
      const entered = [pa, pb].every((p) => companions.enterBattle(p.id, { battle, x: arena.x, y: arena.y, radiusPx: arena.radiusPx, onDefeat: () => duels.defeated(p.id) }, tick));
      if (!entered) {
        for (const p of [pa, pb]) giveBack(p);
        return undefined;
      }
      return arena;
    },
    finish(a, b) {
      for (const id of [a, b]) {
        const p = players.get(id);
        if (p) giveBack(p);
      }
    },
  });

  /** Spec 028.5: out of the duel's arena, with the progress from before it. */
  function giveBack(p: Player): void {
    companions?.leaveBattle(p.id);
    if (!p.duelBackup) return;
    Object.assign(p.progress, p.duelBackup);
    p.duelBackup = undefined;
    companions?.refresh(p.id);
    p.conn?.send({ type: "bag", items: p.progress.bag.map((r) => ({ ...r })) } satisfies ServerMessage);
  }

  const trainerBattles: TrainerBattles | undefined =
    options.trainers && combat && options.combat && companions && scripts
      ? createTrainerBattles({
          data: options.trainers,
          ai,
          combat,
          combatData: options.combat,
          companions,
          world,
          lookup: lookup,
          rng,
          items: options.items,
          held: (item) => items.heldItem(item),
          extras: (m) => ({ held: items.heldFor(m), cooldownMul: items.cooldownMulFor(m) }),
          progression,
          trainerOf: (e) => scripts.trainerOf(e),
          visible: (playerId, e) => scripts.visible(playerId, e),
          free: (playerId) => {
            const p = players.get(playerId);
            const e = p && world.get(p.entityId);
            return !!e && !p.menuOpen && !scripts.busy(playerId) && !companions.inCombat(playerId) && !(progression?.busy(playerId) ?? false) && e.data["hop"] === undefined && e.data["warping"] === undefined;
          },
          broadcast(area, msg, except) {
            for (const p of players.values()) if (p.id !== except && world.get(p.entityId)?.area === area) p.conn?.send(msg);
          },
          onEnd: (playerId, won) => scripts.battleEnded(playerId, won),
          rematch: (playerId, trainer) => phone.rematchOfTrainer(playerId, trainer),
          rematchWon: (playerId, contact) => phone.rematchWon(playerId, contact),
          offerNumber: (playerId, trainer, again) => {
            const c = phone.contactOfTrainer(trainer);
            return !!c && !phone.registered(playerId, c.id) && scripts.offerNumber(playerId, c.id, c.bank, again);
          },
          onDecision: options.onDecision,
          log: (message) => options.log(message),
        })
      : undefined;
  const field = createField({
    data: fieldData,
    world,
    lookup,
    busy: busyOf,
    flyPoints: options.scripts?.flyPoints ?? [],
    home: (id) => players.get(id)?.progress.respawn ?? startPosition(lookup),
  });
  const fishing = createFishing({
    rules: fieldData.fishing,
    world,
    lookup,
    rng,
    busy: (id) => field.busy(id),
    friendship(id) {
      const party = players.get(id)?.progress.party ?? [];
      const out = world.all().some((e) => e.kind === "pokemon" && e.data["owner"] === String(id) && !companions?.inCombat(id));
      return out ? (party[leadIndex(party) ?? -1]?.friendship ?? 0) : 0;
    },
    mode: (id) => field.mode(id),
    setMode: (id, mode) => field.setMode(id, mode),
    canFish: (area, rod) => wilds?.canFish(area, rod) ?? false,
    hook: (area, rod, x, y, tick) => void wilds?.hook(area, rod, x, y, tick),
  });
  const notice = (p: Player, code: NoticeCode) => p.conn?.send({ type: "notice", code } satisfies ServerMessage);
  const sendBag = (p: Player) => {
    if (captures) captures.refresh(p.id);
    else p.conn?.send({ type: "bag", items: p.progress.bag.map((b) => ({ ...b })) } satisfies ServerMessage);
  };
  const berryHours = new Map((options.scripts?.fieldItems?.berries ?? []).map((b) => [b.item, b.hoursPerStage]));
  const items = createItems({
    data: options.items,
    rules: options.itemRules ?? bundledItemRules(),
    combat,
    world,
    rng: createRng((options.seed ^ 0x027) >>> 0),
    now: () => time.now(),
    hpMax,
    controlled: (id) => companions?.controlled(id),
    active: (id) => companions?.active(id),
    inCombat: (id) => companions?.inCombat(id) ?? false,
    changed(id, what) {
      const p = players.get(id);
      if (!p) return;
      if (what === "party") companions?.refresh(id);
      else sendBag(p);
    },
    progression,
    escapeRope: (id) => field.escapeRope(id),
    escapeRopeItem: fieldData.rules.escapeRope,
    hidden: (id) => scripts?.hidden(id) ?? [],
    companionPlace(id) {
      const p = players.get(id);
      const e = p && world.get(p.entityId);
      const out = world.all().some((w) => w.kind === "pokemon" && w.data["owner"] === String(id));
      const map = e && lookup(e.area);
      return e && out ? placeOf(map?.areaType, map?.mapsec, options.companion?.reactions.towns ?? []) : undefined;
    },
    berryHours: (berry) => berryHours.get(berry),
    log: (message) => options.log(message),
  });
  /** The session's clock (spec 026): one time for every player. */
  function clockMessage() {
    return { type: "clock", minuteOfDay: time.minuteOfDay(), weekday: time.weekday(), fixed: time.fixed() } satisfies ServerMessage;
  }
  /** The Pokégear map (spec 026): this player's visited places and where the others stand, nothing else of theirs. */
  function sendGear(p: Player): void {
    const others = [...players.values()].filter((q) => q.id !== p.id && q.arenaFoes === undefined).flatMap((q) => {
      const e = world.get(q.entityId);
      return e ? [{ name: q.base.name, area: e.area, x: e.x, y: e.y }] : [];
    });
    p.conn?.send({ type: "gear-map", visited: [...p.progress.flyPoints], others: others.slice(0, 3) } satisfies ServerMessage);
  }

  function sendClock(): void {
    const msg = clockMessage();
    for (const p of players.values()) p.conn?.send(msg);
  }

  /** The menu does not pause anything; it only shows the player as busy to the others (spec 017, FR-012). */
  function setBusy(p: Player, busy: boolean): void {
    const e = world.get(p.entityId);
    if (!e || (e.data["busy"] === true) === busy) return;
    const data = { ...e.data };
    if (busy) data["busy"] = true;
    else delete data["busy"];
    world.update({ ...e, data });
  }
  /** What the others see this player doing (spec 028.1): combat over a cutscene over a menu, or nothing. */
  function setPresence(p: Player): void {
    const e = world.get(p.entityId);
    if (!e) return;
    const presence = companions?.inCombat(p.id) || trainerBattles?.inBattle(p.id) ? "combat" : scripts?.busy(p.id) ? "cutscene" : p.menuOpen || p.gearOpen ? "menu" : undefined;
    if (e.data["presence"] === presence) return;
    const data = { ...e.data };
    if (presence) data["presence"] = presence;
    else delete data["presence"];
    world.update({ ...e, data });
  }
  /** "Estou preso" (spec 024): to the blackout spot, cutting short a script in progress; never a way out of a fight. */
  function rescue(p: Player): boolean {
    if (p.arenaFoes !== undefined || companions?.inCombat(p.id) || trainerBattles?.inBattle(p.id) || scripts?.abort(p.id) === false) return false;
    const to = p.progress.respawn ?? startPosition(lookup);
    const e = world.get(p.entityId)!;
    const data = { ...e.data };
    delete data["hop"];
    delete data["warping"];
    world.update(unstick({ ...e, area: to.area, x: to.x, y: to.y, level: 0, facing: "south", data }, lookup));
    p.conn?.send({ type: "rescued" } satisfies ServerMessage);
    return true;
  }
  /** The player and their Pokémon are out of reach while a cutscene runs (spec 021, FR-012): combat and wild AIs skip them. */
  function setSheltered(p: Player, on: boolean): void {
    for (const e of world.all()) {
      if (e.id !== p.entityId && !(e.kind === "pokemon" && e.data["owner"] === String(p.id))) continue;
      if ((e.data["cutscene"] === true) === on) continue;
      const data = { ...e.data };
      if (on) data["cutscene"] = true;
      else delete data["cutscene"];
      world.update({ ...e, data });
    }
  }
  const players = new Map<number, Player>();
  const reserved = new Map<string, Reserved>();
  let state: "open" | "closing" | "closed" = "open";
  let closeReason: CloseReason = "closed-by-host";
  let closingTicks = 0;
  let tick = 0;
  let nextPlayerId = 1;
  let hostId: number | undefined;
  /** Player ids last sent in the "players" list. */
  let roster = "";

  function add(base: Save, conn: Connection | undefined, spawn: Spawn, token: string, arena = false): Player {
    const id = nextPlayerId++;
    const entityId = world.add({ kind: "player", area: spawn.area, x: spawn.x, y: spawn.y, level: spawn.level, facing: spawn.facing, data: { name: base.name, character: base.character } }).id;
    const player: Player = {
      id,
      entityId,
      conn,
      lastInputSeq: -1,
      queue: [],
      lastSeenTick: tick,
      replica: createReplica(),
      token,
      base: { ...base, npcPlacement: structuredClone(base.npcPlacement) },
      playTimeMs: base.playTimeMs,
      joinTick: tick,
      rev: base.rev,
      lastArea: spawn.area,
      pendingAck: undefined,
      gone: false,
      arenaFoes: arena ? [] : undefined,
      debugAi: false,
      progress: {
        party: base.party.map((m) => ({ ...m })),
        money: base.money,
        badgeSet: base.badgeSet,
        flyPoints: [...base.flyPoints],
        respawn: base.respawn,
        escape: base.escape ?? null,
        bag: base.bag.map((b) => ({ ...b })),
        pokedex: { seen: [...base.pokedex.seen], caught: [...base.pokedex.caught] },
        boxes: structuredClone(base.boxes),
        pcItems: base.pcItems.map((b) => ({ ...b })),
        pending: base.pending.map((i) => ({ ...i })),
        phone: structuredClone(base.phone),
        ...itemStateOf(base),
      },
      flags: new Set(base.flags),
      vars: new Map(Object.entries(base.vars).map(([k, v]) => [Number(k), v])),
      buttons: 0,
      menuOpen: false,
      gearOpen: false,
    };
    players.set(id, player);
    const send = (msg: ServerMessage) => player.conn?.send(msg);
    companions?.join({ playerId: id, entityId, progress: player.progress, send });
    captures?.join({ playerId: id, entityId, progress: player.progress, send });
    progression?.join({ playerId: id, progress: player.progress, send });
    field.join({ playerId: id, entityId, progress: player.progress, send });
    fishing.join({ playerId: id, entityId, progress: player.progress, send });
    trainerBattles?.join({ playerId: id, entityId, flags: player.flags, progress: player.progress, send });
    items.join({ playerId: id, entityId, progress: player.progress, send });
    // The arena has no story, shops or PC.
    if (!arena) {
      scripts?.join({ playerId: id, entityId, name: base.name, character: base.character, flags: player.flags, vars: player.vars, placement: player.base.npcPlacement, rival: player.base, intro: base.rev === 0 && base.playTimeMs === 0, init: (base.rev === 0 && base.playTimeMs === 0) || storyUnstarted(base), progress: player.progress, send });
      phone.join({ playerId: id, entityId, character: base.character, phone: player.progress.phone, flags: player.flags, send });
      shops?.join({ playerId: id, progress: player.progress, send });
      pcs.join({ playerId: id, progress: player.progress, send });
    }
    hostId ??= id;
    options.onRecord?.({ tick, kind: "join", playerId: id, name: base.name, spawn });
    return player;
  }

  /**
   * The player's save as of now; each call takes the next rev. While a script runs, the state from just before it
   * (spec 024), as the original never saves mid-script: a scene cut short by a save would run again on load over
   * effects it already had (a second Mystery Egg).
   */
  function snapshot(p: Player): Save {
    if (!scripts?.busy(p.id)) p.beforeScript = undefined;
    // What the player buys or stores in a shop or PC the script opened is kept; the rest of the scene still starts over.
    else if (scripts.inService(p.id)) p.beforeScript = capture(p);
    // The boxes and the PC's items only change in the PC, so they are always saved as they are.
    return {
      ...(p.beforeScript ?? capture(p)),
      // Spec 028.5: mid-duel, the progress from before it; the duel's levels and HP never reach a save.
      ...(p.duelBackup ? structuredClone(p.duelBackup) : {}),
      boxes: structuredClone(p.progress.boxes),
      pcItems: p.progress.pcItems.map((b) => ({ ...b })),
      playTimeMs: p.playTimeMs + (tick - p.joinTick) * TICK_MS,
      savedAt: clock(),
      rev: ++p.rev,
    };
  }

  /** The save state but the rev, the time and the PC, which change apart from scripts. */
  function capture(p: Player): BeforeScript {
    const e = world.get(p.entityId)!;
    return {
      ...p.base,
      ...p.progress,
      party: p.progress.party.map((m) => ({ ...m })),
      bag: p.progress.bag.map((b) => ({ ...b })),
      pokedex: { seen: [...p.progress.pokedex.seen], caught: [...p.progress.pokedex.caught] },
      pending: p.progress.pending.map((i) => ({ ...i })),
      phone: structuredClone(p.progress.phone),
      ...itemStateOf(p.progress),
      flags: [...p.flags].sort((a, b) => a - b),
      vars: Object.fromEntries([...p.vars].map(([k, v]) => [String(k), v])),
      area: e.area,
      x: e.x,
      y: e.y,
      facing: e.facing,
    };
  }

  /** The rev of the save sent, if one was. */
  function sendSave(p: Player): number | undefined {
    if (!p.conn || p.arenaFoes !== undefined) return undefined;
    const save = snapshot(p);
    if (state === "closing") p.pendingAck = save.rev;
    p.conn.send({ type: "save", save } satisfies ServerMessage);
    return save.rev;
  }

  /**
   * Spec 028.3: both sides of a trade in one synchronous step, checked again against what each player holds now;
   * then a save to each, kept until acknowledged (a drop before that keeps the seat, see `Reserved.tradeUnsaved`).
   */
  function commitTrade(a: number, giveA: TradeOffer, b: number, giveB: TradeOffer): boolean {
    const [pa, pb] = [players.get(a), players.get(b)];
    if (!pa || !pb) return false;
    const after = (p: Player, give: TradeOffer, get: TradeOffer) => {
      const party = p.progress.party.filter((_, i) => !give.party.includes(i));
      if (give.party.some((i) => i >= p.progress.party.length)) return undefined;
      party.push(...(get === giveA ? pa : pb).progress.party.filter((_, i) => get.party.includes(i)).map((m) => structuredClone(m)));
      const bag = p.progress.bag.map((row) => ({ ...row }));
      for (const g of give.items) {
        const row = bag.find((r) => r.item === g.item);
        if (!row || row.count < g.count) return undefined;
        row.count -= g.count;
      }
      for (const g of get.items) {
        const row = bag.find((r) => r.item === g.item);
        if (row) row.count += g.count;
        else bag.push({ ...g });
      }
      // Nobody is left without a Pokémon, nor over the party or the bag's row limit.
      if (party.length < 1 || party.length > 6 || bag.some((r) => r.count > 999)) return undefined;
      return { party, bag: bag.filter((r) => r.count > 0) };
    };
    const [nextA, nextB] = [after(pa, giveA, giveB), after(pb, giveB, giveA)];
    if (!nextA || !nextB) return false;
    for (const [p, next, got] of [[pa, nextA, giveB], [pb, nextB, giveA]] as const) {
      p.progress.party = next.party;
      p.progress.bag = next.bag;
      // Spec 028.4: what arrived sits at the end of the party; its trade evolutions queue before the save goes out.
      for (let i = next.party.length - got.party.length; i < next.party.length; i++) progression?.traded(p.id, i);
      companions?.refresh(p.id);
      p.conn?.send({ type: "bag", items: p.progress.bag.map((r) => ({ ...r })) } satisfies ServerMessage);
    }
    for (const p of [pa, pb]) {
      const save = snapshot(p);
      // Into the host's book before it goes out: if the host closes before this client writes, its next game still owes it.
      p.tradeRev = save.rev;
      options.tradeLedger?.put(p.base.name, save);
      p.conn?.send({ type: "save", save } satisfies ServerMessage);
    }
    return true;
  }

  function remove(p: Player): void {
    p.gone = true;
    duels.cancel(p.id);
    trades.cancel(p.id);
    trainerBattles?.leave(p.id);
    players.delete(p.id);
    companions?.leave(p.id);
    captures?.leave(p.id);
    progression?.leave(p.id);
    field.leave(p.id);
    fishing.leave(p.id);
    items.leave(p.id);
    scripts?.leave(p.id);
    phone.leave(p.id);
    radio.leave(p.id);
    shops?.leave(p.id);
    pcs.leave(p.id);
    for (const id of [p.entityId, ...(p.arenaFoes ?? [])]) {
      combat?.remove(world, id);
      world.remove(id);
    }
    options.onRecord?.({ tick, kind: "leave", playerId: p.id });
  }

  /** A guest left on purpose: final save, then the seat is freed. */
  function leave(p: Player): void {
    if (p.gone) return;
    if (p.id === hostId) {
      close("host-left");
      return;
    }
    sendSave(p);
    remove(p);
    p.conn?.close();
    if (state === "closing" && ![...players.values()].some((q) => q.pendingAck !== undefined)) finishClose();
  }

  /** A guest dropped: the seat and the progress are kept for a while. */
  function reserve(p: Player): void {
    if (p.gone) return;
    duels.cancel(p.id);
    trades.cancel(p.id);
    // Ends any fight first, so the reserved progress keeps the HP it ended with; a trainer battle ends undecided.
    trainerBattles?.leave(p.id);
    companions?.leave(p.id);
    const e = world.get(p.entityId)!;
    reserved.set(nameKey(p.base.name), {
      token: p.token,
      base: snapshot(p),
      spawn: { area: e.area, x: e.x, y: e.y, level: e.level, facing: e.facing },
      until: tick + RESERVE_TICKS,
      tradeUnsaved: p.tradeRev !== undefined,
    });
    remove(p);
    p.conn?.close();
  }

  function finishClose(): void {
    if (state === "closed") return;
    state = "closed";
    const remaining = [...players.values()];
    players.clear();
    reserved.clear();
    for (const p of remaining) {
      p.gone = true;
      p.conn?.send({ type: "session-closed", reason: closeReason } satisfies ServerMessage);
      p.conn?.close();
    }
  }

  function close(reason: CloseReason): void {
    if (state !== "open") return;
    state = "closing";
    closeReason = reason;
    reserved.clear();
    for (const p of players.values()) sendSave(p);
    if (![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
  }

  function enqueue(player: Player, input: PlayerInput): void {
    if (input.seq <= player.lastInputSeq || player.queue.some((q) => q.seq === input.seq)) return;
    const at = player.queue.findIndex((q) => q.seq > input.seq);
    player.queue.splice(at === -1 ? player.queue.length : at, 0, input);
    if (player.queue.length > MAX_QUEUED_INPUTS) {
      const dropped = player.queue.splice(0, player.queue.length - MAX_QUEUED_INPUTS);
      options.log(`Player ${player.id}: dropped ${dropped.length} queued inputs`);
    }
  }

  function reject(conn: Connection, code: RejectCode, message: string): void {
    conn.send({ type: "reject", code, message, serverProtocolVersion: PROTOCOL_VERSION } satisfies ServerMessage);
    conn.close();
  }

  /** Handles a hello; returns the new player or undefined when it was refused. */
  /** Why this arena cannot be built, checked before anything enters the world; undefined when it can. */
  function arenaProblem(spec: ArenaSpec): string | undefined {
    if (!combat || !options.combat || !options.devArena) return "A arena de teste está desligada neste servidor.";
    if (spec.foe.kind === "trainer" && !trainerBattles) return "Arena inválida: lutas de treinador precisam dos dados de treinadores e de scripts";
    if (spec.foe.kind === "trainer" && !options.trainers?.trainer(spec.foe.trainer)) return `Arena inválida: treinador ${spec.foe.trainer} não existe na extração`;
    if (spec.foe.kind === "wild" && spec.foe.behavior === "ai" && !wilds) return "Arena inválida: selvagens com IA precisam dos dados de selvagens";
    try {
      for (const c of [...spec.team, ...spec.foe.team]) arenaMember(c, options.combat, options.progression);
    } catch (error) {
      return `Arena inválida: ${(error as Error).message}`;
    }
    return undefined;
  }

  /** The arena's foes (arenaProblem passed): wild ones east of the player, or the trainer's battle, which keeps its own. */
  function spawnFoes(p: Player, foe: ArenaSpec["foe"]): number[] {
    if (foe.kind === "trainer") {
      trainerBattles?.startScripted(p.id, foe.trainer, 0, foe.team.map(trainerMember));
      return [];
    }
    return foe.team.map((c, i) => {
      const at = foeSpot(i);
      if (foe.behavior === "ai") return wilds!.place(ARENA_AREA, at.x, at.y, c, tick);
      // A still target: a wild combatant the AI never drives.
      const e = world.add({ kind: "pokemon", area: ARENA_AREA, ...at, level: 0, facing: "west", data: {} });
      combat!.spawn(world, e.id, c, "wild");
      return e.id;
    });
  }

  function admit(conn: Connection, msg: { protocolVersion: number; save: unknown; resumeToken?: string | undefined; arena?: ArenaSpec | undefined }): { player: Player; resumed: boolean } | undefined {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      reject(conn, "protocol-mismatch", protocolMismatchMessage(PROTOCOL_VERSION, msg.protocolVersion));
      return undefined;
    }
    if (state !== "open") {
      reject(conn, "session-closed", "A sessão foi encerrada.");
      return undefined;
    }
    const migrated = migrate(msg.save);
    if (!migrated.ok) {
      reject(conn, migrated.code === "save-too-new" ? "save-too-new" : "invalid-save", migrated.message);
      return undefined;
    }
    // A new game's story gives the starter and the balls (spec 024); the dev kit is for older saves.
    const devKit = migrated.save.storyRev < STORY_REV;
    let save = devKit && options.devParty && migrated.save.party.length === 0 ? { ...migrated.save, party: options.devParty.map((m) => ({ ...m })) } : migrated.save;
    if (devKit && options.devBag && save.bag.length === 0) save = { ...save, bag: options.devBag.map((b) => ({ ...b })) };
    const problem = options.validateSave?.(save);
    if (problem) {
      reject(conn, "invalid-save", problem);
      return undefined;
    }
    if (msg.arena) {
      const arena = arenaProblem(msg.arena);
      if (arena) {
        reject(conn, "invalid-message", arena);
        return undefined;
      }
      // The arena's trainer and team stand in for the save's for this session, and a blackout comes back to the arena; nothing is ever saved.
      const { trainer, team } = msg.arena;
      save = { ...save, name: trainer.name, character: trainer.character, party: team.map((c) => arenaMember(c, options.combat!, options.progression)), bag: [], pending: [], flags: [], vars: {}, respawn: { area: ARENA_AREA, x: ARENA_SPAWN.x, y: ARENA_SPAWN.y } };
    }
    const key = nameKey(save.name);
    const held = reserved.get(key);
    if (held && (held.token === msg.resumeToken || held.tradeUnsaved)) {
      reserved.delete(key);
      const back = add(held.base, conn, held.spawn, held.token);
      // Still unsaved on the client: the next acknowledged save clears it.
      if (held.tradeUnsaved) back.tradeRev = held.base.rev;
      return { player: back, resumed: true };
    }
    if (held || [...players.values()].some((p) => nameKey(p.base.name) === key)) {
      reject(conn, "name-taken", "Esse nome já está em uso nesta sessão.");
      return undefined;
    }
    if (players.size + reserved.size >= MAX_PLAYERS) {
      reject(conn, "session-full", `A sessão está cheia (${MAX_PLAYERS} jogadores).`);
      return undefined;
    }
    if (msg.arena) {
      // shortcut: arena joins are not recorded, so a replay of an arena session does not rebuild it; record them if arena replays matter.
      const player = add(save, conn, ARENA_SPAWN, options.newToken(), true);
      player.arenaFoes = spawnFoes(player, msg.arena.foe);
      return { player, resumed: false };
    }
    // Spec 028.3: a save older than a trade this host still owes the player is replaced by the traded one.
    const owed = options.tradeLedger?.get(save.name);
    if (owed && owed.rev > save.rev) save = owed;
    else if (owed) options.tradeLedger?.remove(save.name);
    const player = add(save, conn, { area: save.area, x: save.x, y: save.y, level: 0, facing: save.facing }, options.newToken());
    if (owed && save === owed) player.tradeRev = owed.rev;
    return { player, resumed: false };
  }

  function connect(conn: Connection): void {
    let player: Player | undefined;

    conn.onMessage((raw) => {
      if (player) player.lastSeenTick = tick;
      const who = player ? `player ${player.id}` : "a new connection";
      const parsed = clientMessage.safeParse(raw);
      if (!parsed.success) {
        options.log(`Discarded malformed message from ${who}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return;
      }
      const msg = parsed.data;
      if (!player) {
        if (msg.type !== "hello") {
          options.log(`Discarded ${msg.type} before hello`);
          return;
        }
        const admitted = admit(conn, msg);
        if (!admitted) return;
        player = admitted.player;
        conn.send({
          type: "welcome",
          protocolVersion: PROTOCOL_VERSION,
          playerId: player.id,
          entityId: player.entityId,
          tick,
          tickRateHz: 20,
          resumeToken: player.token,
          resumed: admitted.resumed,
        } satisfies ServerMessage);
        conn.send(clockMessage());
        phone.sync(player.id);
        // Spec 028.3: the client came back with a save from before a trade; the traded progress goes to its disk at once.
        if (player.tradeRev !== undefined) player.tradeRev = sendSave(player) ?? player.tradeRev;
        return;
      }
      switch (msg.type) {
        case "hello":
          options.log(`Discarded repeated hello from ${who}`);
          return;
        case "leave":
          leave(player);
          return;
        case "input":
          // Players never aim: moves and balls aim themselves; a client's aim is ignored.
          enqueue(player, { seq: msg.seq, move: msg.move, run: msg.run, buttons: msg.buttons });
          return;
        case "swap":
          companions?.swap(player.id, msg.partyIndex, tick);
          return;
        case "select-ball":
          captures?.select(player.id, msg.item);
          return;
        case "debugAi":
          player.debugAi = msg.on;
          return;
        case "script-answer":
          if (scripts) scripts.answer(player.id, msg.id, msg.answer, msg.text);
          else options.log(`Discarded script-answer from ${who}: this session has no scripts`);
          return;
        case "trainer-ready":
          trainerBattles?.ready(player.id);
          return;
        case "pc-move":
        case "pc-rename":
        case "pc-items":
        case "pc-leave":
          pcs.handle(player.id, msg);
          return;
        case "trade-propose": {
          const refused = players.has(msg.to) ? trades.propose(player.id, msg.to) : "action-refused";
          if (refused) notice(player, refused);
          return;
        }
        case "trade-answer":
          trades.answer(player.id, msg.accept);
          return;
        case "trade-offer":
          if (!trades.offer(player.id, msg.offer)) notice(player, "action-refused");
          return;
        case "trade-confirm":
          trades.confirm(player.id);
          return;
        case "duel-invite": {
          const refused = players.has(msg.to) ? duels.invite(player.id, msg.to, msg.rules) : "action-refused";
          if (refused) notice(player, refused);
          return;
        }
        case "duel-answer":
          duels.answer(player.id, msg.accept);
          return;
        case "duel-cancel":
          duels.cancel(player.id);
          return;
        case "trade-cancel":
          trades.cancel(player.id);
          return;
        case "shop-buy":
        case "shop-sell":
        case "shop-leave":
          if (shops) shops.handle(player.id, msg);
          else player.conn?.send({ type: "shopResult", ok: false, reason: "invalid", money: player.progress.money } satisfies ServerMessage);
          return;
        case "debugScript":
          scripts?.debug(player.id, msg.on);
          return;
        case "debugSetFlag":
          scripts?.setFlag(player.id, msg.flag, msg.on);
          return;
        case "debugWarp":
          scripts?.warp(player.id, msg.map, msg.tx, msg.ty);
          return;
        case "debugSetHp":
          scripts?.setHp(player.id, msg.hp);
          return;
        case "debugGiveBadge":
          scripts?.giveBadge(player.id, msg.badge);
          return;
        case "debugTeachMove":
          scripts?.teachMove(player.id, msg.slot, msg.move);
          return;
        case "debugGiveItem":
          scripts?.giveItem(player.id, msg.item, msg.count);
          return;
        case "debugSetStatus": {
          const id = companions?.controlled(player.id);
          if (scripts?.allowDev(player.id, "debugSetStatus") && id !== undefined && combat?.has(id)) combat.inflict(id, msg.status, tick);
          return;
        }
        case "debugSetClock": {
          // The session's clock is the host's (FR-001): a guest never sets it (FR-016).
          if (player.id !== hostId) {
            options.log(`Refused debugSetClock from player ${player.id}: not the host`);
            return;
          }
          if (!scripts?.allowDev(player.id, "debugSetClock")) {
            if (!scripts) options.log(`Refused debugSetClock from player ${player.id}: there is no script debugger`);
            return;
          }
          const c = msg.clock;
          if (c.mode === "host") time.set({ kind: "host" });
          else if (c.mode === "advance") time.advance(c.minutes);
          else time.setTime(c);
          sendClock();
          return;
        }
        case "phoneDial":
          if ((scripts?.busy(player.id) ?? false) || (companions?.inCombat(player.id) ?? false) || !phone.dial(player.id, msg.contact)) notice(player, "action-refused");
          return;
        case "phoneAnswer":
          if (!phone.answer(player.id, msg.callId, msg.choice)) notice(player, "action-refused");
          return;
        case "radioTune":
          if (!radio.tune(player.id, msg.channel, world.get(player.entityId)?.area ?? "")) notice(player, "action-refused");
          else player.conn?.send(radio.state(player.id, world.get(player.entityId)?.area ?? ""));
          return;
        case "gearOpen":
          if (companions?.inCombat(player.id)) notice(player, "menu-blocked");
          else {
            player.gearOpen = true;
            setBusy(player, true);
            sendGear(player);
            phone.sync(player.id);
            player.conn?.send(radio.state(player.id, world.get(player.entityId)?.area ?? ""));
          }
          return;
        case "gearClose":
          player.gearOpen = false;
          setBusy(player, player.menuOpen || (scripts?.busy(player.id) ?? false));
          return;
        case "field-mount":
          field.mount(player.id, msg.mode);
          return;
        case "field-dismount":
          field.dismount(player.id);
          return;
        case "field-fish":
          fishing.fish(player.id, msg.rod, tick);
          return;
        case "field-reel":
          fishing.reel(player.id, tick);
          return;
        case "field-use":
          field.use(player.id, msg.move);
          return;
        case "field-fly":
          field.fly(player.id, msg.area);
          return;
        case "field-interact":
          // Field moves arrive with spec 025's stories; until then every request is refused.
          player.conn?.send({ type: "field-result", ok: false, reason: "notAllowed" } satisfies ServerMessage);
          return;
        case "menu":
          if (msg.open && companions?.inCombat(player.id)) notice(player, "menu-blocked");
          else {
            player.menuOpen = msg.open;
            setBusy(player, msg.open || (scripts?.busy(player.id) ?? false));
          }
          return;
        case "rescue":
          if (!rescue(player)) notice(player, "action-refused");
          return;
        case "reorder-party":
          if (companions?.inCombat(player.id) || progression?.busy(player.id) || !reorderParty(player.progress.party, msg.from, msg.to)) notice(player, "action-refused");
          else companions?.refresh(player.id);
          return;
        case "use-item": {
          // Spec 027: every item through the item rules; the progression queue is busy with something else first.
          const refused = progression?.busy(player.id) ? "action-refused" : items.use(player.id, msg.item, msg.partyIndex, msg.moveIndex);
          if (refused) notice(player, refused);
          return;
        }
        case "use-item-combat": {
          const refused = items.useInCombat(player.id, msg.item, tick);
          if (refused) notice(player, refused);
          return;
        }
        case "set-held": {
          const refused = items.setHeld(player.id, msg.partyIndex, msg.item);
          if (refused) notice(player, refused);
          return;
        }
        case "berry-plant":
        case "berry-harvest": {
          const refused = msg.type === "berry-plant" ? items.plant(player.id, msg.pot, msg.item) : items.harvest(player.id, msg.pot);
          if (refused) notice(player, refused);
          return;
        }
        case "progression-ack":
        case "learn-answer":
        case "evolve-answer":
          progression?.answer(player.id, msg);
          return;
        case "save-ack":
          if (player.tradeRev !== undefined && msg.rev >= player.tradeRev) {
            player.tradeRev = undefined;
            options.tradeLedger?.remove(player.base.name);
          }
          if (player.pendingAck !== undefined && msg.rev >= player.pendingAck) {
            player.pendingAck = undefined;
            if (state === "closing" && ![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
          }
          return;
      }
    });

    conn.onClose(() => {
      if (!player || player.gone) return;
      // Nobody left to wait for.
      if (state !== "open") player.pendingAck = undefined;
      else if (player.id === hostId) close("host-left");
      else reserve(player);
      if (state === "closing" && ![...players.values()].some((p) => p.pendingAck !== undefined)) finishClose();
    });
  }

  function step(): void {
    if (state === "closed") return;
    if (state === "closing") {
      if (++closingTicks >= CLOSE_WAIT_TICKS) finishClose();
      return;
    }
    for (const [key, r] of reserved) {
      if (tick >= r.until && !r.tradeUnsaved) reserved.delete(key);
    }
    // Timeouts run before the tick advances so they record like any other leave between ticks.
    for (const p of [...players.values()]) {
      if (tick + 1 - p.lastSeenTick >= timeoutTicks) {
        options.log(`Player ${p.id} timed out`);
        if (p.id === hostId) close("host-left");
        else reserve(p);
      }
    }
    // A timed-out host closes the session; TS cannot see that mutation through close().
    if ((state as Session["state"]) !== "open") return;
    // Joins and leaves show up here, after the welcome went out.
    // Map changes too (spec 028.1): the list shows where each player is.
    const areaOf = (p: Player) => world.get(p.entityId)?.area ?? "";
    const ids = [...players.values()].map((p) => `${p.id}@${areaOf(p)}`).join();
    if (ids !== roster) {
      roster = ids;
      const list = [...players.values()].map((p) => ({ id: p.id, name: p.base.name, host: p.id === hostId, area: areaOf(p) }));
      for (const p of players.values()) p.conn?.send({ type: "players", players: list } satisfies ServerMessage);
    }
    tick++;
    // The clients run the clock on between these (spec 026); a change made with debugSetClock goes at once.
    if (tick % CLOCK_EVERY_TICKS === 0) sendClock();
    if (tick % GEAR_MAP_EVERY_TICKS === 0) for (const p of players.values()) if (p.gearOpen) sendGear(p);
    for (const p of players.values()) {
      const input = p.queue.shift();
      if (input) {
        p.lastInputSeq = input.seq;
        options.onRecord?.({ tick, kind: "input", playerId: p.id, input });
      }
      const buttons = input?.buttons ?? p.buttons;
      const pressed = buttons & ~p.buttons;
      p.buttons = buttons;
      // A trainer saw the player: held while the "!" shows and the trainer walks up (spec 022).
      if (trainerBattles?.locked(p.id)) {
        world.update(stepMovement(world.get(p.entityId)!, null, lookup));
        continue;
      }
      // A running script holds the player; interact on a person or a sign starts one (spec 020).
      if (scripts?.input(p.id, input, pressed, tick)) {
        world.update(stepMovement(world.get(p.entityId)!, null, lookup));
        continue;
      }
      // A ball can be thrown walking or in combat, but never at a trainer's Pokémon (spec 022).
      if (trainerBattles?.inBattle(p.id)) {
        if (pressed & BUTTON.throw) for (const text of options.trainers!.tuning.ballRefusal) p.conn?.send({ type: "trainerSay", text } satisfies ServerMessage);
      } else captures?.input(p.id, input);
      // In combat the input moves the Pokémon and the trainer stands still.
      // Spec 027: with lockMovement on, the Pokémon stands still while its trainer uses an item.
      if (companions?.input(p.id, input && items.locked(p.id) ? { ...input, move: { x: 0, y: 0 } } : input, tick)) {
        // A fight that starts with the menu open closes it (spec 017, FR-013).
        p.menuOpen = false;
        p.gearOpen = false;
        setBusy(p, false);
        continue;
      }
      // Every tick, so ledge hops and warp transitions run out without input.
      scripts?.push(p.id, input);
      const me = world.get(p.entityId)!;
      world.update(stepMovement(me, input ?? null, lookup, npcs && npcOccupied(world.all().filter((e) => scripts!.visible(p.id, e)).map((e) => scripts!.view(p.id, e)), me.area)));
    }
    npcs?.step();
    const hits = combat?.step(tick, world) ?? [];
    for (const h of hits) {
      const a = combat!.get(h.attacker)?.owner;
      const b = combat!.get(h.target)?.owner;
      if (a === "wild" && typeof b === "number") progression?.engage(b, h.attacker);
      if (b === "wild" && typeof a === "number") progression?.engage(a, h.target);
      if (typeof b === "number" && a !== undefined && a !== b) companions?.hitBy(b, a);
    }
    field.step();
    fishing.step(tick);
    companions?.step(tick);
    trainerBattles?.step(tick, hits);
    wilds?.step(tick, hits);
    captures?.step(tick);
    items.step(tick, hits);
    progression?.step();
    scripts?.step(tick);
    phone.step();
    for (const p of players.values()) radio.at(p.id, world.get(p.entityId)?.area ?? "");
    scripts?.sendDebug();
    // Others see a player in a script as busy (principle VII), as with the menu.
    if (scripts) for (const p of players.values()) if (p.arenaFoes === undefined) {
          setBusy(p, p.menuOpen || scripts.busy(p.id) || (trainerBattles?.locked(p.id) ?? false));
          setSheltered(p, scripts.sheltered(p.id));
        }
    for (const p of players.values()) setPresence(p);
    trades.check();
    duels.check();
    const entities = world.all();
    for (const p of players.values()) {
      const entity = world.get(p.entityId)!;
      p.conn?.send(replicate(p.replica, entity, scripts ? entities.filter((e) => scripts.visible(p.id, e)).map((e) => scripts.view(p.id, e)) : entities, tick, p.lastInputSeq));
      const seen = hits.filter((h) => world.get(h.target)?.area === entity.area);
      if (seen.length > 0) p.conn?.send({ type: "combat-event", tick, events: seen } satisfies ServerMessage);
      if (p.debugAi && wilds && tick % aiDebugEvery === 0) p.conn?.send({ type: "aiDebug", tick, ais: wilds.ai.debug(entity.area, entity, aiDebugRadiusPx) } satisfies ServerMessage);
      // Periodically and on every map change (FR-006).
      if (entity.area !== p.lastArea || (tick - p.joinTick) % SAVE_INTERVAL_TICKS === 0) sendSave(p);
      p.lastArea = entity.area;
    }
  }

  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get occupied() {
      return players.size + reserved.size;
    },
    world,
    rng,
    combat,
    connect,
    step,
    close,
    broadcast(msg) {
      for (const p of players.values()) p.conn?.send(msg);
    },
    join: (name, spawn) => {
      const base: Save = { schemaVersion: 11, rivalName: "", storyRev: STORY_REV, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name, character: "male", area: spawn.area, x: spawn.x, y: spawn.y, facing: spawn.facing, playTimeMs: 0, savedAt: clock(), rev: 0, ...newProgress(), ...newCollection() };
      return add(base, undefined, spawn, "").id;
    },
    leave(playerId) {
      const p = players.get(playerId);
      if (p) leave(p);
    },
    enqueue(playerId, input) {
      const p = players.get(playerId);
      if (p) enqueue(p, input);
    },
  };
}
