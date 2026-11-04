import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFieldFile, type FieldFileKind } from "../../src/field/schemas.ts";
import { parseEventsFile } from "../../src/events/schemas.ts";

// Spec 025: the hand-written field-move rules and fishing rules, and the extracted fly points.

interface MovesRaw {
  value: { moves: { name: string; badge?: number; obstacle: string }[] };
}
interface FishingRaw {
  value: { friendshipBite: number; rods: Record<string, { waitS?: number[]; baseBite?: number }> };
}
const content = <T>(file: string) => JSON.parse(readFileSync(new URL(`../../../../content/field/${file}`, import.meta.url), "utf8")) as T;
const FILES: Record<Exclude<FieldFileKind, "locomotion">, string> = { moves: "moves.json", fishing: "fishing.json" };

describe("field data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [keyof typeof FILES, string][]) {
      expect(parseFieldFile(kind, content<unknown>(file), file)).toMatchObject({ ok: true });
    }
  });

  it("has the badge of every move that needs one, from field_move.c", () => {
    const badges = Object.fromEntries(content<MovesRaw>("moves.json").value.moves.map((m) => [m.name, m.badge]));
    expect(badges).toMatchObject({ rockSmash: 0, cut: 1, strength: 2, surf: 3, fly: 4, whirlpool: 6, waterfall: 7, rockClimb: 15 });
    for (const free of ["flash", "headbutt", "dig", "teleport"]) expect(badges[free]).toBeUndefined();
  });

  it("rejects an obstacle outside the known list, with its path", () => {
    const raw = content<MovesRaw>("moves.json");
    raw.value.moves[0]!.obstacle = "bush";
    expect(parseFieldFile("moves", raw, "moves.json")).toMatchObject({ ok: false, error: { file: "moves.json", path: "value.moves.0.obstacle" } });
  });

  it("rejects a badge outside 0..15", () => {
    const raw = content<MovesRaw>("moves.json");
    raw.value.moves[0]!.badge = 16;
    expect(parseFieldFile("moves", raw, "moves.json")).toMatchObject({ ok: false, error: { path: "value.moves.0.badge" } });
  });

  it("rejects a wait with min above max", () => {
    const raw = content<FishingRaw>("fishing.json");
    raw.value.rods["old"]!.waitS = [5, 2];
    expect(parseFieldFile("fishing", raw, "fishing.json")).toMatchObject({ ok: false });
  });

  it.each(["baseBite", "friendshipBite"])("rejects %s outside 0..1", (field) => {
    const raw = content<FishingRaw>("fishing.json");
    if (field === "baseBite") raw.value.rods["good"]!.baseBite = 1.5;
    else raw.value.friendshipBite = -0.1;
    expect(parseFieldFile("fishing", raw, "fishing.json")).toMatchObject({ ok: false });
  });

  it("rejects a missing rod", () => {
    const raw = content<FishingRaw>("fishing.json");
    delete raw.value.rods["super"];
    expect(parseFieldFile("fishing", raw, "fishing.json")).toMatchObject({ ok: false, error: { path: "value.rods.super" } });
  });
});

describe("fly-points.json", () => {
  const file = (points: unknown[]) => ({ kind: "fly-points", formatVersion: 1, points });
  const point = (extra: Record<string, unknown> = {}) => ({ flypoint: 11, map: 3, tx: 10, ty: 12, ...extra });

  it("accepts a point", () => {
    expect(parseEventsFile("fly-points", file([point()]), "fly-points.json")).toMatchObject({ ok: true });
  });

  it("rejects a flypoint above 37", () => {
    expect(parseEventsFile("fly-points", file([point({ flypoint: 38 })]), "fly-points.json")).toMatchObject({ ok: false, error: { path: "points.0.flypoint" } });
  });

  it("rejects a repeated flypoint", () => {
    expect(parseEventsFile("fly-points", file([point(), point()]), "fly-points.json")).toMatchObject({ ok: false });
  });
});
