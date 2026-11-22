import { BUTTON } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { combatSetup, MOVES, realAction } from "./combat-fixture";

// Block C: the server judges parry, guard and dodge by what the player's screen showed (the tick a press carries), so a
// contact on a player's Pokémon waits for presses still on their way. Times are ticks; the real lagMaxS is 3 of them.

const { tackle, ember, strength } = MOVES;
const west = { x: -1, y: 0 };
const LAG = { ...realAction(), normalDamageMul: 1 };

/** A wild Sentret touching the player's Cyndaquil: its Tackle begins on tick 3 and leaves, touching, on tick 11. */
function duel(move: number = tackle.id, owner: 1 | "wild" = "wild", gap = 16) {
  const t = combatSetup(5, LAG);
  const a = t.spawn("cyndaquil", [tackle.id], { x: 0, y: 0 }, owner === "wild" ? 1 : "wild", 50);
  const b = t.spawn("sentret", [move], { x: gap, y: 0 }, owner, 50);
  const kinds = (kind: string) => t.events.filter((e) => e.kind === kind);
  /** Runs `ticks`, pressing \`buttons\` on tick \`at\` with the tick the screen showed. */
  const run = (ticks: number, press?: { at: number; buttons: number; seen: number; hold?: boolean }) => {
    const hits: number[] = [];
    for (let tick = 1; tick <= ticks; tick++) {
      if (tick === 3) t.press(b, 1, west);
      const on = press && (tick === press.at || (press.hold === true && tick > press.at));
      t.combat.input(a, { move: { x: 0, y: 0 }, buttons: on ? press.buttons : 0, ...(tick === press?.at ? { seen: press.seen } : {}) });
      const before = t.events.length;
      t.step();
      if (t.events.slice(before).some((e) => e.kind === "hit" && e.target === a)) hits.push(tick);
    }
    return hits;
  };
  return { t, a, b, ca: t.combat.get(a)!, kinds, run };
}

describe("contacts on a player's Pokémon", () => {
  it("land 0.1 s late, so a press made in time can still arrive", () => {
    expect(duel().run(14)).toEqual([13]);
  });

  it("land at once on a CPU's", () => {
    expect(duel(tackle.id, 1).run(14)).toEqual([11]);
  });

  it("land all the same when the attacker faints meanwhile, and a drain does not bring it back", () => {
    const d = duel();
    d.run(11);
    d.t.combat.get(d.b)!.hp = 0;
    d.t.step(2);
    expect(d.kinds("hit")).toHaveLength(1);
    expect(d.t.combat.get(d.b)!.hp).toBe(0);
  });

  it("are dropped when either side is gone", () => {
    for (const gone of ["a", "b"] as const) {
      const d = duel();
      d.run(11);
      d.t.combat.remove(d.t.world, d[gone]);
      d.t.step(4);
      expect(d.kinds("hit")).toHaveLength(0);
    }
  });

  it("count for the attacker's combo once they land", () => {
    const d = duel();
    d.run(12);
    expect(d.t.combat.get(d.b)!.combo.count).toBe(0);
    d.t.step();
    expect(d.t.combat.get(d.b)!.combo.count).toBe(1);
  });
});

describe("parry by what the screen showed", () => {
  it.each([
    // The last tick of the charge on screen, pressed there, arriving 1 to 3 ticks later.
    { seen: 10, at: 11, parried: true },
    { seen: 10, at: 12, parried: true },
    { seen: 10, at: 13, parried: true },
    // The move had already left on screen.
    { seen: 11, at: 12, parried: false },
    // Later than lagMaxS: judged as of 3 ticks ago at most, when it had left.
    { seen: 5, at: 14, parried: false },
    // Before the charge showed.
    { seen: 2, at: 2, parried: false },
  ])("seen on tick $seen and arrived on $at: $parried", ({ seen, at, parried }) => {
    const { run, kinds } = duel();
    run(16, { at, buttons: BUTTON.guard, seen });
    expect(kinds("parried")).toHaveLength(parried ? 1 : 0);
    expect(kinds("hit")).toHaveLength(parried ? 0 : 1);
  });

  it("holds for a shot already flying", () => {
    const { run, kinds } = duel(ember.id, "wild", 60);
    run(40, { at: 13, buttons: BUTTON.guard, seen: 10 });
    expect(kinds("parried")).toHaveLength(1);
  });

  it("never parries a special", () => {
    const { run, kinds } = duel(strength.id);
    run(30, { at: 20, buttons: BUTTON.guard, seen: 18 });
    expect(kinds("parried")).toHaveLength(0);
    expect(kinds("hit").length + kinds("missed").length).toBe(1);
  });
});

describe("dodge and guard by what the screen showed", () => {
  it.each([
    { seen: 10, at: 13, evaded: true },
    { seen: 11, at: 12, evaded: true },
    { seen: 12, at: 13, evaded: false },
  ])("a dodge seen on tick $seen, arrived on $at, against a contact on 11: $evaded", ({ seen, at, evaded }) => {
    const { run, kinds } = duel();
    run(16, { at, buttons: BUTTON.dash, seen });
    expect(kinds("evaded")).toHaveLength(evaded ? 1 : 0);
    expect(kinds("hit")).toHaveLength(evaded ? 0 : 1);
  });

  it("a guard raised once it had touched on screen takes it all", () => {
    const amount = (press?: { at: number; buttons: number; seen: number; hold: boolean }) => {
      const { run, kinds } = duel();
      run(16, press);
      expect(kinds("parried")).toHaveLength(0);
      return kinds("hit")[0]!.amount;
    };
    const full = amount();
    expect(amount({ at: 13, buttons: BUTTON.guard, seen: 12, hold: true })).toBe(full);
    expect(amount({ at: 12, buttons: BUTTON.guard, seen: 11, hold: true })).toBe(Math.max(1, Math.floor(full * 0.2)));
  });
});
