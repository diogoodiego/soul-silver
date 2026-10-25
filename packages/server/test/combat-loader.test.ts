import { describe, expect, it } from "vitest";
import { buildCombatData } from "../src/combat-loader";
import { extraction, MOVES, readContent } from "./combat-fixture";

type Content = ReturnType<typeof readContent>;
const edit = (change: (c: { archetypes: { records: Record<string, unknown>[] }; moves: { records: Record<string, unknown>[] }; statuses: { records: Record<string, unknown>[] } }) => void): Content => {
  const c = structuredClone(readContent()) as never;
  change(c);
  return c;
};

describe("buildCombatData", () => {
  it("loads content/combat with the extraction", () => {
    const data = buildCombatData(readContent(), extraction());
    const ember = data.move(MOVES.ember.id)!;
    expect(ember.behavior).toBe("projectile");
    expect(ember.type).toBe(10);
    // Seconds become ticks at 20 Hz: the projectile archetype casts in 0.15 s.
    expect(ember.castTicks).toBe(3);
    expect(ember.effects).toContainEqual({ kind: "status", status: "burn" });
  });

  it("uses the generic archetype of the category for unmapped moves", () => {
    const data = buildCombatData(readContent(), extraction());
    expect(data.move(MOVES.unmappedPhysical.id)!.archetype).toBe("generic-physical");
    expect(data.move(MOVES.unmappedSpecial.id)!.archetype).toBe("generic-special");
    expect(data.move(MOVES.unmappedStatus.id)!.archetype).toBe("generic-status");
    expect(data.move(MOVES.unmappedPhysical.id)!.effects).toEqual([{ kind: "damage" }]);
    expect(data.move(MOVES.unmappedStatus.id)!.effects).toEqual([]);
    expect(data.move(99999)).toBeUndefined();
  });

  it.each([
    ["a move missing from the extraction", (c: Parameters<Parameters<typeof edit>[0]>[0]) => c.moves.records.push({ id: 5000, archetype: "melee", effects: [] }), /moves\.json: records\.\d+\.id: golpe 5000 não existe/],
    ["an unknown archetype", (c: Parameters<Parameters<typeof edit>[0]>[0]) => (c.moves.records[0]!.archetype = "nope"), /moves\.json: records\.0\.archetype: arquétipo "nope" não existe/],
    ["a hitbox the behavior does not take", (c: Parameters<Parameters<typeof edit>[0]>[0]) => (c.archetypes.records[1]!.defaults = { ...(c.archetypes.records[1]!.defaults as object), hitbox: { shape: "arc", radiusPx: 4, angleDeg: 90 } }), /archetypes\.json: records\.1\.defaults\.hitbox: formato "arc" não serve/],
    ["a repeated archetype", (c: Parameters<Parameters<typeof edit>[0]>[0]) => c.archetypes.records.push({ ...c.archetypes.records[0]! }), /archetypes\.json: records\.\d+\.id: arquétipo repetido/],
    ["a missing status", (c: Parameters<Parameters<typeof edit>[0]>[0]) => c.statuses.records.splice(0, 1), /statuses\.json: records: falta o status "burn"/],
    ["a schema error", (c: Parameters<Parameters<typeof edit>[0]>[0]) => (c.moves.records[0]!.hits = 99), /moves\.json: records\.0\.hits: esperado valor ≤ 10/],
  ])("rejects %s, naming the file and the field", (_, change, message) => {
    const content = edit(change);
    expect(() => buildCombatData(content, extraction())).toThrow(message);
  });
});
