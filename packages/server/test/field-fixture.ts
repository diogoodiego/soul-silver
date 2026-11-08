// The field-move common scripts of file 146 rebuilt with the same commands, a map with field-move
// tiles, and players who know the moves (spec 025). Synthetic: numbers only, no ROM text (principle II).
import type { CollisionMap, WorldLookup } from "@soulsilver/shared/game";
import { classifyPermission } from "@soulsilver/shared/maps";
import { buildWildData } from "../src/wild-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";
import { wildContent } from "./wild-fixture";

type Line = Parameters<typeof scriptFile>[1][number];
const v = (id: number) => ({ variable: id });
const RESULT = 0x800c;
const FOLLOWER = 0x8005;
const SLOT = 0x8004;
const ifEq = (val: number, label: string, of = RESULT): Line[] => [
  ["CompareVarToValue", { var: v(of), val }],
  ["GoToIf", { condition: 1, dest: { label } }],
];
const go = (label: string): Line => ["GoTo", { dest: { label } }];
/** The opening every field-move script shares: move in the party, badge, question. */
const ask = (name: string, move: number, badge: number | undefined, msg: number): Line[] => [
  ["PlaySE", { arg0: 1500 }],
  ["LockAll"],
  ["GetPartySlotWithMove", { arg0: RESULT, arg1: move }],
  ["CopyVar", { dst: v(SLOT), src: v(RESULT) }],
  ...ifEq(6, `${name}No`),
  ...(badge === undefined ? [] : [["CheckBadge", { badge, var: v(RESULT) }] as Line, ...ifEq(0, `${name}No`)]),
  ["NPCMsg", { msg_id: msg }],
  ["GetMenuChoice", { arg0: RESULT }],
  ...ifEq(0, `${name}Yes`),
  ["CloseMsg"],
  go("out"),
  `${name}No:`,
  ["NPCMsg", { msg_id: msg + 1 }],
  ["WaitButton"],
  ["CloseMsg"],
  go("out"),
  `${name}Yes:`,
];

export const FIELD_FILE = scriptFile(146, [
  "L1:", // cut, talked to a tree
  ...(ask("cut", 15, 1, 0)),
  ["GetFollowPokePartyIndex", { arg0: FOLLOWER }],
  ["ScrCmd_730", { arg0: 0x8006 }],
  ["ScrCmd_183", { arg0: SLOT }],
  ["ScrCmd_560", { arg0: 0, arg1: FOLLOWER }],
  ["Wait", { frames: 7, var: v(RESULT) }],
  ["HidePerson", { arg0: 0x800d }],
  "cutWait:",
  ["Wait", { frames: 1, var: v(RESULT) }],
  ...(ifEq(0, "cutWait", FOLLOWER)),
  go("out"),
  "L2:", // rock smash
  ...(ask("smash", 249, 0, 3)),
  ["HidePerson", { arg0: 0x800d }],
  ["ReleaseAll"],
  ["RockSmashItemCheck", { arg0: 0x8007, arg1: RESULT, arg2: 0x8006 }],
  ...ifEq(1, "smashItem"),
  ["End"],
  "smashItem:",
  ["GiveItem", { arg0: v(0x8006), arg1: 1, arg2: v(RESULT) }],
  ["End"],
  "L3:", // strength, talked to a boulder
  ["StrengthFlagAction", { action: 2, var: v(RESULT) }],
  ["CompareVarToValue", { var: v(RESULT), val: 1 }],
  ["GoToIf", { condition: 5, dest: { label: "strengthOff" } }],
  ["NPCMsg", { msg_id: 10 }],
  go("out"),
  "strengthOff:",
  ...(ask("strength", 70, 2, 7)),
  ["StrengthFlagAction", { action: 1 }],
  ["NPCMsg", { msg_id: 12 }],
  ["WaitButton"],
  go("out"),
  "L4:", // rock climb, from the tile ahead
  ...(ask("climb", 431, 15, 20)),
  ["RockClimb", { arg0: SLOT }],
  go("out"),
  "L5:", // headbutt, from the tile ahead
  ...(ask("headbutt", 29, undefined, 32)),
  ["TryHeadbuttEncounter", { arg0: RESULT }],
  go("out"),
  "L6:", // waterfall, from the water
  ...(ask("waterfall", 127, 7, 24)),
  ["Waterfall", { arg0: SLOT }],
  go("out"),
  "out:",
  ["ReleaseAll"],
  ["End"],
]);

export const STD = { 10000: { file: 146, entry: 0 }, 10001: { file: 146, entry: 1 }, 10002: { file: 146, entry: 2 }, 10003: { file: 146, entry: 3 }, 10014: { file: 146, entry: 4 }, 10005: { file: 146, entry: 5 } };

/** A map object running one of the scripts above. */
export const obstacle = (id: number, x: number, z: number, script: keyof typeof STD) => ({
  id,
  sprite: 86,
  movement: 0,
  type: 0,
  hideFlag: 0,
  script: { id: script, ...STD[script] },
  facing: 0,
  param: [0, 0, 0] as [number, number, number],
  xRange: 0,
  yRange: 0,
  x,
  z,
  y: 0,
  trainer: null,
});

