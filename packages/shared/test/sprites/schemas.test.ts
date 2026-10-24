import { describe, expect, it } from "vitest";
import { spriteName } from "../../src/sprites/names.ts";
import { parseSpriteFile, parseSpriteJson, serializeSpriteFile } from "../../src/sprites/schemas.ts";

const frame = (extra: Record<string, unknown> = {}) => ({ name: "battle/1/0/front", page: 0, x: 0, y: 0, w: 8, h: 8, anchor: { x: 4, y: 8 }, ...extra });
const set = (extra: Record<string, unknown> = {}) => ({
  kind: "sprite-set",
  formatVersion: 1,
  category: "battle",
  pages: [{ file: "battle-0.png", shinyFile: "battle-0-shiny.png", width: 16, height: 16 }],
  frames: [frame()],
  sprites: [{ name: "battle/1/0", species: 1, form: 0, frames: ["battle/1/0/front"], animations: [] }],
  ...extra,
});
const problem = (value: unknown) => {
  const r = parseSpriteFile("sprite-set", value, "battle.json");
  if (r.ok) throw new Error("expected failure");
  return r.error;
};

describe("sprite-set", () => {
  it("accepts a valid set and serializes it with a trailing newline", () => {
    const r = parseSpriteFile("sprite-set", set(), "battle.json");
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeSpriteFile("sprite-set", r.data).endsWith("}\n")).toBe(true);
  });

  it("names file, path and problem when the anchor is missing", () => {
    const noAnchor = { ...frame(), anchor: undefined };
    expect(problem(set({ frames: [noAnchor] }))).toMatchObject({ file: "battle.json", path: "frames.0.anchor" });
  });

  it("rejects an animation step that points to a missing frame", () => {
    const sprites = [{ name: "s", frames: [], animations: [{ name: "walk", loop: true, steps: [{ frame: "nope", ms: 10, flipX: false }] }] }];
    expect(problem(set({ sprites })).path).toBe("sprites.0.animations.0.steps.0.frame");
  });

  it("rejects a frame outside its page", () => {
    expect(problem(set({ frames: [frame({ x: 12 })] })).path).toBe("frames.0");
  });

  it("rejects repeated frame names", () => {
    expect(problem(set({ frames: [frame(), frame()] })).path).toBe("frames.1.name");
  });

  it("rejects pages larger than 2048", () => {
    expect(problem(set({ pages: [{ file: "a.png", width: 2049, height: 8 }] })).path).toBe("pages.0.width");
  });

  it("rejects a step shorter than 1 ms", () => {
    const sprites = [{ name: "s", frames: [], animations: [{ name: "w", loop: true, steps: [{ frame: "battle/1/0/front", ms: 0, flipX: false }] }] }];
    expect(problem(set({ sprites })).path).toBe("sprites.0.animations.0.steps.0.ms");
  });

  it("reports invalid JSON with the file name", () => {
    const r = parseSpriteJson("sprite-set", "{", "battle.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.file).toBe("battle.json");
  });
});

describe("spriteName", () => {
  it("joins category and ids", () => {
    expect(spriteName("battle", [25, 0, "front"])).toBe("battle/25/0/front");
  });
});
