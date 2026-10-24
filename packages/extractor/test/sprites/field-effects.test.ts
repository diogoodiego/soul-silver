import { describe, expect, it } from "vitest";
import { extractFieldEffects } from "../../src/sprites/field-effects.ts";
import { GRASS_EFFECT_MEMBER } from "../../src/sprites/layout.ts";
import { buildNitroFile, buildTex0 } from "../fixtures/maps/build-nitro.ts";

const tex = (names: string[]) =>
  buildNitroFile("BTX0", [
    buildTex0(
      names.map((name) => ({ name, format: 3, width: 8, height: 8, texels: new Uint8Array(32).fill(0x11) })),
      [{ name: "kusaeff", colors: [0, 0x03e0] }],
    ),
  ]);

describe("extractFieldEffects", () => {
  it("gives the grass rustle as four frames, anchored at the tuft's bottom, played once", async () => {
    const result = await extractFieldEffects((i) => Promise.resolve(i === GRASS_EFFECT_MEMBER ? tex(["kusaeff.1", "kusaeff.2", "kusaeff.3", "kusaeff.4"]) : new Uint8Array()));
    expect(result.failed).toEqual([]);
    expect(result.frames.map((f) => [f.name, f.anchor])).toEqual([0, 1, 2, 3].map((k) => [`field-effect/grass/${k}`, { x: 4, y: 8 }]));
    const [sprite] = result.sprites;
    expect(sprite).toMatchObject({ name: "field-effect/grass", frames: [] });
    expect(sprite!.animations.map((a) => [a.name, a.loop, a.steps.map((s) => s.frame)])).toEqual([["rustle", false, [0, 1, 2, 3].map((k) => `field-effect/grass/${k}`)]]);
  });

  it("reports the sprite as failed when a frame is missing", async () => {
    const result = await extractFieldEffects(() => Promise.resolve(tex(["kusaeff.1"])));
    expect(result.failed.map((f) => f.sprite)).toEqual(["field-effect/grass"]);
    expect(result.failed[0]!.reason).toContain("kusaeff.2");
  });
});
