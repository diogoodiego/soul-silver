import { describe, expect, it } from "vitest";
import { at, fieldStory, mon, obstacle } from "./field-fixture";

// Spec 025 US1 (FR-003, FR-005, FR-006): the tree's own script asks, checks the badge and the move, and
// cuts it for the player who used Cut only; it grows back when that player leaves the map.

const CUT = 15;
const HIVE = 1 << 1;
const tree = obstacle(4, 1, 2, 10000);

type Test = ReturnType<typeof fieldStory>;
type Client = ReturnType<Test["connect"]>;

/** Person ids this client sees, from the spawn and remove lists it got. */
function seen(t: Test, c: Client): number[] {
  const ids = new Set<number>();
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc") ids.add(e.id);
    for (const id of s.removed) ids.delete(id);
  }
  return [...ids].map((id) => t.entity(id)?.data["person"] as number);
}

const player = (t: Test, c: Client) => t.entity(c.welcome!.entityId)!;

/** Talks to the tree and answers every message and the question with `yes`. */
function talk(t: Test, c: Client, yes = true) {
  t.press(c);
  for (let answered = 0; t.of(c, "script").length > answered; answered++) {
    const asked = t.of(c, "script").at(-1)!;
    c.conn.send({ type: "script-answer", id: asked.id, answer: asked.request.kind === "yes-no" && !yes ? 1 : 0 });
    t.step(12);
  }
}

function scene(save: object) {
  const t = fieldStory([tree], {}, { devTools: true, spawn: (n) => ({ area: "60", x: at(n === 1 ? 1 : 4), y: at(1) }) });
  const a = t.connect("A", undefined, { save });
  const b = t.connect("B");
  t.step(2);
  return { t, a, b };
}

describe("cutting a tree (spec 025)", () => {
  it("clears the tree for the player who cut it and only them", () => {
    const { t, a, b } = scene({ party: [mon([33, CUT])], badgeSet: HIVE });
    expect(seen(t, a)).toContain(4);
    talk(t, a);
    expect(t.of(a, "script").map((m) => m.request.kind)).toEqual(["say", "yes-no"]);
    expect(seen(t, a)).not.toContain(4);
    expect(seen(t, b)).toContain(4);
    // A walks through where the tree stood.
    t.walk(a, { x: 0, y: 1 }, 20);
    expect(Math.floor(player(t, a).y / 16)).toBeGreaterThanOrEqual(2);
  });

  it("the tree grows back when the player leaves the map and comes back", () => {
    const { t, a } = scene({ party: [mon([CUT])], badgeSet: HIVE });
    talk(t, a);
    expect(seen(t, a)).not.toContain(4);
    a.conn.send({ type: "debugScript", on: true });
    a.conn.send({ type: "debugWarp", map: 61, tx: 1, ty: 1 });
    t.step(2);
    a.conn.send({ type: "debugWarp", map: 60, tx: 1, ty: 1 });
    t.step(2);
    expect(seen(t, a)).toContain(4);
  });

  it("without the badge or the move only the original's message shows", () => {
    for (const save of [{ party: [mon([CUT])], badgeSet: 0 }, { party: [mon([33])], badgeSet: HIVE }]) {
      const { t, a } = scene(save);
      talk(t, a);
      expect(t.of(a, "script").map((m) => m.request.kind)).toEqual(["say"]);
      expect(seen(t, a)).toContain(4);
    }
  });

  it("answering no leaves the tree", () => {
    const { t, a } = scene({ party: [mon([CUT])], badgeSet: HIVE });
    talk(t, a, false);
    expect(seen(t, a)).toContain(4);
  });

  it("a forged field-use is refused and changes nothing", () => {
    const { t, a } = scene({ party: [mon([CUT])], badgeSet: HIVE });
    a.conn.send({ type: "field-use", move: "cut", objectId: 4 });
    t.step();
    expect(t.of(a, "field-result").at(-1)).toMatchObject({ ok: false });
    expect(seen(t, a)).toContain(4);
  });
});
