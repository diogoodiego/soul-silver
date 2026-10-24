// Sprite files: sprite-set (one per category) and sprite-report. See
// specs/007-sprite-atlas/data-model.md. Same codec as the game data (feature 004).
import { z } from "zod";
import { id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import { ATLAS_MAX_SIZE, SPRITE_CATEGORIES, SPRITE_FORMAT_VERSION } from "./constants.ts";

const point = z.strictObject({ x: int(-ATLAS_MAX_SIZE, ATLAS_MAX_SIZE), y: int(-ATLAS_MAX_SIZE, ATLAS_MAX_SIZE) });

const frame = z.strictObject({
  name: z.string().min(1),
  page: id(),
  x: id(),
  y: id(),
  w: int(1, ATLAS_MAX_SIZE),
  h: int(1, ATLAS_MAX_SIZE),
  /** Pixel of the frame that sits on the character position (the "foot" of the sprite). */
  anchor: point,
});

const step = z.strictObject({ frame: z.string().min(1), ms: int(1, 0xffffff), flipX: z.boolean() });

const animation = z.strictObject({ name: z.string().min(1), loop: z.boolean(), steps: z.array(step).min(1) });

const sprite = z.strictObject({
  name: z.string().min(1),
  species: id().optional(),
  form: id().optional(),
  gender: z.enum(["male", "female", "unisex"]).optional(),
  item: id().optional(),
  trainer: id().optional(),
  character: z.string().min(1).optional(),
  /** Frame names of a still sprite; animated sprites list them through `animations`. */
  frames: z.array(z.string().min(1)),
  animations: z.array(animation),
  fallbackOf: z.strictObject({ species: id(), form: id() }).optional(),
});

const page = z.strictObject({
  file: z.string().min(1),
  shinyFile: z.string().min(1).optional(),
  width: int(1, ATLAS_MAX_SIZE),
  height: int(1, ATLAS_MAX_SIZE),
});

export const spriteSetFile = z
  .strictObject({
    kind: z.literal("sprite-set"),
    formatVersion: z.literal(SPRITE_FORMAT_VERSION),
    category: z.enum(SPRITE_CATEGORIES),
    pages: z.array(page),
    frames: z.array(frame),
    sprites: z.array(sprite),
  })
  .superRefine((set, ctx) => {
    const names = new Set<string>();
    set.frames.forEach((f, i) => {
      if (names.has(f.name)) ctx.addIssue({ code: "custom", path: ["frames", i, "name"], message: `nome de quadro repetido: ${f.name}` });
      names.add(f.name);
      const p = set.pages[f.page];
      if (!p) ctx.addIssue({ code: "custom", path: ["frames", i, "page"], message: `página ${f.page} não existe` });
      else if (f.x + f.w > p.width || f.y + f.h > p.height) {
        ctx.addIssue({ code: "custom", path: ["frames", i], message: `quadro ${f.name} fora da página ${f.page}` });
      }
    });
    const spriteNames = new Set<string>();
    set.sprites.forEach((s, i) => {
      if (spriteNames.has(s.name)) ctx.addIssue({ code: "custom", path: ["sprites", i, "name"], message: `nome de sprite repetido: ${s.name}` });
      spriteNames.add(s.name);
      s.frames.forEach((name, j) => {
        if (!names.has(name)) ctx.addIssue({ code: "custom", path: ["sprites", i, "frames", j], message: `quadro inexistente: ${name}` });
      });
      s.animations.forEach((a, j) =>
        a.steps.forEach((st, k) => {
          if (!names.has(st.frame)) {
            ctx.addIssue({ code: "custom", path: ["sprites", i, "animations", j, "steps", k, "frame"], message: `quadro inexistente: ${st.frame}` });
          }
        }),
      );
    });
  });
export type SpriteSetFile = z.infer<typeof spriteSetFile>;
export type SpriteFrame = z.infer<typeof frame>;
export type SpriteAnimation = z.infer<typeof animation>;
export type SpriteEntry = z.infer<typeof sprite>;

const categoryCounts = z.strictObject({ sprites: id(), frames: id(), animations: id(), pages: id() });
const category = z.enum(SPRITE_CATEGORIES);

export const spriteReportFile = z.strictObject({
  kind: z.literal("sprite-report"),
  formatVersion: z.literal(SPRITE_FORMAT_VERSION),
  ok: z.boolean(),
  categories: z.partialRecord(category, categoryCounts),
  missing: z.array(z.strictObject({ category, sprite: z.string(), frame: z.string().optional(), reason: z.string().min(1) })),
  fallbacks: z.array(z.strictObject({ species: id(), form: id(), usedForm: id() })),
  failed: z.array(z.strictObject({ category, sprite: z.string(), reason: z.string().min(1) })),
});
export type SpriteReportFile = z.infer<typeof spriteReportFile>;

const codec = createGameDataCodec({ "sprite-set": spriteSetFile, "sprite-report": spriteReportFile });

export type SpriteFileKind = "sprite-set" | "sprite-report";
export const parseSpriteFile = codec.parseGameDataFile;
export const parseSpriteJson = codec.parseGameDataJson;
export const serializeSpriteFile = codec.serializeGameDataFile;
