import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slotIndices, type CombatTuning } from "@soulsilver/shared/combat";
import { BUTTON, createRng, type HitEvent } from "@soulsilver/shared/game";
import { createCombat, type Owner } from "../src/combat";
import { buildCombatData, type CombatContent, type ExtractedForCombat } from "../src/combat-loader";
import { createWorld } from "../src/world";
import { GEN4_CHART } from "../../shared/test/combat/fixtures/type-chart-gen4";

// Synthetic extraction for combat tests (no ROM data): a few species with their real types and
// base stats (game facts), and moves made up for the tests or copied from the rules.

const CONTENT = join(import.meta.dirname, "..", "..", "..", "content", "combat");
export const readContent = (): CombatContent => ({
  archetypes: JSON.parse(readFileSync(join(CONTENT, "archetypes.json"), "utf8")),
  moves: JSON.parse(readFileSync(join(CONTENT, "moves.json"), "utf8")),
  statuses: JSON.parse(readFileSync(join(CONTENT, "statuses.json"), "utf8")),
  tuning: JSON.parse(readFileSync(join(CONTENT, "tuning.json"), "utf8")),
});

const base = (hp: number, attack: number, defense: number, speed: number, specialAttack: number, specialDefense: number) => ({ hp, attack, defense, speed, specialAttack, specialDefense });

export const SPECIES = {
  chikorita: { id: 152, baseStats: base(45, 49, 65, 45, 49, 65), types: [12] as [number] },
  cyndaquil: { id: 155, baseStats: base(39, 52, 43, 65, 60, 50), types: [10] as [number] },
  sentret: { id: 161, baseStats: base(35, 46, 34, 20, 35, 45), types: [0] as [number] },
  gastly: { id: 92, baseStats: base(30, 35, 30, 80, 100, 35), types: [7, 3] as [number, number] },
  rattata: { id: 19, baseStats: base(30, 56, 35, 72, 25, 35), types: [0] as [number] },
  hoothoot: { id: 163, baseStats: base(60, 30, 30, 50, 36, 56), types: [0, 2] as [number, number] },
  onix: { id: 95, baseStats: base(35, 45, 160, 70, 30, 45), types: [5, 4] as [number, number] },
  raikou: { id: 243, baseStats: base(90, 85, 75, 115, 115, 100), types: [13] as [number] },
  /** Made up: Chikorita's stats with the Normal type, to compare effectiveness on the same rolls. */
  normalChikorita: { id: 9001, baseStats: base(45, 49, 65, 45, 49, 65), types: [0] as [number] },
};

/** Moves the tests use, with their original type, category, power and PP. */
export const MOVES = {
  tackle: { id: 33, type: 0, category: "physical", power: 35, pp: 35 },
  scratch: { id: 10, type: 0, category: "physical", power: 40, pp: 35 },
  ember: { id: 52, type: 10, category: "special", power: 40, pp: 25 },
  swordsDance: { id: 14, type: 0, category: "status", power: 0, pp: 30 },
  sleepPowder: { id: 79, type: 12, category: "status", power: 0, pp: 15 },
  hyperBeam: { id: 63, type: 0, category: "special", power: 150, pp: 5 },
  quickAttack: { id: 98, type: 0, category: "physical", power: 40, pp: 30 },
  growl: { id: 45, type: 0, category: "status", power: 0, pp: 40 },
  sunnyDay: { id: 241, type: 10, category: "status", power: 0, pp: 5 },
  thunder: { id: 87, type: 13, category: "special", power: 120, pp: 10 },
  willOWisp: { id: 261, type: 10, category: "status", power: 0, pp: 15 },
  supersonic: { id: 48, type: 0, category: "status", power: 0, pp: 20 },
  synthesis: { id: 235, type: 12, category: "status", power: 0, pp: 5 },
  strength: { id: 70, type: 0, category: "physical", power: 80, pp: 15 },
  takeDown: { id: 36, type: 0, category: "physical", power: 90, pp: 20 },
  gigaDrain: { id: 202, type: 12, category: "special", power: 60, pp: 10 },
  haze: { id: 114, type: 15, category: "status", power: 0, pp: 30 },
  toxicSpikes: { id: 390, type: 3, category: "status", power: 0, pp: 20 },
  /** Not in content/combat/moves.json: exercises the generic archetypes. */
  unmappedPhysical: { id: 900, type: 1, category: "physical", power: 50, pp: 20 },
  unmappedSpecial: { id: 901, type: 11, category: "special", power: 50, pp: 20 },
  unmappedStatus: { id: 902, type: 0, category: "status", power: 0, pp: 20 },
} as const;

