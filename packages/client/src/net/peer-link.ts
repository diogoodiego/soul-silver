import { PEER_LINK_MESSAGE, PEER_PORT_MESSAGE } from "@soulsilver/shared";

// R.3: MessagePorts cannot cross the context bridge, so they travel as window messages to and from the preload.

/** Host: a port to the game server for a guest's data channel. */
export function hostLink(timeoutMs = 5000): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("O servidor do jogo não respondeu. Tente de novo."));
    }, timeoutMs);
    function onMessage(event: MessageEvent): void {
      const port = event.ports[0];
      if (event.source !== window || (event.data as { type?: unknown } | null)?.type !== PEER_LINK_MESSAGE || !port) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(port);
    }
    window.addEventListener("message", onMessage);
    window.soulSilver.openPeerLink();
  });
}

/** Guest: hands main the port of this renderer's data channel; join with PEER_ADDRESS right after. */
export function handToMain(port: MessagePort): void {
  window.postMessage({ type: PEER_PORT_MESSAGE }, "*", [port]);
}
