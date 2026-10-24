import { spriteName, type SpriteAnimation, type SpriteEntry } from "@soulsilver/shared/sprites";
import { readU16 } from "../binary.ts";
import { readNitroBlocks } from "../maps/nitro.ts";
import type { RgbaImage } from "../maps/png.ts";
import { decodeTexture, readTextureSet } from "../maps/texture.ts";
import type { BattleResult } from "./battle.ts";
import { OVERWORLD_FRAME_MS, OVERWORLD_GENDER_SPLIT, OVERWORLD_POKEMON_FIRST, OVERWORLD_POKEMON_TABLE } from "./layout.ts";

// Overworld sprites (research.md R0): each member is a BTX0 whose textures `<name>.1`, `.2`...
// are the frames, in numeric order; four directions (up, down, left, right) in blocks.

const DIRECTIONS = ["up", "down", "left", "right"] as const;

export interface Sheet {
  name: string;
  frames: RgbaImage[];
  /** The same frames with the second palette, when the file has two. */
  shiny?: RgbaImage[];
}

export function readSheet(bytes: Uint8Array): Sheet {
  const textures = readTextureSet(bytes, readNitroBlocks(bytes, "BTX0").get("TEX0")!);
  const names = [...textures.textures.keys()].sort((a, b) => Number(a.split(".").pop()) - Number(b.split(".").pop()));
  const palettes = [...textures.palettes.keys()].sort().map((k) => textures.palettes.get(k)!);
  if (palettes.length === 0) throw new Error("the file has no palette");
  const decode = (palette: Uint8Array) => names.map((n) => decodeTexture(textures.textures.get(n)!, palette));
  return {
    name: names[0]?.replace(/\.\d+$/, "") ?? "",
    frames: decode(palettes[0]!),
    ...(palettes.length > 1 ? { shiny: decode(palettes[1]!) } : {}),
  };
}

/** One block of frames: an action (walk, run), frames per direction and where it starts. */
interface Action {
  name: string;
  perDirection: number;
  start: number;
}

const WALK_16: Action[] = [{ name: "walk", perDirection: 4, start: 0 }];
const WALK_RUN_32: Action[] = [
  { name: "walk", perDirection: 4, start: 0 },
  { name: "run", perDirection: 4, start: 16 },
];
const POKEMON_8: Action[] = [{ name: "walk", perDirection: 2, start: 0 }];

/** Lowest opaque row + 1 over every frame: where the feet are. */
export function footRow(frames: readonly RgbaImage[]): number {
  let foot = 0;
  for (const f of frames) {
    for (let y = f.height - 1; y >= foot; y--) {
      let hit = false;
      for (let x = 0; x < f.width && !hit; x++) hit = f.data[(y * f.width + x) * 4 + 3] !== 0;
      if (hit) {
        foot = y + 1;
        break;
      }
    }
  }
  return foot || frames[0]!.height;
}

function build(
  result: BattleResult,
  sheet: Sheet,
  actions: readonly Action[],
  frameCount: number,
  name: string,
  ms: number,
  extra: Partial<SpriteEntry>,
): void {
  if (sheet.frames.length !== frameCount) throw new Error(`expected ${frameCount} frames, found ${sheet.frames.length}`);
  const anchor = { x: sheet.frames[0]!.width >> 1, y: footRow(sheet.frames) };
  const names: string[] = [];
  const animations: SpriteAnimation[] = [];
  for (const action of actions) {
    DIRECTIONS.forEach((dir, d) => {
      const steps = Array.from({ length: action.perDirection }, (_, k) => {
        const index = action.start + d * action.perDirection + k;
        const frame = `${name}/${action.name}/${dir}/${k}`;
        names.push(frame);
        result.frames.push({ name: frame, image: sheet.frames[index]!, ...(sheet.shiny ? { shiny: sheet.shiny[index]! } : {}), anchor });
        return { frame, ms, flipX: false };
      });
      animations.push({ name: `${action.name}-${dir}`, loop: true, steps });
      if (action.name === "walk") animations.push({ name: `idle-${dir}`, loop: true, steps: [{ ...steps[0]!, ms: 1000 }] });
    });
  }
  result.sprites.push({ name, frames: names, animations, ...extra });
}

const empty = (): BattleResult => ({ frames: [], sprites: [], missing: [], failed: [] });

/** The player characters, 32 frames each: walking, then running. */
export async function extractPlayers(read: (member: number) => Promise<Uint8Array>, members: readonly number[]): Promise<BattleResult> {
  const result = empty();
  for (const [n, member] of members.entries()) {
    const name = spriteName("overworld-player", [n]);
    try {
      build(result, readSheet(await read(member)), WALK_RUN_32, 32, name, OVERWORLD_FRAME_MS.walk, { character: `player-${n}` });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}

/** Every 16-frame character among the members before `end`, except the ones in `skip`. */
export async function extractNpcs(read: (member: number) => Promise<Uint8Array>, end: number, skip: readonly number[]): Promise<BattleResult> {
  const result = empty();
  for (let member = 0; member < end; member++) {
    if (skip.includes(member)) continue;
    const name = spriteName("overworld-npc", [member]);
    let sheet: Sheet;
    try {
      sheet = readSheet(await read(member));
    } catch {
      continue; // not a texture set: nothing to extract
    }
    // Objects and special poses have other frame counts; only 16-frame characters walk.
    if (sheet.frames.length !== 16 || sheet.shiny) continue;
    try {
      build(result, sheet, WALK_16, 16, name, OVERWORLD_FRAME_MS.walk, { character: sheet.name });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}

export interface PokemonEntry {
  species: number;
  form: number;
  gender: "male" | "female" | "unisex";
  member: number;
}

/** Entries of the species table: which member holds which species, form and gender. */
export function pokemonEntries(arm9: Uint8Array, species: number, totalMembers: number): PokemonEntry[] {
  const table = Array.from({ length: species }, (_, i) => readU16(arm9, OVERWORLD_POKEMON_TABLE + 2 * i));
  const last = totalMembers - OVERWORLD_POKEMON_FIRST;
  const entries: PokemonEntry[] = [];
  for (let s = 1; s <= species; s++) {
    const start = table[s - 1]!;
    const next = s < species ? table[s]! : last;
    if (next <= start || next > last) throw new Error(`overworld table: species ${s} has an invalid range ${start}..${next}`);
    const split = OVERWORLD_GENDER_SPLIT.has(s) && next - start === 2;
    for (let k = 0; k < next - start; k++) {
      entries.push({ species: s, form: split ? 0 : k, gender: split ? (k === 0 ? "male" : "female") : "unisex", member: OVERWORLD_POKEMON_FIRST + start + k });
    }
  }
  return entries;
}

/** The following Pokémon: 8 frames (2 per direction), normal and shiny. */
export async function extractPokemon(read: (member: number) => Promise<Uint8Array>, entries: readonly PokemonEntry[]): Promise<BattleResult> {
  const result = empty();
  for (const e of entries) {
    const name = spriteName("overworld-pokemon", [e.species, e.form, e.gender]);
    try {
      const sheet = readSheet(await read(e.member));
      build(result, sheet, POKEMON_8, 8, name, OVERWORLD_FRAME_MS.pokemon, { species: e.species, form: e.form, gender: e.gender });
      if (!sheet.shiny) result.missing.push({ sprite: name, reason: "shiny palette is missing" });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}
