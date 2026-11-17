import { decodeInvite, encodeInvite } from "@soulsilver/shared/lan";

// R.3: a direct WebRTC link between two players, with no server of our own. The host makes an invite code,
// the guest pastes it and sends back an answer code, the host pastes that and the data channel opens.
// Candidates are gathered before each code is shown (no trickle), so one code each way is enough.

/** How long candidate gathering may take before the code goes out with what it has. */
export const GATHER_MS = 4000;
/** How long an invite waits for its answer, and a guest for the host to paste it. */
export const INVITE_MS = 10 * 60_000;
/** How long the channel may take to open once both codes are in. */
export const OPEN_MS = 15_000;

export type PeerFactory = (config: RTCConfiguration) => RTCPeerConnection;
const browserFactory: PeerFactory = (config) => new RTCPeerConnection(config);

const NOT_OPENED = "A conexão direta não abriu. A rede de um de vocês pode não permitir conexão direta (comum em 4G); tente pela LAN ou por IPv6.";

function config(stun: string): RTCConfiguration {
  return { iceServers: stun.trim() ? [{ urls: stun.trim() }] : [] };
}

/** The local description once candidates are in, or after GATHER_MS with those found so far. */
function gathered(pc: RTCPeerConnection): Promise<string> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(pc.localDescription?.sdp ?? "");
    };
    const timer = setTimeout(done, GATHER_MS);
    if (pc.iceGatheringState === "complete") done();
    else
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") done();
      };
  });
}

/** Resolves with the channel once open; rejects and closes the connection after `ms`. */
function whenOpen(pc: RTCPeerConnection, channel: Promise<RTCDataChannel>, ms: number): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pc.close();
      reject(new Error(NOT_OPENED));
    }, ms);
    void channel.then((c) => {
      const opened = () => {
        clearTimeout(timer);
        resolve(c);
      };
      if (c.readyState === "open") opened();
      else c.onopen = opened;
    });
  });
}

async function readCode(text: string, want: "offer" | "answer"): Promise<string> {
  const invite = await decodeInvite(text);
  if (!invite) throw new Error("Código inválido. Copie o código inteiro, do SS1. até o fim.");
  if (invite.kind !== want) throw new Error(want === "answer" ? "Esse é um código de convite, não uma resposta." : "Esse é um código de resposta, não um convite.");
  return invite.sdp;
}

export interface HostInvite {
  /** To send to the guest. */
  code: string;
  /** Takes the guest's answer code; resolves with the open channel. */
  accept(answer: string): Promise<RTCDataChannel>;
  cancel(): void;
}

/** Host side: one invite per guest. */
export async function inviteGuest(stun: string, factory: PeerFactory = browserFactory): Promise<HostInvite> {
  const pc = factory(config(stun));
  const channel = pc.createDataChannel("game", { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  const code = await encodeInvite({ kind: "offer", sdp: await gathered(pc) });
  let expired = false;
  const expiry = setTimeout(() => {
    expired = true;
    pc.close();
  }, INVITE_MS);
  return {
    code,
    async accept(answer) {
      if (expired) throw new Error("O convite expirou. Gere outro.");
      const sdp = await readCode(answer, "answer");
      clearTimeout(expiry);
      await pc.setRemoteDescription({ type: "answer", sdp });
      return whenOpen(pc, Promise.resolve(channel), OPEN_MS);
    },
    cancel() {
      clearTimeout(expiry);
      pc.close();
    },
  };
}

export interface GuestAnswer {
  /** To send back to the host. */
  code: string;
  /** The channel, once the host pasted the answer and it opened. */
  opened: Promise<RTCDataChannel>;
  cancel(): void;
}

/** Guest side: answers the host's invite code. */
export async function answerInvite(invite: string, stun: string, factory: PeerFactory = browserFactory): Promise<GuestAnswer> {
  const sdp = await readCode(invite, "offer");
  const pc = factory(config(stun));
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.ondatachannel = (e) => resolve(e.channel);
  });
  await pc.setRemoteDescription({ type: "offer", sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  const code = await encodeInvite({ kind: "answer", sdp: await gathered(pc) });
  return { code, opened: whenOpen(pc, channel, INVITE_MS), cancel: () => pc.close() };
}

/**
 * Joins an open channel to a MessagePort towards the main process: text frames pass as they are, and `null`
 * on the port means "closed", since a MessagePort cannot tell its other end went away.
 */
export function bridge(channel: RTCDataChannel, port: MessagePort, closeConnection: () => void): void {
  channel.onmessage = (e) => {
    if (typeof e.data === "string") port.postMessage(e.data);
  };
  port.onmessage = (e) => {
    if (e.data === null) channel.close();
    else if (typeof e.data === "string" && channel.readyState === "open") channel.send(e.data);
  };
  channel.onclose = () => {
    port.postMessage(null);
    port.close();
    closeConnection();
  };
}
