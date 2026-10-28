import { describe, expect, it } from "vitest";
import { OVERWORLD_POKEMON_FIRST, OVERWORLD_POKEMON_TABLE } from "../../src/sprites/layout.ts";
import { extractNpcs, extractPlayers, extractPokemon, gfxTable, pokemonEntries, readSheet } from "../../src/sprites/overworld.ts";
import { btx0 } from "../fixtures/sprites/btx0.ts";

const empty = new Uint8Array(0);

const red = (img: { data: Uint8Array }, pixel = 0) => img.data[pixel * 4]!;
const five = (c: number) => (c << 3) | (c >> 2);

describe("readSheet", () => {
  it("orders frames by their number, not by name", () => {
    const sheet = readSheet(btx0("boy1", 16));
    expect(sheet.name).toBe("boy1");
    expect(sheet.frames).toHaveLength(16);
    // Frame ".10" is lexicographically second in the file but tenth in the sheet.
    expect(red(sheet.frames[9]!)).toBe(five(11));
    expect(red(sheet.frames[1]!)).toBe(five(3));
  });

  it("keeps the second palette as the shiny frames", () => {
    const sheet = readSheet(btx0("tsure_poke", 8, { palettes: 2 }));
    expect(red(sheet.frames[0]!)).toBe(five(2));
    expect(sheet.shiny![0]!.data[2]).toBe(five(2));
    expect(sheet.shiny![0]!.data[0]).toBe(0);
  });

  it("fails on a file that is not a texture set", () => {
    expect(() => readSheet(new Uint8Array(32))).toThrow("BTX0");
  });
});

describe("extractPlayers", () => {
  it("makes walk, run and idle animations for the four directions", async () => {
    const r = await extractPlayers((m) => Promise.resolve(m === 7 ? btx0("hero", 32) : btx0("heroine", 32)), [7, 8]);
    expect(r.failed).toEqual([]);
    expect(r.sprites.map((s) => [s.name, s.character])).toEqual([["overworld-player/0", "player-0"], ["overworld-player/1", "player-1"]]);
    const hero = r.sprites[0]!;
    expect(hero.animations.map((a) => a.name)).toEqual([
      "walk-up", "idle-up", "walk-down", "idle-down", "walk-left", "idle-left", "walk-right", "idle-right",
      "run-up", "run-down", "run-left", "run-right",
    ]);
    expect(hero.animations[0]!.steps.map((s) => s.frame)).toEqual([0, 1, 2, 3].map((k) => `overworld-player/0/walk/up/${k}`));
    expect(r.frames).toHaveLength(64);
  });

  it("maps blocks to directions up, down, left, right and walk before run", async () => {
    const r = await extractPlayers(() => Promise.resolve(btx0("hero", 32)), [0]);
    const color = (frame: string) => red(r.frames.find((f) => f.name === frame)!.image);
    // Frame index i has color (i + 1) % 15 + 1: walk/down/0 is index 4, run/up/0 is index 16.
    expect(color("overworld-player/0/walk/down/0")).toBe(five(((4 + 1) % 15) + 1));
    expect(color("overworld-player/0/run/up/0")).toBe(five(((16 + 1) % 15) + 1));
    expect(color("overworld-player/0/walk/right/3")).toBe(five(((15 + 1) % 15) + 1));
  });

  it("reports a player whose frame count is wrong, naming it", async () => {
    const r = await extractPlayers(() => Promise.resolve(btx0("hero", 16)), [0]);
    expect(r.failed).toEqual([{ sprite: "overworld-player/0", reason: "expected 32 frames, found 16" }]);
  });

  it("puts the anchor on the foot of the sprite, centered", async () => {
    const r = await extractPlayers(() => Promise.resolve(btx0("hero", 32, { topRows: 3 })), [0]);
    expect(r.frames[0]!.anchor).toEqual({ x: 4, y: 3 });
  });
});

