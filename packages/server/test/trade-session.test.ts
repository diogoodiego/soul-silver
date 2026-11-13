import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";

// Spec 028.2: the trade flow through the session, with two fake clients.

type Client = ReturnType<ReturnType<typeof setup>["connect"]>;
const lastTrade = (c: Client) => c.got.filter((m): m is Extract<ServerMessage, { type: "tradeState" }> => m.type === "tradeState").at(-1);
const lastNotice = (c: Client) => c.got.filter((m): m is Extract<ServerMessage, { type: "notice" }> => m.type === "notice").at(-1)?.code;

function pair(gapPx = 16) {
  let n = 0;
  const t = setup({ spawn: () => ({ area: "a", x: 160 + gapPx * n++, y: 160 }) });
  const a = t.connect("Gold");
  const b = t.connect("Silver");
  const send = (c: Client, msg: unknown) => {
    c.conn.send(msg);
    t.session.step();
  };
  return { ...t, a, b, send };
}

describe("trade through the session (spec 028.2)", () => {
  it("a proposal reaches the player nearby, and the accepted trade opens on both sides", () => {
    const g = pair();
    g.send(g.a, { type: "trade-propose", to: g.b.welcome!.playerId });
    expect(lastTrade(g.b)).toMatchObject({ phase: "invited", partner: g.a.welcome!.playerId });
    g.send(g.b, { type: "trade-answer", accept: true });
    expect([lastTrade(g.a)?.phase, lastTrade(g.b)?.phase]).toEqual(["open", "open"]);
  });

  it("refuses a player too far away", () => {
    const g = pair(160);
    g.send(g.a, { type: "trade-propose", to: g.b.welcome!.playerId });
    expect(lastNotice(g.a)).toBe("trade-far");
    expect(lastTrade(g.b)).toBeUndefined();
  });

  it("the partner leaving the session cancels the trade", () => {
    const g = pair();
    g.send(g.a, { type: "trade-propose", to: g.b.welcome!.playerId });
    g.send(g.b, { type: "trade-answer", accept: true });
    g.b.conn.close();
    g.session.step();
    expect(lastTrade(g.a)?.phase).toBe("cancelled");
  });

  it("cancel from either side ends it for both", () => {
    const g = pair();
    g.send(g.a, { type: "trade-propose", to: g.b.welcome!.playerId });
    g.send(g.b, { type: "trade-answer", accept: true });
    g.send(g.a, { type: "trade-cancel" });
    expect([lastTrade(g.a)?.phase, lastTrade(g.b)?.phase]).toEqual(["cancelled", "cancelled"]);
  });
});
