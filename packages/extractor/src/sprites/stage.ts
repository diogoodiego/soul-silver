// The sprites stage: atlases and metadata per category, plus a report.
// See specs/007-sprite-atlas/data-model.md.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeSpriteFile, type SpriteCategory } from "@soulsilver/shared/sprites";
import { CODE_INPUT, countNarcMembers, NARC_INPUT, readArm9, readNarcMember } from "../data/inputs.ts";
import { SOULSILVER_US_LAYOUT } from "../data/layout.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { extractBattle } from "./battle.ts";
import { extractBattleFx } from "./battle-fx.ts";
import { extractFieldEffects } from "./field-effects.ts";
import { extractForms } from "./forms.ts";
import { BATTLE_MEMBERS_PER_SPECIES, FIELD_EFFECT_ARCHIVE, FORMS_ARCHIVE, ICON_ARCHIVE, ITEM_ICON_ARCHIVE, MOVE_SCRIPT_ARCHIVE, OVERWORLD_ARCHIVE, PARTICLE_ARCHIVE, OVERWORLD_NPC_END, OVERWORLD_PLAYERS, SPRITE_ARCHIVES, TRAINER_ARCHIVE, TRAINER_COUNT } from "./layout.ts";
import { extractItemIcons, extractPokemonIcons, itemIconMembers } from "./icons.ts";
import { extractTrainers } from "./trainers.ts";
import { extractNpcs, extractPlayers, extractPokemon, pokemonEntries } from "./overworld.ts";
import { buildReportFile, type CategoryResult } from "./report.ts";
import { buildAtlas, writeAtlas, type FrameInput } from "./writer.ts";
import type { SpriteEntry } from "@soulsilver/shared/sprites";

const MIB = 1024 * 1024;

async function run(ctx: StageContext): Promise<void> {
  const out = ctx.outputDir("sprites");
  const results: Partial<Record<SpriteCategory, CategoryResult>> = {};

  const add = async (
    category: SpriteCategory,
    extracted: { frames: FrameInput[]; sprites: SpriteEntry[]; missing: CategoryResult["missing"]; failed: CategoryResult["failed"] },
    strict: boolean,
  ) => {
    const atlas = buildAtlas(category, extracted.frames, extracted.sprites);
    await writeAtlas(out, atlas);
    results[category] = { set: atlas.set, missing: extracted.missing, failed: extracted.failed, strict };
  };

  const species = SOULSILVER_US_LAYOUT.counts.species;
  const battleMembers = await countNarcMembers(ctx, SPRITE_ARCHIVES.pokemonBattle);
  if (battleMembers < (species + 1) * BATTLE_MEMBERS_PER_SPECIES) {
    throw new Error(`Battle archive ${SPRITE_ARCHIVES.pokemonBattle} has ${battleMembers} members, expected at least ${(species + 1) * BATTLE_MEMBERS_PER_SPECIES}`);
  }
  ctx.progress(0.05);
  const base = await extractBattle((i) => readNarcMember(ctx, SPRITE_ARCHIVES.pokemonBattle, i), species);
  const forms = await extractForms((i) => readNarcMember(ctx, FORMS_ARCHIVE, i));
  await add(
    "battle",
    {
      frames: [...base.frames, ...forms.frames],
      sprites: [...base.sprites, ...forms.sprites],
      missing: [...base.missing, ...forms.missing],
      failed: [...base.failed, ...forms.failed],
    },
    true,
  );
  ctx.progress(0.5);

  const overworld = (i: number) => readNarcMember(ctx, OVERWORLD_ARCHIVE, i);
  await add("overworld-player", await extractPlayers(overworld, OVERWORLD_PLAYERS), true);
  await add("overworld-npc", await extractNpcs(overworld, OVERWORLD_NPC_END, OVERWORLD_PLAYERS), false);
  const arm9 = await readArm9(ctx);
  const entries = pokemonEntries(arm9, species, await countNarcMembers(ctx, OVERWORLD_ARCHIVE));
  await add("overworld-pokemon", await extractPokemon(overworld, entries), true);
  ctx.progress(0.7);

  await add("icon-pokemon", await extractPokemonIcons((i) => readNarcMember(ctx, ICON_ARCHIVE, i), arm9, species), true);
  const items = itemIconMembers(arm9, SOULSILVER_US_LAYOUT.arm9.itemMap, SOULSILVER_US_LAYOUT.counts.items);
  await add("icon-item", await extractItemIcons((i) => readNarcMember(ctx, ITEM_ICON_ARCHIVE, i), items), false);
  await add("trainer", await extractTrainers((i) => readNarcMember(ctx, TRAINER_ARCHIVE, i), TRAINER_COUNT), false);
  await add("field-effect", await extractFieldEffects((i) => readNarcMember(ctx, FIELD_EFFECT_ARCHIVE, i)), true);
  await add(
    "battle-fx",
    await extractBattleFx((m) => readNarcMember(ctx, MOVE_SCRIPT_ARCHIVE, m), (s) => readNarcMember(ctx, PARTICLE_ARCHIVE, s), SOULSILVER_US_LAYOUT.counts.moves),
    false,
  );
  ctx.progress(0.9);

  const report = buildReportFile(results);
  await writeFile(join(out, "report.json"), serializeSpriteFile("sprite-report", report));
  if (!report.ok) ctx.log.warn(`sprites: ${report.failed.length} sprites failed; see report.json`);
}

export const spritesStage: Stage = {
  id: "sprites",
  title: "Extraindo os sprites",
  version: 4,
  weight: 10,
  inputs: [NARC_INPUT, CODE_INPUT],
  outputs: ["sprites"],
  estimateBytes: () => 200 * MIB,
  run,
};
