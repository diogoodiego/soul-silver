// The item use scenarios of the spec 027 probe (layer 3), shared by items.golden.ts (each item on a fresh save) and
// campaign.golden.ts (each item in the bag at the end of the golden path, on that save).
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import { useEffectOf } from "@soulsilver/shared/items";
import { applyNewGame, migrate, type NewGameStart, type PartyMember, type Save } from "@soulsilver/shared/save";
import { bundledItemRules, createMemoryConnectionPair, createSession } from "@soulsilver/server";
import type { loadServerData } from "../src/server-host/server-data";

const CYNDAQUIL = 155;
const RARE_CANDY = 50;
/** HOLD_EFFECT_NO_EVOLVE: the Everstone (spec 030.1). */
const NO_EVOLVE = 64;
const FLASH_TM = 397;

export function itemProbe(data: ReturnType<typeof loadServerData>, start: NewGameStart) {
/** A session on the real data with one player, the debugger on and every script request answered with 0. */
  function play(save: Partial<Save>) {
  const session = createSession({
    seed: 7,
    world: data.world!,
    log: () => undefined,
    clock: () => "2026-11-07T12:00:00.000Z",
    newToken: () => "Itens",
    combat: data.combat,
    companion: data.companion,
    progression: data.progression,
    items: data.items,
    wild: data.wild,
    scripts: data.scripts,
    devTools: true,
    now: () => new Date(2026, 10, 7, 12),
  });
  const created = migrate({ schemaVersion: 1, name: "Itens", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-07T12:00:00.000Z", rev: 0 });
  if (!created.ok) throw new Error(created.message);
  const [server, client] = createMemoryConnectionPair();
  const got: ServerMessage[] = [];
  client.onMessage((m) => {
    const msg = m as ServerMessage;
    got.push(msg);
    if (msg.type === "script") client.send({ type: "script-answer", id: msg.id, ...(msg.request.kind === "say" || msg.request.kind === "cutscene" || msg.request.kind.startsWith("wait") ? {} : { answer: 0 }) });
  });
  session.connect(server);
  client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save: { ...applyNewGame(created.save, start), storyRev: 1, ...save } });
  client.send({ type: "debugScript", on: true });
  let seq = 0;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) session.step();
  };
  step();
  const last = <T extends ServerMessage["type"]>(type: T) => got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1);
  return {
    session,
    got,
    step,
    last,
    send(msg: unknown, n = 2) {
      client.send(msg);
      step(n);
    },
    press(buttons: number) {
      client.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons });
      step();
      client.send({ type: "input", seq: ++seq, move: { x: 0, y: 0 }, run: false, buttons: 0 });
      step();
    },
    bag: () => last("bag")?.items ?? [],
    party: () => last("party")?.members ?? [],
    controlled: () => last("control")?.entityId,
    close: () => session.close("closed-by-host"),
  };
}