describe("extractNpcs", () => {
  const members = [btx0("boy1", 16), btx0("object", 15), empty, btx0("girl1", 16), btx0("shiny", 16, { palettes: 2 })];

  it("takes only 16-frame characters, skipping objects, junk, skipped members and two-palette files", async () => {
    const r = await extractNpcs((m) => Promise.resolve(members[m]!), members.length, [3]);
    expect(r.failed).toEqual([]);
    expect(r.sprites.map((s) => [s.name, s.character])).toEqual([["overworld-npc/0", "boy1"]]);
    expect(r.sprites[0]!.animations).toHaveLength(8);
    expect(r.frames).toHaveLength(16);
  });
});

describe("pokemonEntries", () => {
  const arm9 = (table: number[]) => {
    const bytes = new Uint8Array(OVERWORLD_POKEMON_TABLE + 2 * table.length);
    table.forEach((v, i) => new DataView(bytes.buffer).setUint16(OVERWORLD_POKEMON_TABLE + 2 * i, v, true));
    return bytes;
  };

  it("gives one entry per species, male then female for split species, forms elsewhere", () => {
    // Species 1: 1 entry; species 2: 2 forms; species 3 (Venusaur): male and female.
    const entries = pokemonEntries(arm9([0, 1, 3]), 3, OVERWORLD_POKEMON_FIRST + 5);
    expect(entries).toEqual([
      { species: 1, form: 0, gender: "unisex", member: OVERWORLD_POKEMON_FIRST },
      { species: 2, form: 0, gender: "unisex", member: OVERWORLD_POKEMON_FIRST + 1 },
      { species: 2, form: 1, gender: "unisex", member: OVERWORLD_POKEMON_FIRST + 2 },
      { species: 3, form: 0, gender: "male", member: OVERWORLD_POKEMON_FIRST + 3 },
      { species: 3, form: 0, gender: "female", member: OVERWORLD_POKEMON_FIRST + 4 },
    ]);
  });

  it("rejects a table that does not grow or runs past the archive", () => {
    expect(() => pokemonEntries(arm9([0, 0, 1]), 3, OVERWORLD_POKEMON_FIRST + 3)).toThrow("species 1");
    expect(() => pokemonEntries(arm9([0, 1, 9]), 3, OVERWORLD_POKEMON_FIRST + 3)).toThrow("species 2");
  });
});

describe("extractPokemon", () => {
  const entries = [
    { species: 1, form: 0, gender: "unisex" as const, member: 0 },
    { species: 2, form: 0, gender: "male" as const, member: 1 },
    { species: 3, form: 0, gender: "unisex" as const, member: 2 },
  ];
  const files = [btx0("tsure_poke", 8, { palettes: 2 }), btx0("tsure_poke", 8, { palettes: 1 }), btx0("tsure_poke", 7, { palettes: 2 })];

  it("builds 2-frame walk cycles with the shiny palette, listing what is missing or failed", async () => {
    const r = await extractPokemon((m) => Promise.resolve(files[m]!), entries);
    expect(r.sprites.map((s) => s.name)).toEqual(["overworld-pokemon/1/0/unisex", "overworld-pokemon/2/0/male"]);
    expect(r.frames[0]!.shiny).toBeDefined();
    expect(r.sprites[0]!.animations.find((a) => a.name === "walk-left")!.steps).toEqual([
      { frame: "overworld-pokemon/1/0/unisex/walk/left/0", ms: 250, flipX: false },
      { frame: "overworld-pokemon/1/0/unisex/walk/left/1", ms: 250, flipX: false },
    ]);
    expect(r.missing).toEqual([{ sprite: "overworld-pokemon/2/0/male", reason: "shiny palette is missing" }]);
    expect(r.failed).toEqual([{ sprite: "overworld-pokemon/3/0/unisex", reason: "expected 8 frames, found 7" }]);
  });
});

