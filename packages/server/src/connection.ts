// One client's link to the game server. Local IPC today, WebSocket in spec 012 (spec 010, research R1).
// Transports MUST be reliable and ordered: replication sends deltas against the last message sent.

export interface Connection {
  send(msg: unknown): void;
  onMessage(listener: (msg: unknown) => void): void;
  onClose(listener: () => void): void;
  /** Idempotent; notifies both ends. */
  close(): void;
}

/** Two linked in-memory ends with synchronous delivery, for tests and replay. */
export function createMemoryConnectionPair(): [Connection, Connection] {
  const listeners = [[], []] as ((msg: unknown) => void)[][];
  const closeListeners = [[], []] as (() => void)[][];
  let closed = false;

  const end = (self: 0 | 1): Connection => ({
    send(msg) {
      if (closed) return;
      for (const l of listeners[1 - self]!) l(msg);
    },
    onMessage(listener) {
      listeners[self]!.push(listener);
    },
    onClose(listener) {
      closeListeners[self]!.push(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const l of [...closeListeners[0]!, ...closeListeners[1]!]) l();
    },
  });

  return [end(0), end(1)];
}
