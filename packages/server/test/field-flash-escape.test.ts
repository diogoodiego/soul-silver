import { describe, expect, it } from "vitest";
import { at, mon, townStory } from "./field-fixture";

// Spec 025 US4 (FR-016, FR-017): Flash lights a dark cave for this player until they leave the map;
// Dig and Escape Rope go back out the way the player came in, Teleport to the last Pokémon Center.

const FLASH = 148;
const DIG = 91;
const TELEPORT = 100;
const ESCAPE_ROPE = 78;

type Test = ReturnType<typeof townStory>;
type Client = ReturnType<Test["connect"]>;

function scene(save: object, area = "70", x = 8, y = 12) {
  const t = townStory({ spawn: () => ({ area, x: at(x), y: at(y) }) });
  const a = t.connect("A", undefined, { save });
  t.step(3);
  return { t, a };
}

const me = (t: Test, c: Client) => t.entity(c.welcome!.entityId)!;
const last = <T extends Parameters<Test["of"]>[1]>(t: Test, c: Client, type: T) => t.of(c, type).at(-1);
const use = (t: Test, a: Client, move: string) => {
  a.conn.send({ type: "field-use", move });
  t.step();
};
/** From (3, 4) on "60", one step north through the cave's door. */
function enterCave(save: object) {
  const s = scene(save, "60", 3, 4);
  s.t.walk(s.a, { x: 0, y: -1 }, 30);
  expect(me(s.t, s.a).area).toBe("70");
  return s;
}

describe("Flash (spec 025)", () => {
  it("lights a dark cave until the player leaves it", () => {
    const { t, a } = scene({ party: [mon([33, FLASH])] });
    expect(t.of(a, "field-lit")).toHaveLength(0);
    use(t, a, "flash");
    expect(last(t, a, "field-lit")).toEqual({ type: "field-lit", lit: true });
    t.session.world.update({ ...me(t, a), area: "71" });
    t.step(2);
    expect(last(t, a, "field-lit")).toEqual({ type: "field-lit", lit: false });
  });

  it("is refused in a lit cave and without the move", () => {
    for (const [save, area, reason] of [
      [{ party: [mon([33, FLASH])] }, "71", "notHere"],
      [{ party: [mon([33])] }, "70", "move"],
    ] as const) {
      const { t, a } = scene(save, area);
      use(t, a, "flash");
      expect(last(t, a, "field-result"), reason).toMatchObject({ ok: false, reason });
      expect(t.of(a, "field-lit")).toHaveLength(0);
    }
  });
});

describe("leaving a cave (spec 025)", () => {
  it("Dig goes back out the door the player came in by", () => {
    const { t, a } = enterCave({ party: [mon([33, DIG])] });
    use(t, a, "dig");
    expect(last(t, a, "field-result")).toMatchObject({ ok: true });
    expect(me(t, a)).toMatchObject({ area: "60", facing: "south" });
    expect(Math.floor(me(t, a).y / 16)).toBe(4);
  });

  it("keeps the way out in the save, so Dig still finds it after a reload inside the cave", () => {
    const { t, a } = enterCave({ party: [mon([33, DIG])] });
    t.session.close("closed-by-host");
    const saved = a.saves().at(-1)!.save;
    expect(saved.escape).toMatchObject({ area: "60", facing: "north" });
    const again = scene({ party: [mon([33, DIG])], escape: saved.escape });
    use(again.t, again.a, "dig");
    expect(me(again.t, again.a)).toMatchObject({ area: "60", facing: "south" });
    expect(Math.floor(me(again.t, again.a).y / 16)).toBe(4);
  });

  it("Escape Rope does the same and is used up", () => {
    const { t, a } = enterCave({ party: [mon([33])], bag: [{ item: ESCAPE_ROPE, count: 1 }] });
    a.conn.send({ type: "use-item", item: ESCAPE_ROPE, partyIndex: 0 });
    t.step();
    expect(me(t, a).area).toBe("60");
    expect(last(t, a, "bag")?.items.find((b) => b.item === ESCAPE_ROPE)).toBeUndefined();
  });

  it("Teleport goes to the last Pokémon Center", () => {
    const { t, a } = scene({ party: [mon([33, TELEPORT])], respawn: { area: "33", x: at(4), y: at(5) } });
    use(t, a, "teleport");
    expect(me(t, a)).toMatchObject({ area: "33", x: at(4), y: at(5) });
  });

  it("is refused in a cave whose header forbids the Escape Rope", () => {
    const { t, a } = scene({ party: [mon([33, 91])], bag: [{ item: ESCAPE_ROPE, count: 1 }] }, "72");
    use(t, a, "dig");
    expect(last(t, a, "field-result")).toMatchObject({ ok: false, reason: "notHere" });
    a.conn.send({ type: "use-item", item: ESCAPE_ROPE, partyIndex: 0 });
    t.step();
    expect(me(t, a).area).toBe("72");
  });

  it("works only in a cave", () => {
    const { t, a } = scene({ party: [mon([33, DIG, TELEPORT])], bag: [{ item: ESCAPE_ROPE, count: 1 }] }, "60");
    for (const move of ["dig", "teleport"]) {
      use(t, a, move);
      expect(last(t, a, "field-result"), move).toMatchObject({ ok: false, reason: "notHere" });
    }
    a.conn.send({ type: "use-item", item: ESCAPE_ROPE, partyIndex: 0 });
    t.step();
    expect(last(t, a, "field-result")).toMatchObject({ ok: false, reason: "notHere" });
    expect(me(t, a).area).toBe("60");
  });
});
