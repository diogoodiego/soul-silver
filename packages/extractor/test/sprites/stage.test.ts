import { parseSpriteJson } from "@soulsilver/shared/sprites";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReportFile, buildSpriteReport } from "../../src/sprites/report.ts";
import { spritesStage } from "../../src/sprites/stage.ts";
import type { StageContext } from "../../src/pipeline/stage.ts";
import { btx0 } from "../fixtures/sprites/btx0.ts";
import { buildNitroFile, buildTex0 } from "../fixtures/maps/build-nitro.ts";
import { GRASS_EFFECT_MEMBER, ICON_PALETTE_TABLE, OVERWORLD_GFX_TABLE, OVERWORLD_POKEMON_FIRST, OVERWORLD_POKEMON_TABLE } from "../../src/sprites/layout.ts";
import { SOULSILVER_US_LAYOUT } from "../../src/data/layout.ts";
import { buildMoveScript, buildSpa } from "../fixtures/sprites/spa.ts";
import { bgr555, buildNclr, buildNcgr, encryptPokemonPixels, encryptTrainerPixels } from "../fixtures/sprites/builders.ts";

const plain = new Uint8Array(64).fill(0x11);
plain[0] = plain[1] = 0;
const graphic = buildNcgr({ tilesWide: 2, tilesHigh: 1, scanned: true, data: encryptPokemonPixels(plain) });
const normal = buildNclr([0, bgr555(31, 0, 0)]);
const shiny = buildNclr([0, bgr555(0, 0, 31)]);

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sprites-stage-"));
});
afterEach(() => rm(root, { recursive: true }));