const member = (species: number, level: number): PartyMember => {
  const moves = (data.progression?.levelUp(species) ?? []).filter((l) => l.level <= level).map((l) => l.move).slice(-4);
  return { species, level, moves: moves.length ? moves : [33], hp: 30, friendship: 70, experience: level ** 3, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
};

  const rules = bundledItemRules();
  const flashLearner = [...Array(251).keys()].map((i) => i + 1).find((sp) => data.progression?.machines(sp).includes(FLASH_TM - 327));

  /** Uses `item` the way its effect calls for and checks it worked; the failure, or undefined. `base`: the save to start from. */
  function scenario(item: number, base?: Partial<Save>): string | undefined {
    const r = data.items?.item(item);
    const effect = r ? useEffectOf(r, rules.effects) : undefined;
    const held = r?.holdEffect?.id ? rules.effects.held[String(r.holdEffect.id)] : undefined;
    let failed: string | undefined;
    const g = play(base ?? { bag: [{ item, count: 3 }], party: [member(item === FLASH_TM && flashLearner ? flashLearner : CYNDAQUIL, 12), member(CYNDAQUIL, 10)] });
    const had = g.bag().find((b) => b.item === item)?.count ?? 0;
    const fight = () => {
      g.press(BUTTON.combat);
      return g.controlled();
    };
    switch (effect?.archetype) {
      case "heal": {
        g.send({ type: "debugSetHp", hp: 1 });
        g.send({ type: "use-item", item, partyIndex: 0 });
        if ((g.party()[0]?.hp ?? 0) <= 1) failed = "o HP não subiu";
        break;
      }
      case "cure": {
        const id = fight();
        g.send({ type: "debugSetStatus", status: effect.cures[0]! });
        g.send({ type: "use-item-combat", item }, 50);
        const e = id === undefined ? undefined : g.session.world.get(id);
        if (!e || e.data["status"] !== "") failed = `o status ${effect.cures[0]} ficou`;
        break;
      }
      case "pp-ether": {
        const id = fight();
        // Block C: the first special (slot 3) goes on cooldown, and the Ether or Elixir ends it.
        g.press(1 << 2);
        g.step(20);
        g.send({ type: "use-item-combat", item }, 40);
        const cd = id === undefined ? undefined : g.session.world.get(id)?.data["cd3"];
        if (cd === undefined) failed = "o Pokémon não tem golpe especial";
        else if (Number(cd) !== 0) failed = "o cooldown do especial não zerou";
        break;
      }
      case "battle-stat": {
        const id = fight();
        g.send({ type: "use-item-combat", item }, 40);
        const stat = Object.keys(effect.stages)[0];
        if (id === undefined || !stat || !g.session.world.get(id)?.data[`stg_${stat}`]) failed = `o estágio ${stat} não subiu`;
        break;
      }
      case "pp-up":
        g.send({ type: "use-item", item, partyIndex: 0, moveIndex: 0 });
        if (!g.party()[0]?.ppUps?.[0]) failed = "o PP Up não contou";
        break;
      case "rare-candy":
        g.send({ type: "use-item", item, partyIndex: 0 }, 3);
        if (g.last("progression")?.item.kind !== "level-up") failed = "nenhum nível na fila";
        break;
      case "teach": {
        // A member that learns it; with none in the party, the machine must be refused and kept.
        const machine = item - 327;
        const party = g.party();
        const who = party.findIndex((m) => data.progression?.machines(m.species).includes(machine) && !m.moves?.includes(data.progression.machine(machine)?.move ?? 0));
        if (who === -1 && !base) failed = flashLearner ? "nenhum membro aprende a MT" : "nenhuma espécie aprende a MT nos dados";
        else if (who === -1) {
          g.send({ type: "use-item", item, partyIndex: 0 }, 3);
          if (g.last("notice")?.code !== "item-not-compatible" || !g.bag().some((b) => b.item === item && b.count === had)) failed = "a MT incompatível não foi recusada e mantida";
        } else {
          g.send({ type: "use-item", item, partyIndex: who }, 3);
          if (g.last("progression")?.item.kind !== "learn") failed = "o golpe não entrou na fila";
        }
        break;
      }
      case "repel":
        g.send({ type: "use-item", item, partyIndex: 0 });
        if (!g.last("items-state")?.repelEndsAt) failed = "o Repel não começou";
        break;
      case "escape-rope": {
        // The Dark Cave (map 110), by its Violet side's warp; the rope leads to the last spot outdoors (spec 025).
        g.send({ type: "debugWarp", map: 110, tx: 15, ty: 27 }, 4);
        g.send({ type: "use-item", item, partyIndex: 0 }, 20);
        const me = g.session.world.all().find((e) => e.kind === "player");
        if (g.bag().some((b) => b.item === item && b.count === had) || me?.area === "110") failed = "a corda não tirou o jogador da caverna";
        break;
      }
      case "ball":
        g.send({ type: "select-ball", item });
        if (g.last("bag")?.selected !== item) failed = "a bola não ficou pronta para arremessar";
        break;
      case "none":
        if (effect.reason === "sell" && !((r?.price ?? 0) > 0)) failed = "item de venda sem preço";
        if (item === 468) {
          g.send({ type: "use-item", item, partyIndex: 0 });
          if (!g.last("apricorn-box")) failed = "a Caixa de Apricorns não abriu";
        }
        break;
      default:
        if (r?.holdEffect?.id === NO_EVOLVE) {
          // Spec 030.1: held by a Cyndaquil at 13, a Rare Candy takes it to 14, Quilava's level, with no evolution.
          const e = play({ bag: [{ item, count: 1 }, { item: RARE_CANDY, count: 1 }], party: [member(CYNDAQUIL, 13)] });
          e.send({ type: "set-held", partyIndex: 0, item });
          e.send({ type: "use-item", item: RARE_CANDY, partyIndex: 0 });
          const levelled = e.last("progression")?.item.kind === "level-up";
          e.send({ type: "progression-ack" });
          if (e.party()[0]?.held !== item) failed = "não ficou segurado";
          else if (!levelled) failed = "o Rare Candy não subiu o nível";
          else if (e.last("progression")?.item.kind === "evolve") failed = "evoluiu segurando a Everstone";
          e.close();
        } else if (held && held.trigger !== "none") {
          g.send({ type: "set-held", partyIndex: 0, item });
          if (g.party()[0]?.held !== item) failed = "não ficou segurado";
        } else failed = "sem cenário";
    }
    g.close();
    return failed;
  }

  /** "heal", "hp-threshold"…: what the probe calls the item in its report. */
  const kind = (item: number) => {
    const r = data.items?.item(item);
    return (r && useEffectOf(r, rules.effects)?.archetype) ?? (r?.holdEffect?.id ? rules.effects.held[String(r.holdEffect.id)]?.trigger : undefined) ?? "?";
  };
  return { play, member, scenario, kind };
}
