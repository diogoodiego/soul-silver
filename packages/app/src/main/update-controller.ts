import type { UpdateState } from "@soulsilver/shared";

/** The part of electron-updater's autoUpdater the controller uses; faked in tests. */
export interface Updater {
  on(event: "update-available" | "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "update-not-available", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
}

export interface UpdateControllerOptions {
  updater: Updater;
  isPackaged: boolean;
  currentVersion: string;
  /** Gives up on a check that has not answered by then. */
  checkTimeoutMs?: number;
  onState(state: UpdateState): void;
}

export interface UpdateController {
  start(): void;
  getState(): UpdateState;
  restart(): void;
}

const TERMINAL: ReadonlySet<UpdateState["status"]> = new Set(["disabled", "up-to-date", "ready", "check-failed"]);

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater } = options;
  let state: UpdateState = { status: options.isPackaged ? "checking" : "disabled" };

  // Events after a terminal state are stale (e.g. a check answering after its timeout).
  function setState(next: UpdateState): void {
    if (TERMINAL.has(state.status)) return;
    state = next;
    options.onState(state);
  }

  const fail = () => {
    setState({ status: "check-failed" });
  };

  return {
    start() {
      if (!options.isPackaged) return;
      updater.on("update-not-available", () => {
        setState({ status: "up-to-date" });
      });
      updater.on("update-available", ({ version }) => {
        setState({ status: "downloading", version, percent: 0 });
      });
      updater.on("download-progress", ({ percent }) => {
        if (state.status !== "downloading") return;
        const rounded = Math.round(percent);
        if (rounded > state.percent) setState({ ...state, percent: rounded });
      });
      updater.on("update-downloaded", ({ version }) => {
        setState({ status: "ready", currentVersion: options.currentVersion, newVersion: version });
      });
      updater.on("error", fail);

      options.onState(state);
      setTimeout(() => {
        if (state.status === "checking") fail();
      }, options.checkTimeoutMs ?? 15_000);
      updater.checkForUpdates().catch(fail);
    },
    getState() {
      return state;
    },
    restart() {
      if (state.status === "ready") updater.quitAndInstall(true, true);
    },
  };
}
