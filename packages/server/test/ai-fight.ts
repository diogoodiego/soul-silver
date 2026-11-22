import { createRng, type HitEvent, type WorldMap } from "@soulsilver/shared/game";
import type { Temperament } from "@soulsilver/shared/wild";
import { createAi } from "../src/ai";
import { buildAiData, BUNDLED_AI_CONTENT, type AiData } from "../src/ai-loader";
import { createCombat } from "../src/combat";
import { createReferenceBot } from "../src/reference-bot";
import { createWorld } from "../src/world";
import { combatData, SPECIES } from "./combat-fixture";
import { grassMap, px } from "./wild-fixture";

// Headless fights for the spec 019 tests: one wild Pokémon driven by the AI against a player's
// Pokémon driven by a reference bot, on an open synthetic map (principle II).

const MAP: WorldMap = grassMap("field", () => true);
const lookup = (id: string) => (id === "field" ? MAP : undefined);
const STARTER_OWNER = 1;

export interface FightOptions {
  seed: number;
  wild: { species: keyof typeof SPECIES; level: number; moves: number[] };
  starter: { species: keyof typeof SPECIES; level: number; moves: number[] };
  temperament?: Temperament;
  ai?: AiData;
  maxTicks?: number;
  /** Called after every tick, to check invariants. */
  watch?(f: Fight, tick: number, hits: HitEvent[]): void;
  /** Spec 027: the Repel level of each body (the player's side). */
  repel?: (body: { id: number; kind: string }) => number;
  /** The player's side stands still instead of the reference bot. */
  idle?: boolean;
}

export type Fight = ReturnType<typeof startFight>;

export function startFight(o: FightOptions) {
  const rng = createRng(o.seed);
  const botRng = createRng(o.seed ^ 0x5eed);
  const world = createWorld();
  const data = combatData("real");
  const ai = o.ai ?? buildAiData(BUNDLED_AI_CONTENT);
  const combat = createCombat({ data, rng, lookup });
  const runner = createAi({ data: ai, combat, combatData: data, world, lookup, rng, repel: o.repel });
  // The trainer stands back, close enough to keep the wild one awake.
  world.add({ kind: "player", area: "field", x: px(10), y: px(20), level: 0, facing: "east", data: {} });
  const starter = world.add({ kind: "pokemon", area: "field", x: px(12), y: px(20), level: 0, facing: "east", data: {} }).id;
  const wild = world.add({ kind: "pokemon", area: "field", x: px(16), y: px(20), level: 0, facing: "west", data: {} }).id;
  combat.spawn(world, starter, { species: SPECIES[o.starter.species].id, level: o.starter.level, moves: o.starter.moves }, STARTER_OWNER);
  combat.spawn(world, wild, { species: SPECIES[o.wild.species].id, level: o.wild.level, moves: o.wild.moves }, "wild");
  runner.add(wild, { home: { x: px(16), y: px(20) }, level: o.wild.level, temperament: o.temperament ?? "aggressive", leashPx: 10 * 16, facing: { x: -1, y: 0 } });
  let hits: HitEvent[] = [];
  let tick = 0;
  const reference = createReferenceBot(botRng);
  const side = (id: number) => ({ x: world.get(id)!.x, y: world.get(id)!.y, c: combat.get(id)! });
  const bot = () => combat.input(starter, o.idle ? { move: { x: 0, y: 0 }, buttons: 0 } : reference(side(starter), side(wild), tick));

  const f = {
    world,
    combat,
    ai: runner,
    starter,
    wild,
    get tick() {
      return tick;
    },
    /** Runs until one side faints or time runs out. */
    run(): "starter" | "wild" | "timeout" {
      const max = o.maxTicks ?? 20 * 120;
      while (tick < max) {
        tick++;
        runner.prepare(tick, hits);
        runner.drive(wild);
        bot();
        hits = combat.step(tick, world);
        o.watch?.(f, tick, hits);
        if (combat.get(wild)!.hp === 0) return "starter";
        if (combat.get(starter)!.hp === 0) return "wild";
      }
      return "timeout";
    },
  };
  return f;
}
