import type { Handler } from "../runner.ts";

/** The DS field runs scripts at 30 frames a second; the server ticks at 20. */
const framesToTicks = (frames: number) => Math.ceil((frames * 20) / 30);
// The server locks the player for as long as any script runs, so the script's own locks change nothing.
const nothing: Handler = () => undefined;

export const WORLD: Record<string, Handler> = {
  Warp: (c) => c.host.warp(c.get("arg0"), c.get("arg2"), c.get("arg3"), c.get("arg4")),
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
  StopBGM: (c) => c.host.emit({ kind: "bgm", id: null }),
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
