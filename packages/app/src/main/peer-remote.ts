import type { RemoteClientOptions } from "./remote-connection";

// R.3: the guest's link to a host through a WebRTC data channel. The channel lives in the renderer
// (the main process has no WebRTC); the renderer hands over a MessagePort that carries its text frames.

/** The part of Electron's MessagePortMain this uses. */
export interface PeerPort {
  postMessage(data: unknown): void;
  on(event: "message", listener: (e: { data: unknown }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  start(): void;
  close(): void;
}

export function createPeerRemote(options: RemoteClientOptions) {
  let port: PeerPort | undefined;
  let password = "";
  let open = false;

  const close = () => {
    const old = port;
    port = undefined;
    open = false;
    // A renderer MessagePort cannot see its other end go: null says so (see bridge in client/net/peer.ts).
    old?.postMessage(null);
    old?.close();
  };

  return {
    /** The link from the renderer, once its data channel opened; replaces any earlier one. */
    attach(next: PeerPort): void {
      close();
      port = next;

      const ended = () => {
        if (port !== next) return;
        port = undefined;
        if (open) options.onClose();
        open = false;
      };
      next.on("message", (e) => {
        if (port !== next) return;
        if (e.data === null) {
          ended();
          next.close();
          return;
        }
        if (typeof e.data !== "string") return;
        try {
          options.onMessage(JSON.parse(e.data) as unknown);
        } catch {
          options.log("Discarded a host frame that is not JSON");
        }
      });
      next.on("close", ended);
      next.start();
    },
    /** Resolves when a link is attached (the channel is already open by then); `roomPassword` goes in the hello. */
    connect(_address?: string, roomPassword = ""): Promise<void> {
      if (!port) return Promise.reject(new Error("A conexão do convite não está aberta. Gere o convite de novo."));
      password = roomPassword;
      open = true;
      return Promise.resolve();
    },
    send(msg: unknown): void {
      if (!port || !open) return;
      const isHello = typeof msg === "object" && msg !== null && (msg as { type?: unknown }).type === "hello";
      port.postMessage(JSON.stringify(isHello && password ? { ...(msg), roomPassword: password } : msg));
    },
    close,
    get connected() {
      return port !== undefined && open;
    },
  };
}

export type PeerRemote = ReturnType<typeof createPeerRemote>;