async function fakeArchive(species: number): Promise<StageContext> {
  const dir = join(root, "rom-unpack", "narc", "a", "0", "0", "4");
  await mkdir(dir, { recursive: true });
  const members: Uint8Array[] = [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)];
  for (let s = 1; s <= species; s++) members.push(graphic, graphic, graphic, graphic, normal, shiny);
  await Promise.all(members.map((m, i) => writeFile(join(dir, `${String(i).padStart(4, "0")}.bin`), Buffer.from(m))));
  const forms = join(root, "rom-unpack", "narc", "a", "1", "1", "4");
  await mkdir(forms, { recursive: true });
  const formMembers = [...Array.from({ length: 158 }, () => graphic), ...Array.from({ length: 98 }, (_, i) => (i % 2 ? shiny : normal))];
  await Promise.all(formMembers.map((m, i) => writeFile(join(forms, `${String(i).padStart(4, "0")}.bin`), Buffer.from(m))));
  // Overworld: players (69, 70), one NPC (0) and 493 single-entry Pokémon; table in the ARM9.
  const ow = join(root, "rom-unpack", "narc", "a", "0", "8", "1");
  await mkdir(ow, { recursive: true });
  const owMembers = Array.from({ length: OVERWORLD_POKEMON_FIRST + 493 }, (_, i) =>
    i === 0 ? btx0("npc", 16) : i === 69 || i === 70 ? btx0("hero", 32) : i >= OVERWORLD_POKEMON_FIRST ? btx0("tsure_poke", 8, { palettes: 2 }) : new Uint8Array(0),
  );
  await Promise.all(owMembers.map((m, i) => writeFile(join(ow, `${String(i).padStart(4, "0")}.bin`), Buffer.from(m))));
  // Icons: palette, 6 animation members, then 523 icons; items: one graphic and one palette.
  const iconDir = join(root, "rom-unpack", "narc", "a", "0", "2", "0");
  await mkdir(iconDir, { recursive: true });
  const iconGfx = buildNcgr({ tilesWide: 4, tilesHigh: 8, data: new Array(1024).fill(0x11) });
  const iconMembers = [buildNclr([0, bgr555(1, 0, 0)]), ...Array.from({ length: 6 }, () => new Uint8Array(0)), ...Array.from({ length: 544 }, () => iconGfx)];
  await Promise.all(iconMembers.map((m, i) => writeFile(join(iconDir, `${String(i).padStart(4, "0")}.bin`), Buffer.from(m))));
  const itemDir = join(root, "rom-unpack", "narc", "a", "0", "1", "8");
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(itemDir, "0000.bin"), Buffer.from(buildNcgr({ tilesWide: 4, tilesHigh: 4, data: new Array(512).fill(0x11) })));
  await writeFile(join(itemDir, "0001.bin"), Buffer.from(buildNclr([0, bgr555(1, 0, 0)])));
  const trainerDir = join(root, "rom-unpack", "narc", "a", "0", "5", "8");
  await mkdir(trainerDir, { recursive: true });
  const sheetPlain = new Uint8Array(6400).fill(0x11);
  sheetPlain[6398] = sheetPlain[6399] = 0;
  const sheet = buildNcgr({ tilesWide: 20, tilesHigh: 10, scanned: true, data: encryptTrainerPixels(sheetPlain) });
  const trainerMembers = Array.from({ length: 129 * 5 }, (_, i) => (i % 5 === 1 ? buildNclr([0, bgr555(1, 0, 0)]) : i % 5 === 4 ? sheet : new Uint8Array(0)));
  await Promise.all(trainerMembers.map((m, i) => writeFile(join(trainerDir, `${String(i).padStart(4, "0")}.bin`), Buffer.from(m))));
  // Field effects: the grass rustle texture file, other members empty.
  const effectDir = join(root, "rom-unpack", "narc", "a", "1", "0", "3");
  await mkdir(effectDir, { recursive: true });
  const grass = buildNitroFile("BTX0", [
    buildTex0(
      [1, 2, 3, 4].map((k) => ({ name: `kusaeff.${k}`, format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(k) })),
      [{ name: "kusaeff", colors: [0, bgr555(0, 31, 0), bgr555(0, 20, 0), bgr555(0, 10, 0), bgr555(0, 5, 0)] }],
    ),
  ]);
  await writeFile(join(effectDir, `${String(GRASS_EFFECT_MEMBER).padStart(4, "0")}.bin`), Buffer.from(grass));
  // Battle effects: every move script creates emitter 0 of SPA 32; statuses use SPA 27 and 115.
  const scripts = join(root, "rom-unpack", "narc", "a", "0", "1", "0");
  const spaDir = join(root, "rom-unpack", "narc", "a", "0", "2", "9");
  await mkdir(scripts, { recursive: true });
  await mkdir(spaDir, { recursive: true });
  await Promise.all(Array.from({ length: 468 }, (_, m) => writeFile(join(scripts, `${String(m).padStart(4, "0")}.bin`), Buffer.from(buildMoveScript(32)))));
  const spa = buildSpa(Array.from({ length: 10 }, () => ({})), [{ colors: [0, 0x7fff] }]);
  await Promise.all([27, 32, 115].map((id) => writeFile(join(spaDir, `${String(id).padStart(4, "0")}.bin`), Buffer.from(spa))));
  const itemMap = SOULSILVER_US_LAYOUT.arm9.itemMap;
  const arm9 = new Uint8Array(Math.max(OVERWORLD_POKEMON_TABLE + 2 * 493, ICON_PALETTE_TABLE + 544, itemMap + 8 * 537));
  for (let id = 1; id <= 536; id++) new DataView(arm9.buffer).setUint16(itemMap + id * 8 + 4, 1, true);
  for (let i = 0; i < 493; i++) new DataView(arm9.buffer).setUint16(OVERWORLD_POKEMON_TABLE + 2 * i, i, true);
  await mkdir(join(root, "code-decompress", "code"), { recursive: true });
  await writeFile(join(root, "code-decompress", "code", "arm9.bin"), arm9);
  // Field overlay sprite table: event sprite 315 is NPC member 0, then the end marker.
  const overlay = new Uint8Array(OVERWORLD_GFX_TABLE.offset + 12);
  new DataView(overlay.buffer).setUint16(OVERWORLD_GFX_TABLE.offset, 315, true);
  new DataView(overlay.buffer).setUint16(OVERWORLD_GFX_TABLE.offset + 6, 0xffff, true);
  await mkdir(join(root, "code-decompress", "code", "overlay9"), { recursive: true });
  await writeFile(join(root, "code-decompress", "code", "overlay9", "0001.bin"), overlay);
  await mkdir(join(root, "out"), { recursive: true });
  const noop = () => {};
  return {
    rom: new Uint8Array(0),
    inputDir: (stage: string, output: string) => join(root, stage, output),
    outputDir: () => join(root, "out"),
    signal: new AbortController().signal,
    progress: noop,
    log: { info: noop, warn: noop, error: noop },
  };
}

