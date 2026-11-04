import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canUseFieldMove, parseFieldFile, pickUser, type FieldMovesRules } from "../../src/field/index.ts";

// Spec 025 (FR-002, FR-004, FR-006): a field move clears its obstacle with the move in the party and the badge.

const parsed = parseFieldFile("moves", JSON.parse(readFileSync(new URL("../../../../content/field/moves.json", import.meta.url), "utf8")), "moves.json");
if (!parsed.ok) throw new Error(parsed.error.problem);
const rules: FieldMovesRules = parsed.data.value;

const BLOCKERS = ["cut", "rockSmash", "strength", "surf", "whirlpool", "waterfall", "rockClimb", "flash", "headbutt"] as const;
const ruleOf = (name: string) => rules.moves.find((m) => m.name === name)!;
const ALL_BADGES = 0xffff;

describe("canUseFieldMove", () => {
  for (const name of BLOCKERS) {
    const rule = ruleOf(name);
    const knows = [{ moves: [33] }, { moves: [33, rule.move] }];
    const lacks = [{ moves: [33] }];
    const withBadge = rule.badge === undefined ? 0 : 1 << rule.badge;
    const withoutBadge = rule.badge === undefined ? 0 : ALL_BADGES & ~(1 << rule.badge);

    it(`${name}: needs the move${rule.badge === undefined ? "" : " and badge " + rule.badge}`, () => {
      expect(canUseFieldMove(rules, withBadge, knows, rule.obstacle)).toEqual({ ok: true, move: rule, user: 1 });
      expect(canUseFieldMove(rules, withBadge, lacks, rule.obstacle)).toEqual({ ok: false, reason: "move" });
      expect(canUseFieldMove(rules, withoutBadge, lacks, rule.obstacle)).toEqual({ ok: false, reason: "move" });
      if (rule.badge === undefined) expect(canUseFieldMove(rules, 0, knows, rule.obstacle)).toMatchObject({ ok: true });
      else expect(canUseFieldMove(rules, withoutBadge, knows, rule.obstacle)).toEqual({ ok: false, reason: "badge" });
    });
  }

  it("fly has no obstacle and nothing clears 'none'", () => {
    expect(ruleOf("fly")).toMatchObject({ obstacle: "none", badge: 4 });
    expect(canUseFieldMove(rules, ALL_BADGES, [{ moves: [ruleOf("fly").move] }], "none")).toEqual({ ok: false, reason: "notHere" });
  });

  it("the companion uses the move when it knows it", () => {
    const cut = ruleOf("cut").move;
    const party = [{ moves: [cut] }, { moves: [1] }, { moves: [cut] }];
    expect(canUseFieldMove(rules, ALL_BADGES, party, "tree", 2)).toMatchObject({ ok: true, user: 2 });
    expect(canUseFieldMove(rules, ALL_BADGES, party, "tree", 1)).toMatchObject({ ok: true, user: 0 });
  });
});

describe("pickUser", () => {
  it("is the companion, else the first who knows, else nothing", () => {
    const party = [{ moves: [1] }, { moves: [15] }, { moves: [15] }];
    expect(pickUser(party, 15, 2)).toBe(2);
    expect(pickUser(party, 15, 0)).toBe(1);
    expect(pickUser(party, 15)).toBe(1);
    expect(pickUser(party, 99, 0)).toBeUndefined();
  });
});
