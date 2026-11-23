import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { writable } from "svelte/store";
import { hostLink } from "./peer-link";
import { hostRoom, type RoomHost, type RoomHostOptions, type RoomHostState } from "./room-host";

// O.4: the host's online room outlives the Online tab (switching tabs unmounts it): it lives here, and the
// game screen closes it when the session ends. Closing the window closes it too.

export const hostedRoom = writable<RoomHostState | undefined>();
let current: RoomHost | undefined;
let players = 1;

export type HostedRoomSettings = Pick<RoomHostOptions, "lobbyUrl" | "roomName" | "hostName" | "appVersion" | "public" | "hasPassword">;

export function openHostedRoom(settings: HostedRoomSettings): void {
  current?.close();
  current = hostRoom({ ...settings, protocolVersion: PROTOCOL_VERSION, openLink: () => hostLink(), onChange: (s) => hostedRoom.set(s) });
  current.setPlayers(players);
  hostedRoom.set(current.state);
}

export function closeHostedRoom(): void {
  current?.close();
  current = undefined;
  hostedRoom.set(undefined);
}

/** The session's player count, kept even before a room opens. */
export function setRoomPlayers(n: number): void {
  players = n;
  current?.setPlayers(n);
}

if (typeof window !== "undefined") window.addEventListener("beforeunload", () => current?.close());
