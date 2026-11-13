import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 028.1: the server tells every client what each player is doing (combat, cutscene, menu) and where they are.

type Client = ReturnType<ReturnType<typeof setup>["connect"]>;

/** What `c` last knows of entity `id`'s presence, from spawns and deltas. */
function seenPresence(c: Client, id: number): unknown {
  let presence: unknown;
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.id === id) presence = e.data["presence"];
    for (const d of s.changed) if (d.id === id && d.data) presence = d.data["presence"];
  }
  return presence;
}

const lastPlayers = (c: Client) => c.got.filter((m): m is Extract<ServerMessage, { type: "players" }> => m.type === "players").at(-1)?.players;

const member: PartyMember = { species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.tackle.id], hp: 30, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };

function pair() {
  const t = setup({ combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area: "a", x: 160, y: 160 }) });
  const p = t.connect("Gold", undefined, { save: { party: [member] } });
  const other = t.connect("Silver");
  const send = (msg: unknown) => {
    p.conn.send(msg);
    t.session.step();
  };
  return { ...t, p, other, send, id: p.welcome!.entityId };
}

describe("presence indicators (spec 028.1)", () => {
  it("the other player sees the menu, then nothing once it closes", () => {
    const g = pair();
    g.send({ type: "menu", open: true });
    expect(seenPresence(g.other, g.id)).toBe("menu");
    g.send({ type: "menu", open: false });
    expect(seenPresence(g.other, g.id)).toBeUndefined();
  });

  it("the other player sees combat while the Pokémon is out", () => {
    const g = pair();
    g.send({ type: "input", seq: 1, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.combat });
    g.send({ type: "input", seq: 2, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    expect(seenPresence(g.other, g.id)).toBe("combat");
  });

  it("the other player sees a cutscene while a script runs", () => {
    const file = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 0, movement: { movement: "M1" } }], ["WaitMovement"], ["End"]], { M1: [{ action: "WalkNormalEast", count: 3 }] });
    const t = story(scriptData([file], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }));
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    expect(seenPresence(b, a.welcome!.entityId)).toBe("cutscene");
  });
});

describe("session list with places (spec 028.1)", () => {
  it("lists each player's area and sends it again when someone changes map", () => {
    const g = pair();
    g.session.step();
    expect(lastPlayers(g.other)?.map((p) => p.area)).toEqual(["a", "a"]);
    g.session.world.update({ ...g.session.world.get(g.id)!, area: "b" });
    g.session.step();
    expect(lastPlayers(g.other)?.find((p) => p.name === "Gold")?.area).toBe("b");
  });
});
