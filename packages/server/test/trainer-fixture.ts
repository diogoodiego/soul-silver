// Trainer battles for the session tests (spec 022). Synthetic: made-up trainers on a 16x16 map, no ROM data (principle II).
import type { TrainerRecord } from "@soulsilver/shared/events";
import { BUTTON, type CollisionMap, type ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { buildAiData, BUNDLED_AI_CONTENT } from "../src/ai-loader";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { buildItemsData } from "../src/items";
import { buildTrainerData } from "../src/trainer-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { flatWorld, setup } from "./harness";
import { mapEvents, scriptData, scriptFile } from "./scripts-fixture";

export const POTION = 17;
/** A medicine that restores 20 HP (hpRestore reads byte 5 bit 2 and the amount in byte 13). */
const potionParams = Array.from({ length: 20 }, (_, i) => (i === 5 ? "04" : i === 13 ? "14" : "00")).join("");
export const ITEMS = buildItemsData([{ id: POTION, pocket: "medicine", partyUse: { kind: 0, params: potionParams } }]);

export const FLAG_BASE = 1360;
export const at = (t: number) => t * 16 + 8;
/** SCRIPT_DIRECTIONS order: north, south, west, east. */
export const FACING = { north: 0, south: 1, west: 2, east: 3 } as const;

export function member(species: keyof typeof SPECIES, level = 30, hp = 999): PartyMember {
  return { species: SPECIES[species].id, level, moves: [MOVES.tackle.id], hp, friendship: 70, experience: 0, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
}

export function trainer(id: number, team: (keyof typeof SPECIES)[], over: Partial<TrainerRecord> = {}): TrainerRecord {
  return {
    id,
    class: { id: 5, text: "0730:5" },
    name: `0729:${id}`,
    items: [],
    aiFlags: 0,
    doubleBattle: false,
    team: team.map((s, i) => ({ difficulty: 0, genderOverride: 0, abilityOverride: 0, level: 3 + i, species: SPECIES[s].id, form: 0, item: null, moves: [MOVES.tackle.id, 0, 0, 0], capsule: 0 })),
    ...over,
  };
}

/** A person standing on (x, z) facing `facing` who is trainer `id` and sees `sight` tiles. */
export function trainerNpc(person: number, x: number, z: number, id: number, facing: number, sight: number) {
  return { id: person, sprite: 3, movement: 0, type: 1, hideFlag: 0, script: null, facing, param: [sight, 0, 0] as [number, number, number], xRange: 0, yRange: 0, x, z, y: 0, trainer: id };
}

type Npc = ReturnType<typeof trainerNpc>;

export function arenaSetup(o: { trainers: TrainerRecord[]; npcs?: Npc[]; walls?: [number, number][]; party?: PartyMember[]; script?: Parameters<typeof scriptFile>[1]; spawns?: { x: number; y: number }[] }) {
  const walls = new Set((o.walls ?? []).map(([x, y]) => `${x},${y}`));
  const grid: CollisionMap = { width: 16, height: 16, tiles: Array.from({ length: 256 }, (_, i) => ({ category: walls.has(`${i % 16},${Math.floor(i / 16)}`) ? ("blocked" as const) : ("free" as const), raw: 0 })) };
  const files = o.script ? [scriptFile(100, o.script)] : [];
  // With a script, a person at (0, 0) runs it when talked to.
  const talker = o.script ? [{ ...trainerNpc(99, 0, 0, 0, FACING.south, 0), type: 0, trainer: null, script: { id: 1, file: 100, entry: 0 } }] : [];
  const data = scriptData(files, { 60: mapEvents({ npcs: [...(o.npcs ?? []), ...talker] as never }) });
  const ai = buildAiData(BUNDLED_AI_CONTENT);
  // Trainer t says text 0728:(10t + kind): 0 the challenge, 1 when it loses, 2 after.
  const messages = o.trainers.flatMap((t) => [0, 1, 2].map((kind) => ({ trainer: t.id, kind, text: `0728:${t.id * 10 + kind}` })));
  const trainers = buildTrainerData({ trainers: o.trainers, classes: [{ id: 5, prizeBase: 4, music: "trainer" }], messages, learnsets: [] }, ai.profiles.map((p) => p.id));
  const spawns = o.spawns ?? [{ x: at(1), y: at(1) }];
  const t = setup({
    world: flatWorld(grid),
    scripts: data,
    combat: combatData(),
    companion: buildCompanionData(BUNDLED_COMPANION_CONTENT),
    items: ITEMS,
    trainers,
    ai,
    spawn: (n) => ({ area: "60", ...spawns[(n - 1) % spawns.length]! }),
  });
  let seq = 0;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) t.session.step();
  };
  const join = (name?: string, save: Partial<Save> = {}) => t.connect(name, undefined, { save: { party: o.party ?? [member("cyndaquil")], money: 1000, ...save } });
  type Client = ReturnType<typeof join>;
  const send = (c: Client, buttons = 0, move = { x: 0, y: 0 }) => c.conn.send({ type: "input", seq: ++seq, move, run: false, buttons });
  const of = <T extends ServerMessage["type"]>(c: Client, type: T) => c.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  /** Pokémon of the trainer battles, by owner "trainer". */
  const foes = () => t.session.world.all().filter((e) => e.kind === "pokemon" && t.session.combat?.get(e.id)?.owner === "trainer");
  /** Knocks out every trainer Pokémon on the field. */
  const knockOut = () => foes().forEach((e) => (t.session.combat!.get(e.id)!.hp = 0));
  /** Steps until `c`'s own trainer battle starts (or `max` ticks), closing the challenge line as a client would; others' starts reach `c` too. */
  const untilStart = (c: Client, max = 120) => {
    for (let i = 0; i < max && !of(c, "trainerBattleStart").some((m) => m.player === c.welcome!.playerId); i++) {
      if (of(c, "trainerSpotted").length > 0) c.conn.send({ type: "trainer-ready" });
      step();
    }
  };
  /** Steps `n` ticks with `c` sending empty inputs, as a real client does: a silent one is dropped after 10 s. */
  const idle = (c: Client, n: number) => {
    for (let i = 0; i < n; i++) {
      send(c);
      step();
    }
  };
  const press = (c: Client, buttons: number) => {
    send(c, buttons);
    step();
    send(c, 0);
    step();
  };
  return { ...t, step, idle, join, send, of, foes, knockOut, untilStart, press, BUTTON };
}
