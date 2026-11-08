import type { ItemRecord } from "@soulsilver/shared/game-data";
import type { NoticeCode, HitEvent, Rng, ServerMessage } from "@soulsilver/shared/game";
import type { Place } from "@soulsilver/shared/companion";
import { toTicks, TICKS_PER_S } from "@soulsilver/shared/combat";
import {
  addItem,
  apricornReady,
  berryStage,
  canAdd,
  dayKey,
  dowse,
  healHp,
  heldOf,
  kurtReady,
  parseItemFile,
  ppUpCooldownMul,
  removeItem,
  useEffectOf,
  type CompanionFinds,
  type HeldItem,
  type ItemEffects,
  type ItemFileKind,
  type ItemTuning,
  type PocketOf,
  type UseEffect,
} from "@soulsilver/shared/items";
import type { ItemState, PartyMember, Save } from "@soulsilver/shared/save";
import effectsJson from "../../../content/items/effects.json" with { type: "json" };
import tuningJson from "../../../content/items/tuning.json" with { type: "json" };
import findsJson from "../../../content/companion/finds.json" with { type: "json" };
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import type { Combat } from "./combat";
import type { World } from "./world";

// Items (spec 017, spec 027): what an item does on the field and in combat, held items, Berry Pots,
// Repel, the Dowsing MCHN and the companion's finds. The server decides every change (FR-016).

export type ItemData = Pick<ItemRecord, "id" | "pocket" | "partyUse"> & Partial<Pick<ItemRecord, "holdEffect" | "price">>;

export interface ItemsData {
  item(id: number): ItemData | undefined;
}

export function buildItemsData(records: ItemData[]): ItemsData {
  const byId = new Map(records.map((r) => [r.id, r]));
  return { item: (id) => byId.get(id) };
}

/** Moves party member `from` to slot `to`; false for a bad index or the same slot. */
export function reorderParty(party: PartyMember[], from: number, to: number): boolean {
  if (from === to || from >= party.length || to >= party.length) return false;
  const [m] = party.splice(from, 1);
  party.splice(to, 0, m!);
  return true;
}

/** content/items and content/companion/finds.json, validated (principle III). */
export interface ItemRules {
  effects: ItemEffects;
  tuning: ItemTuning;
  finds: CompanionFinds;
}

