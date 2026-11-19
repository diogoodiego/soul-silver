import { GAME_DATA_FILES, parseGameDataJson, type GameDataFileOf, TYPE_KEYS } from "@soulsilver/shared/game-data";
import type { TextBankFile } from "@soulsilver/shared/text";
import { parseEventsJson, type EncounterRecord } from "@soulsilver/shared/events";
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
  /** Place names by mapsec (Fly, spec 025). */
  mapNames: 279,
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

async function records<K extends "items" | "moves" | "species">(kind: K): Promise<GameDataFileOf<K>["records"]> {
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

/** The type keys of every species, by id (spec 024: the starter preview). */
export const speciesTypes = () => records("species").then((list) => new Map(list.map((r) => [r.id, r.types.map((t) => TYPE_KEYS[t] ?? "unknown")])));

const ICONS = "assets://stages/sprites/sprites";
export type Frame = { url: string; x: number; y: number; w: number; h: number };
let fronts: Promise<Map<number, Frame>> | undefined;

/** The battle front sprite of each species (form 0), as a page URL and a frame (spec 024). */
export function pokemonFronts() {
  fronts ??= fetch(`${ICONS}/battle.json`)
    .then((r) => r.json() as Promise<{ pages: { file: string }[]; frames: { name: string; page: number; x: number; y: number; w: number; h: number }[] }>)
    .then((set) => {
      const out = new Map<number, Frame>();
      for (const f of set.frames) {
        const m = /^battle\/(\d+)\/0\/front\/(unisex|male)$/.exec(f.name);
        const page = set.pages[f.page];
        if (m && page && !out.has(Number(m[1]))) out.set(Number(m[1]), { url: `${ICONS}/${page.file}`, x: f.x, y: f.y, w: f.w, h: f.h });
      }
      return out;
    })
    .catch(() => new Map<number, Frame>());
  return fronts;
}
let trainers: Promise<Map<number, Frame>> | undefined;

/** The battle sprite of each trainer class (a/0/5/8), as a page URL and a frame. */
export function trainerSprites() {
  trainers ??= fetch(`${ICONS}/trainer.json`)
    .then((r) => r.json() as Promise<{ pages: { file: string }[]; frames: { name: string; page: number; x: number; y: number; w: number; h: number }[] }>)
    .then((set) => {
      const out = new Map<number, Frame>();
      for (const f of set.frames) {
        const m = /^trainer\/(\d+)$/.exec(f.name);
        const page = set.pages[f.page];
        if (m && page) out.set(Number(m[1]), { url: `${ICONS}/${page.file}`, x: f.x, y: f.y, w: f.w, h: f.h });
      }
      return out;
    })
    .catch(() => new Map<number, Frame>());
  return trainers;
}

let encounters: Promise<Map<number, EncounterRecord>> | undefined;

/** The extracted encounter tables, by id (Block H: the minimap's route species); empty when missing. */
export function encounterTables() {
  const path = "assets://stages/events/events/encounters.json";
  encounters ??= fetch(path)
    .then((r) => r.text())
    .then((text) => {
      const parsed = parseEventsJson("encounters", text, path);
      return new Map(parsed.ok ? parsed.data.records.map((r) => [r.id, r]) : []);
    })
    .catch(() => new Map<number, EncounterRecord>());
  return encounters;
}

let items: Promise<Map<number, Frame>> | undefined;

/** The bag icon of each item (a/0/1/8), as a page URL and a frame; empty when the atlas is missing. */
export function itemIcons() {
  items ??= fetch(`${ICONS}/icon-item.json`)
    .then((r) => r.json() as Promise<{ pages: { file: string }[]; frames: { name: string; page: number; x: number; y: number; w: number; h: number }[] }>)
    .then((set) => {
      const out = new Map<number, Frame>();
      for (const f of set.frames) {
        const m = /^icon-item\/(\d+)$/.exec(f.name);
        const page = set.pages[f.page];
        if (m && page) out.set(Number(m[1]), { url: `${ICONS}/${page.file}`, x: f.x, y: f.y, w: f.w, h: f.h });
      }
      return out;
    })
    .catch(() => new Map<number, Frame>());
  return items;
}

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
