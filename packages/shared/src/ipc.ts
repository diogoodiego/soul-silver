import type { AssetsState } from "./assets-state";
import type { SessionListing } from "./lan/discovery";
import type { Save } from "./save/schema";
import type { SaveResult, SlotSummary } from "./save/slot";
import type { ServerInfo, ServerStatus } from "./server-info";
import type { AppSettings, SettingsPatch } from "./settings";
import type { UpdateState } from "./update-state";

export const IpcChannel = {
  ServerGetInfo: "server:get-info",
  ServerStatus: "server:status",
  AppGetVersion: "app:get-version",
  UpdateGetState: "update:get-state",
  UpdateState: "update:state",
  UpdateRestart: "update:restart",
  AssetsGetState: "assets:get-state",
  AssetsState: "assets:state",
  AssetsChooseRom: "assets:choose-rom",
  AssetsSubmitRomPath: "assets:submit-rom-path",
  AssetsStart: "assets:start",
  AssetsCancel: "assets:cancel",
  AssetsOpenLog: "assets:open-log",
  GameSend: "game:send",
  GameMessage: "game:message",
  GameClosed: "game:closed",
  GameSaved: "game:saved",
  SavesList: "saves:list",
  SavesCreate: "saves:create",
  SavesRestore: "saves:restore",
  SavesDelete: "saves:delete",
  SavesExport: "saves:export",
  SavesImport: "saves:import",
  SavesRestartStory: "saves:restart-story",
  SessionSolo: "session:solo",
  SessionHost: "session:host",
  SessionJoin: "session:join",
  SessionOpenLan: "session:open-lan",
  /** R.5: asks the router (UPnP) to forward the hosted session's port. */
  SessionOpenInternet: "session:open-internet",
  /** R.3: renderer asks for a port to the server for a guest's data channel; the reply carries it on the same channel. */
  PeerLink: "peer:link",
  /** R.3: renderer hands main the port of its own data channel, as a guest. */
  PeerPort: "peer:port",
  SessionsWatch: "sessions:watch",
  SessionsList: "sessions:list",
  SettingsGet: "settings:get",
  SettingsFirewallSeen: "settings:firewall-seen",
  SettingsSet: "settings:set",
  AppQuit: "app:quit",
} as const;

/** Rejection message of getServerInfo() when the game server is stopped or does not reply. */
export const SERVER_UNAVAILABLE = "server-unavailable";

/** Outcome of starting or joining a session; the renderer sends `save` in its hello. */
export type SessionResult = { ok: true; save: Save } | { ok: false; reason: string };

/** Outcome of opening the solo session to the LAN: the addresses others type to join. */
export type LanResult = { ok: true; addresses: string[] } | { ok: false; reason: string };
/** R.5: `address` is the public `ip` or `ip:port` friends outside the LAN type. */
export type InternetResult = { ok: true; address: string } | { ok: false; reason: string };

/** The only API the renderer can reach, exposed by the preload as window.soulSilver. */
export interface SoulSilverApi {
  getServerInfo(): Promise<ServerInfo>;
  /** Returns a function that cancels the subscription. */
  onServerStatus(listener: (status: ServerStatus) => void): () => void;
  /** Installed app version; does not depend on the game server. */
  getAppVersion(): Promise<string>;
  getUpdateState(): Promise<UpdateState>;
  /** Returns a function that cancels the subscription. */
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  /** Only has an effect in the `ready` state: applies the update and relaunches. */
  restartToUpdate(): Promise<void>;
  getAssetsState(): Promise<AssetsState>;
  /** Returns a function that cancels the subscription. */
  onAssetsState(listener: (state: AssetsState) => void): () => void;
  /** Opens the file picker in the main process; no effect outside needs-rom/rejected. */
  chooseRom(): Promise<void>;
  /** Drag and drop: the preload turns the File into a path (webUtils.getPathForFile). */
  submitRomFile(file: File): Promise<void>;
  /** Resumes with the saved ROM (needs-rom with savedRom) or retries (failed). */
  startExtraction(): Promise<void>;
  /** Only in validating/extracting. */
  cancelExtraction(): Promise<void>;
  /** Shows extractor.log in Explorer. */
  openExtractionLog(): Promise<void>;
  /** A game protocol message (spec 010); the server validates it. */
  sendGame(msg: unknown): void;
  /** Raw server messages; validate with serverMessage. Returns a function that cancels the subscription. */
  onGameMessage(listener: (msg: unknown) => void): () => void;
  /** Returns a function that cancels the subscription. */
  onGameClosed(listener: () => void): () => void;
  /** The server sent a save and it was written (or failed to be). */
  onGameSaved(listener: (result: SaveResult) => void): () => void;
  listSaves(): Promise<SlotSummary[]>;
  /** Fails on an occupied slot unless `overwrite`. No starter: Prof. Elm gives it (spec 024). */
  createSave(slot: number, name: string, character: "male" | "female", overwrite: boolean): Promise<SaveResult>;
  /** Deletes the save and its backup (spec 017). */
  deleteSave(slot: number): Promise<SaveResult>;
  restoreBackup(slot: number): Promise<SaveResult>;
  exportSave(slot: number): Promise<SaveResult>;
  importSave(slot: number, overwrite: boolean): Promise<SaveResult>;
  /** Spec 024: an outdated save starts the story again in its slot; the old one stays as the backup. */
  restartStory(slot: number): Promise<SaveResult>;
  /** Local session, never announced; the game connection is open when it resolves. */
  startSolo(slot: number): Promise<SessionResult>;
  /** Opens the LAN socket and announces the session; `reason` explains a port failure. */
  startHost(slot: number): Promise<SessionResult>;
  /** `address` is `ip` or `ip:port`; the game connection is open when it resolves. Without `password` (R.1), the last one given for that host is used. */
  joinSession(slot: number, address: string, password?: string): Promise<SessionResult>;
  /** Opens the solo session being played to the LAN and announces it, without restarting it. */
  openToLan(): Promise<LanResult>;
  /** R.5: forwards the hosted session's port on the router by UPnP; the mapping goes when the session ends. */
  openToInternet(): Promise<InternetResult>;
  /** R.3: asks for a port to the server; it arrives as a window message of type PEER_LINK_MESSAGE (ports cannot cross the bridge). */
  openPeerLink(): void;
  /** Sessions announced on the LAN while subscribed. Returns a function that cancels the subscription. */
  watchSessions(listener: (sessions: SessionListing[]) => void): () => void;
  getSettings(): Promise<AppSettings>;
  markFirewallNoticeSeen(): Promise<void>;
  /** Invalid patches are refused and the old settings stay; window size and fullscreen apply at once. */
  setSettings(patch: SettingsPatch): Promise<AppSettings>;
  quitApp(): Promise<void>;
}

/**
 * R.3: MessagePorts cannot cross the context bridge, so they travel as window messages between the page and the
 * preload: PEER_LINK_MESSAGE brings the host a port to the server, PEER_PORT_MESSAGE takes a guest's port to main.
 */
export const PEER_LINK_MESSAGE = "soulsilver:peer-link";
export const PEER_PORT_MESSAGE = "soulsilver:peer-port";
/** R.3: the address a guest joins with when the link is a WebRTC invite, not a socket. */
export const PEER_ADDRESS = "convite";