function parse<K extends ItemFileKind>(kind: K, value: unknown, file: string) {
  const result = parseItemFile(kind, value, file);
  if (!result.ok) throw new Error(`${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

export function buildItemRules(content: { effects: unknown; tuning: unknown; finds: unknown } = { effects: effectsJson, tuning: tuningJson, finds: findsJson }): ItemRules {
  return {
    effects: parse("effects", content.effects, "content/items/effects.json") as ItemEffects,
    tuning: parse("tuning", content.tuning, "content/items/tuning.json") as ItemTuning,
    finds: parse("finds", content.finds, "content/companion/finds.json") as CompanionFinds,
  };
}

let bundled: ItemRules | undefined;
export const bundledItemRules = () => (bundled ??= buildItemRules());

/** Key items with a use of their own (spec 027). */
export const APRICORN_BOX = 468;
export const BERRY_POTS = 470;
export const DOWSING_MCHN = 471;

const ITEM_STATE_KEYS = ["apricorns", "apricornTrees", "berryPots", "kurt", "repel"] as const;
/** A copy of the item state of a save, for the player's progress. */
export const itemStateOf = (save: ItemState): ItemState => structuredClone(Object.fromEntries(ITEM_STATE_KEYS.map((k) => [k, save[k]])) as ItemState);

export interface ItemOwner {
  playerId: number;
  entityId: number;
  progress: Pick<Save, "party" | "bag"> & ItemState;
  send(msg: ServerMessage): void;
}

export interface ItemsOptions {
  data: ItemsData | undefined;
  rules: ItemRules;
  combat: Combat | undefined;
  world: World;
  rng: Rng;
  /** The session's clock (spec 026). */
  now(): Date;
  hpMax(m: PartyMember): number;
  /** The Pokémon this player controls in combat, and its party index. */
  controlled(playerId: number): number | undefined;
  active(playerId: number): number | undefined;
  inCombat(playerId: number): boolean;
  /** The party or the bag changed: send them again. */
  changed(playerId: number, what: "party" | "bag"): void;
  progression?: { useItem(playerId: number, index: number, use: { kind: "level" } | { kind: "evolve"; item: number } | { kind: "learn"; machine: number }): boolean } | undefined;
  /** Spec 025: the Escape Rope's way out of a cave; false when there is none here. */
  escapeRope?(playerId: number): boolean;
  /** The Escape Rope's item id (content/field/moves.json), which works even without the item's record. */
  escapeRopeItem?: number | undefined;
  /** Hidden items in the player's map still there for them, in world pixels (the Dowsing MCHN). */
  hidden?(playerId: number): { x: number; y: number }[];
  /** Where the companion walks with the player now, for its finds; undefined when it is not out. */
  companionPlace?(playerId: number): Place | undefined;
  /** Hours each Berry Pot stage takes, by berry (field-items.json); undefined for an unknown berry. */
  berryHours?(berry: number): number | undefined;
  log(message: string): void;
}

interface UseInCombat {
  item: number;
  effect: UseEffect;
  target: number;
  endsAt: number;
}

interface State {
  owner: ItemOwner;
  using: UseInCombat | undefined;
  cooldownUntil: number;
  dowsing: boolean;
  nextDowse: number;
  /** Tick of the companion's next find. */
  nextFind: number;
  lastItemsState: string;
}

const COMBAT_ARCHETYPES = new Set(["heal", "revive", "cure", "pp-ether", "battle-stat"]);
const FIELD_ARCHETYPES = new Set(["heal", "revive", "pp-up", "rare-candy", "evolve", "teach", "repel", "escape-rope"]);
/** TM01 is item 328, the first of 100 machines. */
const FIRST_MACHINE_ITEM = 328;

export function createItems(options: ItemsOptions) {
  const { data, rules, combat, world, rng } = options;
  const { tuning } = rules;
  const states = new Map<number, State>();
  const pocketOf: PocketOf = (item) => data?.item(item)?.pocket;
  const effectOf = (item: number): UseEffect | undefined => {
    const record = data?.item(item);
    return record ? useEffectOf(record, rules.effects) : undefined;
  };
  const findTicks = toTicks(rules.finds.everyS);
  const dowseTicks = Math.max(1, Math.round((tuning.dowsing.everyMs / 1000) * TICKS_PER_S));
  let tick = 0;

  /** What `item` does when held, as combat uses it. */
  function heldItem(item: number): HeldItem | undefined {
    const record = data?.item(item);
    return record?.holdEffect ? heldOf({ id: record.id, pocket: record.pocket, holdEffect: record.holdEffect }, rules.effects) : undefined;
  }
  const heldFor = (m: PartyMember) => (m.held === undefined ? undefined : heldItem(m.held));
  const cooldownMulFor = (m: PartyMember) => (m.ppUps ?? []).map((n) => ppUpCooldownMul(n, tuning.ppUp.perLevel));

  function sendItemsState(s: State, force = false): void {
    const p = s.owner.progress;
    const msg: Extract<ServerMessage, { type: "items-state" }> = {
      type: "items-state",
      ...(s.using ? { useEndsTick: s.using.endsAt } : {}),
      ...(s.cooldownUntil > tick ? { cooldownUntilTick: s.cooldownUntil } : {}),
      ...(p.repel ? { repelEndsAt: p.repel.endsAt } : {}),
    };
    const key = JSON.stringify(msg);
    if (!force && key === s.lastItemsState) return;
    s.lastItemsState = key;
    s.owner.send(msg);
  }

  function take(s: State, item: number): void {
    removeItem(s.owner.progress.bag, item, 1);
    options.changed(s.owner.playerId, "bag");
  }

  /** The level that keeps lower wild Pokémon away: the companion's, else the party lead's. */
  function repelLevel(s: State): number {
    const party = s.owner.progress.party;
    const out = options.active(s.owner.playerId);
    return (out !== undefined ? party[out] : party.find((m) => m.hp > 0))?.level ?? 0;
  }

  function startRepel(s: State, item: number): NoticeCode | undefined {
    const steps = tuning.repel.steps[String(item)];
    if (steps === undefined) return "item-unavailable";
    const endsAt = new Date(options.now().getTime() + Math.round(steps * tuning.repel.stepS * 1000)).toISOString();
    s.owner.progress.repel = { item, endsAt };
    take(s, item);
    sendItemsState(s, true);
    return undefined;
  }

  /** Field use (spec 027): undefined when it worked, else the notice; nothing changes on refusal. */
  function use(playerId: number, item: number, index: number, moveIndex: number | undefined): NoticeCode | undefined {
    const s = states.get(playerId);
    if (!s) return "action-refused";
    const p = s.owner.progress;
    if (!p.bag.some((b) => b.item === item)) return "action-refused";
    if (item === BERRY_POTS) {
      s.owner.send(potsMessage(p));
      return undefined;
    }
    if (item === APRICORN_BOX) {
      s.owner.send({ type: "apricorn-box", counts: [...p.apricorns] });
      return undefined;
    }
    if (item === DOWSING_MCHN) {
      s.dowsing = !s.dowsing;
      if (!s.dowsing) s.owner.send({ type: "dowse" });
      s.nextDowse = tick;
      return undefined;
    }
    const effect: UseEffect | undefined = item === options.escapeRopeItem ? { archetype: "escape-rope" } : effectOf(item);
    if (!effect || !FIELD_ARCHETYPES.has(effect.archetype)) return "item-unavailable";
    if (options.inCombat(playerId) && effect.archetype !== "escape-rope") return "action-refused";
    if (effect.archetype === "repel") return startRepel(s, item);
    if (effect.archetype === "escape-rope") {
      // The field already told the client why it could not (spec 025).
      if (!options.escapeRope?.(playerId)) return undefined;
      take(s, item);
      return undefined;
    }
    const m = p.party[index];
    if (!m) return "action-refused";
    const max = options.hpMax(m);
    switch (effect.archetype) {
      case "heal":
        if (m.hp === 0 || m.hp >= max) return "action-refused";
        m.hp = Math.min(max, m.hp + healHp(effect.amount, max));
        break;
      case "revive":
        if (m.hp > 0) return "action-refused";
        m.hp = Math.min(max, healHp(effect.amount, max));
        break;
      case "pp-up": {
        if (moveIndex === undefined || m.moves[moveIndex] === undefined) return "action-refused";
        const ups = [...(m.ppUps ?? [])];
        while (ups.length < m.moves.length) ups.push(0);
        if (ups[moveIndex]! >= tuning.ppUp.max) return "item-not-compatible";
        ups[moveIndex] = effect.max ? tuning.ppUp.max : ups[moveIndex]! + 1;
        m.ppUps = ups;
        break;
      }
      case "rare-candy":
      case "evolve":
      case "teach": {
        const growth = effect.archetype === "rare-candy" ? { kind: "level" as const } : effect.archetype === "evolve" ? { kind: "evolve" as const, item } : { kind: "learn" as const, machine: item - FIRST_MACHINE_ITEM + 1 };
        if (!options.progression?.useItem(playerId, index, growth)) return "item-not-compatible";
        // HMs stay in the bag (the original's machines 93 to 100).
        if (effect.archetype === "teach" && pocketOf(item) === "machines" && item - FIRST_MACHINE_ITEM + 1 > 92) {
          options.changed(playerId, "party");
          return undefined;
        }
        break;
      }
      default:
        return "item-not-compatible";
    }
    take(s, item);
    options.changed(playerId, "party");
    return undefined;
  }

  /** Combat use (research R3): the trainer's action; the item is spent only when it acts. */
  function useInCombat(playerId: number, item: number, now: number): NoticeCode | undefined {
    const s = states.get(playerId);
    const target = options.controlled(playerId);
    if (!s || !combat || target === undefined || !combat.has(target)) return "action-refused";
    if (!s.owner.progress.bag.some((b) => b.item === item)) return "action-refused";
    if (s.using || now < s.cooldownUntil) return "item-busy";
    const effect = effectOf(item);
    if (!effect || !COMBAT_ARCHETYPES.has(effect.archetype)) return "item-not-compatible";
    const c = combat.get(target)!;
    if (effect.archetype === "heal" && c.hp >= c.stats.hp && !(effect.cures.length && combat.hasStatus(target, effect.cures))) return "item-not-compatible";
    if (effect.archetype === "cure" && !combat.hasStatus(target, effect.cures)) return "item-not-compatible";
    if (effect.archetype === "revive" && !s.owner.progress.party.some((m) => m.hp === 0)) return "item-not-compatible";
    const timing = tuning.combat[effect.archetype as keyof ItemTuning["combat"]];
    s.using = { item, effect, target, endsAt: now + toTicks(timing.useS) };
    sendItemsState(s);
    return undefined;
  }

  /** The use time ran out: the effect lands and the item is spent; the cooldown starts. */
  function finish(s: State, u: UseInCombat): void {
    const p = s.owner.progress;
    const e = u.effect;
    const c = combat!.get(u.target)!;
    if (e.archetype === "heal") {
      combat!.cure(u.target, e.cures);
      combat!.heal(u.target, healHp(e.amount, c.stats.hp));
    } else if (e.archetype === "cure") combat!.cure(u.target, e.cures);
    else if (e.archetype === "pp-ether") combat!.restore(u.target, e.pp, tuning.secondsPerPp);
    else if (e.archetype === "battle-stat") combat!.raise(u.target, e.stages);
    else if (e.archetype === "revive") {
      // shortcut: in combat the first fainted member is revived; pick one when the quick selector gets a party list.
      const m = p.party.find((x) => x.hp === 0);
      if (m) m.hp = Math.min(options.hpMax(m), healHp(e.amount, options.hpMax(m)));
      options.changed(s.owner.playerId, "party");
    }
    take(s, u.item);
    const key = e.archetype as keyof ItemTuning["combat"];
    s.cooldownUntil = tick + toTicks(tuning.combat[key].cooldownS);
  }

  function setHeld(playerId: number, index: number, item: number | null): NoticeCode | undefined {
    const s = states.get(playerId);
    const m = s?.owner.progress.party[index];
    if (!s || !m) return "action-refused";
    if (options.inCombat(playerId)) return "action-refused";
    const p = s.owner.progress;
    if (item !== null) {
      const record = data?.item(item);
      if (!record || record.pocket === "key-items" || !p.bag.some((b) => b.item === item)) return "action-refused";
    }
    // The item it held goes back to the bag; with the new one taken out first, so a swap in a full pocket still fits.
    const after = p.bag.map((b) => ({ ...b }));
    if (item !== null) removeItem(after, item, 1);
    if (m.held !== undefined && !canAdd(after, m.held, 1, pocketOf)) return "bag-full";
    if (item !== null) removeItem(p.bag, item, 1);
    if (m.held !== undefined) addItem(p.bag, m.held, 1, pocketOf);
    if (item === null) delete m.held;
    else m.held = item;
    options.changed(playerId, "bag");
    options.changed(playerId, "party");
    return undefined;
  }

  function potsMessage(p: ItemState): Extract<ServerMessage, { type: "berry-pots" }> {
    const now = options.now().getTime();
    return {
      type: "berry-pots",
      pots: p.berryPots.map((pot) => (pot ? { berry: pot.berry, stage: berryStage(now - Date.parse(pot.plantedAt), options.berryHours?.(pot.berry) ?? 1) } : null)),
    };
  }

  function plant(playerId: number, pot: number, item: number): NoticeCode | undefined {
    const s = states.get(playerId);
    if (!s) return "action-refused";
    const p = s.owner.progress;
    if (!p.bag.some((b) => b.item === BERRY_POTS) || p.berryPots[pot] !== null || pocketOf(item) !== "berries" || options.berryHours?.(item) === undefined) return "action-refused";
    if (!removeItem(p.bag, item, 1)) return "action-refused";
    p.berryPots[pot] = { berry: item, plantedAt: options.now().toISOString() };
    options.changed(playerId, "bag");
    s.owner.send(potsMessage(p));
    return undefined;
  }

  function harvest(playerId: number, pot: number): NoticeCode | undefined {
    const s = states.get(playerId);
    const plantNow = s?.owner.progress.berryPots[pot];
    if (!s || !plantNow) return "action-refused";
    const p = s.owner.progress;
    const stage = berryStage(options.now().getTime() - Date.parse(plantNow.plantedAt), options.berryHours?.(plantNow.berry) ?? 1);
    if (stage !== "ripe") return "not-ready";
    const [min, max] = tuning.berryYield;
    const count = min + rng.nextInt(max - min + 1);
    if (!addItem(p.bag, plantNow.berry, count, pocketOf)) return "bag-full";
    p.berryPots[pot] = null;
    options.changed(playerId, "bag");
    s.owner.send({ type: "item-found", item: plantNow.berry, count, source: "berry" });
    s.owner.send(potsMessage(p));
    return undefined;
  }

  function find(s: State): void {
    const place = options.companionPlace?.(s.owner.playerId);
    const table = place ? rules.finds.places[place] : undefined;
    if (!table || rng.nextInt(100) >= rules.finds.chance) return;
    let roll = rng.nextInt(table.reduce((a, r) => a + r.weight, 0));
    const pick = table.find((r) => (roll -= r.weight) < 0)!;
    if (!addItem(s.owner.progress.bag, pick.item, 1, pocketOf)) return;
    options.changed(s.owner.playerId, "bag");
    s.owner.send({ type: "item-found", item: pick.item, count: 1, source: "companion" });
  }

  /** The level below which wild Pokémon keep away from this player, while a level-filtering Repel lasts; 0 without one. */
  function repelFor(playerId: number): number {
    const s = states.get(playerId);
    const effect = s?.owner.progress.repel ? effectOf(s.owner.progress.repel.item) : undefined;
    return s && effect?.archetype === "repel" && effect.levelFilter ? repelLevel(s) : 0;
  }

  return {
    pocketOf,
    heldItem,
    heldFor,
    cooldownMulFor,
    join(owner: ItemOwner): void {
      // Nothing goes out before the welcome: the first items-state is sent when something is in effect.
      states.set(owner.playerId, { owner, using: undefined, cooldownUntil: 0, dowsing: false, nextDowse: 0, nextFind: tick + findTicks, lastItemsState: JSON.stringify({ type: "items-state" }) });
    },
    leave(playerId: number): void {
      states.delete(playerId);
    },
    use,
    useInCombat,
    setHeld,
    plant,
    harvest,
    /** Whether a trainer using an item holds the Pokémon still (tuning lockMovement). */
    locked: (playerId: number) => tuning.lockMovement && states.get(playerId)?.using !== undefined,
    repelLevel: repelFor,
    /** The share of the spawn cap near this player: lower with any Repel or the Black Flute (research R9). */
    density: (playerId: number) => (states.get(playerId)?.owner.progress.repel ? tuning.repel.density : 1),
    /** Apricorn trees and Kurt (scr_seq_0150, 0874), on the session's day; for the script host. */
    apricorns(playerId: number) {
      const s = states.get(playerId);
      const p = s?.owner.progress;
      const today = () => dayKey(options.now());
      return {
        tree(color: number | undefined, tree: number) {
          return p && color !== undefined ? { color, ready: apricornReady(p.apricornTrees, tree, today()) } : undefined;
        },
        pick(color: number, tree: number): boolean {
          if (!p || !apricornReady(p.apricornTrees, tree, today()) || p.apricorns[color]! >= 99) return false;
          if (p.apricornTrees.day !== today()) p.apricornTrees = { day: today(), trees: [] };
          p.apricornTrees.trees.push(tree);
          p.apricorns[color]!++;
          s.owner.send({ type: "apricorn-box", counts: [...p.apricorns] });
          return true;
        },
        counts: () => [...(p?.apricorns ?? [0, 0, 0, 0, 0, 0, 0])],
        give(color: number): void {
          if (!p || p.kurt || !p.apricorns[color]) return;
          p.kurt = { apricorn: color, count: p.apricorns[color], given: today() };
          p.apricorns[color] = 0;
        },
        kurtCount: () => p?.kurt?.count ?? 0,
        /** The ball Kurt makes, once a day has passed (the original's daily flag 2722); 0 before. */
        kurtBall: () => (p?.kurt && kurtReady(p.kurt.given, today(), tuning.kurtDays) ? tuning.apricornBalls[p.kurt.apricorn]! : 0),
        kurtWaiting: () => !!p?.kurt && !kurtReady(p.kurt.given, today(), tuning.kurtDays),
        clearKurt(): void {
          if (p) p.kurt = null;
        },
      };
    },
    /** Every tick, after combat: trainers' items, consumed held items, Repel, the Dowsing MCHN and the companion's finds. */
    step(now: number, hits: readonly HitEvent[]): void {
      tick = now;
      for (const h of hits) {
        if (h.kind !== "held" || combat?.get(h.target)?.held !== undefined) continue;
        const owner = combat?.get(h.target)?.owner;
        const s = typeof owner === "number" ? states.get(owner) : undefined;
        const index = s ? options.active(s.owner.playerId) : undefined;
        const m = index === undefined ? undefined : s!.owner.progress.party[index];
        if (m && m.held === h.item) {
          delete m.held;
          options.changed(s!.owner.playerId, "party");
        }
      }
      const clock = options.now().getTime();
      for (const s of states.values()) {
        const u = s.using;
        if (u) {
          const c = combat?.get(u.target);
          // Fainted, recalled or swapped out: the use is lost, the item is not.
          if (!c || c.hp === 0 || options.controlled(s.owner.playerId) !== u.target) s.using = undefined;
          else if (tick >= u.endsAt) {
            s.using = undefined;
            finish(s, u);
          }
        }
        const p = s.owner.progress;
        if (p.repel && Date.parse(p.repel.endsAt) <= clock) {
          p.repel = null;
          s.owner.send({ type: "notice", code: "repel-ended" });
        }
        const e = world.get(s.owner.entityId);
        if (s.dowsing && tick >= s.nextDowse && e) {
          s.nextDowse = tick + dowseTicks;
          const radius = tuning.dowsing.radiusTiles * MAP_TILE_PX;
          const at = dowse(e, options.hidden?.(s.owner.playerId) ?? [], radius);
          s.owner.send(at ? { type: "dowse", dir: at.dir, near: at.near } : { type: "dowse" });
        }
        if (tick >= s.nextFind) {
          s.nextFind = tick + findTicks;
          if (!options.inCombat(s.owner.playerId)) find(s);
        }
        sendItemsState(s);
      }
    },
  };
}

export type Items = ReturnType<typeof createItems>;
