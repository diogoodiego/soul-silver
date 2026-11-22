import { describe, expect, it } from "vitest";
import { arenaSetup, at, FLAG_BASE, POTION, trainer } from "./trainer-fixture";

// Item 033.5: trainer battles one after the other, as the Kimono Girls' (map 86) and the Elite Four's (maps 301–305): no
// Pokémon Center between them, items between and during them, and a loss midway blacks out and ends the sequence. Synthetic.

/** Battles `ids` in a row; a loss runs WhiteOut and ends the script, as 928:59 does (L71). */
const inARow = (ids: number[]) => [
  "L1:",
  ...ids.flatMap((id) => [
    ["TrainerBattle", { trainer: { trainer: id }, arg1: 0, arg2: 0, arg3: 0 }],
    ["CheckBattleWon", { var: { variable: 0x4001 } }],
    ["CompareVarToValue", { var: { variable: 0x4001 }, val: 0 }],
    ["GoToIf", { condition: 1, dest: { label: "L2" } }],
  ]),
  ["End"],
  "L2:",
  ["WhiteOut"],
  ["End"],
];

/** The Elite Four's rooms: each talk is the next battle (0x4002 counts them), so the player walks between them. */
const room = (ids: number[]) => [
  "L1:",
  ...ids.flatMap((id, n) => [
    ["CompareVarToValue", { var: { variable: 0x4002 }, val: n }],
    ["GoToIf", { condition: 1, dest: { label: `R${n}` } }],
  ]),
  ["End"],
  ...ids.flatMap((id, n) => [`R${n}:`, ["TrainerBattle", { trainer: { trainer: id }, arg1: 0, arg2: 0, arg3: 0 }], ["SetVar", { var: { variable: 0x4002 }, value: n + 1 }], ["End"]]),
];

function sequence(script: unknown[], bag: { item: number; count: number }[] = []) {
  const t = arenaSetup({ trainers: [trainer(1, ["sentret"]), trainer(2, ["sentret"]), trainer(3, ["sentret"])], script: script as never, spawns: [{ x: at(0), y: at(1) }] });
  const a = t.join(undefined, { facing: "north", bag });
  t.step();
  const mine = () => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(a.welcome!.playerId));
  const started = () => t.of(a, "trainerBattleStart").map((m) => m.trainerId);
  /** Steps until the next battle is on, then knocks out the trainer's Pokémon. */
  const win = () => {
    for (let i = 0; i < 60 && t.foes().length === 0; i++) t.step();
    t.knockOut();
    t.step(45);
  };
  return { t, a, mine, started, win };
}

describe("trainer battles in a row (item 033.5)", () => {
  it("fights every battle of the sequence with the HP the last one left, and marks each trainer", () => {
    const { t, a, mine, started, win } = sequence(inARow([1, 2, 3]));
    t.press(a, t.BUTTON.interact);
    for (let i = 0; i < 60 && !mine(); i++) t.step();
    t.session.combat!.get(mine()!.id)!.hp = 25;
    win();
    // No Center between them: the next battle starts with what the last one left.
    for (let i = 0; i < 60 && !mine(); i++) t.step();
    expect(t.session.combat!.get(mine()!.id)!.hp).toBe(25);
    win();
    win();
    expect(started()).toEqual([1, 2, 3]);
    expect(t.of(a, "trainerBattleEnd").map((m) => m.result)).toEqual(["won", "won", "won"]);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual(expect.arrayContaining([FLAG_BASE + 1, FLAG_BASE + 2, FLAG_BASE + 3]));
  });

  it("a loss midway blacks out and ends the sequence; talking again starts it from its first battle", () => {
    const { t, a, mine, started, win } = sequence(inARow([1, 2, 3]));
    t.press(a, t.BUTTON.interact);
    win();
    for (let i = 0; i < 60 && !mine(); i++) t.step();
    t.session.combat!.get(mine()!.id)!.hp = 0;
    t.step(70);
    expect(t.of(a, "blackout")).toHaveLength(1);
    expect(started()).toEqual([1, 2]);
    expect(t.of(a, "trainerBattleEnd").map((m) => m.result)).toEqual(["won", "lost"]);
    t.session.close("closed-by-host");
    const flags = a.saves().at(-1)!.save.flags;
    expect(flags).toContain(FLAG_BASE + 1);
    expect(flags).not.toContain(FLAG_BASE + 2);
    expect(flags).not.toContain(FLAG_BASE + 3);
  });

  it("items work during a battle and between two of them", () => {
    const { t, a, mine, win } = sequence(room([1, 2]), [{ item: POTION, count: 5 }]);
    t.press(a, t.BUTTON.interact);
    for (let i = 0; i < 60 && !mine(); i++) t.step();
    const fighting = t.session.combat!.get(mine()!.id)!;
    fighting.hp = 10;
    a.conn.send({ type: "use-item-combat", item: POTION });
    t.step(40);
    expect(fighting.hp).toBeGreaterThan(10);
    const before = fighting.hp;
    win();
    t.step(10);
    // Back from the battle, before the next room: a Potion from the bag on the field.
    a.conn.send({ type: "use-item", item: POTION, partyIndex: 0 });
    t.step(5);
    t.press(a, t.BUTTON.interact);
    for (let i = 0; i < 60 && !mine(); i++) t.step();
    expect(t.session.combat!.get(mine()!.id)!.hp).toBeGreaterThan(before);
    win();
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.bag.find((b) => b.item === POTION)?.count).toBe(3);
  });
});
