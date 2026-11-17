// R.3: the codes players exchange by chat to open a direct WebRTC link without a server of our own.
// A code is the prefix (format version) and the description, deflated and in base64url, so it pastes as one word.

export const INVITE_PREFIX = "SS1.";

export interface Invite {
  /** `offer` comes from the host; `answer` goes back from the guest. */
  kind: "offer" | "answer";
  sdp: string;
}

/** Each code fits a chat message; a description this long is not one WebRTC made. */
const MAX_SDP = 20_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodeInvite(invite: Invite): Promise<string> {
  const json = JSON.stringify({ k: invite.kind === "offer" ? "o" : "a", s: invite.sdp });
  return INVITE_PREFIX + toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
}

/** Undefined for anything that is not a whole code of this version; whitespace a chat app adds is ignored. */
export async function decodeInvite(text: string): Promise<Invite | undefined> {
  const code = text.replace(/\s+/g, "");
  if (!code.startsWith(INVITE_PREFIX) || code.length > MAX_SDP) return undefined;
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(code.slice(INVITE_PREFIX.length)), new DecompressionStream("deflate-raw")));
    const parsed = JSON.parse(json) as { k?: unknown; s?: unknown };
    if ((parsed.k !== "o" && parsed.k !== "a") || typeof parsed.s !== "string" || !parsed.s.startsWith("v=0") || parsed.s.length > MAX_SDP) return undefined;
    return { kind: parsed.k === "o" ? "offer" : "answer", sdp: parsed.s };
  } catch {
    return undefined;
  }
}
