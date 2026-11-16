import type { Handler } from "../runner.ts";

/** The DS field runs scripts at 30 frames a second; the server ticks at 20. */
export const framesToTicks = (frames: number) => Math.ceil((frames * 20) / 30);
// The server locks the player for as long as any script runs, so the script's own locks change nothing.
const nothing: Handler = () => undefined;

/** ScrCmd_PlaceStarterBallsInElmsLab: the room model and its three points on the machine. */
const STARTER_BALL = 0x8d;
const STARTER_BALL_AT = [
  [131, 65],
  [141, 65],
  [136, 72],
] as const;
const FLAG_GOT_TM51_FROM_FALKNER = 0x73;
const FLAG_MET_PASSERBY_BOY = 0x99;
/** Floor numbers of the maps an elevator's dynamic warp leads to, as its script counts them. */
// shortcut: the Olivine Lighthouse's 1F and 6F only (the original reads a table by map); add Goldenrod's store with its elevator.
const ELEVATOR_FLOOR: Record<number, number> = { 115: 0, 225: 1 };

export const WORLD: Record<string, Handler> = {
  PlaceStarterBallsInElmsLab: (c) => {
    const h = c.host;
    const n = h.flag(FLAG_GOT_TM51_FROM_FALKNER) ? 0 : h.flag(FLAG_MET_PASSERBY_BOY) ? 1 : h.partyCount() > 0 ? 2 : 3;
    h.emit({ kind: "props", props: STARTER_BALL_AT.slice(0, n).map(([x, z]) => ({ model: STARTER_BALL, x, y: 0, z })) });
  },
  // shortcut: warps stay where the map puts them; on a tile the first warp wins, which is the one the Ruins of Alph's MoveWarp keeps while VAR 0x403E < 6 (no puzzle solved). Move warps per player with the puzzles (Marco 6).
  MoveWarp: nothing,
  PlayerOnBikeCheck: (c) => c.writeVar(c.ptr("arg0"), c.host.onBike?.() ? 1 : 0),
  Warp: (c) => c.host.warp(c.get("arg0"), c.get("arg2"), c.get("arg3"), c.get("arg4")),
  // Item 031.5: arg1 is the warp anchor of the map; with one, the original ignores the coordinates.
  SetDynamicWarp: (c) => c.host.setDynamicWarp?.(c.get("arg0"), c.get("arg1")),
  GetDynamicWarpFloorNo: (c) => c.writeVar(c.ptr("arg0"), ELEVATOR_FLOOR[c.host.dynamicWarpMap?.() ?? -1] ?? 0),
  // The car moving `distance` times; the client draws no elevator yet.
  ElevatorAnim: (c) => c.block({ kind: "wait", ticks: framesToTicks(30 * c.get("distance")) }),
  FadeScreen: (c) => c.host.emit({ kind: "fade", type: c.raw("direction"), color: c.raw("color"), duration: c.raw("arg0") }),
  WaitFade: (c) => c.block({ kind: "wait-fade" }),
  Wait: (c) => {
    const frames = c.raw("frames");
    const into = c.ptr("var");
    c.writeVar(into, frames);
    c.block({ kind: "wait", ticks: framesToTicks(frames) }, () => c.writeVar(into, 0));
  },
  PlaySE: (c) => c.host.emit({ kind: "sound", sound: "se", id: c.get("arg0") }),
  WaitSE: (c) => c.block({ kind: "wait-sound", sound: "se" }),
  PlayFanfare: (c) => c.host.emit({ kind: "sound", sound: "fanfare", id: c.get("fanfare") }),
  WaitFanfare: (c) => c.block({ kind: "wait-sound", sound: "fanfare" }),
  PlayCry: (c) => c.host.emit({ kind: "sound", sound: "cry", id: c.get("arg0") }),
  WaitCry: (c) => c.block({ kind: "wait-sound", sound: "cry" }),
  PlayBGM: (c) => c.host.emit({ kind: "bgm", id: c.raw("bgm") }),
  TempBGM: (c) => c.host.emit({ kind: "bgm", id: c.raw("arg0") }),
  ResetBGM: (c) => c.host.emit({ kind: "bgm-reset" }),
  StopBGM: (c) => c.host.emit({ kind: "bgm", id: null }),
  // shortcut: stops at once instead of fading over `frames`; add a fade event when the client mixer can ramp.
  FadeOutBGM: (c) => c.host.emit({ kind: "bgm", id: null }),
  LockAll: nothing,
  ReleaseAll: nothing,
  Lock: nothing,
  Release: nothing,
  FacePlayer: (c) => c.host.facePlayer(),
  HidePerson: (c) => c.host.hidePerson(c.get("arg0")),
  ShowPerson: (c) => c.host.showPerson(c.get("arg0")),
  // The original reads x, height, depth in that order; the table names the last two z and y.
  MovePersonFacing: (c) => c.host.movePerson(c.get("person"), c.get("x"), c.get("y"), c.get("facing")),
  GetPlayerCoords: (c) => {
    const p = c.host.playerPosition();
    c.writeVar(c.ptr("arg0"), p.x);
    c.writeVar(c.ptr("arg1"), p.z);
  },
  GetPlayerFacing: (c) => c.writeVar(c.ptr("arg0"), c.host.playerPosition().facing),
  GetPersonCoords: (c) => {
    // 255 when the object is not there, as the original.
    const p = c.host.personPosition(c.get("arg0")) ?? { x: 255, z: 255 };
    c.writeVar(c.ptr("arg1"), p.x);
    c.writeVar(c.ptr("arg2"), p.z);
  },
  GetWeekday: (c) => c.writeVar(c.ptr("arg0"), c.host.weekday()),
};
