import {
  type AssetsFailure,
  type AssetsState,
  type ExtractionMode,
  type ExtractorToMainMessage,
  isExtractorToMainMessage,
  type MainToExtractorMessage,
} from "@soulsilver/shared";

// State machine in specs/003-rom-extraction-pipeline/data-model.md, "Estado dos assets no app".

/** Same shape as the extractor's AssetsCheck; kept structural so tests need no file system. */
export type AssetsCheckResult =
  | { status: "ready" }
  | { status: "needs-extraction"; romAvailable: boolean; reason: "no-manifest" | "incomplete" | "outdated" | "outputs-missing" }
  | { status: "needs-rom" };

/** The part of Electron's UtilityProcess the controller uses; faked in tests. */
export interface ExtractorProcess {
  postMessage(msg: MainToExtractorMessage): void;
  on(event: "message", listener: (msg: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): boolean;
}

export interface AssetsPaths {
  romCopy: string;
  workspace: string;
  logFile: string;
}

export interface AssetsControllerOptions {
  paths: AssetsPaths;
  appVersion: string;
  checkAssets(): Promise<AssetsCheckResult>;
  fork(): ExtractorProcess;
  /** Resolves to the chosen path, or undefined when the dialog is cancelled. */
  showOpenDialog(): Promise<string | undefined>;
  showItemInFolder(path: string): void;
  /** Deletes the extraction folder (recursive, no error when missing). */
  removeWorkspace(dir: string): Promise<void>;
  onState(state: AssetsState): void;
  log(message: string): void;
  /** Kill the host if it has not exited this long after a cancel. */
  cancelTimeoutMs?: number;
}

export interface AssetsController {
  start(): Promise<void>;
  getState(): AssetsState;
  chooseRom(): Promise<void>;
  submitRomPath(path: string): Promise<void>;
  startExtraction(): Promise<void>;
  cancel(): void;
  openLog(): void;
  isBusy(): boolean;
  /** Deletes the extracted data, keeping the ROM copy; false while a task runs. The caller relaunches the app. */
  deleteExtraction(): Promise<boolean>;
  /** Cancels any running task and resolves once the host has exited. */
  shutdown(): Promise<void>;
}

const MODE_BY_REASON = {
  "no-manifest": "resume",
  incomplete: "resume",
  outdated: "update",
  "outputs-missing": "repair",
} as const satisfies Record<string, ExtractionMode>;

interface Task {
  host: ExtractorProcess;
  finished: boolean;
  exited: Promise<void>;
}

export function createAssetsController(options: AssetsControllerOptions): AssetsController {
  const cancelTimeoutMs = options.cancelTimeoutMs ?? 5000;
  let state: AssetsState = { status: "checking" };
  let task: Task | undefined;
  /** Whether a verified ROM copy is known to exist. */
  let romSaved = false;

  function setState(next: AssetsState): void {
    state = next;
    options.onState(state);
  }

  function needsRom(previousRomInvalid = false): void {
    setState({ status: "needs-rom", savedRom: romSaved, previousRomInvalid });
  }

  function fail(failure: AssetsFailure): void {
    setState({ status: "failed", failure });
  }

  /** Starts a host for one task; messages from older hosts are ignored. */
  function spawn(message: MainToExtractorMessage, onMessage: (msg: ExtractorToMainMessage) => void): void {
    const host = options.fork();
    let resolveExit!: () => void;
    const current: Task = { host, finished: false, exited: new Promise((resolve) => (resolveExit = resolve)) };
    task = current;
    host.on("message", (msg) => {
      if (task !== current || current.finished) return;
      if (!isExtractorToMainMessage(msg)) {
        options.log(`Discarded invalid extractor message: ${JSON.stringify(msg)}`);
        return;
      }
      onMessage(msg);
    });
    host.on("exit", (code) => {
      resolveExit();
      if (task !== current) return;
      task = undefined;
      if (current.finished) return;
      if (state.status === "cancelling") {
        needsRom();
        return;
      }
      options.log(`Extractor exited with code ${code} without a final message`);
      fail({ code: "unexpected" });
    });
    host.postMessage(message);
  }

  function finish(): void {
    if (task) task.finished = true;
  }

  /** Handles the final messages every task shares. */
  function handleCommon(msg: ExtractorToMainMessage): boolean {
    switch (msg.type) {
      case "cancelled":
        finish();
        needsRom();
        return true;
      case "failed":
        finish();
        fail(msg.failure);
        return true;
      default:
        return false;
    }
  }

  function extract(mode: ExtractionMode): void {
    setState({ status: "extracting", mode, stageTitle: "Conferindo a ROM guardada", percent: 0 });
    const { paths } = options;
    spawn(
      { type: "extract", romCopyPath: paths.romCopy, workspaceDir: paths.workspace, logPath: paths.logFile, appVersion: options.appVersion },
      (msg) => {
        if (handleCommon(msg)) return;
        switch (msg.type) {
          case "progress":
            if (state.status === "extracting" && msg.percent >= state.percent) {
              setState({ ...state, stageTitle: msg.stageTitle, percent: msg.percent });
            }
            return;
          case "completed":
            finish();
            setState({ status: "ready" });
            return;
          case "rom-copy-invalid":
            finish();
            romSaved = false;
            needsRom(true);
            return;
          default:
            return;
        }
      },
    );
  }

  function acceptsRom(): boolean {
    return state.status === "needs-rom" || state.status === "rejected";
  }

  async function submitRomPath(path: string): Promise<void> {
    if (!acceptsRom() || typeof path !== "string" || path.length === 0) return;
    setState({ status: "validating" });
    const { paths } = options;
    spawn({ type: "validate-and-copy", sourcePath: path, romCopyPath: paths.romCopy, logPath: paths.logFile }, (msg) => {
      if (handleCommon(msg)) return;
      switch (msg.type) {
        case "validated":
          if (!msg.result.ok) {
            finish();
            setState({ status: "rejected", rejection: msg.result.rejection });
          }
          return;
        case "copied":
          finish();
          romSaved = true;
          extract("first-run");
          return;
        default:
          return;
      }
    });
    return Promise.resolve();
  }

  async function start(): Promise<void> {
    setState({ status: "checking" });
    let check: AssetsCheckResult;
    try {
      check = await options.checkAssets();
    } catch (error) {
      options.log(`Assets check failed: ${String(error)}`);
      fail({ code: "unexpected" });
      return;
    }
    switch (check.status) {
      case "ready":
        setState({ status: "ready" });
        return;
      case "needs-rom":
        romSaved = false;
        needsRom();
        return;
      case "needs-extraction":
        romSaved = check.romAvailable;
        if (check.romAvailable) extract(MODE_BY_REASON[check.reason]);
        else needsRom();
        return;
    }
  }

  function isBusy(): boolean {
    return state.status === "validating" || state.status === "extracting" || state.status === "cancelling";
  }

  function cancel(): void {
    if (!task || (state.status !== "validating" && state.status !== "extracting")) return;
    const current = task;
    setState({ status: "cancelling" });
    current.host.postMessage({ type: "cancel" });
    const timer = setTimeout(() => {
      if (task === current) current.host.kill();
    }, cancelTimeoutMs);
    void current.exited.then(() => clearTimeout(timer));
  }

  return {
    start,
    getState: () => state,
    async chooseRom() {
      if (!acceptsRom()) return;
      const path = await options.showOpenDialog();
      if (path !== undefined) await submitRomPath(path);
    },
    submitRomPath,
    async startExtraction() {
      if (state.status === "needs-rom" && state.savedRom) extract("resume");
      else if (state.status === "failed") await start();
    },
    cancel,
    openLog() {
      options.showItemInFolder(options.paths.logFile);
    },
    isBusy,
    async deleteExtraction() {
      if (isBusy()) return false;
      await options.removeWorkspace(options.paths.workspace);
      return true;
    },
    async shutdown() {
      const current = task;
      if (!current) return;
      cancel();
      await current.exited;
    },
  };
}
