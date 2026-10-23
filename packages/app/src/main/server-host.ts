import {
  isServerToHostMessage,
  PROTOCOL_VERSION,
  SERVER_UNAVAILABLE,
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
  log(message: string): void;
}

export interface ServerHost {
  start(): void;
  getInfo(): Promise<ServerInfo>;
  getStatus(): ServerStatus;
  stop(): void;
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
    stop() {
      child?.kill();
    },
  };
}
