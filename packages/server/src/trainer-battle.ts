import { blocksSight, lineOfSight, type AiHooks, type AiTick, type SkillProfile } from "@soulsilver/shared/ai";
import { computeStats, effectiveness, toTicks, type Point, type StatOptions } from "@soulsilver/shared/combat";
import { leadIndex } from "@soulsilver/shared/companion";
import type { TrainerMusic, TrainerRecord } from "@soulsilver/shared/events";
import { hpRestore, RING_RADIUS_PX, RING_SPOTS, ringArea, ringSource, tileAt, type Entity, type HitEvent, type Rng, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { canFight, type PartyMember, type Save } from "@soulsilver/shared/save";
import type { HeldItem } from "@soulsilver/shared/items";
import { BOSS_TRAINERS, chooseItem, chooseSwitch, prize, trainerProfile, type TrainerProfile } from "@soulsilver/shared/trainer";
import { wildMoves } from "@soulsilver/shared/wild";
import { createAi } from "./ai";
import type { AiData } from "./ai-loader";
import { playerPic, type Combat, type CombatantSpec } from "./combat";
import type { CombatData } from "./combat-loader";
import { SOLID, type Companions } from "./companion";
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
  /** Spec 027: what an item does when held, and what a party member brings into combat (held item, PP Ups). */
  held?: ((item: number) => HeldItem | undefined) | undefined;
  extras?: ((m: PartyMember) => Pick<CombatantSpec, "held" | "cooldownMul">) | undefined;
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
  /**
   * Spec 026: a beaten trainer who seeks a rematch on this player's phone (LoadPhoneDat, GetPhoneBookRematch in
   * scr_seq_0953.s): the trainer to fight and the contact; undefined for none. Winning it calls rematchWon (ScrCmd_462).
   */
  rematch?(playerId: number, trainer: number): { contact: number; trainer: number } | undefined;
  rematchWon?(playerId: number, contact: number): void;
  /** Spec 026: a trainer with an unregistered number offers it (scr_seq_0953.s _0D9F): after the first win, or `again` when talked to. True when it does. */
  offerNumber?(playerId: number, trainer: number, again: boolean): boolean;
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
  boss: boolean;
  held: HeldItem | undefined;
  /** Item 032.5: whose team, in a tag battle: 0 the first trainer, 1 the partner. */
  foe: number;
}

/** Item 032.5: a trainer fighting beside the player (MultiBattle), one Pokémon out at a time, driven by the combat AI. */
interface NpcAlly {
  trainer: TrainerRecord;
  skill: SkillProfile;
  team: Member[];
  out: { index: number; entityId: number } | undefined;
  next: { index: number; at: number } | undefined;
}

interface Battle {
  id: number;
  fighter: Fighter;
  trainer: TrainerRecord;
  /** The second opposing trainer of a tag battle. */
  partner: TrainerRecord | undefined;
  npc: NpcAlly | undefined;
  profile: TrainerProfile;
  skill: SkillProfile;
  arena: { area: string; x: number; y: number; radiusPx: number };
  /** Where the trainer's Pokémon come out. */
  side: Point;
  /** Ticks of "!" and approach still to go; fighting once undefined. */
  fightAt: number | undefined;
  /** Decided: how, and the tick a won one closes at (a lost one closes with the blackout). */
  over: { result: "won" | "lost"; at: number } | undefined;
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
  /** The trainer's person in the world, when known: its sprite stands in for it in a ring. */
  npcId: number | undefined;
  /** Item V.3: fought in a ring, where the player stood before it and the trainer's stand-in. */
  ring: { back: Pick<Entity, "area" | "x" | "y" | "level" | "facing">; standIn: number | undefined } | undefined;
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

  function memberOf(m: TrainerRecord["team"][number], foe: number, boss: boolean): Member {
    const species = combatData.species(m.species);
    if (!species) throw new Error(`espécie ${m.species} não existe na extração`);
    const moves = m.moves?.filter((id) => id > 0) ?? wildMoves(data.levelUp(m.species), m.level, (id) => combatData.move(id)?.special ?? false);
    // The original's IVs: the member's difficulty scaled from 0–255 to 0–31, the same for every stat.
    const iv = Math.floor((m.difficulty * 31) / 255);
    const stats: StatOptions = { ivs: { hp: iv, attack: iv, defense: iv, speed: iv, specialAttack: iv, specialDefense: iv } };
    const hpMax = Math.floor(computeStats(species.baseStats, m.level, stats).hp * (boss ? combatData.tuning.bossHpMul : 1));
    return { species: m.species, level: m.level, moves, stats, types: [...species.types], hp: hpMax, hpMax, boss, held: m.item === null ? undefined : options.held?.(m.item), foe };
  }

