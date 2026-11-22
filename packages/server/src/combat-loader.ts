import {
  BEHAVIOR_SHAPES,
  isSpecial,
  parseCombatFile,
  specialCooldownS,
  STATUS_IDS,
  toTicks,
  type ArchetypeRecord,
  type Behavior,
  type CombatFileKind,
  type CombatFileOf,
  type CombatTuning,
  type Effect,
  type Hitbox,
  type StatusId,
  type StatusRecord,
} from "@soulsilver/shared/combat";
import type { MoveRecord, SpeciesRecord, TypeChartRecord } from "@soulsilver/shared/game-data";
import archetypesJson from "../../../content/combat/archetypes.json" with { type: "json" };
import movesJson from "../../../content/combat/moves.json" with { type: "json" };
import statusesJson from "../../../content/combat/statuses.json" with { type: "json" };
import tuningJson from "../../../content/combat/tuning.json" with { type: "json" };

// Combat data: the hand-written content/combat files (bundled with the app) checked against the
// extraction (spec 013, contracts/combat-data.md). Any problem stops the load with file, field and reason.

export interface CombatContent {
  archetypes: unknown;
  moves: unknown;
  statuses: unknown;
  tuning: unknown;
}

/** The parts of the extracted game data combat reads. */
export interface ExtractedForCombat {
  /** Block C: `accuracy` null or absent never misses. */
  moves: (Pick<MoveRecord, "id" | "type" | "category" | "power" | "pp"> & Partial<Pick<MoveRecord, "accuracy">> & { effect: Pick<MoveRecord["effect"], "chance"> })[];
  species: Pick<SpeciesRecord, "id" | "baseStats" | "types">[];
  typeChart: Pick<TypeChartRecord, "id" | "against">[];
}

/** A move ready for the simulation: archetype defaults applied, times in ticks. */
export interface CombatMove {
  id: number;
  archetype: string;
  behavior: Behavior;
  type: number;
  category: MoveRecord["category"];
  /** The power damage uses: the original, or the mapping's override for variable-power moves. */
  power: number;
  /** Chance used by effects that do not set their own: the original effect chance, 100 when it is 0. */
  defaultChance: number;
  /** Block C: the original accuracy in percent; null never misses. */
  accuracy: number | null;
  rangePx: number;
  hitbox: Hitbox | undefined;
  /** Block C: a special's cast (at least specialCastS); normal moves take the chain's cast instead. */
  castTicks: number;
  /** Block C: a special's cooldown; 0 for normal moves. */
  cooldownTicks: number;
  speedPx: number;
  hits: number;
  durationTicks: number;
  rooted: boolean;
  critStage: number;
  effects: Effect[];
  /** Block C: power 80 and up, status, fixed or variable damage; otherwise normal. */
  special: boolean;
}

export interface CombatData {
  tuning: CombatTuning;
  statuses: Map<StatusId, StatusRecord>;
  typeChart: ExtractedForCombat["typeChart"];
  species(id: number): ExtractedForCombat["species"][number] | undefined;
  /** A mapped move, or the generic archetype of its category; undefined for an id the extraction lacks. */
  move(id: number): CombatMove | undefined;
}

const GENERIC: Record<MoveRecord["category"], string> = { physical: "generic-physical", special: "generic-special", status: "generic-status" };
const FILES: Record<keyof CombatContent, string> = { archetypes: "archetypes.json", moves: "moves.json", statuses: "statuses.json", tuning: "tuning.json" };

function fail(file: string, path: string, problem: string): never {
  throw new Error(`content/combat/${file}: ${path}: ${problem}`);
}

function parse<K extends CombatFileKind & keyof CombatContent>(kind: K, value: unknown): CombatFileOf<K> {
  const result = parseCombatFile(kind, value, FILES[kind]);
  if (!result.ok) fail(result.error.file, result.error.path, result.error.problem);
  return result.data;
}

function checkShape(behavior: Behavior, shape: Hitbox | undefined, file: string, path: string): void {
  if (shape && !BEHAVIOR_SHAPES[behavior].includes(shape.shape)) fail(file, path, `formato "${shape.shape}" não serve ao comportamento "${behavior}"`);
}

