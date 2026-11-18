import { describe, expect, it } from "vitest";
import { decodeInvite, encodeInvite, INVITE_PREFIX } from "../../src/lan/invite.ts";

// R.3: the invite and answer codes players copy to each other, carrying a WebRTC description.

const sdp = ["v=0", "o=- 4611731400430051336 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0", "a=candidate:1 1 udp 2122260223 192.168.1.20 53412 typ host", "a=candidate:2 1 udp 1686052607 177.10.20.30 53412 typ srflx raddr 192.168.1.20 rport 53412", "a=ice-ufrag:abcd", "a=ice-pwd:0123456789abcdefghijklmn", "a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99", "a=setup:actpass", "a=mid:0", "a=sctp-port:5000", ""].join("\r\n");

describe("invite codes", () => {
  it.each(["offer", "answer"] as const)("round-trips an %s", async (kind) => {
    const code = await encodeInvite({ kind, sdp });
    expect(code.startsWith(INVITE_PREFIX)).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await decodeInvite(code)).toEqual({ kind, sdp });
  });

  it("is shorter than the description it carries", async () => {
    expect((await encodeInvite({ kind: "offer", sdp })).length).toBeLessThan(sdp.length);
  });

  it("survives spaces and line breaks added by a chat app", async () => {
    const code = await encodeInvite({ kind: "offer", sdp });
    const pasted = `  ${code.slice(0, 40)}\n${code.slice(40, 90)} ${code.slice(90)}\n`;
    expect(await decodeInvite(pasted)).toEqual({ kind: "offer", sdp });
  });

  it("survives invisible characters, quotes and text around the code", async () => {
    const code = await encodeInvite({ kind: "offer", sdp });
    const pasted = `Aqui: "﻿${code.slice(0, 30)}​${code.slice(30)} ".`;
    expect(await decodeInvite(pasted)).toEqual({ kind: "offer", sdp });
  });

  it.each([
    ["empty", ""],
    ["another version", "SS9.abc"],
    ["no prefix", "abc"],
    ["corrupted", "SS1.not-really-deflate"],
  ])("refuses a code that is %s", async (_label, code) => {
    expect(await decodeInvite(code)).toBeUndefined();
  });

  it("refuses a code cut short", async () => {
    const code = await encodeInvite({ kind: "offer", sdp });
    expect(await decodeInvite(code.slice(0, code.length - 10))).toBeUndefined();
  });
});
