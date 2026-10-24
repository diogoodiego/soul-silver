import { z } from "zod";
import { GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";

// Texture animations of a map (specs/006-map-prerender, FR-009): the data to play them,
// not the playback. Values are 4.12 fixed point from the ROM, already as plain numbers.

const number = z.number();

/** A scroll track: one value for every frame, or the same value throughout. */
const track = z.union([z.strictObject({ constant: number }), z.strictObject({ values: z.array(number) })]);
const rotationTrack = z.union([
  z.strictObject({ constant: z.tuple([number, number]) }),
  z.strictObject({ values: z.array(z.tuple([number, number])) }),
]);

const scroll = z.strictObject({
  type: z.literal("scroll"),
  material: z.string(),
  duration: int(1, 0xffff),
  scaleS: track,
  scaleT: track,
  /** [sin, cos]. */
  rotation: rotationTrack,
  translateS: track,
  translateT: track,
});

const pattern = z
  .strictObject({
    type: z.literal("pattern"),
    material: z.string(),
    duration: int(1, 0xffff),
    textures: z.array(z.string()),
    palettes: z.array(z.string()),
    keys: z.array(z.strictObject({ frame: int(0, 0xffff), texture: id(), palette: id() })),
  })
  .superRefine((anim, ctx) => {
    anim.keys.forEach((key, i) => {
      if (key.texture >= anim.textures.length) ctx.addIssue({ code: "custom", path: ["keys", i, "texture"], message: "textura fora da lista da animação" });
      if (key.palette >= anim.palettes.length) ctx.addIssue({ code: "custom", path: ["keys", i, "palette"], message: "paleta fora da lista da animação" });
      if (i > 0 && key.frame <= anim.keys[i - 1]!.frame) ctx.addIssue({ code: "custom", path: ["keys", i, "frame"], message: "os quadros devem crescer" });
    });
  });

export const mapAnimation = z.union([scroll, pattern]);
export type MapAnimation = z.infer<typeof mapAnimation>;

/** Where the frames of a layer replace the static image: pixels, aligned to tiles. */
export const animationRegion = z.strictObject({
  level: id(),
  layer: z.enum(["lower", "upper"]),
  x: id(),
  y: id(),
  width: int(1, 0xffff),
  height: int(1, 0xffff),
});
export type AnimationRegion = z.infer<typeof animationRegion>;

/**
 * The animations whose material a map uses (FR-019), and the frames played from them: each region
 * has `frames` images, layers/{level}-{layer}-anim-{k}.png, one per point of the resampled cycle.
 */
export const mapAnimationsFile = z.strictObject({
  kind: z.literal("map-animations"),
  formatVersion: z.literal(GAME_DATA_FORMAT_VERSION),
  map: id(),
  frames: int(1, 64),
  regions: z.array(animationRegion),
  animations: z.array(mapAnimation),
});
export type MapAnimationsFile = z.infer<typeof mapAnimationsFile>;
