import { toTicks, type Point } from "@soulsilver/shared/combat";
import { behind, leadIndex, moneyLoss, pickReaction, placeOf, poseAt, pushPose, timeOfDay, type Pose } from "@soulsilver/shared/companion";
import { BUTTON, tileAt, type Entity, type PlayerInput, type Rng, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { friendshipOnFaint, memberStats, natureMods } from "@soulsilver/shared/progression";
import { badgeCount, type PartyMember, type Save } from "@soulsilver/shared/save";
import { canHarm, type Combat, type Owner } from "./combat";
import type { CombatData } from "./combat-loader";
import type { CompanionData } from "./companion-loader";
import type { World } from "./world";

// The companion and the rules around a fight (spec 014): the party lead follows its trainer along
// the trail; the combat button puts it under the player's control while the trainer stands still.

/** Tiles a Pokémon cannot stand on. */
export const SOLID = new Set(["blocked", "water", "ledge"]);
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const OPPOSITE: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };

/** A player as the companion rules see it; the progress fields are the player's own and change in place. */
export interface Trainer {
  playerId: number;
  entityId: number;
  progress: Pick<Save, "party" | "money" | "badgeSet" | "respawn">;
  send(msg: ServerMessage): void;
}

interface State {
  trainer: Trainer;
  trail: Pose[];
  /** The companion's entity: following, or out in combat; undefined while in the ball. */
  companionId: number | undefined;
  mode: "walk" | "combat";
  /** Party index out in combat; undefined after it fainted, until the player picks the next one. */
  active: number | undefined;
  /** Where the trainer stands during combat. */
  anchor: Point;
  swapReadyTick: number;
  /** No control until this tick: the Pokémon is coming out of its ball. */
  swapUntil: number;
  lastThreatTick: number;
  buttons: number;
  lastArea: string;
  /** The last hit on the Pokémon out came from another player's: a blackout from it costs no money. */
  hitByPlayer: boolean;
  /** In a trainer battle (spec 022): kept inside the arena, no recall, no disengage. */
  arena: Arena | undefined;
}

/** A trainer battle's arena as the companion rules see it. */
export interface Arena {
  battle: number;
  x: number;
  y: number;
  radiusPx: number;
  /** Party index fighting as the AI ally in a double battle: it cannot be swapped in. */
  ally?: number | undefined;
}

export interface CompanionOptions {
  data: CompanionData;
  /** Without combat data the combat button does nothing. */
  combat: Combat | undefined;
  combatData: CombatData | undefined;
  lookup: WorldLookup;
  world: World;
  rng: Rng;
  /** Hour of the host's clock (0–23), for reactions. */
  hour: () => number;
  /** Home: the blackout respawn point before any Pokémon Center. */
  home: () => { area: string; x: number; y: number };
  /** True while the player has progression decisions waiting (spec 016): the combat button does nothing. */
  busy?(playerId: number): boolean;
  /** Stats, moves and experience for the party screen (spec 017). */
  detail?(m: PartyMember): Omit<Extract<ServerMessage, { type: "party" }>["members"][number], "species" | "level" | "hp" | "hpMax"> | undefined;
  log(message: string): void;
}

