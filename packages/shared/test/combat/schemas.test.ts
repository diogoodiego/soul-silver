import { describe, expect, it } from "vitest";
import { parseCombatFile } from "../../src/combat/schemas.ts";

const envelope = (kind: string, records: unknown[]) => ({ kind, formatVersion: 1, records });

function error(kind: Parameters<typeof parseCombatFile>[0], value: unknown) {
  const result = parseCombatFile(kind, value, `${kind}.json`);
  if (result.ok) throw new Error("expected a failure");
  return result.error;
}

describe("combat schemas", () => {
  it("accepts the contract examples", () => {
    expect(
      parseCombatFile(
        "archetypes",
        envelope("archetypes", [{ id: "projectile", behavior: "projectile", defaults: { rangePx: 160, hitbox: { shape: "circle", radiusPx: 6 }, speedPx: 240, castS: 0.15, hits: 1 } }]),
        "a.json",
      ).ok,
    ).toBe(true);
    expect(
      parseCombatFile(
        "moves",
        envelope("combat-moves", [
          { id: 14, archetype: "self-buff", effects: [{ kind: "stages", target: "self", stat: "attack", delta: 2 }] },
          { id: 33, archetype: "melee", hitbox: { shape: "arc", radiusPx: 20, angleDeg: 90 }, effects: [{ kind: "damage" }] },
          { id: 52, archetype: "projectile", effects: [{ kind: "damage" }, { kind: "status", status: "burn" }] },
        ]),
        "m.json",
      ).ok,
    ).toBe(true);
    expect(
      parseCombatFile(
        "statuses",
        envelope("statuses", [{ id: "burn", durationS: { min: 8, max: 8 }, intervalS: 2, tickDamage: 0.125, attackMul: 0.5, immuneTypes: [10] }]),
        "s.json",
      ).ok,
    ).toBe(true);
  });

  it.each([
    ["an unknown behavior", "archetypes", envelope("archetypes", [{ id: "x", behavior: "laser", defaults: {} }]), "records.0.behavior"],
    ["hits above 10", "moves", envelope("combat-moves", [{ id: 1, archetype: "x", hits: 11, effects: [] }]), "records.0.hits"],
    ["castS above 5", "moves", envelope("combat-moves", [{ id: 1, archetype: "x", castS: 6, effects: [] }]), "records.0.castS"],
    ["a stage delta above 6", "moves", envelope("combat-moves", [{ id: 1, archetype: "x", effects: [{ kind: "stages", target: "self", stat: "attack", delta: 7 }] }]), "records.0.effects.0.delta"],
    ["a chance above 100", "moves", envelope("combat-moves", [{ id: 1, archetype: "x", effects: [{ kind: "status", status: "burn", chance: 101 }] }]), "records.0.effects.0.chance"],
    ["a negative radius", "moves", envelope("combat-moves", [{ id: 12, archetype: "x", hitbox: { shape: "circle", radiusPx: -1 }, effects: [] }]), "records.0.hitbox.radiusPx"],
    ["max duration below min", "statuses", envelope("statuses", [{ id: "sleep", durationS: { min: 4, max: 2 }, immuneTypes: [] }]), "records.0.durationS.max"],
    ["moves out of order", "moves", envelope("combat-moves", [{ id: 2, archetype: "x", effects: [] }, { id: 2, archetype: "x", effects: [] }]), "records.1.id"],
  ] as const)("rejects %s with the file and field path", (_, kind, value, path) => {
    const e = error(kind, value);
    expect(e.file).toBe(`${kind}.json`);
    expect(e.path).toBe(path);
  });
});
