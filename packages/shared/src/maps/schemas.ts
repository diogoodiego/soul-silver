// Map files: map-headers, map-areas, map-collision, map-report and map-mesh.
// See specs/006-map-prerender/data-model.md. Same envelope and codec as the game data (feature 004).
import { z } from "zod";
import { fileSchema, GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import { mapMeshFile } from "./mesh.ts";

/** Version of the map file format; bumped when a map schema changes. */
export const MAP_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION;

const u16 = () => int(0, 0xffff);

const mapHeader = z.strictObject({
  id: id(),
  /** Index into the "map-names" text bank (feature 005). */
  mapsec: id(),
  areaType: z.enum(["outdoor", "indoor", "cave"]),
  area: id(),
  matrix: id(),
  musicDay: u16(),
  musicNight: u16(),
  weather: int(0, 127),
  /** Where the bicycle, the Escape Rope (and Dig) and Fly work (spec 025). */
  bikeAllowed: z.boolean(),
  escapeRopeAllowed: z.boolean(),
  flyAllowed: z.boolean(),
  /** Where the Pokégear rings (spec 026); absent in extractions from before it. */
  incomingCalls: z.boolean().optional(),
  /** Indices of the ROM archives each header points to; null when the map has none. */
  refs: z.strictObject({
    events: id(),
    scripts: id(),
    messages: id(),
    encounters: id().nullable(),
  }),
});

export const mapHeadersFile = fileSchema("map-headers", mapHeader);
export type MapHeadersFile = z.infer<typeof mapHeadersFile>;
export type MapHeader = z.infer<typeof mapHeader>;

const mapArea = z
  .strictObject({
    id: id(),
    name: z.string(),
    width: int(1, 255),
    height: int(1, 255),
    /** Piece (land data) per cell, row by row; null for an empty cell. */
    pieces: z.array(id().nullable()),
    /** Height of each cell's piece; null when the matrix has no heights. */
    heights: z.array(int(0, 255)).nullable(),
    /** Map header per cell; null when the whole matrix is a single map. */
    maps: z.array(id().nullable()).nullable(),
  })
  .superRefine((area, ctx) => {
    const cells = area.width * area.height;
    for (const grid of ["pieces", "heights", "maps"] as const) {
      const values = area[grid];
      if (values && values.length !== cells) {
        ctx.addIssue({ code: "custom", path: [grid], message: `esperado ${cells} células (largura × altura), recebido ${values.length}` });
      }
    }
  });

export const mapAreasFile = fileSchema("map-areas", mapArea);
export type MapAreasFile = z.infer<typeof mapAreasFile>;
export type MapArea = z.infer<typeof mapArea>;

const collisionCell = z
  .strictObject({
    category: z.enum(["blocked", "free", "tallGrass", "water", "ledge", "ladder", "levelTransition", "special"]),
    raw: u16(),
    direction: z.enum(["north", "south", "east", "west"]).optional(),
    targetLevel: id().optional(),
  })
  .superRefine((cell, ctx) => {
    if ((cell.category === "ledge") !== (cell.direction !== undefined)) {
      ctx.addIssue({ code: "custom", message: "direction existe só, e sempre, em ledge" });
    }
    if ((cell.category === "levelTransition") !== (cell.targetLevel !== undefined)) {
      ctx.addIssue({ code: "custom", message: "targetLevel existe só, e sempre, em levelTransition" });
    }
  });

export const mapCollisionFile = z
  .strictObject({
    kind: z.literal("map-collision"),
    formatVersion: z.literal(GAME_DATA_FORMAT_VERSION),
    map: id(),
    level: id(),
    width: int(1, 0xffff),
    height: int(1, 0xffff),
    /** One cell per tile, row by row. */
    tiles: z.array(collisionCell),
  })
  .superRefine((file, ctx) => {
    const cells = file.width * file.height;
    if (file.tiles.length !== cells) {
      ctx.addIssue({ code: "custom", path: ["tiles"], message: `esperado ${cells} tiles (largura × altura), recebido ${file.tiles.length}` });
    }
  });
export type MapCollisionFile = z.infer<typeof mapCollisionFile>;

const reportEntry = z
  .strictObject({
    id: id(),
    status: z.enum(["success", "successWithWarnings", "failure"]),
    stage: z.enum(["header", "grid", "pieces", "render", "collision"]).optional(),
    reason: z.string().min(1).optional(),
    warnings: z.array(
      z.strictObject({
        code: z.enum(["animated-texture", "unknown-permission", "ambiguous-height", "missing-texture", "missing-model"]),
        detail: z.string(),
      }),
    ),
  })
  .superRefine((entry, ctx) => {
    if (entry.status === "failure" && (entry.stage === undefined || entry.reason === undefined)) {
      ctx.addIssue({ code: "custom", message: "falha exige stage e reason" });
    }
    if (entry.status === "successWithWarnings" && entry.warnings.length === 0) {
      ctx.addIssue({ code: "custom", message: "successWithWarnings exige ao menos um aviso" });
    }
  });

export const mapReportFile = fileSchema("map-report", reportEntry);
export type MapReportFile = z.infer<typeof mapReportFile>;
export type MapReportEntry = z.infer<typeof reportEntry>;

const codec = createGameDataCodec({
  "map-headers": mapHeadersFile,
  "map-areas": mapAreasFile,
  "map-collision": mapCollisionFile,
  "map-report": mapReportFile,
  "map-mesh": mapMeshFile,
});

export type MapFileKind = "map-headers" | "map-areas" | "map-collision" | "map-report" | "map-mesh";
export const parseMapFile = codec.parseGameDataFile;
export const parseMapJson = codec.parseGameDataJson;
export const serializeMapFile = codec.serializeGameDataFile;
