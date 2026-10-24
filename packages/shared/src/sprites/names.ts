import type { SpriteCategory } from "./constants.ts";

/** Stable sprite or frame name: `<category>/<id>/<id>...`, e.g. `battle/25/0/front/male`. */
export function spriteName(category: SpriteCategory, parts: readonly (number | string)[]): string {
  return [category, ...parts].join("/");
}
