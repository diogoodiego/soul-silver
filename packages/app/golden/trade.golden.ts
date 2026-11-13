// Trade evolution probe (spec 028.4, layer 3), on the real extraction: a trade between two players on one session,
// and the trade evolutions the extracted data gives. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ServerMessage } from "@soulsilver/shared/game";
import { migrate, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages } from "./obtainable";

const stages = defaultStages();
const KADABRA = 64;
const ALAKAZAM = 65;
const ONIX = 95;
const STEELIX = 208;
const PIDGEY = 16;
const METAL_COAT = 233;
/** New Bark Town (map 60), a free tile away from the houses (as in the golden path). */
const AT = { map: 60, tx: 690, ty: 402 };

if (!existsSync(join(stages, "maps"))) throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app e aponte SOULSILVER_DATA para a pasta stages.`);
const data = loadServerData(stages, () => undefined);

const member = (species: number, held?: number): PartyMember => {
  const moves = (data.progression?.levelUp(species) ?? []).filter((l) => l.level <= 40).map((l) => l.move).slice(-4);
  return { species, level: 40, moves: moves.length ? moves : [33], hp: 30, friendship: 70, experience: 40 ** 3, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0, ...(held ? { held } : {}) };
};

/** Gold trades `given` to Silver for a Pidgey and accepts every evolution offered; Silver's party afterwards, and the evolutions offered to Silver. */
function trade(given: PartyMember) {
  const session = createSession({ seed: 1, world: data.world!, log: () => undefined, clock: () => "2026-11-13T12:00:00.000Z", newToken: () => "t", combat: data.combat, companion: data.companion, progression: data.progression, items: data.items });
  const o = data.world!(String(AT.map))!.origin ?? { tx: 0, ty: 0 };
  const answers: (() => void)[] = [];
  const tick = () => {
    for (const a of answers.splice(0)) a();
    session.step();
  };
  const join_ = (name: string, party: PartyMember[]) => {
    const created = migrate({ schemaVersion: 1, name, character: "male", area: String(AT.map), x: (AT.tx - o.tx) * 16 + 8, y: (AT.ty - o.ty) * 16 + 8, facing: "south", playTimeMs: 0, savedAt: "2026-11-13T12:00:00.000Z", rev: 0 });
    if (!created.ok) throw new Error(created.message);
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => {
      const msg = m as ServerMessage;
      got.push(msg);
      // Every evolution offered is accepted, as a player would: on the next tick, as a real client answers after the message.
      if (msg.type === "progression" && msg.item.kind === "evolve") answers.push(() => client.send({ type: "evolve-answer", accept: true }));
      else if (msg.type === "progression") answers.push(() => client.send({ type: "progression-ack" }));
    });
    session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...created.save, party, storyRev: 99 } satisfies Save });
    const welcome = got.find((m): m is Extract<ServerMessage, { type: "welcome" }> => m.type === "welcome");
    if (!welcome) throw new Error(`recusado: ${JSON.stringify(got.at(-1))}`);
    return { client, got, id: welcome.playerId };
  };
  const gold = join_("Gold", [member(PIDGEY), given]);
  const silver = join_("Silver", [member(PIDGEY), member(PIDGEY)]);
  const send = (c: typeof gold, msg: unknown) => {
    c.client.send(msg);
    for (let i = 0; i < 3; i++) tick();
  };
  send(gold, { type: "trade-propose", to: silver.id });
  send(silver, { type: "trade-answer", accept: true });
  send(gold, { type: "trade-offer", offer: { party: [1], items: [] } });
  send(silver, { type: "trade-offer", offer: { party: [1], items: [] } });
  for (const c of [gold, silver, gold, silver]) send(c, { type: "trade-confirm" });
  for (let i = 0; i < 40; i++) tick();
  session.close("closed-by-host");
  const phase = silver.got.filter((m): m is Extract<ServerMessage, { type: "tradeState" }> => m.type === "tradeState").at(-1)?.phase;
  const party = silver.got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save").at(-1)?.save.party ?? [];
  const evolutions = silver.got.filter((m) => m.type === "progression" && m.item.kind === "evolve").length;
  return { phase, received: party.at(-1), evolutions };
}

it("Kadabra traded becomes Alakazam", () => {
  const r = trade(member(KADABRA));
  console.log(`Kadabra: troca ${r.phase}, recebido espécie ${r.received?.species}, evoluções oferecidas ${r.evolutions}`);
  expect(r.phase).toBe("done");
  expect(r.received?.species).toBe(ALAKAZAM);
});

it("Onix traded holding a Metal Coat becomes Steelix and the Metal Coat is used up", () => {
  const r = trade(member(ONIX, METAL_COAT));
  console.log(`Onix com Metal Coat: troca ${r.phase}, recebido espécie ${r.received?.species}, item segurado ${r.received?.held ?? "nenhum"}`);
  expect(r.phase).toBe("done");
  expect(r.received?.species).toBe(STEELIX);
  expect(r.received?.held).toBeUndefined();
});

it("Onix traded without the Metal Coat stays Onix", () => {
  const r = trade(member(ONIX));
  console.log(`Onix sem item: recebido espécie ${r.received?.species}, evoluções oferecidas ${r.evolutions}`);
  expect(r.received?.species).toBe(ONIX);
  expect(r.evolutions).toBe(0);
});

it("a Pokémon with no trade evolution (Pidgey) does not evolve", () => {
  const r = trade(member(PIDGEY));
  console.log(`Pidgey: troca ${r.phase}, recebido espécie ${r.received?.species}, evoluções oferecidas ${r.evolutions}`);
  expect(r.phase).toBe("done");
  expect(r.received?.species).toBe(PIDGEY);
  expect(r.evolutions).toBe(0);
});