type MoveIn = ExtractedForCombat["moves"][number];

/** Every move the content maps gets a plain stand-in unless the tests define it. */
export function extraction(content: CombatContent = readContent()): ExtractedForCombat {
  const known = new Map<number, MoveIn>(Object.values(MOVES).map((m) => [m.id, { ...m, effect: { chance: 0 } }]));
  for (const r of (content.moves as { records: { id: number }[] }).records) {
    if (!known.has(r.id)) known.set(r.id, { id: r.id, type: 0, category: "physical", power: 40, pp: 20, effect: { chance: 0 } });
  }
  return {
    moves: [...known.values()].sort((a, b) => a.id - b.id),
    species: Object.values(SPECIES),
    typeChart: GEN4_CHART,
  };
}

type Action = CombatTuning["action"];
/**
 * The mechanics tests time moves by their archetypes' own casts and read damage straight from the formula, so block C's
 * casts, normal damage share, missed-first wait and leap time are off (they are tested on their own in combat-action.test.ts, with `"real"`),
 * and so is the wait for late presses, which every test but combat-lag.test.ts leaves out.
 */
export const MECHANICS: Partial<Action> = { normalCastS: [0, 0, 0], normalMissCooldownS: 0, specialCastS: 0, normalDamageMul: 1, leapSpeedPx: 2048, lagMaxS: 0 };
export const realAction = (): Action => (readContent().tuning as { value: { action: Action } }).value.action;

export const combatData = (action: Partial<Action> | "real" = MECHANICS) => {
  const content = readContent() as CombatContent & { tuning: { value: { action: Action } } };
  const value = { ...content.tuning.value, action: { ...content.tuning.value.action, lagMaxS: 0, ...(action === "real" ? {} : action) } };
  return buildCombatData({ ...content, tuning: { ...content.tuning, value } }, extraction());
};

/** A world with a combat simulation and helpers to drive it tick by tick. */
export function combatSetup(seed = 1, action: Partial<Action> | "real" = MECHANICS) {
  const world = createWorld();
  const data = combatData(action);
  const combat = createCombat({ data, rng: createRng(seed), lookup: () => undefined });
  let tick = 0;
  const events: HitEvent[] = [];
  /** Block C puts normals in slots 1–2 and specials in 3–4: `press(id, n)` means the nth move given to `spawn`. */
  const slotsOf = new Map<number, (number | undefined)[]>();

  function spawn(species: keyof typeof SPECIES, moves: number[], at: { x: number; y: number }, owner: Owner = "wild", level = 10) {
    const entity = world.add({ kind: "pokemon", area: "arena", x: at.x, y: at.y, level: 0, facing: "east", data: {} });
    combat.spawn(world, entity.id, { species: SPECIES[species].id, level, moves }, owner);
    slotsOf.set(entity.id, slotIndices(moves, (m) => data.move(m)!.special).slots);
    return entity.id;
  }

  return {
    world,
    data,
    combat,
    events,
    spawn,
    get tick() {
      return tick;
    },
    /** Presses the `n`th move given to `spawn` (1–4) this tick, aiming with `aim`. */
    press(id: number, n: number, aim?: { x: number; y: number }) {
      // Spawned straight through combat.spawn: the nth slot.
      const slot = slotsOf.has(id) ? slotsOf.get(id)!.indexOf(n - 1) : n - 1;
      combat.input(id, { move: { x: 0, y: 0 }, buttons: slot < 0 ? 0 : 1 << slot, ...(aim ? { aim } : {}) });
    },
    /** Holds these buttons this tick (raw bits: slots 0–3, then BUTTON). */
    hold(id: number, buttons: number, move = { x: 0, y: 0 }, aim?: { x: number; y: number }) {
      combat.input(id, { move, buttons, ...(aim ? { aim } : {}) });
    },
    /** The slot (0–3) the nth move given to `spawn` went to. */
    slotOf: (id: number, n: number) => slotsOf.get(id)!.indexOf(n - 1),
    BUTTON,
    walk(id: number, move: { x: number; y: number }) {
      combat.input(id, { move, buttons: 0 });
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) events.push(...combat.step(++tick, world));
    },
    hp: (id: number) => combat.get(id)!.hp,
    pos: (id: number) => ({ x: world.get(id)!.x, y: world.get(id)!.y }),
  };
}
