import type { CollisionMap } from "@soulsilver/shared/game";
import { newBoxes, type PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { flatWorld } from "./harness";
import { mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 023 US3: talking to a PC tile (behavior 0x83) runs the PC's common script (std 2010), whose
// storage command opens the boxes; every move is checked by the server; the script goes on after.

const PC_SCRIPT = 2010;
const pc = scriptFile(101, ["L1:", ["ScrCmd_158", { arg0: 0 }], ["SetFlag", { flag: { flag: 340 } }], ["End"]]);
const data = () => scriptData([pc], { 60: mapEvents() }, { [PC_SCRIPT]: { file: 101, entry: 0 } });

/** 16×16 free tiles with a PC at (1, 2), south of the spawn. */
function grid(): CollisionMap {
  const tiles = Array.from({ length: 256 }, () => ({ category: "free" as const, raw: 0 }));
  tiles[2 * 16 + 1] = { category: "blocked", raw: 0x8083 } as never;
  return { width: 16, height: 16, tiles };
}

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (species: number, hp = 20): PartyMember => ({ species, level: 5, moves: [33], hp, friendship: 70, experience: 125, ivs: stats(31), evs: stats(0), nature: 0 });

function atPc(save: Record<string, unknown> = { party: [mon(1), mon(2)] }) {
  const t = story(data(), { world: flatWorld(grid()) });
  const c = t.connect(undefined, undefined, { save });
  t.step();
  t.press(c);
  const saved = () => {
    t.session.close("closed-by-host");
    return c.saves().at(-1)!.save;
  };
  return { t, c, saved };
}

describe("Pokémon PC (US3)", () => {
  it("opens with the player's boxes when they talk to the PC", () => {
    const { t, c } = atPc();
    expect(t.of(c, "pcOpen").at(-1)?.boxes).toHaveLength(18);
  });

  it("deposits, moves between boxes and withdraws", () => {
    const { t, c, saved } = atPc();
    c.conn.send({ type: "pc-move", from: { where: "party", index: 0 }, to: { where: "box", box: 0, index: 0 } });
    t.step();
    expect(t.of(c, "pcResult").at(-1)).toMatchObject({ ok: true });
    c.conn.send({ type: "pc-move", from: { where: "box", box: 0, index: 0 }, to: { where: "box", box: 3, index: 7 } });
    t.step();
    expect(t.of(c, "pcResult").at(-1)!.boxes[3]!.slots[7]).toMatchObject({ species: 1 });
    c.conn.send({ type: "pc-move", from: { where: "box", box: 3, index: 7 }, to: { where: "party", index: 1 } });
    t.step();
    expect(saved().party.map((m) => m.species)).toEqual([2, 1]);
  });

  it.each([
    ["the last Pokémon able to fight", { party: [mon(1), mon(2, 0)] }, { type: "pc-move", from: { where: "party", index: 0 }, to: { where: "box", box: 0, index: 0 } }, "last-fighter"],
    ["a Pokémon that does not exist", { party: [mon(1), mon(2)] }, { type: "pc-move", from: { where: "box", box: 5, index: 5 }, to: { where: "party", index: 2 } }, "empty"],
    ["a blank box name", { party: [mon(1)] }, { type: "pc-rename", box: 0, name: "        " }, "invalid"],
  ] as const)("refuses %s and changes nothing", (_, save, msg, reason) => {
    const { t, c, saved } = atPc(save);
    c.conn.send(msg);
    t.step();
    expect(t.of(c, "pcResult").at(-1)).toMatchObject({ ok: false, reason });
    const after = saved();
    expect(after.party).toEqual(save.party);
    expect(after.boxes).toEqual(newBoxes());
  });

  it("deposits bag items into the PC and withdraws them, refusing more than the bag holds", () => {
    const { t, c, saved } = atPc({ party: [mon(1)], bag: [{ item: 17, count: 5 }] });
    c.conn.send({ type: "pc-items", dir: "deposit", item: 17, qty: 3 });
    t.step();
    expect(t.of(c, "pcResult").at(-1)).toMatchObject({ ok: true, pcItems: [{ item: 17, count: 3 }] });
    expect(t.of(c, "bag").at(-1)!.items).toEqual([{ item: 17, count: 2 }]);
    c.conn.send({ type: "pc-items", dir: "deposit", item: 17, qty: 3 });
    t.step();
    expect(t.of(c, "pcResult").at(-1)).toMatchObject({ ok: false, reason: "empty" });
    c.conn.send({ type: "pc-items", dir: "withdraw", item: 17, qty: 1 });
    t.step();
    expect(saved()).toMatchObject({ bag: [{ item: 17, count: 3 }], pcItems: [{ item: 17, count: 2 }] });
  });

  it("renames a box and keeps it in the save", () => {
    const { t, c, saved } = atPc();
    c.conn.send({ type: "pc-rename", box: 2, name: "Bugs" });
    t.step();
    expect(saved().boxes[2]!.name).toBe("Bugs");
  });

  it("refuses every request without an open PC", () => {
    const t = story(data(), { world: flatWorld(grid()) });
    const c = t.connect();
    t.step();
    c.conn.send({ type: "pc-rename", box: 0, name: "x" });
    t.step();
    expect(t.of(c, "pcResult").at(-1)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("the PC script goes on after the player logs off", () => {
    const { t, c, saved } = atPc();
    c.conn.send({ type: "pc-leave" });
    t.step();
    expect(t.of(c, "pcClose")).toHaveLength(1);
    expect(saved().flags).toContain(340);
  });
});
