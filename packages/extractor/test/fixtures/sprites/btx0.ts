import { buildNitroFile, buildTex0 } from "../maps/build-nitro.ts";
import { bgr555 } from "./builders.ts";

/**
 * A BTX0 with `count` 8x8 16-color textures named `<name>.1`..`<name>.<count>`, stored in
 * lexicographic order like the ROM does. Texture n is filled with color n % 15 + 1; with
 * `topRows` set only that many rows are opaque. Palette color i has red = i.
 */
export function btx0(name: string, count: number, opts: { palettes?: number; topRows?: number } = {}): Uint8Array {
  const order = Array.from({ length: count }, (_, i) => i + 1).sort((a, b) => String(a).localeCompare(String(b)));
  const textures = order.map((n) => {
    const color = (n % 15) + 1;
    const texels = new Uint8Array(32).fill(0);
    for (let y = 0; y < (opts.topRows ?? 8); y++) texels.fill(color | (color << 4), y * 4, y * 4 + 4);
    return { name: `${name}.${n}`, format: 3, width: 8, height: 8, texels, color0Transparent: true };
  });
  const colors = Array.from({ length: 16 }, (_, i) => bgr555(i, 0, 0));
  const shiny = Array.from({ length: 16 }, (_, i) => bgr555(0, 0, i));
  const palettes = Array.from({ length: opts.palettes ?? 1 }, (_, i) => ({ name: `${name}${opts.palettes ? i : ""}`, colors: i === 0 ? colors : shiny }));
  return buildNitroFile("BTX0", [buildTex0(textures, palettes)]);
}
