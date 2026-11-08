import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { at, mon, townStory, wildOptions } from "./field-fixture";

// Spec 025 US4 (FR-014, FR-015): the bicycle outdoors only, faster than running, with the companion
// in its ball; Fly lists only this player's visited fly points and lands on them.

const BICYCLE = 450;
const FLY = 19;
const STORM = 1 << 4;

type Test = ReturnType<typeof townStory>;
type Client = ReturnType<Test["connect"]>;

function scene(save: object, area = "60", players = 1) {
  const t = townStory({ ...wildOptions(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area, x: at(8), y: at(12) }) });
  const clients = Array.from({ length: players }, (_, i) => t.connect(String.fromCharCode(65 + i), undefined, { save }));
  t.step(3);
  return { t, a: clients[0]!, clients };
}

const me = (t: Test, c: Client) => t.entity(c.welcome!.entityId)!;
const companion = (t: Test, c: Client) => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(c.welcome!.playerId));
const last = <T extends Parameters<Test["of"]>[1]>(t: Test, c: Client, type: T) => t.of(c, type).at(-1);
let seq = 1000;
/** Pixels moved west in 10 ticks. */
function distance(t: Test, c: Client, run: boolean) {
  const x = me(t, c).x;
  for (let i = 0; i < 10; i++) {
    c.conn.send({ type: "input", seq: ++seq, move: { x: -1, y: 0 }, run, buttons: 0 });
    t.step();
  }
  return x - me(t, c).x;
}

describe("bicycle (spec 025)", () => {
  const rider = { party: [mon([33])], bag: [{ item: BICYCLE, count: 1 }] };

  it("rides outdoors faster than running, with the companion in its ball", () => {
    const { t, a } = scene(rider);
    const running = distance(t, a, true);
    expect(companion(t, a)).toBeDefined();
    a.conn.send({ type: "field-mount", mode: "bike" });
    t.step(2);
    expect(last(t, a, "field-result")).toMatchObject({ ok: true });
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "bike" });
    expect(companion(t, a)).toBeUndefined();
    expect(distance(t, a, false)).toBeGreaterThan(running);
    a.conn.send({ type: "field-dismount" });
    t.step(3);
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "walk" });
    expect(companion(t, a)).toBeDefined();
  });

  it("is refused indoors and without the bicycle", () => {
    for (const [save, area, reason] of [
      [rider, "61", "indoors"],
      [rider, "34", "indoors"],
      [{ ...rider, bag: [] }, "60", "notAllowed"],
    ] as const) {
      const { t, a } = scene(save, area);
      a.conn.send({ type: "field-mount", mode: "bike" });
      t.step(2);
      expect(last(t, a, "field-result"), reason).toMatchObject({ ok: false, reason });
      expect(me(t, a).data["mode"]).toBeUndefined();
    }
  });

  it("gets off on entering a building", () => {
    const { t, a } = scene(rider);
    a.conn.send({ type: "field-mount", mode: "bike" });
    t.step(2);
    t.session.world.update({ ...me(t, a), area: "61" });
    t.step(2);
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "walk" });
  });
});

describe("Fly (spec 025)", () => {
  const flyer = { party: [mon([33, FLY])], badgeSet: STORM, flyPoints: ["60"] };

  it("lists only this player's visited fly points", () => {
    const { t, clients } = scene(flyer, "60", 2);
    const [a, b] = clients as [Client, Client];
    a.conn.send({ type: "field-use", move: "fly" });
    t.step();
    expect(last(t, a, "field-fly-map")).toEqual({ type: "field-fly-map", points: [{ area: "60", flypoint: 11 }] });
    expect(t.of(b, "field-fly-map")).toHaveLength(0);
  });

  it("opens from the menu: the menu closes, then Fly is asked for, in the same tick", () => {
    const { t, a } = scene(flyer);
    a.conn.send({ type: "menu", open: true });
    t.step();
    a.conn.send({ type: "menu", open: false });
    a.conn.send({ type: "field-use", move: "fly" });
    t.step();
    expect(t.of(a, "field-result")).toEqual([]);
    expect(last(t, a, "field-fly-map")?.points).toHaveLength(1);
  });

  it("is refused without the badge, without the move, or indoors", () => {
    for (const [save, area, reason] of [
      [{ ...flyer, badgeSet: 0 }, "60", "badge"],
      [{ ...flyer, party: [mon([33])] }, "60", "move"],
      [flyer, "61", "notHere"],
      [flyer, "34", "notHere"],
    ] as const) {
      const { t, a } = scene(save, area);
      a.conn.send({ type: "field-use", move: "fly" });
      t.step();
      expect(last(t, a, "field-result"), reason).toMatchObject({ ok: false, reason });
      expect(t.of(a, "field-fly-map")).toHaveLength(0);
    }
  });

  it("flies only to a visited point, and lands on it", () => {
    const { t, a } = scene(flyer, "33");
    a.conn.send({ type: "field-fly", area: "61" });
    t.step();
    expect(last(t, a, "field-result")).toMatchObject({ ok: false, reason: "notVisited" });
    a.conn.send({ type: "field-fly", area: "60" });
    t.step();
    expect(last(t, a, "field-result")).toMatchObject({ ok: true });
    expect(me(t, a)).toMatchObject({ area: "60", x: at(8), y: at(8) });
  });

  it("adds a fly point on entering its map", () => {
    const { t, a } = scene({ ...flyer, flyPoints: [] }, "33");
    t.step();
    a.conn.send({ type: "field-use", move: "fly" });
    t.step();
    expect(last(t, a, "field-fly-map")).toEqual({ type: "field-fly-map", points: [{ area: "33", flypoint: 3 }] });
  });
});

describe("field moves from the water (spec 025)", () => {
  const surfer = { party: [mon([57, FLY, 148])], badgeSet: STORM | (1 << 3), flyPoints: ["60"] };
  /** On "35" or "74", at the edge (8, 9), surfing onto row 10. */
  function afloat(area: string) {
    const t = townStory({ ...wildOptions(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area, x: at(8), y: at(9) }) });
    const a = t.connect("A", undefined, { save: surfer });
    t.step(3);
    a.conn.send({ type: "field-mount", mode: "surf" });
    t.step(2);
    expect(me(t, a).data["mode"]).toBe("surf");
    return { t, a };
  }

  it("flies off the water, and lands walking", () => {
    const { t, a } = afloat("35");
    a.conn.send({ type: "field-use", move: "fly" });
    t.step();
    expect(last(t, a, "field-fly-map")?.points).toHaveLength(1);
    a.conn.send({ type: "field-fly", area: "60" });
    t.step(2);
    expect(me(t, a)).toMatchObject({ area: "60", x: at(8), y: at(8) });
    expect(me(t, a).data["mode"]).toBeUndefined();
  });

  it("lights a dark cave from the water and keeps surfing", () => {
    const { t, a } = afloat("74");
    a.conn.send({ type: "field-use", move: "flash" });
    t.step();
    expect(last(t, a, "field-lit")).toEqual({ type: "field-lit", lit: true });
    expect(me(t, a).data["mode"]).toBe("surf");
  });
});
