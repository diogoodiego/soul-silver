import { blocksSight, lineOfSight, type AiHooks, type AiTick, type SkillProfile } from "@soulsilver/shared/ai";
import { computeStats, effectiveness, toTicks, type Point, type StatOptions } from "@soulsilver/shared/combat";
import { leadIndex } from "@soulsilver/shared/companion";
import type { TrainerMusic, TrainerRecord } from "@soulsilver/shared/events";
import { hpRestore, tileAt, type Entity, type HitEvent, type Rng, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import type { Save } from "@soulsilver/shared/save";
import { chooseItem, chooseSwitch, prize, trainerProfile, type TrainerProfile } from "@soulsilver/shared/trainer";
import { wildMoves } from "@soulsilver/shared/wild";
import { createAi } from "./ai";
import type { AiData } from "./ai-loader";
import type { Combat } from "./combat";
import type { CombatData } from "./combat-loader";
import type { Companions } from "./companion";
import type { ItemsData } from "./items";
import type { Progression } from "./progression";
import type { TrainerData } from "./trainer-loader";
import type { World } from "./world";

// Trainer battles (spec 022): an NPC trainer spots a player (or a script starts the battle), and the
// trainer's original team fights that player's Pokémon inside an arena only they share. The state of a
// battle is per player: the same trainer can fight two players at once (principle VII).

/** A player as trainer battles see them; the progress fields are the player's own and change in place. */
export interface Fighter {
  playerId: number;
  entityId: number;
  flags: Set<number>;
  progress: Pick<Save, "party" | "money">;
  send(msg: ServerMessage): void;
}

export interface TrainerBattleOptions {
  data: TrainerData;
  ai: AiData;
  combat: Combat;
  combatData: CombatData;
  companions: Companions;
  world: World;
  lookup: WorldLookup;
  rng: Rng;
  /** Healing items the trainer may use; without them the trainer uses none. */
  items?: ItemsData | undefined;
  progression?: Progression | undefined;
  /** The trainer behind a person entity, if any. */
  trainerOf(e: Entity): { trainer: number; sightTiles: number } | undefined;
  /** Whether the player sees this person (their own flags, principle VII). */
  visible(playerId: number, e: Entity): boolean;
  /** Nothing holds the player: no script, menu, progression decision or fight. */
  free(playerId: number): boolean;
  /** Everyone in the area but `except`. */
  broadcast(area: string, msg: ServerMessage, except?: number): void;
  /** The battle is over; scripts waiting on it go on. */
  onEnd?(playerId: number, won: boolean): void;
  onDecision?: Parameters<typeof createAi>[0]["onDecision"];
  log(message: string): void;
}

interface Member {
  species: number;
  level: number;
  moves: number[];
  stats: StatOptions;
  types: number[];
  hp: number;
  hpMax: number;
}

interface Battle {
  id: number;
  fighter: Fighter;
  trainer: TrainerRecord;
  profile: TrainerProfile;
  skill: SkillProfile;
  arena: { area: string; x: number; y: number; radiusPx: number };
  /** Where the trainer's Pokémon come out. */
  side: Point;
  /** Ticks of "!" and approach still to go; fighting once undefined. */
  fightAt: number | undefined;
  /** Waiting for the player to close the challenge line, until this tick at most. */
  readyBy: number | undefined;
  team: Member[];
  /** Team index by entity on the field. */
  out: Map<number, number>;
  /** Team indexes coming out at a tick. */
  queue: { index: number; at: number }[];
  items: number[];
  /** Entities standing still while an item is used on them. */
  using: Map<number, { until: number; amount: number | "full" }>;
  /** What the AI decided this tick, by entity. */
  want: Map<number, { switchTo?: number; item?: number }>;
  lastSwitchS: number | undefined;
  ally: { index: number; entityId: number } | undefined;
  music: TrainerMusic;
}

const VECTORS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
const facingOf = (d: Point): Direction => (Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? "east" : "west") : d.y >= 0 ? "south" : "north");
const tileOf = (v: number) => Math.floor(v / MAP_TILE_PX);
const ZERO = { move: { x: 0, y: 0 }, buttons: 0 };