export function createCompanions(options: CompanionOptions) {
  const { data, combat, combatData, lookup, world, rng } = options;
  const states = new Map<number, State>();
  const distPx = data.follow.distanceTiles * MAP_TILE_PX;
  const respawnPx = data.follow.respawnTiles * MAP_TILE_PX;
  const radiusPx = data.battle.combatRadiusTiles * MAP_TILE_PX;

  const trainerOf = (s: State) => world.get(s.trainer.entityId)!;
  const free = (e: Entity) => (x: number, y: number) => !SOLID.has(tileAt(lookup, e.area, e.level, x, y)?.category ?? "");
  const poseOf = (e: Entity): Pose => ({ area: e.area, x: e.x, y: e.y, level: e.level, facing: e.facing, hop: typeof e.data["hop"] === "number" ? e.data["hop"] : 0 });
  const busy = (e: Entity) => e.data["hop"] !== undefined || e.data["warping"] !== undefined;
  const hpMax = (m: PartyMember) => {
    const species = combatData?.species(m.species);
    return species ? memberStats(species.baseStats, m).hp : m.hp;
  };
  const inBall = (species: number, area: string) => {
    const map = lookup(area);
    return data.follow.restrictedMaps.includes(Number(area)) || (map?.areaType === "indoor" && data.large.has(species));
  };

  function sendParty(s: State): void {
    const members = s.trainer.progress.party.map((m) => ({ species: m.species, ...(m.nickname ? { nickname: m.nickname } : {}), level: m.level, hp: m.hp, hpMax: hpMax(m), ...options.detail?.(m) }));
    s.trainer.send({ type: "party", members, ...(s.active !== undefined && s.mode === "combat" ? { active: s.active } : {}) });
  }

  /** Copies the HP of the Pokémon out in combat back to its party member. */
  function keepHp(s: State): void {
    const c = s.companionId === undefined ? undefined : combat?.get(s.companionId);
    if (c && s.active !== undefined) s.trainer.progress.party[s.active]!.hp = c.hp;
  }

  function removeCompanion(s: State): void {
    if (s.companionId === undefined) return;
    combat?.remove(world, s.companionId);
    world.remove(s.companionId);
    s.companionId = undefined;
  }

  /** Puts the companion behind the trainer and restarts the trail from there. */
  function reseed(s: State, t: Entity, species: number): void {
    const at = behind(poseOf(t), distPx, free(t));
    s.trail = [at, poseOf(t)];
    place(s, at, species);
  }

  function place(s: State, pose: Pose, species: number): void {
    const data = { owner: String(s.trainer.playerId), role: "companion", species, ...(pose.hop > 0 ? { hop: pose.hop } : {}) };
    const fields = { kind: "pokemon" as const, area: pose.area, x: pose.x, y: pose.y, level: pose.level, facing: pose.facing, data };
    if (s.companionId === undefined) s.companionId = world.add(fields).id;
    else world.update({ id: s.companionId, ...fields });
  }

  function follow(s: State): void {
    const t = trainerOf(s);
    const party = s.trainer.progress.party;
    const lead = leadIndex(party);
    s.lastArea = t.area;
    if (lead === undefined || inBall(party[lead]!.species, t.area)) {
      removeCompanion(s);
      s.trail = [];
      return;
    }
    const species = party[lead]!.species;
    const c = s.companionId === undefined ? undefined : world.get(s.companionId);
    // Back from the ball, through a warp or a map border, or left behind: reappear behind the trainer.
    if (!c || c.area !== t.area || Math.hypot(c.x - t.x, c.y - t.y) > respawnPx || s.trail.at(-1)?.area !== t.area) {
      if (!busy(t)) reseed(s, t, species);
      return;
    }
    pushPose(s.trail, poseOf(t), respawnPx + MAP_TILE_PX * 2);
    const at = poseAt(s.trail, distPx);
    if (at) place(s, at, species);
    else if (c.data["species"] !== species) place(s, poseOf(c), species);
  }

  /** The companion one step in front of the trainer (on the trainer when that spot is blocked). */
  function stepForward(s: State, species: number): void {
    const t = trainerOf(s);
    const [sx, sy] = STEP[t.facing];
    const step = data.battle.stepForwardTiles * MAP_TILE_PX;
    const ahead = free(t)(t.x + sx * step, t.y + sy * step);
    place(s, { ...poseOf(t), x: ahead ? t.x + sx * step : t.x, y: ahead ? t.y + sy * step : t.y, hop: 0 }, species);
  }

  function sendOut(s: State, index: number): boolean {
    const member = s.trainer.progress.party[index]!;
    if (s.companionId === undefined) stepForward(s, member.species);
    try {
      const stats = { ivs: member.ivs, evs: member.evs, nature: natureMods(member.nature) };
      const c = combat!.spawn(world, s.companionId!, { species: member.species, level: member.level, moves: member.moves, stats }, s.trainer.playerId);
      c.hp = Math.min(member.hp, c.stats.hp);
      c.battle = s.arena?.battle;
    } catch (error) {
      options.log(`Player ${s.trainer.playerId}: cannot send out party member ${index}: ${(error as Error).message}`);
      removeCompanion(s);
      return false;
    }
    s.active = index;
    s.trainer.send({ type: "control", entityId: s.companionId! });
    return true;
  }

  /** `forced`: a trainer battle starts even with progression decisions waiting. */
  function startCombat(s: State, tick: number, forced = false): void {
    const t = trainerOf(s);
    const lead = leadIndex(s.trainer.progress.party);
    if (!combat || lead === undefined || busy(t) || (!forced && options.busy?.(s.trainer.playerId))) return;
    // Out of the ball, or one step forward from behind the trainer; no Poké Ball throw.
    stepForward(s, s.trainer.progress.party[lead]!.species);
    if (!sendOut(s, lead)) return;
    s.mode = "combat";
    s.anchor = { x: t.x, y: t.y };
    s.lastThreatTick = tick;
    world.update({ ...t, data: { ...t.data, inCombat: true } });
    sendParty(s);
  }

  /** Recall: back behind the trainer as companion, control back to the trainer; queued progression follows (spec 016). */
  function endCombat(s: State): void {
    const t = trainerOf(s);
    keepHp(s);
    if (s.companionId !== undefined) combat?.remove(world, s.companionId);
    s.mode = "walk";
    s.arena = undefined;
    s.active = undefined;
    const rest = { ...t.data };
    delete rest["inCombat"];
    world.update({ ...t, data: rest });
    const lead = leadIndex(s.trainer.progress.party);
    if (lead !== undefined && !inBall(s.trainer.progress.party[lead]!.species, t.area)) reseed(s, trainerOf(s), s.trainer.progress.party[lead]!.species);
    else removeCompanion(s);
    s.trainer.send({ type: "control", entityId: s.trainer.entityId });
    sendParty(s);
  }

  function blackout(s: State): void {
    const { progress } = s.trainer;
    // Losing to another player is like a link battle: no money changes hands.
    const lost = s.hitByPlayer ? 0 : moneyLoss(progress.money, progress.party.map((m) => m.level), badgeCount(progress.badgeSet), data.battle.moneyLossBase);
    progress.money -= lost;
    for (const m of progress.party) m.hp = hpMax(m);
    const to = progress.respawn ?? options.home();
    const t = trainerOf(s);
    world.update({ ...t, area: to.area, x: to.x, y: to.y, level: 0, facing: "south" });
    s.lastArea = to.area;
    s.trainer.send({ type: "blackout", moneyLost: lost, area: to.area });
    endCombat(s);
  }

  function stepCombat(s: State, tick: number): void {
    const party = s.trainer.progress.party;
    const c = s.companionId === undefined ? undefined : combat!.get(s.companionId);
    keepHp(s);
    if (c && s.active !== undefined) {
      if (c.hp === 0) {
        // Back to the ball on its own; the player picks the next one or recalls to flee.
        const fainted = s.active;
        party[fainted]!.friendship = friendshipOnFaint(party[fainted]!.friendship);
        removeCompanion(s);
        s.active = undefined;
        const canContinue = leadIndex(party) !== undefined;
        s.trainer.send({ type: "fainted", partyIndex: fainted, canContinue });
        if (!canContinue) {
          blackout(s);
          return;
        }
        sendParty(s);
      }
    }
    const e = s.companionId === undefined ? undefined : world.get(s.companionId);
    if (e) {
      // Never past the combat radius around the trainer (FR-015), or out of a trainer battle's arena (spec 022).
      const anchor = s.arena ?? s.anchor;
      const radius = s.arena?.radiusPx ?? radiusPx;
      const dx = e.x - anchor.x;
      const dy = e.y - anchor.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) world.update({ ...e, x: anchor.x + (dx / d) * radius, y: anchor.y + (dy / d) * radius });
    }
    // A trainer battle ends only by its own rules.
    if (s.arena) return;
    const t = trainerOf(s);
    const reach = data.battle.disengageTiles * MAP_TILE_PX;
    const threat = world.all().some((w) => {
      const foe = w.kind === "pokemon" ? combat!.get(w.id) : undefined;
      return foe && foe.hp > 0 && w.area === t.area && canHarm(s.trainer.playerId, foe.owner) && Math.hypot(w.x - (e?.x ?? t.x), w.y - (e?.y ?? t.y)) <= reach;
    });
    if (threat) s.lastThreatTick = tick;
    else if (tick - s.lastThreatTick >= toTicks(data.battle.disengageSeconds)) endCombat(s);
  }

  /** A wild Pokémon still standing within contactTiles of the trainer. */
  function touchingWild(s: State): boolean {
    if (!combat) return false;
    const t = trainerOf(s);
    const reach = data.battle.contactTiles * MAP_TILE_PX;
    return world.all().some((w) => w.kind === "pokemon" && w.area === t.area && combat.get(w.id)?.owner === "wild" && combat.get(w.id)!.hp > 0 && Math.hypot(w.x - t.x, w.y - t.y) <= reach);
  }

  function interact(s: State): void {
    const t = trainerOf(s);
    const c = s.companionId === undefined ? undefined : world.get(s.companionId);
    const lead = leadIndex(s.trainer.progress.party);
    if (!c || lead === undefined || busy(t)) return;
    const dx = c.x - t.x;
    const dy = c.y - t.y;
    const facing: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
    world.update({ ...t, facing });
    world.update({ ...c, facing: OPPOSITE[facing] });
    const member = s.trainer.progress.party[lead]!;
    const map = lookup(t.area);
    const ctx = { place: placeOf(map?.areaType, map?.mapsec, data.reactions.towns), time: timeOfDay(options.hour()), friendship: member.friendship };
    const pick = pickReaction(data.reactions, ctx, (n) => rng.nextInt(n));
    s.trainer.send({ type: "reaction", companionId: c.id, species: member.species, emotion: pick.emotion, bank: data.reactions.bank, text: pick.text });
  }

  return {
    join(trainer: Trainer): void {
      // HP from a save is a trust boundary: never above the maximum for the level.
      for (const m of trainer.progress.party) m.hp = Math.min(m.hp, hpMax(m));
      const t = world.get(trainer.entityId)!;
      const s: State = { trainer, trail: [], companionId: undefined, mode: "walk", active: undefined, anchor: { x: 0, y: 0 }, swapReadyTick: 0, swapUntil: 0, lastThreatTick: 0, buttons: 0, lastArea: t.area, hitByPlayer: false, arena: undefined };
      states.set(trainer.playerId, s);
      sendParty(s);
    },
    /** Ends any fight (keeping HP in the party) and removes the companion. */
    leave(playerId: number): void {
      const s = states.get(playerId);
      if (!s) return;
      keepHp(s);
      removeCompanion(s);
      states.delete(playerId);
    },
    inCombat: (playerId: number) => states.get(playerId)?.mode === "combat",
    /** Records who hit this player's Pokémon last: a player (PvP), a wild one or a trainer's. */
    hitBy(playerId: number, attacker: Owner): void {
      const s = states.get(playerId);
      if (s) s.hitByPlayer = typeof attacker === "number";
    },
    /** Party index out in combat, if any. */
    active: (playerId: number) => states.get(playerId)?.active,
    /** Sends the party again, after progression changed a level or a species. */
    refresh(playerId: number): void {
      const s = states.get(playerId);
      if (s) sendParty(s);
    },
    /** The Pokémon the player controls in combat, if any. */
    controlled(playerId: number): number | undefined {
      const s = states.get(playerId);
      return s?.mode === "combat" ? s.companionId : undefined;
    },
    /** In combat the input moves the Pokémon; returns false when the trainer should walk it instead. */
    input(playerId: number, input: PlayerInput | undefined, tick: number): boolean {
      const s = states.get(playerId);
      if (!s) return false;
      const buttons = input?.buttons ?? s.buttons;
      const pressed = buttons & ~s.buttons;
      s.buttons = buttons;
      if (s.mode === "walk") {
        if (pressed & BUTTON.combat || touchingWild(s)) startCombat(s, tick);
        else if (pressed & BUTTON.interact) interact(s);
        // startCombat() may have changed the mode; TS cannot see that through the call.
        return (s.mode as State["mode"]) === "combat";
      }
      if (pressed & BUTTON.recall) {
        // There is no running from a trainer battle (spec 022).
        if (s.arena) s.trainer.send({ type: "notice", code: "no-escape" });
        else endCombat(s);
        return true;
      }
      if (input && s.companionId !== undefined && tick >= s.swapUntil) combat!.input(s.companionId, { move: input.move, buttons: input.buttons, aim: input.aim });
      return true;
    },
    /** Quick swap; ignored on cooldown, for a fainted or already active member, or outside combat. */
    swap(playerId: number, index: number, tick: number): void {
      const s = states.get(playerId);
      const member = s?.trainer.progress.party[index];
      if (!s || s.mode !== "combat" || !member || member.hp === 0 || index === s.active || index === s.arena?.ally || tick < s.swapReadyTick) return;
      keepHp(s);
      if (s.companionId !== undefined) combat!.remove(world, s.companionId);
      if (!sendOut(s, index)) return;
      s.swapUntil = tick + toTicks(data.battle.swapAnimSeconds);
      s.swapReadyTick = tick + toTicks(data.battle.swapCooldownSeconds);
      sendParty(s);
    },
    /** A trainer battle begins (spec 022): the Pokémon comes out if it is not already; false when it cannot fight. */
    enterBattle(playerId: number, arena: Arena, tick: number): boolean {
      const s = states.get(playerId);
      if (!s) return false;
      if (s.mode !== "combat") startCombat(s, tick, true);
      if (s.mode !== "combat") return false;
      s.arena = arena;
      if (s.companionId !== undefined && combat?.has(s.companionId)) combat.setBattle(s.companionId, arena.battle);
      return true;
    },
    /** The trainer battle is over: back to walking. */
    leaveBattle(playerId: number): void {
      const s = states.get(playerId);
      if (s?.arena && s.mode === "combat") endCombat(s);
      else if (s) s.arena = undefined;
    },
    /** After movement and combat: following, containment, fainting, blackout and the end of combat. */
    step(tick: number): void {
      for (const s of states.values()) {
        if (s.mode === "walk") follow(s);
        else stepCombat(s, tick);
      }
    },
  };
}

export type Companions = ReturnType<typeof createCompanions>;
