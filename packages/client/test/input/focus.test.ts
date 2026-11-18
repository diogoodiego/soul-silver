import { describe, expect, it } from "vitest";
import { nextInDirection } from "../../src/input/focus";

const r = (x: number, y: number, w = 100, h = 30) => ({ left: x, top: y, width: w, height: h });

describe("nextInDirection", () => {
  // A vertical menu.
  const column = [r(0, 0), r(0, 40), r(0, 80)];

  it("moves down and up a column", () => {
    expect(nextInDirection(column, 0, "down")).toBe(1);
    expect(nextInDirection(column, 1, "down")).toBe(2);
    expect(nextInDirection(column, 2, "up")).toBe(1);
  });

  it("stays put at the edge", () => {
    expect(nextInDirection(column, 2, "down")).toBe(2);
    expect(nextInDirection(column, 0, "left")).toBe(0);
  });

  it("prefers the aligned neighbour over a nearer diagonal one", () => {
    // 0 at the top left; 1 right below it; 2 slightly lower but far to the right.
    const rects = [r(0, 0), r(0, 60), r(300, 35)];
    expect(nextInDirection(rects, 0, "down")).toBe(1);
  });

  it("goes item by item down a right-aligned column of mixed widths", () => {
    // Sozinho, Hospedar, Entrar (short), Arena de teste (long), Voltar: right edges at 300.
    const widths = [120, 130, 70, 210, 90];
    const items = widths.map((w, i) => r(300 - w, i * 40, w));
    for (let i = 0; i < items.length - 1; i++) expect(nextInDirection(items, i, "down")).toBe(i + 1);
    for (let i = items.length - 1; i > 0; i--) expect(nextInDirection(items, i, "up")).toBe(i - 1);
  });

  it("moves across a row", () => {
    const row = [r(0, 0), r(120, 0), r(240, 0)];
    expect(nextInDirection(row, 0, "right")).toBe(1);
    expect(nextInDirection(row, 2, "left")).toBe(1);
  });

  it("starts from the first element when nothing is focused", () => {
    expect(nextInDirection(column, -1, "down")).toBe(0);
  });
});
