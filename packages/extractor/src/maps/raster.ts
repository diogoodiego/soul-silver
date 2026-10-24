import type { RgbaImage } from "./png.ts";

// Software rasterizer for the fixed map projection (research.md R3). Triangles arrive in
// screen space; affine interpolation is exact because the projection has no perspective.

export interface ScreenVertex {
  x: number;
  y: number;
  /** Depth: lower is nearer the camera. */
  z: number;
  /** Texture coordinates in texels. */
  u: number;
  v: number;
  /** Multiplies the texel; white when absent. */
  color?: [number, number, number];
  /** Value handed to DrawOptions.accept (the height above the ground). */
  h?: number;
}

export interface DrawOptions {
  /** Per axis: repeat the texture (default) or clamp to its edge. */
  repeat: [boolean, boolean];
  /** Per axis: mirror every other repetition. */
  flip: [boolean, boolean];
  /** 1 is opaque; below 1 the triangle blends and does not write depth. */
  alpha: number;
  /** Pixels whose interpolated h is refused are left untouched. */
  accept?: ((h: number) => boolean) | undefined;
}

export interface Canvas {
  image: RgbaImage;
  depth: Float32Array;
  /** h of the opaque fragment that won each pixel. */
  heights: Float32Array;
}

export function createCanvas(width: number, height: number): Canvas {
  return {
    image: { width, height, data: new Uint8Array(width * height * 4) },
    depth: new Float32Array(width * height).fill(Infinity),
    heights: new Float32Array(width * height),
  };
}

function texel(value: number, size: number, repeat: boolean, flip: boolean): number {
  const i = Math.floor(value);
  if (!repeat) return Math.min(size - 1, Math.max(0, i));
  if (!flip) return ((i % size) + size) % size;
  const period = ((i % (2 * size)) + 2 * size) % (2 * size);
  return period < size ? period : 2 * size - 1 - period;
}

/** Draws one textured triangle; pixels whose centers are inside are covered. */
export function drawTriangle(
  canvas: Canvas,
  [a, b, c]: [ScreenVertex, ScreenVertex, ScreenVertex],
  texture: RgbaImage,
  options: Partial<DrawOptions> = {},
): void {
  const { repeat = [true, true], flip = [false, false], alpha = 1, accept } = options;
  const { width, height, data } = canvas.image;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (area === 0) return;
  const tinted = [a, b, c].some((v) => v.color && (v.color[0] !== 255 || v.color[1] !== 255 || v.color[2] !== 255));

  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Pixel center, nudged off exact edges so a pixel on an edge shared by two triangles
      // belongs to exactly one of them (matters for translucent triangles).
      const px = x + 0.5 + 1e-6;
      const py = y + 0.5 + 1e-7;
      // Barycentric weights, normalized so they are all >= 0 inside either winding.
      const wa = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
      const wb = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
      const wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;

      const i = y * width + x;
      const z = wa * a.z + wb * b.z + wc * c.z;
      if (z >= canvas.depth[i]!) continue;
      const h = wa * (a.h ?? 0) + wb * (b.h ?? 0) + wc * (c.h ?? 0);
      if (accept && !accept(h)) continue;

      const tu = texel(wa * a.u + wb * b.u + wc * c.u, texture.width, repeat[0], flip[0]);
      const tv = texel(wa * a.v + wb * b.v + wc * c.v, texture.height, repeat[1], flip[1]);
      const t = (tv * texture.width + tu) * 4;
      if (texture.data[t + 3] === 0) continue;

      let [r, g, bl] = [texture.data[t]!, texture.data[t + 1]!, texture.data[t + 2]!];
      if (tinted) {
        const tint = (k: 0 | 1 | 2) => (wa * (a.color?.[k] ?? 255) + wb * (b.color?.[k] ?? 255) + wc * (c.color?.[k] ?? 255)) / 255;
        [r, g, bl] = [Math.round(r * tint(0)), Math.round(g * tint(1)), Math.round(bl * tint(2))];
      }
      const o = i * 4;
      if (alpha < 1) {
        data[o] = Math.round(r * alpha + data[o]! * (1 - alpha));
        data[o + 1] = Math.round(g * alpha + data[o + 1]! * (1 - alpha));
        data[o + 2] = Math.round(bl * alpha + data[o + 2]! * (1 - alpha));
        data[o + 3] = Math.max(data[o + 3]!, Math.round(texture.data[t + 3]! * alpha));
        continue;
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = bl;
      data[o + 3] = texture.data[t + 3]!;
      canvas.depth[i] = z;
      canvas.heights[i] = h;
    }
  }
}
