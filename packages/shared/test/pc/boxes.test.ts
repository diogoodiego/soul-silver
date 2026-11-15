import { describe, expect, it } from "vitest";
import { firstFree, moveMon, renameBox, store, type PcProgress } from "../../src/pc/boxes.ts";
import { newBoxes, type PartyMember } from "../../src/save/schema.ts";

// Spec 023, data-model.md "Validações": each operation checks everything before it changes anything.

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (species: number, hp = 10) => ({ species, level: 5, moves: [33], hp, friendship: 70, experience: 125, ivs: stats(31), evs: stats(0), nature: 0 });
const pc = (party = [mon(1), mon(2)]): PcProgress => ({ party, boxes: newBoxes() });

describe("PC boxes", () => {
  it("finds the first free slot", () => {
    const p = pc();
    expect(firstFree(p.boxes)).toEqual({ box: 0, index: 0 });
    p.boxes[0]!.slots[0] = mon(3);
    expect(firstFree(p.boxes)).toEqual({ box: 0, index: 1 });
    for (const b of p.boxes) b.slots.fill(mon(3));
    expect(firstFree(p.boxes)).toBeUndefined();
  });

  it("stores in the first free slot, or refuses when every box is full", () => {
    const p = pc();
    expect(store(p.boxes, mon(9))).toBe(true);
    expect(p.boxes[0]!.slots[0]).toMatchObject({ species: 9 });
    for (const b of p.boxes) b.slots.fill(mon(3));
    expect(store(p.boxes, mon(9))).toBe(false);
  });

  it("deposits a party member into an empty slot", () => {
    const p = pc();
    expect(moveMon(p, { where: "party", index: 0 }, { where: "box", box: 2, index: 5 })).toBeNull();
    expect(p.party.map((m) => m.species)).toEqual([2]);
    expect(p.boxes[2]!.slots[5]).toMatchObject({ species: 1 });
  });

  it("withdraws to the end of the party", () => {
    const p = pc();
    p.boxes[1]!.slots[3] = mon(7);
    expect(moveMon(p, { where: "box", box: 1, index: 3 }, { where: "party", index: 2 })).toBeNull();
    expect(p.party.map((m) => m.species)).toEqual([1, 2, 7]);
    expect(p.boxes[1]!.slots[3]).toBeNull();
  });

  it("moves between boxes", () => {
    const p = pc();
    p.boxes[0]!.slots[0] = mon(7);
    expect(moveMon(p, { where: "box", box: 0, index: 0 }, { where: "box", box: 17, index: 29 })).toBeNull();
    expect(p.boxes[0]!.slots[0]).toBeNull();
    expect(p.boxes[17]!.slots[29]).toMatchObject({ species: 7 });
  });

  it.each([
    ["an empty origin", (p: PcProgress) => moveMon(p, { where: "box", box: 0, index: 0 }, { where: "box", box: 0, index: 1 }), "empty"],
    ["a party index past the end", (p: PcProgress) => moveMon(p, { where: "party", index: 4 }, { where: "box", box: 0, index: 1 }), "empty"],
    ["an occupied destination", (p: PcProgress) => ((p.boxes[0]!.slots[1] = mon(8)), moveMon(p, { where: "party", index: 0 }, { where: "box", box: 0, index: 1 })), "occupied"],
    ["a withdraw to a taken party slot", (p: PcProgress) => ((p.boxes[0]!.slots[1] = mon(8)), moveMon(p, { where: "box", box: 0, index: 1 }, { where: "party", index: 0 })), "occupied"],
    ["a withdraw with a full party", (p: PcProgress) => ((p.party.push(mon(3), mon(4), mon(5), mon(6))), (p.boxes[0]!.slots[1] = mon(8)), moveMon(p, { where: "box", box: 0, index: 1 }, { where: "party", index: 6 })), "full"],
    ["a box that does not exist", (p: PcProgress) => moveMon(p, { where: "party", index: 0 }, { where: "box", box: 18, index: 0 }), "invalid"],
    ["a slot that does not exist", (p: PcProgress) => moveMon(p, { where: "party", index: 0 }, { where: "box", box: 0, index: 30 }), "invalid"],
    ["a move to the same slot", (p: PcProgress) => moveMon(p, { where: "party", index: 0 }, { where: "party", index: 0 }), "invalid"],
  ])("refuses %s without changing anything", (_, act, reason) => {
    const p = pc();
    const before = structuredClone(p);
    const result = act(p);
    expect(result).toBe(reason);
    if (reason !== "occupied" && reason !== "full") expect(p).toEqual(before);
  });

  it("an egg does not count as able to fight (spec 029.2)", () => {
    const egg: PartyMember = { ...mon(2), egg: { cycles: 20 } };
    const p = pc([mon(1), egg]);
    expect(moveMon(p, { where: "party", index: 0 }, { where: "box", box: 0, index: 0 })).toBe("last-fighter");
  });

  it("refuses to deposit the last Pokémon able to fight", () => {
    const p = pc([mon(1), mon(2, 0)]);
    const before = structuredClone(p);
    expect(moveMon(p, { where: "party", index: 0 }, { where: "box", box: 0, index: 0 })).toBe("last-fighter");
    expect(p).toEqual(before);
    expect(moveMon(p, { where: "party", index: 1 }, { where: "box", box: 0, index: 0 })).toBeNull();
  });

  it("renames a box, refusing an empty name, one over 8 characters or a missing box", () => {
    const p = pc();
    expect(renameBox(p.boxes, 3, "Bugs")).toBeNull();
    expect(p.boxes[3]!.name).toBe("Bugs");
    expect(renameBox(p.boxes, 3, "   ")).toBe("invalid");
    expect(renameBox(p.boxes, 3, "123456789")).toBe("invalid");
    expect(renameBox(p.boxes, 18, "x")).toBe("invalid");
    expect(p.boxes[3]!.name).toBe("Bugs");
  });
});