describe("gfxTable", () => {
  // Entries of 6 bytes: event sprite id, overworld member, flags; an id of 0xffff ends the table.
  const code = (rows: [number, number, number][], at = 4) => {
    const bytes = new Uint8Array(at + 6 * rows.length + 6);
    const v = new DataView(bytes.buffer);
    rows.forEach(([id, member, flags], i) => {
      v.setUint16(at + 6 * i, id, true);
      v.setUint16(at + 6 * i + 2, member, true);
      v.setUint16(at + 6 * i + 4, flags, true);
    });
    v.setUint16(at + 6 * rows.length, 0xffff, true);
    return bytes;
  };

  it("lists the event sprite ids each member is drawn for", () => {
    const table = gfxTable(code([[1, 0, 0], [3, 2, 0], [315, 113, 0], [148, 58, 0], [1032, 483, 20007], [400, 2, 0]]), 4);
    expect(table.get(0)).toEqual([1]);
    expect(table.get(2)).toEqual([3, 400]);
    expect(table.get(113)).toEqual([315]);
    expect(table.get(483)).toEqual([1032]);
    expect(table.has(1)).toBe(false);
  });

  it("fails when the table never ends", () => {
    const bytes = code([[1, 0, 0]]);
    bytes.fill(0, 10);
    expect(() => gfxTable(bytes, 4)).toThrow("0xffff");
  });
});

describe("event sprite ids on the sheets", () => {
  it("tags NPC and Pokémon sprites with the ids drawn with them", async () => {
    const gfx = new Map([[0, [1, 400]], [7, [1032]]]);
    const npcs = await extractNpcs(() => Promise.resolve(btx0("boy1", 16)), 1, [], gfx);
    expect(npcs.sprites[0]!.gfx).toEqual([1, 400]);
    const mons = await extractPokemon(() => Promise.resolve(btx0("tsure_poke", 8, { palettes: 2 })), [{ species: 1, form: 0, gender: "unisex", member: 7 }], gfx);
    expect(mons.sprites[0]!.gfx).toEqual([1032]);
    const none = await extractNpcs(() => Promise.resolve(btx0("boy1", 16)), 1, []);
    expect(none.sprites[0]!.gfx).toBeUndefined();
  });
});

describe("extractNpcs with the field sprite table", () => {
  const members = [btx0("monstarball", 1), btx0("pcwoman1", 17), btx0("hero", 32), btx0("bonguri", 7, { palettes: 2 }), btx0("junk", 1)];
  const gfx = new Map([[0, [87]], [1, [335]], [2, [238]], [3, [262]]]);

  it("draws every sheet the table uses: objects still, 17 frames as a walk, 32 frames as walk and run", async () => {
    const r = await extractNpcs((m) => Promise.resolve(members[m]!), members.length, [], gfx);
    expect(r.failed).toEqual([]);
    const by = new Map(r.sprites.map((s) => [s.name, s]));
    expect(by.get("overworld-npc/0")).toMatchObject({ frames: ["overworld-npc/0/still/0"], animations: [], gfx: [87] });
    expect(by.get("overworld-npc/1")!.animations.map((a) => a.name)).toContain("walk-down");
    expect(by.get("overworld-npc/1")!.frames).toHaveLength(16);
    expect(by.get("overworld-npc/2")!.animations.map((a) => a.name)).toContain("run-left");
    expect(by.get("overworld-npc/3")).toMatchObject({ frames: ["overworld-npc/3/still/0"], gfx: [262] });
    // Not in the table: an object stays out of the atlas.
    expect(by.has("overworld-npc/4")).toBe(false);
  });
});

describe("extractPlayers with the field sprite table", () => {
  it("tags the protagonists with the map sprite ids that draw them", async () => {
    const r = await extractPlayers(() => Promise.resolve(btx0("hero", 32)), [69, 70], new Map([[69, [0]], [70, [97]]]));
    expect(r.sprites.map((s) => s.gfx)).toEqual([[0], [97]]);
  });
});