describe("sprites stage", { timeout: 30_000 }, () => {
  it("writes the battle atlas (species and forms), its json and a report with no failures", async () => {
    await fakeArchive(493);
    const ctx = await fakeArchive(493);
    await spritesStage.run(ctx);
    const files = await readdir(join(root, "out"));
    expect(files).toEqual(expect.arrayContaining(["battle.json", "battle-0.png", "battle-0-shiny.png", "overworld-player.json", "overworld-npc.json", "overworld-pokemon.json", "report.json"]));
    const set = parseSpriteJson("sprite-set", await readFile(join(root, "out", "battle.json"), "utf8"), "battle.json");
    expect(set.ok && set.data.sprites).toHaveLength(493 + 65);
    const npcs = parseSpriteJson("sprite-set", await readFile(join(root, "out", "overworld-npc.json"), "utf8"), "overworld-npc.json");
    expect(npcs.ok && npcs.data.sprites[0]!.gfx).toEqual([315]);
    const report = parseSpriteJson("sprite-report", await readFile(join(root, "out", "report.json"), "utf8"), "report.json");
    expect(report.ok && report.data.ok).toBe(true);
    expect(report.ok && Object.fromEntries(Object.entries(report.data.categories).map(([k, v]) => [k, v.sprites]))).toEqual({
      battle: 493 + 65,
      "overworld-player": 2,
      "overworld-npc": 1,
      "overworld-pokemon": 493,
      "icon-pokemon": 493 + 30,
      "icon-item": 536,
      trainer: 129,
      "field-effect": 1,
      "battle-fx": 467 + 7,
    });
  });

  it("is byte-identical on a second run (SC-004)", async () => {
    const ctx = await fakeArchive(493);
    await spritesStage.run(ctx);
    const first = await readFile(join(root, "out", "battle-0.png"));
    const json = await readFile(join(root, "out", "battle.json"), "utf8");
    await spritesStage.run(ctx);
    expect((await readFile(join(root, "out", "battle-0.png"))).equals(first)).toBe(true);
    expect(await readFile(join(root, "out", "battle.json"), "utf8")).toBe(json);
  });

  it("fails clearly when the archive is too small", async () => {
    const ctx = await fakeArchive(3);
    await expect(spritesStage.run(ctx)).rejects.toThrow("a/0/0/4");
  });
});

describe("sprite report", () => {
  const set = { kind: "sprite-set" as const, formatVersion: 1 as const, category: "battle" as const, pages: [], frames: [], sprites: [] };
  const result = (failed: number, strict: boolean) => ({
    set: { ...set, sprites: Array.from({ length: 100 }, (_, i) => ({ name: `s${i}`, frames: [], animations: [] })) },
    missing: [],
    failed: Array.from({ length: failed }, (_, i) => ({ sprite: `f${i}`, reason: "boom" })),
    strict,
  });

  it("fails when a strict category loses any sprite", () => {
    expect(buildReportFile({ battle: result(1, true) }).ok).toBe(false);
    expect(buildReportFile({ battle: result(0, true) }).ok).toBe(true);
  });

  it("tolerates up to 2% loss in other categories", () => {
    expect(buildReportFile({ "icon-item": result(2, false) }).ok).toBe(true);
    expect(buildReportFile({ "icon-item": result(5, false) }).ok).toBe(false);
  });

  it("prints counts, and lists each missing and failed sprite", async () => {
    const dir = join(root, "r");
    await mkdir(dir);
    const r = buildReportFile({ battle: { ...result(1, true), missing: [{ sprite: "battle/9/0", reason: "shiny palette is missing" }] } });
    await writeFile(join(dir, "report.json"), JSON.stringify(r));
    const out = await buildSpriteReport(dir);
    expect(out.ok).toBe(false);
    expect(out.lines.join("\n")).toContain("faltando  battle battle/9/0: shiny palette is missing");
    expect(out.lines.join("\n")).toContain("falha     battle f0: boom");
  });

  it("says so when the stage has not run", async () => {
    expect((await buildSpriteReport(join(root, "none"))).lines.join("\n")).toContain("não extraído");
  });
});
