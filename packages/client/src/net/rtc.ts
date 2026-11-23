import type { IceServer, LobbyClientMessage } from "@soulsilver/shared/lobby";

// O.4/O.5: the WebRTC side of a room link, shared by host and guest. Candidates go out as they are found
// (trickle ICE), and the ones that arrive before the remote description wait for it.

export type PeerFactory = (config: RTCConfiguration) => RTCPeerConnection;
export const browserPeers: PeerFactory = (config) => new RTCPeerConnection(config);

/** What travels inside a lobby `signal`. */
export type SignalData = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

/** The lobby message's JSON field; WebRTC's init dictionaries are JSON, but typed as interfaces. */
export const asJson = (data: SignalData) => data as unknown as Extract<LobbyClientMessage, { type: "signal" }>["data"];

export interface RtcLink {
  pc: RTCPeerConnection;
  /** Feeds a signal from the other side; anything else is ignored. */
  receive(data: unknown): Promise<void>;
  close(): void;
}

/** Wires `pc` to send its candidates out and to take the other side's description and candidates. */
export function linkSignals(pc: RTCPeerConnection, send: (data: SignalData) => void, onOffer?: () => void): RtcLink {
  const waiting: RTCIceCandidateInit[] = [];
  let closed = false;
  pc.onicecandidate = (e) => {
    if (e.candidate && !closed) send({ candidate: e.candidate.toJSON() });
  };
  return {
    pc,
    async receive(data) {
      if (closed || typeof data !== "object" || data === null) return;
      if ("sdp" in data) {
        const sdp = (data as { sdp: RTCSessionDescriptionInit }).sdp;
        await pc.setRemoteDescription(sdp);
        if (sdp.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          if (pc.localDescription) send({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
          onOffer?.();
        }
        for (const c of waiting.splice(0)) await pc.addIceCandidate(c);
      } else if ("candidate" in data) {
        const c = (data as { candidate: RTCIceCandidateInit }).candidate;
        if (pc.remoteDescription) await pc.addIceCandidate(c);
        else waiting.push(c);
      }
    },
    close() {
      closed = true;
      pc.close();
    },
  };
}

export function rtcConfig(iceServers: IceServer[]): RTCConfiguration {
  return { iceServers: iceServers.map((s) => ({ ...s })) };
}

/** Resolves when the channel is open; rejects after `ms` (the caller closes the connection). */
export function channelOpen(channel: Promise<RTCDataChannel>, ms: number, onTimeout: () => Error): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    void channel.then((c) => {
      const opened = () => {
        clearTimeout(timer);
        resolve(c);
      };
      if (c.readyState === "open") opened();
      else c.addEventListener("open", opened, { once: true });
    });
  });
}
