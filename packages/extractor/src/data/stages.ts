import { GAME_DATA_FILES, GAME_DATA_FORMAT_VERSION, type GameDataKind } from "@soulsilver/shared/game-data";
import type { Stage, StageContext, StageInput } from "../pipeline/stage.ts";
import {
  CODE_INPUT,
  countNarcMembers,
  FILESYSTEM_INPUT,
  NARC_INPUT,
  readArm9,
  readFileSystemFile,
  readNarcMember,
  readOverlay,
} from "./inputs.ts";
import type { DataLayout } from "./layout.ts";
import { readEvolutions } from "./readers/evolution.ts";
import { readItem, readItemMap } from "./readers/item.ts";
import {
  readEggMoves,
  readLevelUp,
  readMachineCompat,
  readMachines,
  readTutorCompat,
  readTutors,
  tutorCompatEntry,
} from "./readers/learnset.ts";
import { readMove } from "./readers/move.ts";
import { readPersonal } from "./readers/personal.ts";
import { readAbilityCount, readGrowthRates, readNatures, readTypeChart, types } from "./readers/tables.ts";
import { writeGameDataFile } from "./write.ts";

// The data stages; see specs/004-game-data-extraction/contracts/stages.md.

const MIB = 1024 * 1024;

export interface DataStageOptions {
  id: string;
  title: string;
  inputs: readonly StageInput[];
  /** Estimated disk use of the `json` output, in MiB. */
  estimateMiB: number;
  run(ctx: StageContext, json: string): Promise<void>;
}

/** Every data stage is version 1, weight 1 and writes a single `json` output. */
export function dataStage(options: DataStageOptions): Stage {
  return {
    id: options.id,
    title: options.title,
    version: 1,
    weight: 1,
    inputs: options.inputs,
    outputs: ["json"],
    estimateBytes: () => options.estimateMiB * MIB,
    run: (ctx) => options.run(ctx, ctx.outputDir("json")),
  };
}

/** Writes one data file with the common envelope; the schema validates it first. */
async function writeKind(json: string, kind: GameDataKind, records: readonly unknown[], extra: object = {}): Promise<void> {
  await writeGameDataFile(json, kind, { kind, formatVersion: GAME_DATA_FORMAT_VERSION, ...extra, records }, GAME_DATA_FILES[kind].file);
}

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);

/** Species ids first, then the alternate forms, as in the personal NARC. */
function personalIndices(layout: DataLayout): number[] {
  return [...range(1, layout.counts.species), ...layout.forms.map((f) => f.personalIndex)].sort((a, b) => a - b);
}

function speciesStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-species",
    title: "Lendo os Pokémon",
    inputs: [NARC_INPUT],
    estimateMiB: 1,
    run: async (ctx, json) => {
      const indices = personalIndices(layout);
      const records = [];
      for (const [done, index] of indices.entries()) {
        ctx.signal.throwIfAborted();
        records.push(readPersonal(await readNarcMember(ctx, layout.narc.personal, index), index, layout));
        ctx.progress((done + 1) / indices.length);
      }
      await writeKind(json, "species", records);
    },
  });
}

function movesStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-moves",
    title: "Lendo os golpes",
    inputs: [NARC_INPUT],
    estimateMiB: 1,
    run: async (ctx, json) => {
      const records = [];
      for (const id of range(1, layout.counts.moves)) {
        ctx.signal.throwIfAborted();
        records.push(readMove(await readNarcMember(ctx, layout.narc.moves, id), id));
        ctx.progress(id / layout.counts.moves);
      }
      await writeKind(json, "moves", records);
    },
  });
}

function learnsetsStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-learnsets",
    title: "Lendo os golpes que cada Pokémon aprende",
    inputs: [NARC_INPUT, FILESYSTEM_INPUT, CODE_INPUT],
    estimateMiB: 2,
    run: async (ctx, json) => {
      const eggMoves = readEggMoves(await readNarcMember(ctx, layout.narc.eggMoves, 0));
      const machines = readMachines(await readArm9(ctx), layout.arm9.machines, layout.counts.machines, layout.counts.moves);
      const { overlay, offset } = layout.overlay.tutors;
      const tutors = readTutors(await readOverlay(ctx, overlay), offset, layout.counts.tutors, layout.counts.moves);
      const compat = await readFileSystemFile(ctx, layout.tutorCompatFile);
      const expectedSize = layout.counts.tutorCompatEntries * 8;
      if (compat.length !== expectedSize) {
        throw new Error(`Compatibilidade de tutores com ${compat.length} bytes (esperado ${expectedSize})`);
      }

      const indices = personalIndices(layout);
      const learnsets = [];
      for (const [done, index] of indices.entries()) {
        ctx.signal.throwIfAborted();
        const entry = tutorCompatEntry(layout, index);
        if (entry === undefined) throw new Error(`Sem entrada de compatibilidade de tutores para o registro ${index}`);
        learnsets.push({
          id: index,
          levelUp: readLevelUp(await readNarcMember(ctx, layout.narc.levelUp, index)),
          machines: readMachineCompat(await readNarcMember(ctx, layout.narc.personal, index)),
          egg: eggMoves.get(index) ?? [],
          tutors: readTutorCompat(compat, entry, tutors.length),
        });
        ctx.progress((done + 1) / indices.length);
      }
      await writeKind(json, "learnsets", learnsets);
      await writeKind(json, "machines", machines);
      await writeKind(json, "tutors", tutors);
    },
  });
}

function evolutionsStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-evolutions",
    title: "Lendo as evoluções",
    inputs: [NARC_INPUT],
    estimateMiB: 1,
    run: async (ctx, json) => {
      const records = [];
      for (const index of personalIndices(layout)) {
        ctx.signal.throwIfAborted();
        const evolutions = readEvolutions(await readNarcMember(ctx, layout.narc.evolutions, index));
        if (evolutions.length > 0) records.push({ id: index, evolutions });
      }
      await writeKind(json, "evolutions", records);
    },
  });
}

function itemsStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-items",
    title: "Lendo os itens",
    inputs: [NARC_INPUT, CODE_INPUT],
    estimateMiB: 1,
    run: async (ctx, json) => {
      const members = await countNarcMembers(ctx, layout.narc.items);
      const map = readItemMap(await readArm9(ctx), layout.arm9.itemMap, layout.counts.items, members);
      const records = [];
      for (const id of range(1, layout.counts.items)) {
        ctx.signal.throwIfAborted();
        const dataIndex = map[id]!;
        if (dataIndex === 0) continue;
        records.push(readItem(await readNarcMember(ctx, layout.narc.items, dataIndex), id, dataIndex));
        ctx.progress(id / layout.counts.items);
      }
      await writeKind(json, "items", records);
    },
  });
}

function tablesStage(layout: DataLayout): Stage {
  return dataStage({
    id: "data-tables",
    title: "Lendo tipos, naturezas e experiência",
    inputs: [NARC_INPUT, CODE_INPUT],
    estimateMiB: 1,
    run: async (ctx, json) => {
      await writeKind(json, "types", types());

      const chart = readTypeChart(await readOverlay(ctx, layout.overlay.typeChart.overlay), layout.overlay.typeChart.offset);
      await writeKind(json, "type-chart", chart.records, { foresightIgnored: chart.foresightIgnored });
      ctx.progress(0.4);

      await writeKind(json, "natures", readNatures(await readArm9(ctx), layout.arm9.natures));
      ctx.progress(0.6);

      const abilityCount = readAbilityCount(await readNarcMember(ctx, layout.narc.messages, layout.abilityNameBank));
      const abilities = range(1, abilityCount).map((id) => ({ id, name: { catalog: "ability-names", index: id } }));
      await writeKind(json, "abilities", abilities);
      ctx.progress(0.8);

      const growth = await Promise.all(range(0, layout.counts.growthRates - 1).map((id) => readNarcMember(ctx, layout.narc.growth, id)));
      await writeKind(json, "growth-rates", readGrowthRates(growth));
      ctx.progress(1);
    },
  });
}

export function createDataStages(layout: DataLayout): Stage[] {
  return [
    speciesStage(layout),
    movesStage(layout),
    learnsetsStage(layout),
    evolutionsStage(layout),
    itemsStage(layout),
    tablesStage(layout),
  ];
}
