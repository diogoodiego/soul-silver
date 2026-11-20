import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { BALL_PX, createPokeBall, poseCapture } from "../../src/render/poke-ball";

describe("poke ball", () => {
  it("is BALL_PX wide, slightly taller (52/50), and rests on the ground point", () => {
    const b = createPokeBall();
    b.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(b.root);
    expect(box.max.x - box.min.x).toBeCloseTo(BALL_PX, 1);
    expect((box.max.y - box.min.y) / BALL_PX).toBeCloseTo(52 / 50, 1);
    expect(box.min.y).toBeGreaterThanOrEqual(0);
    expect(box.min.y).toBeLessThan(0.2);
    // The button is on the front (+Z) and stands proud of the shell.
    expect(box.max.z).toBeGreaterThan(BALL_PX / 2);
    b.dispose();
  });

  it("lights the button green when caught and red when it breaks open", () => {
    const b = createPokeBall();
    poseCapture(b, 3 * 1000, 3, 1000, true);
    expect(b.button.color.getHex()).toBe(0x8bff7a);
    poseCapture(b, 3 * 1000, 3, 1000, false);
    expect(b.button.color.getHex()).toBe(0xff5d5d);
    poseCapture(b, 500, 3, 1000, undefined);
    expect(b.button.color.getHex()).toBe(0xffffff);
  });
});
