import {
  isServerToHostMessage,
  PROTOCOL_VERSION,
  SERVER_UNAVAILABLE,
  type AssetsState,
  type HostToServerMessage,
  type ServerInfo,
  type ServerStatus,
} from "@soulsilver/shared";

/** The part of Electron's UtilityProcess the host uses; faked in tests. */
export interface ServerProcess {
  postMessage(msg: HostToServerMessage): void;
  on(event: "message", listener: (msg: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): boolean;
}

export interface ServerHostOptions {
  fork(): ServerProcess;
  appVersion: string;
  requestTimeoutMs?: number;
  onStatus(status: ServerStatus): void;
  /** A game protocol message for the renderer; validated there. */
  onGameMessage(msg: unknown): void;
  /** The game server closed the renderer's game connection. */
  onGameClosed(): void;
  log(message: string): void;
}

export interface ServerHost {
  start(): void;
  getInfo(): Promise<ServerInfo>;
  getStatus(): ServerStatus;
  /** Opens a fresh game connection for the renderer, closing the previous one. */
  connectGame(): void;
  sendGame(msg: unknown): void;
  /** Opens the LAN socket (hosted session); resolves with the port, rejects with the reason. */
  listen(): Promise<number>;
  unlisten(): void;
  stop(): void;
}

interface PendingListen {
  resolve(port: number): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingRequest {
  resolve(info: ServerInfo): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export function createServerHost(options: ServerHostOptions): ServerHost {
  const timeoutMs = options.requestTimeoutMs ?? 2000;
  const pending = new Map<number, PendingRequest>();
  let status: ServerStatus = { state: "starting", tick: 0 };
  let child: ServerProcess | undefined;
  let nextRequestId = 1;
  let gameConnId = 0;
  let pendingListen: PendingListen | undefined;

  function settleListen(): PendingListen | undefined {
    const request = pendingListen;
    if (request) clearTimeout(request.timer);
    pendingListen = undefined;
    return request;
  }

  function settle(requestId: number): PendingRequest | undefined {
    const request = pending.get(requestId);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(requestId);
    }
    return request;
  }

  function handleMessage(msg: unknown): void {
    if (!isServerToHostMessage(msg)) {
      options.log(`Discarded invalid server message: ${JSON.stringify(msg)}`);
      return;
    }
    switch (msg.type) {
      case "status":
        if (status.state === "stopped") return;
        status = msg.status;
        options.onStatus(status);
        return;
      case "info":
        settle(msg.requestId)?.resolve(msg.info);
        return;
      case "error":
        options.log(`Game server error (${msg.code}): ${msg.message}`);
        return;
      case "client-send":
        if (msg.connId === gameConnId) options.onGameMessage(msg.msg);
        return;
      case "client-close":
        if (msg.connId === gameConnId) options.onGameClosed();
        return;
      case "listening":
        settleListen()?.resolve(msg.port);
        return;
      case "listen-failed":
        settleListen()?.reject(new Error(msg.message));
        return;
      case "ready":
        return;
    }
  }

  function handleExit(code: number): void {
    if (status.state === "stopped") return;
    options.log(`Game server exited with code ${code}`);
    status = { state: "stopped", tick: status.tick };
    for (const requestId of [...pending.keys()]) {
      settle(requestId)?.reject(new Error(SERVER_UNAVAILABLE));
    }
    options.onStatus(status);
  }

  return {
    start() {
      child = options.fork();
      child.on("message", handleMessage);
      child.on("exit", handleExit);
      child.postMessage({ type: "init", protocolVersion: PROTOCOL_VERSION, appVersion: options.appVersion });
    },
    getInfo() {
      if (!child || status.state === "stopped") {
        return Promise.reject(new Error(SERVER_UNAVAILABLE));
      }
      const requestId = nextRequestId++;
      const result = new Promise<ServerInfo>((resolve, reject) => {
        const timer = setTimeout(() => {
          settle(requestId)?.reject(new Error(SERVER_UNAVAILABLE));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
      });
      child.postMessage({ type: "get-info", requestId });
      return result;
    },
    getStatus() {
      return status;
    },
    connectGame() {
      if (gameConnId > 0) child?.postMessage({ type: "client-close", connId: gameConnId });
      gameConnId++;
    },
    sendGame(msg) {
      if (gameConnId > 0) child?.postMessage({ type: "client-message", connId: gameConnId, msg });
    },
    listen() {
      if (!child || status.state === "stopped") return Promise.reject(new Error(SERVER_UNAVAILABLE));
      settleListen()?.reject(new Error("substituído por outro pedido"));
      const result = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          settleListen()?.reject(new Error("O servidor não respondeu ao abrir a porta de rede."));
        }, timeoutMs * 2);
        pendingListen = { resolve, reject, timer };
      });
      child.postMessage({ type: "listen" });
      return result;
    },
    unlisten() {
      child?.postMessage({ type: "unlisten" });
    },
    stop() {
      child?.kill();
    },
  };
}

/** The server reads the extraction once, when it starts; a first run extracts after launch, so it starts on "ready". */
export function startWhenAssetsReady(host: Pick<ServerHost, "start">): (state: AssetsState) => void {
  let started = false;
  return (state) => {
    if (state.status !== "ready" || started) return;
    started = true;
    host.start();
  };
}
