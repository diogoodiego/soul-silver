import type { CutsceneActor, CutsceneStep } from "../../game/protocol.ts";
import type { Handler } from "../runner.ts";
import { framesToTicks } from "./world.ts";

// Movement and camera commands (spec 021): they become a cutscene request the triggering client stages.

/** Object ids of the player and their following Pokémon in the original (fieldmap object ids). */
const PLAYER = 255;
const COMPANION = 253;
const DIR = /(North|South|West|East)$/;
const JUMP_TILES: Record<string, number> = { Near: 1, Far: 2, Farther: 3 };
/** Actions that only change looks the client does not draw yet. */
const COSMETIC = new Set([
  "LockDir",
  "UnlockDir",
  "PauseAnimation",
  "ResumeAnimation",
  "EmoteExclamationMark",
  "EmoteQuestionMark",
  "EmoteExclamation2",
  "NurseJoyBow",
  "RevealTrainer",
  "PlayerGive",
  "PlayerReceive",
  // shortcut: the Burned Tower beasts' leaps (24 M1–M6) stay in place, and each beast hides after; draw the arcs when the client animates jumps of their own shape.
  "MoveAction_105",
  "MoveAction_106",
  "MoveAction_107",
  "MoveAction_108",
  "MoveAction_109",
  "MoveAction_110",
  // shortcut: Suicune's leaps at its sightings (875 M4, M5; 252 M14) stay in place too, and it hides after (item 031.2).
  "MoveAction_111",
  "MoveAction_112",
]);

const actorOf = (id: number): CutsceneActor => (id === PLAYER ? "player" : id === COMPANION ? "companion" : { person: id });

/** The steps of one movement list, or the first action nothing implements. */
export function movementSteps(actor: CutsceneActor, list: readonly { action: string; count: number }[]): CutsceneStep[] | { unknown: string } {
  const steps: CutsceneStep[] = [];
  for (const { action, count } of list) {
    const dir = DIR.exec(action)?.[1]?.toLowerCase() as "north" | "south" | "west" | "east" | undefined;
    const jump = /^Jump(Near|Farther|Far)/.exec(action);
    const delay = /^Delay(\d+)$/.exec(action);
    if (dir && action.startsWith("Face")) steps.push({ kind: "face", actor, dir });
    else if (dir && /^(WalkOnSpot|JumpOnSpot)/.test(action)) steps.push({ kind: "face", actor, dir });
    else if (dir && /^(Walk|Run)/.test(action)) steps.push({ kind: "walk", actor, dir, count });
    else if (dir && jump) steps.push({ kind: "jump", actor, dir, count: JUMP_TILES[jump[1]!]! * count });
    else if (delay) steps.push({ kind: "wait", ticks: framesToTicks(Number(delay[1]) * count) });
    else if (action === "SetInvisible" || action === "WarpOut") steps.push({ kind: "hide", actor });
    else if (action === "SetVisible" || action === "WarpIn") steps.push({ kind: "show", actor });
    else if (!COSMETIC.has(action)) return { unknown: action };
  }
  return steps;
}

const nothing: Handler = () => undefined;

export const CUTSCENE: Record<string, Handler> = {
  // The companion (spec 014) walks on its own rules, so the original's follower commands change nothing here.
  ToggleFollowingPokemonMovement: nothing,
  FollowingPokemonMovement: nothing,
  WaitFollowingPokemonMovement: nothing,
  // Spec 024: they put the follower beside the player (ov01_02205720, ov01_02205784).
  ScrCmd_605: nothing,
  ScrCmd_608: nothing,
  SetFollowMonInhibitState: nothing,
  FollowMonFacePlayer: nothing,
  FollowMonInteract: nothing,
  // Opens 291 scripts right before LockAll, with no arguments; a follower toggle in the original.
  ScrCmd_609: nothing,
  // Item 031.5: the draw-only visibility bit of a fieldmap object (the player after falling into the lighthouse's 2F, people of the
  // Ecruteak theater); who is on the map is the hide flags', so the server has nothing to do.
  MakeObjectVisible: nothing,
  ScrCmd_374: nothing,
  // The lighthouse lamp lighting up once Amphy is cured (225 L6); not drawn.
  ScrCmd_459: nothing,
  // Item 031.7: always arg 0, after a heal, a fade or a party menu and before the player or follower moves (the Cianwood
  // Tentacool's naming, Pokémon Centers); a follower reset the server has no state for.
  ScrCmd_815: nothing,
  // Item 032.3: Lance (arg0) flying off on his Dragonite (arg1) at the Lake of Rage (88 L42); both hide right after, not drawn.
  ScrCmd_775: nothing,
  // No follower-specific event ever triggers: the result variable reads 0.
  FollowerPokeIsEventTrigger: (c) => {
    const into = c.raw("arg2");
    if (into >= 0x4000) c.writeVar(into, 0);
  },
  // The companion is the first Pokémon able to fight.
  GetFollowPokePartyIndex: (c) => c.writeVar(c.ptr("arg0"), c.host.partyLeadAlive()),
  // People keep the movement pattern of their map events (spec 021); the player's step history is not kept.
  SetObjectMovementType: nothing,
  PlayerMovementSavingSet: nothing,
  PlayerMovementSavingClear: nothing,
  // shortcut: each ApplyMovement plays before the next instead of alongside it; batch until WaitMovement when a scene needs two actors moving at once.
  ApplyMovement: (c) => {
    const arg = c.args["movement"];
    const list = typeof arg === "object" && "movement" in arg ? c.file.movements[arg.movement] : undefined;
    const actor = actorOf(c.get("arg0"));
    const steps = list ? movementSteps(actor, list) : { unknown: "?" };
    if (!Array.isArray(steps)) return c.unsupported();
    if (steps.length > 0) c.block({ kind: "cutscene", actors: [actor], steps });
  },
  WaitMovement: () => undefined,
  // shortcut: arguments read as amplitude, ?, frames, ? (unverified against pokeheartgold); check against the original when a quake looks wrong.
  ScreenShake: (c) => c.block({ kind: "cutscene", actors: [], steps: [{ kind: "camera-shake", amplitude: c.get("arg0"), ticks: framesToTicks(c.get("arg2")) }] }),
};