/** 16×16 tiles, free but for the permissions given by "x,y". */
export function fieldWorld(raw: Record<string, number> = {}): WorldLookup {
  const tiles = Array.from({ length: 256 }, (_, i) => classifyPermission(raw[`${i % 16},${Math.floor(i / 16)}`] ?? 0));
  const grid: CollisionMap = { width: 16, height: 16, tiles };
  return (id) => ({ id, levels: [grid], warps: [], neighbors: [], widthPx: 256, heightPx: 256, areaType: "outdoor", encounters: 1 });
}

export const at = (t: number) => t * 16 + 8;
export const mon = (moves: number[], species: number = SPECIES.cyndaquil.id) => ({ species, level: 20, moves, hp: 40, friendship: 70, experience: 8000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });

/** Rock smash: always Onix; headbutt: Hoothoot from a common tree. */
export function fieldWild(rockSmashRate = 100) {
  const slot = (species: number) => ({ species, form: 0, minLevel: 10, maxLevel: 10, chance: 100 });
  return buildWildData(wildContent(), {
    encounters: [{ id: 1, rates: { walking: 0, surfing: 0, rockSmash: rockSmashRate, oldRod: 0, goodRod: 0, superRod: 0 }, rockSmash: [slot(SPECIES.onix.id)] }],
    learnsets: Object.values(SPECIES).map((s) => ({ id: s.id, levelUp: [{ level: 1, move: MOVES.tackle.id }] })),
    species: Object.values(SPECIES).map((s) => ({ id: s.id, catchRate: 255, growthRate: "medium-fast" as const, baseFriendship: 70 })),
    evolutions: [],
  });
}

const slot = (species: number) => ({ species, form: 0, minLevel: 5, maxLevel: 5, chance: 100 });
export const HEADBUTT = { id: 60, common: [slot(SPECIES.hoothoot.id)], rare: [slot(SPECIES.sentret.id)], secret: [slot(SPECIES.rattata.id)], regularTrees: [[[5, 2] as [number, number]]], secretTrees: [[[7, 2] as [number, number]]] };

/** A story on map 60 with the field scripts; `people` are the map objects. */
export function fieldStory(people: ReturnType<typeof obstacle>[], raw: Record<string, number> = {}, extra: Parameters<typeof story>[1] = {}) {
  const data = {
    ...scriptData([FIELD_FILE], { 60: mapEvents({ npcs: people }) }, STD),
    headbutt: (map: number) => (map === 60 ? HEADBUTT : undefined),
    rockSmash: (map: number) => (map === 60 ? { id: 60, odds: 100, items: "default" as const } : undefined),
  };
  return story(data, { world: fieldWorld(raw), ...extra });
}

export const wildOptions = () => ({ combat: combatData(), wild: fieldWild() });

/** Spec 025 US4: Fly lands on New Bark (11) and on map 33 (3), on map tiles (no matrix origin). */
export const FLY_POINTS = [
  { flypoint: 11, map: 60, tx: 8, ty: 8 },
  { flypoint: 3, map: 33, tx: 4, ty: 4 },
];

/** Open 16×16 maps: "60" and "33" outdoors, "61" indoors, "70" a dark cave whose door is (3, 3) on "60", "71" a lit cave; "34" outdoors and "72" a cave whose headers forbid the bicycle, Fly and the Escape Rope; "35" outdoors and "74" a dark cave with water from row 10 down. */
export function townWorld(): WorldLookup {
  const grid: CollisionMap = { width: 16, height: 16, tiles: Array.from({ length: 256 }, () => classifyPermission(0)) };
  // Water from row 10 down.
  const wet: CollisionMap = { width: 16, height: 16, tiles: Array.from({ length: 256 }, (_, i) => classifyPermission(i >= 160 ? 0x10 : 0)) };
  const map = (id: string, areaType: "outdoor" | "indoor" | "cave", weather = 0, warps: { tx: number; ty: number; destMap: string; destAnchor: number }[] = [], allowed = true) => ({
    id,
    levels: [grid],
    warps,
    neighbors: [],
    widthPx: 256,
    heightPx: 256,
    areaType,
    weather,
    bikeAllowed: allowed && areaType === "outdoor",
    flyAllowed: allowed && areaType === "outdoor",
    escapeRopeAllowed: allowed && areaType === "cave",
  });
  const maps: Record<string, ReturnType<typeof map>> = {
    "60": map("60", "outdoor", 0, [{ tx: 3, ty: 3, destMap: "70", destAnchor: 0 }]),
    "33": map("33", "outdoor"),
    "61": map("61", "indoor"),
    "70": map("70", "cave", 11, [{ tx: 5, ty: 8, destMap: "60", destAnchor: 0 }]),
    "71": map("71", "cave", 1),
    "34": map("34", "outdoor", 0, [], false),
    "72": map("72", "cave", 0, [], false),
    "35": { ...map("35", "outdoor"), levels: [wet] },
    "74": { ...map("74", "cave", 11), levels: [wet] },
  };
  return (id) => maps[id];
}

/** A story on townWorld with the fly points. */
export function townStory(extra: Parameters<typeof story>[1] = {}) {
  const data = { ...scriptData([FIELD_FILE], { 60: mapEvents() }, STD), flyPoints: FLY_POINTS };
  return story(data, { world: townWorld(), ...extra });
}