export function createTrainerBattles(options: TrainerBattleOptions) {
  const { data, combat, combatData, companions, world, lookup } = options;
  const { tuning } = data;
  const ai = createAi({ data: options.ai, combat, combatData, world, lookup, rng: options.rng, onDecision: options.onDecision });
  const fighters = new Map<number, Fighter>();
  /** By player: one battle each at most. */
  const battles = new Map<number, Battle>();
  const radiusPx = tuning.arenaRadiusTiles * MAP_TILE_PX;
  const sightEvery = Math.max(1, Math.round(20 / tuning.sightHz));
  const activationPx = tuning.activationTiles * MAP_TILE_PX;
  let nextBattleId = 1;
  let tick = 0;

  const flagOf = (trainer: number) => tuning.trainerFlagBase + trainer;
  const skillOf = (id: string) => options.ai.profiles.find((p) => p.id === id)!;
  const heals = (item: number) => {
    const record = options.items?.item(item);
    return record ? hpRestore(record) : undefined;
  };

  function memberOf(m: TrainerRecord["team"][number]): Member {
    const species = combatData.species(m.species);
    if (!species) throw new Error(`espécie ${m.species} não existe na extração`);
    const moves = m.moves?.filter((id) => id > 0) ?? wildMoves(data.levelUp(m.species), m.level);
    // The original's IVs: the member's difficulty scaled from 0–255 to 0–31, the same for every stat.
    const iv = Math.floor((m.difficulty * 31) / 255);
    const stats: StatOptions = { ivs: { hp: iv, attack: iv, defense: iv, speed: iv, specialAttack: iv, specialDefense: iv } };
    const hpMax = computeStats(species.baseStats, m.level, stats).hp;
    return { species: m.species, level: m.level, moves, stats, types: [...species.types], hp: hpMax, hpMax };
  }

  function hooksFor(b: Battle, entityId: number): AiHooks {
    return {
      chooseSwitch(t: AiTick) {
        const active = b.out.get(entityId);
        if (active === undefined) return undefined;
        const busy = new Set([...b.out.values(), ...b.queue.map((q) => q.index)]);
        const to = chooseSwitch({
          // Members already out or on their way cannot be picked.
          team: b.team.map((m, i) => (i !== active && busy.has(i) ? { ...m, hp: 0 } : m)),
          active,
          // What a player could tell of the foe: its own types, the moves it most likely holds.
          foeMoveTypes: t.opponents.flatMap((o) => o.types),
          effectiveness: (type, types) => effectiveness(combatData.typeChart, type, types),
          profile: b.profile,
          nowS: tick / 20,
          lastSwitchS: b.lastSwitchS,
        });
        if (to !== undefined) b.want.set(entityId, { ...b.want.get(entityId), switchTo: to });
        return to;
      },
      chooseItem(t: AiTick) {
        const item = chooseItem({ hp: t.self.hp, hpMax: t.self.hpMax, items: b.items, heals, profile: b.profile });
        if (item !== undefined) b.want.set(entityId, { ...b.want.get(entityId), item });
        return item;
      },
    };
  }

  function sendOut(b: Battle, index: number): void {
    const m = b.team[index]!;
    const e = world.add({ kind: "pokemon", area: b.arena.area, x: b.side.x, y: b.side.y, level: 0, facing: facingOf({ x: b.arena.x - b.side.x, y: b.arena.y - b.side.y }), data: {} });
    const c = combat.spawn(world, e.id, { species: m.species, level: m.level, moves: m.moves, stats: m.stats }, "trainer");
    c.hp = m.hp;
    combat.setBattle(e.id, b.id);
    ai.add(e.id, { home: { x: b.arena.x, y: b.arena.y }, level: m.level, temperament: "aggressive", leashPx: b.arena.radiusPx, profile: b.skill, hooks: hooksFor(b, e.id) });
    b.out.set(e.id, index);
    options.progression?.engage(b.fighter.playerId, e.id);
    options.broadcast(b.arena.area, { type: "trainerSendOut", battleId: b.id, slot: index, entityId: e.id });
  }

  function recall(b: Battle, entityId: number): void {
    const index = b.out.get(entityId);
    const c = combat.get(entityId);
    if (index !== undefined && c) b.team[index]!.hp = c.hp;
    combat.remove(world, entityId);
    world.remove(entityId);
    ai.remove(entityId);
    b.out.delete(entityId);
    b.using.delete(entityId);
    b.want.delete(entityId);
  }

  /** The next member in the original order that can come out. */
  function nextUp(b: Battle): number | undefined {
    const busy = new Set([...b.out.values(), ...b.queue.map((q) => q.index)]);
    const i = b.team.findIndex((m, index) => m.hp > 0 && !busy.has(index));
    return i === -1 ? undefined : i;
  }

  function syncAlly(b: Battle): void {
    if (!b.ally) return;
    const c = combat.get(b.ally.entityId);
    const member = b.fighter.progress.party[b.ally.index];
    if (c && member) member.hp = c.hp;
  }

  function removeAlly(b: Battle): void {
    if (!b.ally) return;
    syncAlly(b);
    combat.remove(world, b.ally.entityId);
    world.remove(b.ally.entityId);
    ai.remove(b.ally.entityId);
    b.ally = undefined;
  }

  function end(b: Battle, result: "won" | "lost" | "aborted"): void {
    for (const id of [...b.out.keys()]) recall(b, id);
    removeAlly(b);
    battles.delete(b.fighter.playerId);
    const { fighter } = b;
    let money: number | undefined;
    if (result === "won") {
      fighter.flags.add(flagOf(b.trainer.id));
      money = prize({ prizeBase: data.trainerClass(b.trainer.class.id)?.prizeBase ?? 0, team: b.trainer.team, double: b.trainer.doubleBattle });
      fighter.progress.money = Math.min(999999, fighter.progress.money + money);
    }
    // A blackout already ended the fight on a loss.
    if (b.fightAt === undefined) companions.leaveBattle(fighter.playerId);
    const defeat = result === "won" ? data.lines(b.trainer.id).defeat : undefined;
    fighter.send({ type: "trainerBattleEnd", battleId: b.id, result, ...(money !== undefined ? { prize: money } : {}), ...(defeat ? { defeat } : {}) });
    options.broadcast(b.arena.area, { type: "trainerBattleEnd", battleId: b.id, result }, fighter.playerId);
    options.onEnd?.(fighter.playerId, result === "won");
  }

  function begin(b: Battle): void {
    b.fightAt = undefined;
    const party = b.fighter.progress.party;
    const lead = leadIndex(party);
    const allyIndex = b.trainer.doubleBattle ? party.findIndex((m, i) => i !== lead && m.hp > 0) : -1;
    const arena = { battle: b.id, x: b.arena.x, y: b.arena.y, radiusPx: b.arena.radiusPx, ally: allyIndex === -1 ? undefined : allyIndex };
    if (!companions.enterBattle(b.fighter.playerId, arena, tick)) {
      options.log(`Player ${b.fighter.playerId}: trainer battle ${b.trainer.id} not started, no Pokémon could come out`);
      // Nothing came out, so there is no fight to leave.
      b.fightAt = tick;
      end(b, "aborted");
      return;
    }
    options.broadcast(b.arena.area, { type: "trainerBattleStart", battleId: b.id, player: b.fighter.playerId, trainerId: b.trainer.id, arena: b.arena, music: b.music, double: b.trainer.doubleBattle });
    for (let n = b.trainer.doubleBattle ? 2 : 1; n > 0; n--) {
      const i = nextUp(b);
      if (i !== undefined) sendOut(b, i);
    }
    if (allyIndex !== -1) {
      const member = party[allyIndex]!;
      const me = world.get(b.fighter.entityId)!;
      const e = world.add({ kind: "pokemon", area: me.area, x: b.arena.x, y: b.arena.y, level: me.level, facing: me.facing, data: { owner: String(b.fighter.playerId), role: "ally", species: member.species } });
      try {
        const c = combat.spawn(world, e.id, { species: member.species, level: member.level, moves: member.moves }, b.fighter.playerId);
        c.hp = member.hp;
        combat.setBattle(e.id, b.id);
        ai.add(e.id, { home: { x: b.arena.x, y: b.arena.y }, level: member.level, temperament: "aggressive", leashPx: b.arena.radiusPx, profile: skillOf(data.classes.default.combat) });
        b.ally = { index: allyIndex, entityId: e.id };
      } catch (error) {
        world.remove(e.id);
        options.log(`Player ${b.fighter.playerId}: ally ${allyIndex} not sent out: ${(error as Error).message}`);
      }
    }
  }

  function stepBattle(b: Battle): void {
    if (b.fightAt !== undefined) {
      if (tick >= b.fightAt && (b.readyBy === undefined || tick >= b.readyBy)) begin(b);
      return;
    }
    // The player's last Pokémon fainted: the companion rules already blacked them out.
    if (!companions.inCombat(b.fighter.playerId)) {
      b.fightAt = tick;
      end(b, "lost");
      return;
    }
    for (const [id, index] of [...b.out]) {
      const c = combat.get(id);
      const m = b.team[index]!;
      if (!c) continue;
      m.hp = c.hp;
      if (c.hp === 0) {
        options.progression?.faint(id, m.species, m.level, true);
        recall(b, id);
        const next = nextUp(b);
        if (next !== undefined) b.queue.push({ index: next, at: tick + toTicks(tuning.sendOutS) });
        continue;
      }
      const use = b.using.get(id);
      if (use) {
        if (tick < use.until) {
          combat.input(id, ZERO);
          continue;
        }
        c.hp = use.amount === "full" ? c.stats.hp : Math.min(c.stats.hp, c.hp + use.amount);
        m.hp = c.hp;
        b.using.delete(id);
      }
      const want = b.want.get(id);
      b.want.delete(id);
      if (want?.switchTo !== undefined) {
        recall(b, id);
        b.lastSwitchS = tick / 20;
        b.queue.push({ index: want.switchTo, at: tick + toTicks(tuning.sendOutS) });
        continue;
      }
      if (want?.item !== undefined) {
        b.items.splice(b.items.indexOf(want.item), 1);
        b.using.set(id, { until: tick + toTicks(tuning.itemUseS), amount: heals(want.item)! });
        combat.input(id, ZERO);
        options.broadcast(b.arena.area, { type: "trainerItem", battleId: b.id, item: want.item, target: id });
        continue;
      }
      ai.drive(id);
    }
    b.queue = b.queue.filter((q) => {
      if (tick < q.at) return true;
      sendOut(b, q.index);
      return false;
    });
    if (b.ally) {
      const c = combat.get(b.ally.entityId);
      syncAlly(b);
      if (!c || c.hp === 0) removeAlly(b);
      else ai.drive(b.ally.entityId);
    }
    if (b.out.size === 0 && b.queue.length === 0 && nextUp(b) === undefined) end(b, "won");
  }

  /** Whether the trainer `npc`, looking the way it faces, sees `me` within its range in a straight line. */
  function sees(npc: Entity, me: Entity, sightTiles: number): number | undefined {
    const look = VECTORS[npc.facing];
    const dx = tileOf(me.x) - tileOf(npc.x);
    const dy = tileOf(me.y) - tileOf(npc.y);
    const along = dx * look.x + dy * look.y;
    const across = dx * look.y - dy * look.x;
    if (across !== 0 || along < 1 || along > sightTiles) return undefined;
    const blocks = (x: number, y: number) => blocksSight(tileAt(lookup, npc.area, npc.level, x, y));
    return lineOfSight(blocks, npc, me) ? along : undefined;
  }

  function prepare(f: Fighter, trainerId: number): Battle | undefined {
    const trainer = data.trainer(trainerId);
    if (!trainer) {
      options.log(`Player ${f.playerId}: trainer ${trainerId} is not in the extraction`);
      return undefined;
    }
    let team: Member[];
    try {
      team = trainer.team.map(memberOf);
    } catch (error) {
      options.log(`Player ${f.playerId}: trainer ${trainerId} cannot fight: ${(error as Error).message}`);
      return undefined;
    }
    const profile = trainerProfile({ classId: trainer.class.id, aiFlags: trainer.aiFlags }, data.aiFlags, data.classes);
    const me = world.get(f.entityId)!;
    return {
      id: nextBattleId++,
      fighter: f,
      trainer,
      profile,
      skill: skillOf(profile.combat),
      arena: { area: me.area, x: me.x, y: me.y, radiusPx },
      side: { x: me.x, y: me.y },
      fightAt: tick,
      readyBy: undefined,
      team,
      out: new Map(),
      queue: [],
      items: [...trainer.items],
      using: new Map(),
      want: new Map(),
      lastSwitchS: undefined,
      ally: undefined,
      music: data.trainerClass(trainer.class.id)?.music ?? "trainer",
    };
  }

  /** The arena lies ahead of the player, toward the trainer: half of it in front, the trainer's side at its far edge. */
  function place(b: Battle, dir: Point): void {
    const me = world.get(b.fighter.entityId)!;
    world.update({ ...me, facing: facingOf(dir) });
    b.arena = { area: me.area, x: me.x + dir.x * (radiusPx / 2), y: me.y + dir.y * (radiusPx / 2), radiusPx };
    b.side = { x: me.x + dir.x * radiusPx, y: me.y + dir.y * radiusPx };
  }

  function start(playerId: number, trainerId: number, npc: Entity | undefined, tiles: number): boolean {
    const f = fighters.get(playerId);
    if (!f || battles.has(playerId) || leadIndex(f.progress.party) === undefined) return false;
    const b = prepare(f, trainerId);
    if (!b) return false;
    const me = world.get(f.entityId)!;
    if (npc) {
      const d = Math.hypot(npc.x - me.x, npc.y - me.y);
      place(b, d < 0.01 ? VECTORS[me.facing] : { x: (npc.x - me.x) / d, y: (npc.y - me.y) / d });
      const { intro } = data.lines(trainerId);
      b.fightAt = tick + toTicks(tuning.alertS + tiles * tuning.approachSPerTile);
      // The client shows the line once the trainer stands in front, then answers trainer-ready.
      if (intro) b.readyBy = b.fightAt + toTicks(tuning.challengeTimeoutS);
      f.send({ type: "trainerSpotted", npcId: npc.id, trainerId, tiles, ...(intro ? { intro } : {}) });
    } else place(b, VECTORS[me.facing]);
    battles.set(playerId, b);
    return true;
  }

  return {
    join(f: Fighter): void {
      fighters.set(f.playerId, f);
    },
    /** Ends any battle without a winner: the trainer stays undefeated. */
    leave(playerId: number): void {
      const b = battles.get(playerId);
      if (b) end(b, "aborted");
      fighters.delete(playerId);
    },
    /** A script's TrainerBattle (spec 022, FR-003): the same battle, no approach. `partner` is not supported yet. */
    startScripted(playerId: number, trainerId: number, partner: number): boolean {
      // shortcut: tag battles (two trainers, `partner`) fight the first trainer only; add the partner's team when a script needs it.
      if (partner !== 0) options.log(`Player ${playerId}: tag battle partner ${partner} ignored`);
      return start(playerId, trainerId, undefined, 0);
    },
    /** The player talked to a person: a trainer not yet beaten challenges, a beaten one says its after line. False when it is not a trainer. */
    talk(playerId: number, npc: Entity): boolean {
      const f = fighters.get(playerId);
      const info = options.trainerOf(npc);
      if (!f || !info) return false;
      if (f.flags.has(flagOf(info.trainer))) {
        const { after } = data.lines(info.trainer);
        if (after) f.send({ type: "trainerSay", text: after });
        return true;
      }
      return start(playerId, info.trainer, npc, 0);
    },
    /** The player closed the challenge line. */
    ready(playerId: number): void {
      const b = battles.get(playerId);
      if (b) b.readyBy = undefined;
    },
    inBattle: (playerId: number) => battles.has(playerId),
    /** "!" and approach: the player cannot move. */
    locked: (playerId: number) => battles.get(playerId)?.fightAt !== undefined,
    /** Whether an entity is a Pokémon of some trainer battle (balls do nothing to it). */
    isTrainerPokemon: (entityId: number) => combat.get(entityId)?.owner === "trainer",
    /** After combat and the companion rules: sight, then every battle. */
    step(now: number, hits: HitEvent[]): void {
      tick = now;
      ai.prepare(tick, hits);
      for (const b of [...battles.values()].sort((x, y) => x.id - y.id)) stepBattle(b);
      if (tick % sightEvery !== 0) return;
      const npcs = world.all().filter((e) => e.kind === "npc");
      for (const f of fighters.values()) {
        if (battles.has(f.playerId) || !options.free(f.playerId) || leadIndex(f.progress.party) === undefined) continue;
        const me = world.get(f.entityId);
        if (!me) continue;
        // In id order, so two trainers who see the player at once challenge one at a time.
        for (const npc of npcs) {
          if (npc.area !== me.area || Math.hypot(npc.x - me.x, npc.y - me.y) > activationPx || !options.visible(f.playerId, npc)) continue;
          const info = options.trainerOf(npc);
          if (!info || info.sightTiles === 0 || f.flags.has(flagOf(info.trainer))) continue;
          const along = sees(npc, me, info.sightTiles);
          if (along !== undefined && start(f.playerId, info.trainer, npc, along - 1)) break;
        }
      }
    },
  };
}

export type TrainerBattles = ReturnType<typeof createTrainerBattles>;
