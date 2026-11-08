import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRng, type HitEvent } from "@soulsilver/shared/game";
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

export const combatData = () => buildCombatData(readContent(), extraction());

/** A world with a combat simulation and helpers to drive it tick by tick. */
export function combatSetup(seed = 1) {
  const world = createWorld();
  const data = combatData();
  const combat = createCombat({ data, rng: createRng(seed), lookup: () => undefined });
  let tick = 0;
  const events: HitEvent[] = [];

  function spawn(species: keyof typeof SPECIES, moves: number[], at: { x: number; y: number }, owner: Owner = "wild", level = 10) {
    const entity = world.add({ kind: "pokemon", area: "arena", x: at.x, y: at.y, level: 0, facing: "east", data: {} });
    combat.spawn(world, entity.id, { species: SPECIES[species].id, level, moves }, owner);
    // Ready to act at once, so move tests need not wait for the action bar (tested on its own in combat.test.ts).
    combat.get(entity.id)!.gauge = 1;
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
    /** Presses move `slot` (1–4) this tick, aiming with `aim`. */
    press(id: number, slot: number, aim?: { x: number; y: number }) {
      combat.input(id, { move: { x: 0, y: 0 }, buttons: 1 << (slot - 1), ...(aim ? { aim } : {}) });
    },
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
