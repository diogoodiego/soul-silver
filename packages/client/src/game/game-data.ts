import { GAME_DATA_FILES, parseGameDataJson, type GameDataFileOf, TYPE_KEYS } from "@soulsilver/shared/game-data";
import type { TextBankFile } from "@soulsilver/shared/text";
import { loadBank } from "../render/combat-fx";

// What the menus and the HUD read from the extraction (spec 017): text banks and a few game-data
// files, each fetched once. Everything falls back to nothing when the extraction lacks it.

/** Text banks of the catalog (spec 005). */
export const BANK = {
  natures: 34,
  items: 222,
  species: 237,
  abilities: 720,
  types: 735,
  moves: 750,
  /** SoulSilver Pokédex entries (HeartGold's are in 803). */
  dexEntries: 804,
  dexCategories: 823,
  /** "Would you like to play with {trainer-name:0} again?": the dev dialog test (SC-004). */
  dialogTest: 18,
} as const;

const banks = new Map<number, Promise<Map<number, string>>>();

/** A bank's records by id; empty when it cannot be read. */
export function bankTexts(bank: number): Promise<Map<number, string>> {
  let p = banks.get(bank);
  if (!p) {
    p = loadBank(bank).then((file: TextBankFile | undefined) => new Map(file?.records.map((r) => [r.id, r.text]) ?? []));
    banks.set(bank, p);
  }
  return p;
}

const files = new Map<string, Promise<unknown>>();

async function records<K extends "items" | "moves">(kind: K): Promise<GameDataFileOf<K>["records"]> {
  let p = files.get(kind);
  if (!p) {
    const { stage, file } = GAME_DATA_FILES[kind];
    const path = `assets://stages/${stage}/json/${file}`;
    p = fetch(path)
      .then((r) => r.text())
      .then((text) => {
        const parsed = parseGameDataJson(kind, text, path);
        return parsed.ok ? parsed.data.records : [];
      })
      .catch(() => []);
    files.set(kind, p);
  }
  return p as Promise<GameDataFileOf<K>["records"]>;
}

/** Pocket and party-use data of every item, by id. */
export const itemRecords = () => records("items").then((list) => new Map(list.map((r) => [r.id, r])));

/** The type key of every move, by id (for the HUD colors). */
export const moveTypes = () => records("moves").then((list) => new Map(list.map((m) => [m.id, TYPE_KEYS[m.type] ?? "unknown"])));

const ICONS = "assets://stages/sprites/sprites";
let icons: Promise<Map<number, { url: string; x: number; y: number; w: number; h: number }>> | undefined;

/** The party icon of each species (form 0), as a page URL and a frame. */
export function pokemonIcons() {
  icons ??= fetch(`${ICONS}/icon-pokemon.json`)
    .then((r) => r.json() as Promise<{ pages: { file: string }[]; frames: { name: string; page: number; x: number; y: number; w: number; h: number }[] }>)
    .then((set) => {
      const out = new Map<number, { url: string; x: number; y: number; w: number; h: number }>();
      for (const f of set.frames) {
        const m = /^icon-pokemon\/(\d+)\/0$/.exec(f.name);
        const page = set.pages[f.page];
        if (m && page) out.set(Number(m[1]), { url: `${ICONS}/${page.file}`, x: f.x, y: f.y, w: f.w, h: f.h });
      }
      return out;
    })
    .catch(() => new Map());
  return icons;
}
