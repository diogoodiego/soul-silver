import type { SpriteEmitter } from "@soulsilver/shared/sprites";
import { Scene, Texture } from "three";
import { describe, expect, it } from "vitest";
import { OBLIQUE, SPRITE_DEPTH_BIAS } from "../../src/render/camera";
import { createParticles } from "../../src/render/particles";

const FRAME = 1000 / 30;
const def: SpriteEmitter = {
  frame: "battle-fx/27/2",
  color: "ffffff",
  colorEnd: "ff0000",
  alpha: 1,
  scale: 1,
  scaleFrom: 1,
  scaleTo: 0.5,
  count: 1,
  interval: 1,
  delay: 0,
  emitterLife: 3,
  particleLife: 5,
  radius: 0,
  speed: 0,
  gravityY: 0,
};

function setup() {
  const scene = new Scene();
  const page = new Texture({ width: 32, height: 32 });
  const particles = createParticles(scene, (name) => (name === def.frame ? { frame: { x: 0, y: 0, w: 16, h: 16 }, page } : undefined));
  return { scene, particles };
}

describe("particles", () => {
  it("emit one particle per interval during the emitter's life, then fade them out", () => {
    const { scene, particles } = setup();
    const at = () => ({ x: 10, y: 20, ground: 0 });
    particles.play([def], at, 0);
    for (let f = 0; f <= 3; f++) particles.update(f * FRAME);
    expect(scene.children).toHaveLength(3);
    particles.update(20 * FRAME);
    expect(scene.children).toHaveLength(0);
  });

  it("loop while their anchor exists and stop when asked", () => {
    const { scene, particles } = setup();
    particles.play([def], () => ({ x: 0, y: 0, ground: 0 }), 0, "7/status/burn", true);
    particles.update(10 * FRAME);
    particles.update(11 * FRAME);
    expect([...particles.keys()]).toEqual(["7/status/burn"]);
    expect(scene.children.length).toBeGreaterThan(0);
    particles.stop("7/status/burn");
    particles.update(40 * FRAME);
    expect(scene.children).toHaveLength(0);
  });

  it("stream a travelling effect from the user towards its target", () => {
    const { scene, particles } = setup();
    particles.play([def], () => ({ x: 0, y: 0, ground: 0 }), 0, undefined, false, () => ({ x: 100, y: 0, ground: 0 }));
    particles.update(0);
    particles.update(2 * FRAME);
    particles.update(4 * FRAME);
    const xs = scene.children.map((m) => m.position.x);
    expect(Math.max(...xs)).toBeGreaterThan(40);
  });

  describe("of a status", () => {
    const AT = { x: 0, y: 100, ground: 16 };
    /** Screen rows up from the feet. */
    const up = (p: { y: number; z: number }) => AT.y - OBLIQUE * AT.ground - (p.z - OBLIQUE * p.y);

    it("stay behind the sprite, at the same screen point, as the Pokémon walks", () => {
      const { scene, particles } = setup();
      let y = 100.4;
      particles.play([{ ...def, speed: 1, particleLife: 20 }], () => ({ ...AT, y }), 0, "7/status/burn", true, undefined, {});
      for (let f = 0; f <= 12; f++, y -= 2) particles.update(f * FRAME);
      const spriteZ = Math.round(y + 2) + SPRITE_DEPTH_BIAS * OBLIQUE;
      expect(scene.children.length).toBeGreaterThan(0);
      for (const m of scene.children) expect(m.position.z).toBeLessThan(spriteZ);

      const rows = (status: object | undefined) => {
        const s = setup();
        s.particles.play([{ ...def, gravityY: 0.1 }], () => AT, 0, undefined, false, undefined, status);
        for (let f = 0; f <= 2; f++) s.particles.update(f * FRAME);
        return s.scene.children.map((m) => up(m.position));
      };
      rows({}).forEach((r, i) => expect(r).toBeCloseTo(rows(undefined)[i]!, 6));
    });

    it("rise straight up, as the original's status emitters do", () => {
      const { scene, particles } = setup();
      particles.play([{ ...def, speed: 1, particleLife: 20, emitterLife: 1 }], () => AT, 0, undefined, false, undefined, {});
      particles.update(0);
      const from = up(scene.children[0]!.position);
      particles.update(5 * FRAME);
      expect(scene.children[0]!.position.x).toBeCloseTo(0, 6);
      expect(up(scene.children[0]!.position)).toBeGreaterThan(from + 5);
    });

    it("start at the height asked for", () => {
      const at = (lift?: () => number | undefined) => {
        const { scene, particles } = setup();
        particles.play([def], () => AT, 0, undefined, false, undefined, { lift });
        particles.update(0);
        return up(scene.children[0]!.position);
      };
      expect(at(() => 40)).toBeCloseTo(40 * OBLIQUE, 6);
      expect(at(() => undefined)).toBeCloseTo(at(), 6);
    });

    it("are gone at once when their Pokémon is, or is knocked out", () => {
      const { scene, particles } = setup();
      let there = true;
      particles.play([{ ...def, particleLife: 60 }], () => (there ? AT : undefined), 0, "7/status/burn", true, undefined, {});
      for (let f = 0; f <= 3; f++) particles.update(f * FRAME);
      expect(scene.children.length).toBeGreaterThan(0);
      there = false;
      particles.update(4 * FRAME);
      expect(scene.children).toHaveLength(0);
      expect([...particles.keys()]).toEqual([]);
    });
  });

  it("grow and shrink when the curve starts and ends at nothing (poison)", () => {
    const { scene, particles } = setup();
    particles.play([{ ...def, scaleFrom: 0, scaleTo: 0, particleLife: 10, emitterLife: 1 }], () => ({ x: 0, y: 0, ground: 0 }), 0);
    const scale = (f: number) => {
      particles.update(f * FRAME);
      return scene.children[0]!.scale.x;
    };
    const [born, middle, late] = [scale(0), scale(5), scale(9)];
    expect(middle).toBeGreaterThan(0.3);
    expect(born).toBeLessThan(0.05);
    expect(late).toBeLessThan(middle / 2);
  });

  it("skip effects whose frame is missing", () => {
    const { scene, particles } = setup();
    particles.play([{ ...def, frame: "nope" }], () => ({ x: 0, y: 0, ground: 0 }), 0);
    particles.update(FRAME);
    expect(scene.children).toHaveLength(0);
  });
});
