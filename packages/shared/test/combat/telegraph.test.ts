import { describe, expect, it } from "vitest";
import { castData, castKit, packKit, telegraph, unpackKit } from "../../src/combat/telegraph.ts";

const RIGHT = { x: 1, y: 0 };

describe("cast kit (block C: what a client needs to show a cast before the server does)", () => {
  const melee = { behavior: "melee", rangePx: 0, hitbox: { shape: "arc", radiusPx: 28, angleDeg: 100 }, type: 3 } as const;
  const thunder = { behavior: "target-area", rangePx: 96, hitbox: { shape: "circle", radiusPx: 24 }, type: 13 } as const;

  it("says what it aims at and whether it leaps", () => {
    expect(castKit(melee, 400)).toMatchObject({ aim: "foe", leap: true, castMs: 400, type: 3, shape: "arc", size: 28, span: 100, ahead: 0 });
    expect(castKit(thunder, 800)).toMatchObject({ aim: "foe", leap: false, ahead: 96 });
    expect(castKit({ ...thunder, behavior: "field" }, 800)).toMatchObject({ aim: "facing", leap: false });
  });

  it("survives the trip as text; anything else is no kit", () => {
    for (const kit of [castKit(melee, 400), castKit(thunder, 800)]) expect(unpackKit(packKit(kit))).toEqual(kit);
    for (const bad of [undefined, 3, "", "melee", "cone|1|2|3|4|5|foe|1", "arc|x|2|3|4|5|foe|1"]) expect(unpackKit(bad)).toBeUndefined();
  });

  it("gives the fields the clients draw, as the telegraph would, past the leap", () => {
    const dir = { x: 0, y: 1 };
    const area = telegraph(thunder, dir);
    expect(castData(castKit(thunder, 800), dir, 0)).toEqual({ castMs: 800, castType: 13, castShape: area.shape, castOx: area.ox, castOy: area.oy, castSize: area.size, castSpan: area.span, castDx: 0, castDy: 100 });
    expect(castData(castKit(melee, 400), dir, 44)).toMatchObject({ castOx: 0, castOy: 44 });
  });
});

describe("telegraph", () => {
  it("draws a self-area move as a circle around the user", () => {
    expect(telegraph({ behavior: "self-area", rangePx: 0, hitbox: { shape: "circle", radiusPx: 40 } }, RIGHT)).toEqual({ shape: "circle", ox: 0, oy: 0, size: 40, span: 0 });
  });

  it("draws a melee arc as a sector of its radius and angle", () => {
    expect(telegraph({ behavior: "melee", rangePx: 0, hitbox: { shape: "arc", radiusPx: 28, angleDeg: 100 } }, RIGHT)).toEqual({ shape: "arc", ox: 0, oy: 0, size: 28, span: 100 });
  });

  it("draws a capsule as a rectangle of its length and width from the user", () => {
    expect(telegraph({ behavior: "beam", rangePx: 0, hitbox: { shape: "capsule", lengthPx: 128, widthPx: 12 } }, RIGHT)).toEqual({ shape: "rect", ox: 0, oy: 0, size: 128, span: 12 });
  });

  it("draws a projectile or dash as its whole path: range plus the hitbox on both ends, hitbox wide", () => {
    const shot = { behavior: "projectile", rangePx: 160, hitbox: { shape: "circle", radiusPx: 6 } } as const;
    expect(telegraph(shot, RIGHT)).toEqual({ shape: "rect", ox: 0, oy: 0, size: 172, span: 12 });
    expect(telegraph({ ...shot, behavior: "dash" }, RIGHT).shape).toBe("rect");
  });

  it("puts a target-area or field circle at the end of its range, along the aim", () => {
    expect(telegraph({ behavior: "target-area", rangePx: 96, hitbox: { shape: "circle", radiusPx: 24 } }, { x: 0, y: -1 })).toEqual({ shape: "circle", ox: 0, oy: -96, size: 24, span: 0 });
    expect(telegraph({ behavior: "field", rangePx: 64, hitbox: { shape: "circle", radiusPx: 40 } }, RIGHT)).toMatchObject({ ox: 64, oy: 0 });
  });

  it("gives a move without a hitbox (self-buff) an aura", () => {
    expect(telegraph({ behavior: "self-buff", rangePx: 0, hitbox: undefined }, RIGHT)).toEqual({ shape: "aura", ox: 0, oy: 0, size: 0, span: 0 });
  });
});
