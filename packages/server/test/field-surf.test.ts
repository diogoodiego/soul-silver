import { describe, expect, it } from "vitest";
import { BUTTON } from "@soulsilver/shared/game";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { SPECIES } from "./combat-fixture";
import { at, fieldStory, mon, wildOptions } from "./field-fixture";

// Spec 025 US2 (FR-008, FR-009): Surf from the water's edge with the Fog Badge and the move; the
// companion goes back to its ball; while surfing only aquatic, flying and levitating Pokémon fight.

const SURF = 57;
const FOG = 1 << 3;
/** Rows 5 and below are water. */
const WATER = Object.fromEntries(Array.from({ length: 16 * 11 }, (_, i) => [`${i % 16},${5 + Math.floor(i / 16)}`, 0x10]));

type Test = ReturnType<typeof fieldStory>;
type Client = ReturnType<Test["connect"]>;

function scene(save: object, spawnY = 4) {
  const t = fieldStory([], WATER, { ...wildOptions(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area: "60", x: at(3), y: at(spawnY) }) });
  const a = t.connect("A", undefined, { save });
  t.step(3);
  return { t, a };
}

const me = (t: Test, c: Client) => t.entity(c.welcome!.entityId)!;
const companion = (t: Test, c: Client) => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === String(c.welcome!.playerId));
const last = <T extends Parameters<Test["of"]>[1]>(t: Test, c: Client, type: T) => t.of(c, type).at(-1);
const tile = (px: number) => Math.floor(px / 16);

function mount(t: Test, a: Client) {
  a.conn.send({ type: "field-mount", mode: "surf" });
  t.step(2);
}

describe("surfing (spec 025)", () => {
  const surfer = { party: [mon([33, SURF]), mon([33], SPECIES.hoothoot.id)], badgeSet: FOG };

  it("mounts from the water's edge, puts the companion in its ball and moves on the water only", () => {
    const { t, a } = scene(surfer);
    expect(companion(t, a)).toBeDefined();
    mount(t, a);
    expect(last(t, a, "field-result")).toMatchObject({ ok: true });
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "surf" });
    expect(me(t, a).data["mode"]).toBe("surf");
    expect(tile(me(t, a).y)).toBe(5);
    expect(companion(t, a)).toBeUndefined();
    t.walk(a, { x: 0, y: 1 }, 20);
    expect(tile(me(t, a).y)).toBeGreaterThan(5);
    // Land is a wall while surfing.
    t.walk(a, { x: 0, y: -1 }, 40);
    expect(tile(me(t, a).y)).toBe(5);
  });

  it("dismounts on the land's edge and the companion comes back", () => {
    const { t, a } = scene(surfer);
    mount(t, a);
    t.walk(a, { x: 0, y: -1 }, 4);
    a.conn.send({ type: "field-dismount" });
    t.step(3);
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "walk" });
    expect(me(t, a).data["mode"]).toBeUndefined();
    expect(tile(me(t, a).y)).toBe(4);
    expect(companion(t, a)).toBeDefined();
  });

  it("is refused without the badge, without the move, or away from the water", () => {
    const cases: [object, number, string][] = [
      [{ ...surfer, badgeSet: 0 }, 4, "badge"],
      [{ ...surfer, party: [mon([33])] }, 4, "move"],
      [surfer, 2, "notHere"],
    ];
    for (const [save, y, reason] of cases) {
      const { t, a } = scene(save, y);
      mount(t, a);
      expect(last(t, a, "field-result")).toMatchObject({ ok: false, reason });
      expect(me(t, a).data["mode"]).toBeUndefined();
    }
  });

  it("refuses to dismount onto water", () => {
    const { t, a } = scene(surfer);
    mount(t, a);
    t.walk(a, { x: 0, y: 1 }, 4);
    a.conn.send({ type: "field-dismount" });
    t.step(2);
    expect(last(t, a, "field-result")).toMatchObject({ ok: false, reason: "notHere" });
    expect(me(t, a).data["mode"]).toBe("surf");
  });

  it("marks the launchable members and launches only those", () => {
    const { t, a } = scene(surfer);
    mount(t, a);
    expect(last(t, a, "field-launchable")).toMatchObject({ launchable: [false, true] });
    // The combat button sends out the first one that may fight on the water: Hoothoot, not the lead.
    a.conn.send({ type: "input", seq: 900, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
    t.step(2);
    expect(companion(t, a)?.data["species"]).toBe(SPECIES.hoothoot.id);
    a.conn.send({ type: "swap", partyIndex: 0 });
    t.step(2);
    expect(companion(t, a)?.data["species"]).toBe(SPECIES.hoothoot.id);
    expect(last(t, a, "notice")).toMatchObject({ code: "launch-refused" });
  });

  it("sends the launchable members again when the party changes on the water", () => {
    const { t, a } = scene(surfer);
    mount(t, a);
    a.conn.send({ type: "reorder-party", from: 1, to: 0 });
    t.step(2);
    expect(last(t, a, "field-launchable")).toMatchObject({ launchable: [true, false] });
  });

  it("a flying Pokémon fights across the water", () => {
    const { t, a } = scene(surfer);
    mount(t, a);
    a.conn.send({ type: "input", seq: 900, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
    t.step(12);
    const y = companion(t, a)!.y;
    for (let seq = 901; seq < 921; seq++) {
      a.conn.send({ type: "input", seq, move: { x: 0, y: 1 }, run: false, buttons: 0 });
      t.step();
    }
    expect(companion(t, a)!.y).toBeGreaterThan(y + 16);
  });

  it("a party with nothing launchable does not fight on the water", () => {
    const { t, a } = scene({ ...surfer, party: [mon([33, SURF])] });
    mount(t, a);
    a.conn.send({ type: "input", seq: 900, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
    t.step(2);
    expect(companion(t, a)).toBeUndefined();
    expect(last(t, a, "notice")).toMatchObject({ code: "launch-refused" });
  });
});
