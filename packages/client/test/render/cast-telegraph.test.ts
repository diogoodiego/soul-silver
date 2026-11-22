import type { Entity } from "@soulsilver/shared/game";
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { createCastTelegraphs, ORBIT_FLAT, ORBIT_MOTES, orbitLight, orbitMote } from "../../src/render/cast-telegraph";

describe("createCastTelegraphs", () => {
  it("turns and moves with a contact move's aim, without starting the charge over", () => {
    const scene = new Scene();
    const casts = createCastTelegraphs(scene);
    const draw = (data: Entity["data"], now: number) =>
      casts.draw([{ id: 1, kind: "pokemon", area: "a", x: 0, y: 0, level: 0, facing: "east", data: { casting: 1, castMs: 400, castType: 0, castShape: "arc", castSize: 28, castSpan: 100, ...data } }], () => 0, now, 1);
    draw({ castDx: 100, castDy: 0, castOx: 44, castOy: 0 }, 0);
    const before = [...scene.children];
    const root = before.find((o) => o.position.x === 44)!;
    draw({ castDx: 0, castDy: 100, castOx: 0, castOy: 44 }, 200);
    expect(scene.children).toEqual(before);
    expect(root.position).toMatchObject({ x: 0, z: 44 });
    expect(root.children[0]!.children[0]!.rotation.z).toBeCloseTo(-Math.PI / 2);
  });
});

const motes = Array.from({ length: ORBIT_MOTES }, (_, i) => i);

describe("cast orbit", () => {
  it("circles the user, gathering in as the charge builds", () => {
    for (const p of [0, 0.5, 1]) {
      for (const i of motes) {
        const m = orbitMote(i, 1234, p);
        expect(Math.hypot(m.x, m.z)).toBeLessThan(24);
        expect(m.y).toBeGreaterThan(0);
      }
    }
    // mote 0 starts at angle 0: straight to the user's right, at the ring's radius
    expect(orbitMote(0, 0, 1).x).toBeLessThan(orbitMote(0, 0, 0).x);
    expect(orbitMote(0, 0, 1).x).toBeGreaterThan(4);
  });

  it("spins faster and glows brighter near the end of the charge", () => {
    const turn = (p: number) => Math.acos(orbitMote(0, 100, p).x / Math.hypot(orbitMote(0, 100, p).x, orbitMote(0, 100, p).z / ORBIT_FLAT));
    expect(turn(1)).toBeGreaterThan(turn(0));
    expect(orbitMote(0, 0, 1).glow).toBeGreaterThan(orbitMote(0, 0, 0).glow);
  });

  it("lights the ground more as it charges", () => {
    expect(orbitLight(1, 0)).toBeGreaterThan(orbitLight(0, 0));
    expect(orbitLight(0, 0)).toBeGreaterThan(0);
  });
});
