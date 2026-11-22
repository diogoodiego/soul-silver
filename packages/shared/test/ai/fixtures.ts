import { readFileSync } from "node:fs";
import { createRng } from "../../src/game/rng.ts";
import { parseAiFile, type AiFileKind, type AiTuning, type SkillProfile, type TemperamentTable } from "../../src/ai/schemas.ts";
import type { AiEnv, AiTick, MoveView, OpponentView, SelfView } from "../../src/ai/view.ts";

// Synthetic AI scenarios (principle II): bundled content/ai values, made-up maps and Pokémon.

const FILES: Record<AiFileKind, string> = { profiles: "profiles.json", temperaments: "temperaments.json", wildLevels: "wild-levels.json", tuning: "tuning.json" };
function load(kind: AiFileKind): unknown {
  const raw = JSON.parse(readFileSync(new URL(`../../../../content/ai/${FILES[kind]}`, import.meta.url), "utf8")) as unknown;
  const r = parseAiFile(kind, raw, FILES[kind]);
  if (!r.ok) throw new Error(r.error.problem);
  return r.data.value;
}

export const TUNING = load("tuning") as AiTuning;
export const TEMPERAMENTS = load("temperaments") as TemperamentTable;
const PROFILES = (load("profiles") as { profiles: SkillProfile[] }).profiles;
export const profile = (id: string, patch: Partial<SkillProfile> = {}): SkillProfile => ({ ...PROFILES.find((p) => p.id === id)!, ...patch });

const NORMAL = 0;
const FIRE = 10;
const GRASS = 12;

export const move = (patch: Partial<MoveView> & Pick<MoveView, "id">): MoveView => ({
  slot: 0,
  special: false,
  behavior: "melee",
  type: NORMAL,
  category: "physical",
  power: 40,
  rangePx: 0,
  hitbox: { shape: "arc", radiusPx: 24, angleDeg: 90 },
  speedPx: 0,
  ready: true,
  damages: true,
  status: undefined,
  buff: false,
  debuff: false,
  heals: false,
  ...patch,
});

export const TACKLE = move({ id: 33, power: 35 });
export const EMBER = move({ id: 52, slot: 1, behavior: "projectile", type: FIRE, category: "special", power: 40, rangePx: 96, hitbox: { shape: "circle", radiusPx: 6 }, speedPx: 160 });

export const self = (patch: Partial<SelfView> = {}): SelfView => ({
  id: 1,
  x: 8,
  y: 8,
  types: [FIRE],
  level: 10,
  attack: 25,
  specialAttack: 28,
  hp: 30,
  hpMax: 30,
  immobile: false,
  stunned: false,
  casting: false,
  moves: [TACKLE, EMBER],
  ...patch,
});

export const foe = (patch: Partial<OpponentView> = {}): OpponentView => ({
  id: 2,
  kind: "pokemon",
  x: 40,
  y: 8,
  types: [GRASS],
  defense: 25,
  specialDefense: 25,
  hp: 30,
  hpMax: 30,
  statuses: [],
  casting: undefined,
  ...patch,
});

/** Gen 4 chart rows the tests need: fire ×2 on grass, normal ×0 on ghost (7). */
export const effectiveness = (moveType: number, types: readonly number[]) =>
  types.reduce((m, t) => m * (moveType === FIRE && t === GRASS ? 2 : moveType === NORMAL && t === 7 ? 0 : 1), 1);

/** Open ground, `walls` as "tx,ty" tiles, a 60×40 map. */
export function env(seed = 1, walls: string[] = [], water: string[] = []): AiEnv {
  const wall = new Set(walls);
  const wet = new Set(water);
  const key = (p: { x: number; y: number }) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`;
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < 960 && p.y < 640;
  return {
    rng: createRng(seed),
    sees: (a, b) => {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
      for (let i = 1; i < steps; i++) if (wall.has(key({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }))) return false;
      return true;
    },
    walkable: (p) => inside(p) && !wall.has(key(p)) && !wet.has(key(p)),
    effectiveness,
  };
}

export const tickOf = (tick: number, s: SelfView, opponents: OpponentView[] = [], patch: Partial<AiTick> = {}): AiTick => ({ tick, self: s, opponents, noises: [], hurtBy: [], ...patch });

/** Tile centre in pixels. */
export const px = (tile: number) => tile * 16 + 8;
