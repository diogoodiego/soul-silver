import type { AssetsState } from "./assets-state";
import type { ServerInfo, ServerStatus } from "./server-info";
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
} as const;

/** Rejection message of getServerInfo() when the game server is stopped or does not reply. */
export const SERVER_UNAVAILABLE = "server-unavailable";

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
}