export function buildCombatData(content: CombatContent, extracted: ExtractedForCombat): CombatData {
  const archetypes = parse("archetypes", content.archetypes).records;
  const mappings = parse("moves", content.moves).records;
  const statusRecords = parse("statuses", content.statuses).records;
  const tuning = parse("tuning", content.tuning).value;

  const byId = new Map<string, ArchetypeRecord>();
  archetypes.forEach((a, i) => {
    if (byId.has(a.id)) fail("archetypes.json", `records.${i}.id`, "arquétipo repetido");
    checkShape(a.behavior, a.defaults.hitbox, "archetypes.json", `records.${i}.defaults.hitbox`);
    byId.set(a.id, a);
  });
  for (const g of Object.values(GENERIC)) if (!byId.has(g)) fail("archetypes.json", "records", `falta o arquétipo "${g}"`);

  const statuses = new Map(statusRecords.map((s) => [s.id, s]));
  for (const id of STATUS_IDS) if (!statuses.has(id)) fail("statuses.json", "records", `falta o status "${id}"`);

  const originals = new Map(extracted.moves.map((m) => [m.id, m]));
  const mapped = new Map(mappings.map((m) => [m.id, m]));
  mappings.forEach((m, i) => {
    if (!originals.has(m.id)) fail("moves.json", `records.${i}.id`, `golpe ${m.id} não existe na extração`);
    const archetype = byId.get(m.archetype);
    if (!archetype) fail("moves.json", `records.${i}.archetype`, `arquétipo "${m.archetype}" não existe`);
    checkShape(archetype.behavior, m.hitbox, "moves.json", `records.${i}.hitbox`);
    const hitbox = m.hitbox ?? archetype.defaults.hitbox;
    if (!hitbox && BEHAVIOR_SHAPES[archetype.behavior].length > 0) fail("moves.json", `records.${i}.hitbox`, `o comportamento "${archetype.behavior}" precisa de hitbox`);
  });

  const cache = new Map<number, CombatMove>();
  const species = new Map(extracted.species.map((s) => [s.id, s]));

  function resolve(id: number): CombatMove | undefined {
    const original = originals.get(id);
    if (!original) return undefined;
    const mapping = mapped.get(id);
    const archetype = byId.get(mapping?.archetype ?? GENERIC[original.category])!;
    const p = { ...archetype.defaults, ...mapping };
    const effects: Effect[] = mapping?.effects ?? (original.power > 0 ? [{ kind: "damage" }] : []);
    const damage = effects.find((e) => e.kind === "damage");
    const power = damage?.power ?? original.power;
    const special = isSpecial(original, damage !== undefined && (damage.fixed !== undefined || damage.level === true || damage.targetHpFraction !== undefined));
    return {
      id,
      archetype: archetype.id,
      behavior: archetype.behavior,
      type: original.type,
      category: original.category,
      power,
      defaultChance: original.effect.chance || 100,
      rangePx: p.rangePx ?? 0,
      hitbox: p.hitbox,
      accuracy: original.accuracy ?? null,
      castTicks: special ? toTicks(Math.max(p.castS ?? 0, tuning.action.specialCastS)) : 0,
      cooldownTicks: special ? toTicks(p.cooldownS ?? specialCooldownS(tuning.action.specialCooldown, original.power)) : 0,
      speedPx: p.speedPx ?? 0,
      hits: p.hits ?? 1,
      durationTicks: toTicks(p.durationS ?? 0),
      rooted: p.rooted ?? false,
      critStage: p.critStage ?? 0,
      effects,
      special,
    };
  }

  return {
    tuning,
    statuses,
    typeChart: extracted.typeChart,
    species: (id) => species.get(id),
    move(id) {
      let m = cache.get(id);
      if (!m) {
        m = resolve(id);
        if (m) cache.set(id, m);
      }
      return m;
    },
  };
}

/** content/combat as bundled with the app; reading the extraction is up to the host process. */
export const BUNDLED_COMBAT_CONTENT: CombatContent = { archetypes: archetypesJson, moves: movesJson, statuses: statusesJson, tuning: tuningJson };
