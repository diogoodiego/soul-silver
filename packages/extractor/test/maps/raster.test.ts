import { describe, expect, it } from "vitest";
import { createCanvas, drawTriangle, type DrawOptions, type ScreenVertex } from "../../src/maps/raster.ts";
import type { RgbaImage } from "../../src/maps/png.ts";

const solid = (r: number, g: number, b: number, a = 255): RgbaImage => ({ width: 1, height: 1, data: new Uint8Array([r, g, b, a]) });

/** Two triangles covering the axis-aligned box [x0, x1) x [y0, y1), uv over the whole texture. */
function quad(canvas: ReturnType<typeof createCanvas>, texture: RgbaImage, x0: number, y0: number, x1: number, y1: number, z: number) {
  const v = (x: number, y: number, u: number, t: number): ScreenVertex => ({ x, y, z, u, v: t });
  const [a, b, c, d] = [v(x0, y0, 0, 0), v(x1, y0, texture.width, 0), v(x1, y1, texture.width, texture.height), v(x0, y1, 0, texture.height)];
  drawTriangle(canvas, [a, b, c], texture);
  drawTriangle(canvas, [a, c, d], texture);
}

const pixel = (image: RgbaImage, x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

describe("drawTriangle", () => {
  it("fills exactly the pixels whose centers are covered", () => {
    const canvas = createCanvas(4, 4);
    quad(canvas, solid(255, 0, 0), 1, 1, 3, 3, 0);
    const painted: string[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (pixel(canvas.image, x, y)[3]) painted.push(`${x},${y}`);
    expect(painted).toEqual(["1,1", "2,1", "1,2", "2,2"]);
  });

  it("keeps the nearer surface, whatever the draw order", () => {
    for (const order of [[0, 1], [1, 0]]) {
      const canvas = createCanvas(2, 2);
      const layers = [() => quad(canvas, solid(255, 0, 0), 0, 0, 2, 2, 5), () => quad(canvas, solid(0, 0, 255), 0, 0, 2, 2, 1)];
      for (const i of order) layers[i]!();
      expect(pixel(canvas.image, 0, 0)).toEqual([0, 0, 255, 255]);
    }
  });

  it("samples the texture by nearest neighbor, without blending", () => {
    const texture: RgbaImage = {
      width: 2,
      height: 2,
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    };
    const canvas = createCanvas(4, 4);
    quad(canvas, texture, 0, 0, 4, 4, 0);
    expect([pixel(canvas.image, 0, 0), pixel(canvas.image, 1, 1), pixel(canvas.image, 3, 0), pixel(canvas.image, 0, 3), pixel(canvas.image, 3, 3)]).toEqual([
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 255, 255],
    ]);
  });

  it("skips transparent texels, leaving what is behind them", () => {
    const canvas = createCanvas(2, 2);
    quad(canvas, solid(255, 0, 0), 0, 0, 2, 2, 5);
    quad(canvas, solid(0, 0, 255, 0), 0, 0, 2, 2, 1);
    expect(pixel(canvas.image, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it("clamps or mirrors texture coordinates outside the texture when asked", () => {
    const texture: RgbaImage = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) };
    // uv 0..4 across 4 pixels: texel u = 0.5, 1.5, 2.5, 3.5.
    const row = (sampler: Partial<DrawOptions>) => {
      const canvas = createCanvas(4, 1);
      const v = (x: number, y: number, u: number): ScreenVertex => ({ x, y, z: 0, u, v: 0 });
      drawTriangle(canvas, [v(0, 0, 0), v(4, 0, 4), v(4, 1, 4)], texture, sampler);
      drawTriangle(canvas, [v(0, 0, 0), v(4, 1, 4), v(0, 1, 0)], texture, sampler);
      return [0, 1, 2, 3].map((x) => pixel(canvas.image, x, 0)[0]);
    };
    expect(row({ repeat: [true, true] })).toEqual([255, 0, 255, 0]);
    expect(row({ repeat: [true, true], flip: [true, false] })).toEqual([255, 0, 0, 255]);
    expect(row({ repeat: [false, false] })).toEqual([255, 0, 0, 0]);
  });

  it("modulates texels by the interpolated vertex color", () => {
    const canvas = createCanvas(2, 2);
    const v = (x: number, y: number): ScreenVertex => ({ x, y, z: 0, u: 0, v: 0, color: [255, 128, 0] });
    drawTriangle(canvas, [v(0, 0), v(2, 0), v(2, 2)], solid(255, 255, 255));
    drawTriangle(canvas, [v(0, 0), v(2, 2), v(0, 2)], solid(255, 255, 255));
    expect(pixel(canvas.image, 1, 1)).toEqual([255, 128, 0, 255]);
  });

  it("blends translucent triangles without hiding what is behind", () => {
    const canvas = createCanvas(2, 2);
    quad(canvas, solid(255, 0, 0), 0, 0, 2, 2, 5);
    const v = (x: number, y: number): ScreenVertex => ({ x, y, z: 1, u: 0, v: 0 });
    drawTriangle(canvas, [v(0, 0), v(2, 0), v(2, 2)], solid(0, 0, 255), { alpha: 0.5 });
    drawTriangle(canvas, [v(0, 0), v(2, 2), v(0, 2)], solid(0, 0, 255), { alpha: 0.5 });
    expect(pixel(canvas.image, 1, 1)).toEqual([128, 0, 128, 255]);
    expect(canvas.depth[3]).toBe(5);
  });

  it("only writes the pixels the filter accepts, by interpolated height", () => {
    const canvas = createCanvas(4, 1);
    const v = (x: number, y: number, h: number): ScreenVertex => ({ x, y, z: 0, u: 0, v: 0, h });
    const accept = (h: number) => h > 2;
    drawTriangle(canvas, [v(0, 0, 0), v(4, 0, 4), v(4, 1, 4)], solid(9, 9, 9), { accept });
    drawTriangle(canvas, [v(0, 0, 0), v(4, 1, 4), v(0, 1, 0)], solid(9, 9, 9), { accept });
    expect([0, 1, 2, 3].map((x) => pixel(canvas.image, x, 0)[3])).toEqual([0, 0, 255, 255]);
  });

  it("clips triangles that leave the canvas", () => {
    const canvas = createCanvas(2, 2);
    quad(canvas, solid(0, 255, 0), -5, -5, 7, 7, 0);
    expect(pixel(canvas.image, 1, 1)).toEqual([0, 255, 0, 255]);
  });
});