  function hooksFor(b: Battle, entityId: number): AiHooks {
    return {
      chooseSwitch(t: AiTick) {
        const active = b.out.get(entityId);
        if (active === undefined) return undefined;
        const busy = new Set([...b.out.values(), ...b.queue.map((q) => q.index)]);
        const to = chooseSwitch({
          // Members already out or on their way, or the other trainer's, cannot be picked.
          team: b.team.map((m, i) => (i !== active && (busy.has(i) || m.foe !== b.team[active]!.foe) ? { ...m, hp: 0 } : m)),
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
    const c = combat.spawn(world, e.id, { species: m.species, level: m.level, moves: m.moves, stats: m.stats, held: m.held, trainerPic: b.trainer.class.id, boss: m.boss }, "trainer");
    c.hp = m.hp;
    combat.setBattle(e.id, b.id);
    ai.add(e.id, { home: { x: b.arena.x, y: b.arena.y }, level: m.level, temperament: "aggressive", leashPx: b.arena.radiusPx, profile: b.skill, hooks: hooksFor(b, e.id), strategy: "trainer" });
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

  /** The next member in the original order that can come out; of trainer `foe` only when given. */
  function nextUp(b: Battle, foe?: number): number | undefined {
    const busy = new Set([...b.out.values(), ...b.queue.map((q) => q.index)]);
    const i = b.team.findIndex((m, index) => m.hp > 0 && !busy.has(index) && (foe === undefined || m.foe === foe));
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

  function sendNpcAlly(b: Battle, index: number): void {
    const a = b.npc!;
    const m = a.team[index]!;
    const me = world.get(b.fighter.entityId)!;
    const e = world.add({ kind: "pokemon", area: b.arena.area, x: b.arena.x, y: b.arena.y, level: me.level, facing: me.facing, data: { owner: String(b.fighter.playerId), role: "ally", species: m.species } });
    const c = combat.spawn(world, e.id, { species: m.species, level: m.level, moves: m.moves, stats: m.stats, held: m.held, trainerPic: a.trainer.class.id }, b.fighter.playerId);
    c.hp = m.hp;
    combat.setBattle(e.id, b.id);
    ai.add(e.id, { home: { x: b.arena.x, y: b.arena.y }, level: m.level, temperament: "aggressive", leashPx: b.arena.radiusPx, profile: a.skill, strategy: "trainer" });
    a.out = { index, entityId: e.id };
  }

  function removeNpcAlly(b: Battle): void {
    const out = b.npc?.out;
    if (!out) return;
    const c = combat.get(out.entityId);
    if (c) b.npc!.team[out.index]!.hp = c.hp;
    combat.remove(world, out.entityId);
    world.remove(out.entityId);
    ai.remove(out.entityId);
    b.npc!.out = undefined;
  }

  /** The ally trainer's Pokémon fights until it faints, then its next comes out; with none left the player fights on. */
  function stepNpcAlly(b: Battle): void {
    const a = b.npc;
    if (!a) return;
    if (a.out) {
      const c = combat.get(a.out.entityId);
      if (c && c.hp > 0) {
        ai.drive(a.out.entityId);
        return;
      }
      removeNpcAlly(b);
      const next = a.team.findIndex((m) => m.hp > 0);
      if (next !== -1) a.next = { index: next, at: tick + toTicks(tuning.sendOutS) };
    } else if (a.next && tick >= a.next.at) {
      sendNpcAlly(b, a.next.index);
      a.next = undefined;
    }
  }

  /** The contact of each player's rematch now fought. */
  const rematches = new Map<number, number>();

  function end(b: Battle, result: "won" | "lost" | "aborted"): void {
    const contact = rematches.get(b.fighter.playerId);
    rematches.delete(b.fighter.playerId);
    if (result === "won" && contact !== undefined) options.rematchWon?.(b.fighter.playerId, contact);
    const offer = result === "won" && contact === undefined;
    for (const id of [...b.out.keys()]) recall(b, id);
    removeAlly(b);
    removeNpcAlly(b);
    battles.delete(b.fighter.playerId);
    const { fighter } = b;
    let money: number | undefined;
    if (result === "won") {
      // A tag battle pays and marks both trainers.
      money = 0;
      for (const t of [b.trainer, ...(b.partner ? [b.partner] : [])]) {
        fighter.flags.add(flagOf(t.id));
        money += prize({ prizeBase: data.trainerClass(t.class.id)?.prizeBase ?? 0, team: t.team, double: t.doubleBattle });
      }
      fighter.progress.money = Math.min(999999, fighter.progress.money + money);
    }
    leaveRing(b);
    // A blackout already ended the fight on a loss.
    if (b.fightAt === undefined) companions.leaveBattle(fighter.playerId);
    const defeat = result === "won" ? data.lines(b.trainer.id).defeat : undefined;
    fighter.send({ type: "trainerBattleEnd", battleId: b.id, result, ...(money !== undefined ? { prize: money } : {}), ...(defeat ? { defeat } : {}) });
    options.broadcast(b.arena.area, { type: "trainerBattleEnd", battleId: b.id, result }, fighter.playerId);
    options.onEnd?.(fighter.playerId, result === "won");
    if (offer) options.offerNumber?.(fighter.playerId, b.trainer.id, false);
  }

  /** The person a trainer battle is with: the one given, the trainer's own in the area, or the nearest one to the player (a script's talker). */
  function trainerPerson(b: Battle): Entity | undefined {
    const me = world.get(b.fighter.entityId)!;
    const given = b.npcId === undefined ? undefined : world.get(b.npcId);
    if (given) return given;
    const people = world.all().filter((e) => e.kind === "npc" && e.area === me.area && options.visible(b.fighter.playerId, e));
    // shortcut: a scripted battle takes the closest person within 2 tiles as the trainer; name it from the script if a gym shows the wrong one.
    const near = people.map((e) => ({ e, d: Math.hypot(e.x - me.x, e.y - me.y) })).filter((n) => n.d <= 2 * MAP_TILE_PX).sort((x, y) => x.d - y.d)[0]?.e;
    return people.find((e) => options.trainerOf(e)?.trainer === b.trainer.id) ?? near;
  }

  /** Item V.3: indoors, the fight moves to a ring of its own, the trainer's stand-in across from the player. */
  function enterRing(b: Battle): void {
    const me = world.get(b.fighter.entityId)!;
    // Already in a ring (the dev arena's): fought where it stands.
    if (options.lookup(me.area)?.areaType !== "indoor" || ringSource(me.area) !== undefined) return;
    const area = ringArea(me.area, b.id);
    const person = trainerPerson(b);
    const standIn = person && world.add({ kind: "npc", area, ...RING_SPOTS.trainer, level: 0, facing: "west", data: { sprite: person.data["sprite"] ?? 0 } }).id;
    b.ring = { back: { area: me.area, x: me.x, y: me.y, level: me.level, facing: me.facing }, standIn };
    world.update({ ...me, area, ...RING_SPOTS.player, level: 0, facing: "east" });
    b.arena = { area, ...RING_SPOTS.center, radiusPx: RING_RADIUS_PX };
    b.side = { ...RING_SPOTS.side };
  }

  /** Back where the player stood, unless a blackout already took them away. */
  function leaveRing(b: Battle): void {
    if (!b.ring) return;
    if (b.ring.standIn !== undefined) world.remove(b.ring.standIn);
    const me = world.get(b.fighter.entityId);
    if (me?.area === b.arena.area) world.update({ ...me, ...b.ring.back });
    b.ring = undefined;
  }

  function begin(b: Battle): void {
    b.fightAt = undefined;
    enterRing(b);
    const party = b.fighter.progress.party;
    const lead = leadIndex(party);
    // Beside an ally trainer the player sends one Pokémon only.
    const allyIndex = b.trainer.doubleBattle && !b.npc ? party.findIndex((m, i) => i !== lead && canFight(m)) : -1;
    const arena = { battle: b.id, x: b.arena.x, y: b.arena.y, radiusPx: b.arena.radiusPx, endTicks: toTicks(tuning.endS), ally: allyIndex === -1 ? undefined : allyIndex };
    if (!companions.enterBattle(b.fighter.playerId, arena, tick)) {
      options.log(`Player ${b.fighter.playerId}: trainer battle ${b.trainer.id} not started, no Pokémon could come out`);
      // Nothing came out, so there is no fight to leave.
      b.fightAt = tick;
      end(b, "aborted");
      return;
    }
    options.broadcast(b.arena.area, { type: "trainerBattleStart", battleId: b.id, player: b.fighter.playerId, trainerId: b.trainer.id, arena: b.arena, music: b.music, double: b.trainer.doubleBattle || b.partner !== undefined || b.npc !== undefined });
    // A tag battle: one of each trainer's.
    for (const foe of b.partner ? [0, 1] : b.trainer.doubleBattle ? [0, 0] : [0]) {
      const i = nextUp(b, foe);
      if (i !== undefined) sendOut(b, i);
    }
    if (b.npc) sendNpcAlly(b, 0);
    if (allyIndex !== -1) {
      const member = party[allyIndex]!;
      const me = world.get(b.fighter.entityId)!;
      const e = world.add({ kind: "pokemon", area: me.area, x: b.arena.x, y: b.arena.y, level: me.level, facing: me.facing, data: { owner: String(b.fighter.playerId), role: "ally", species: member.species } });
      try {
        const c = combat.spawn(world, e.id, { species: member.species, level: member.level, moves: member.moves, trainerPic: playerPic(me.data["character"]), ...options.extras?.(member) }, b.fighter.playerId);
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

  /** A side has nobody left: the player is told, and the battle holds for endS. */
  function decide(b: Battle, result: "won" | "lost"): void {
    b.over = { result, at: tick + toTicks(tuning.endS) };
    b.fighter.send({ type: "trainerBattleOver", battleId: b.id, result });
  }

  function stepBattle(b: Battle): void {
    if (b.fightAt !== undefined) {
      if (tick >= b.fightAt && (b.readyBy === undefined || tick >= b.readyBy)) begin(b);
      return;
    }
    if (companions.lostBattle(b.fighter.playerId)) {
      if (!b.over) decide(b, "lost");
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
        // The last one lies on the field until the battle closes.
        if (b.over) continue;
        options.progression?.faint(id, m.species, m.level, true);
        if (b.team.every((t) => t.hp === 0)) continue;
        recall(b, id);
        const next = nextUp(b, m.foe);
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
    stepNpcAlly(b);
    if (b.over) {
      if (tick >= b.over.at) end(b, "won");
    } else if (b.team.every((t) => t.hp === 0)) {
      companions.winBattle(b.fighter.playerId);
      decide(b, "won");
    }
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

  /** A trainer of the extraction and its team as members of side `foe`; undefined (logged) when it cannot fight. */
  function teamOf(f: Fighter, trainerId: number, foe: number, override?: TrainerRecord["team"], ally = false): { trainer: TrainerRecord; team: Member[] } | undefined {
    const record = data.trainer(trainerId);
    const trainer = record && override ? { ...record, team: override } : record;
    if (!trainer) {
      options.log(`Player ${f.playerId}: trainer ${trainerId} is not in the extraction`);
      return undefined;
    }
    try {
      return { trainer, team: trainer.team.map((m, i) => memberOf(m, foe, !ally && BOSS_TRAINERS.has(trainerId) && i === trainer.team.length - 1)) };
    } catch (error) {
      options.log(`Player ${f.playerId}: trainer ${trainerId} cannot fight: ${(error as Error).message}`);
      return undefined;
    }
  }

  function prepare(f: Fighter, trainerId: number, override?: TrainerRecord["team"], partnerId = 0, allyId = 0): Battle | undefined {
    const first = teamOf(f, trainerId, 0, override);
    const second = partnerId ? teamOf(f, partnerId, 1) : undefined;
    const ally = allyId ? teamOf(f, allyId, 0, undefined, true) : undefined;
    if (!first || (partnerId && !second) || (allyId && !ally?.team.length)) return undefined;
    const { trainer } = first;
    const team = [...first.team, ...(second?.team ?? [])];
    const profile = trainerProfile({ classId: trainer.class.id, aiFlags: trainer.aiFlags }, data.aiFlags, data.classes);
    const me = world.get(f.entityId)!;
    return {
      id: nextBattleId++,
      fighter: f,
      trainer,
      partner: second?.trainer,
      npc: ally && { trainer: ally.trainer, skill: skillOf(trainerProfile({ classId: ally.trainer.class.id, aiFlags: ally.trainer.aiFlags }, data.aiFlags, data.classes).combat), team: ally.team, out: undefined, next: undefined },
      profile,
      skill: skillOf(profile.combat),
      arena: { area: me.area, x: me.x, y: me.y, radiusPx },
      side: { x: me.x, y: me.y },
      fightAt: tick,
      over: undefined,
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
      npcId: undefined,
      ring: undefined,
    };
  }

  /**
   * The arena lies ahead of the player, toward the trainer: half of it in front, the trainer's side at its far edge,
   * or at the last walkable point before a wall (a trainer on a raised altar, like Elder Li's, stands in one).
   */
  function place(b: Battle, dir: Point): void {
    const me = world.get(b.fighter.entityId)!;
    world.update({ ...me, facing: facingOf(dir) });
    b.arena = { area: me.area, x: me.x + dir.x * (radiusPx / 2), y: me.y + dir.y * (radiusPx / 2), radiusPx };
    let reach = 0;
    for (let d = MAP_TILE_PX / 2; d <= radiusPx && !SOLID.has(tileAt(options.lookup, me.area, me.level, me.x + dir.x * d, me.y + dir.y * d)?.category ?? "blocked"); d += MAP_TILE_PX / 2) reach = d;
    b.side = { x: me.x + dir.x * reach, y: me.y + dir.y * reach };
  }

  function start(playerId: number, trainerId: number, npc: Entity | undefined, tiles: number, team?: TrainerRecord["team"], partner = 0, ally = 0): boolean {
    const f = fighters.get(playerId);
    if (!f || battles.has(playerId) || leadIndex(f.progress.party) === undefined) return false;
    const b = prepare(f, trainerId, team, partner, ally);
    if (!b) return false;
    const me = world.get(f.entityId)!;
    if (npc) {
      b.npcId = npc.id;
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
    /** Closes a decided battle now: the player is leaving, and the save must have how it ended. */
    settle(playerId: number): void {
      const b = battles.get(playerId);
      if (b?.over) end(b, b.over.result);
    },
    /** Ends any battle: a decided one as it was, any other without a winner (the trainer stays undefeated). */
    leave(playerId: number): void {
      const b = battles.get(playerId);
      if (b) end(b, b.over?.result ?? "aborted");
      fighters.delete(playerId);
    },
    /**
     * A script's TrainerBattle (spec 022, FR-003): the same battle, no approach; `partner` a second opposing trainer (0 for none).
     * Item 032.5: MultiBattle's `ally` trainer fights beside the player. `team` replaces the trainer's own (the dev arena).
     */
    startScripted(playerId: number, trainerId: number, partner: number, team?: TrainerRecord["team"], ally = 0): boolean {
      return start(playerId, trainerId, undefined, 0, team, partner, ally);
    },
    /** A person challenges the player where it stands, with the trainer's own team (the dev arena's Gym Leader). */
    challenge: (playerId: number, trainerId: number, npc: Entity): boolean => start(playerId, trainerId, npc, 0),
    /** The player talked to a person: a trainer not yet beaten challenges, a beaten one says its after line. False when it is not a trainer. */
    talk(playerId: number, npc: Entity): boolean {
      const f = fighters.get(playerId);
      const info = options.trainerOf(npc);
      if (!f || !info) return false;
      if (f.flags.has(flagOf(info.trainer))) {
        const again = options.rematch?.(playerId, info.trainer);
        if (again && start(playerId, again.trainer, npc, 0)) {
          rematches.set(playerId, again.contact);
          return true;
        }
        if (options.offerNumber?.(playerId, info.trainer, true)) return true;
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
    /** Item V.3: in a ring, where the player stood before it (what a save keeps). */
    returnOf: (playerId: number) => battles.get(playerId)?.ring?.back,
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
