import type { SpriteEmitter } from "@soulsilver/shared/sprites";
import { Scene, Texture } from "three";
import { describe, expect, it } from "vitest";
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

  it("skip effects whose frame is missing", () => {
    const { scene, particles } = setup();
    particles.play([{ ...def, frame: "nope" }], () => ({ x: 0, y: 0, ground: 0 }), 0);
    particles.update(FRAME);
    expect(scene.children).toHaveLength(0);
  });
});
