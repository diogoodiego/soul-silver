import { describe, expect, it } from "vitest";
import { MOVE_SPEED_PX } from "@soulsilver/shared/game";
import { setup } from "./harness";

describe("session lifecycle", () => {
  it("welcomes up to 4 players with distinct ids and an entity each", () => {
    const { session, connect, entity } = setup();
    const clients = [1, 2, 3, 4].map((i) => connect(`P${i}`));
    expect(session.state).toBe("open");
    const ids = clients.map((c) => c.welcome?.playerId);
    expect(new Set(ids).size).toBe(4);
    for (const c of clients) expect(entity(c.welcome!.entityId)?.kind).toBe("player");
  });

  it("rejects a 5th player with session-full and closes it", () => {
    const { connect } = setup();
    for (let i = 0; i < 4; i++) connect();
    const fifth = connect();
    expect(fifth.got).toEqual([expect.objectContaining({ type: "reject", code: "session-full" })]);
    expect(fifth.closed).toBe(true);
  });

  it("moves players with their inputs", () => {
    const { session, connect, entity } = setup();
    const clients = [connect(), connect(), connect(), connect()];
    for (let t = 0; t < 10; t++) {
      clients.forEach((c) => c.input(t, "east"));
      session.step();
    }
    for (const c of clients) expect(entity(c.welcome!.entityId)?.x).toBe(24 + 10 * MOVE_SPEED_PX);
    expect(session.tick).toBe(10);
  });

  it("removes a leaving player's entity and tells the others in the area", () => {
    const { session, connect, entity } = setup();
    const host = connect();
    const guest = connect();
    session.step();
    const guestEntity = guest.welcome!.entityId;
    guest.conn.send({ type: "leave" });
    session.step();
    expect(guest.closed).toBe(true);
    expect(entity(guestEntity)).toBeUndefined();
    expect(host.lastState()?.removed).toContain(guestEntity);
  });

  it("treats a dropped connection as leaving", () => {
    const { session, connect, entity } = setup();
    connect();
    const guest = connect();
    guest.conn.close();
    expect(entity(guest.welcome!.entityId)).toBeUndefined();
    expect(session.state).toBe("open");
  });

  it("closes for everyone when the host leaves", () => {
    const { session, connect } = setup();
    const host = connect();
    const guest = connect();
    host.conn.send({ type: "leave" });
    expect(session.state).toBe("closed");
    expect(guest.got.at(-1)).toEqual({ type: "session-closed", reason: "host-left" });
    expect(guest.closed).toBe(true);
  });

  it("closes on demand and refuses later joins", () => {
    const { session, connect } = setup();
    const host = connect();
    session.close("closed-by-host");
    expect(host.got.at(-1)).toEqual({ type: "session-closed", reason: "closed-by-host" });
    const late = connect();
    expect(late.got).toEqual([expect.objectContaining({ type: "reject", code: "session-closed" })]);
  });

  it("drops a player silent for the timeout", () => {
    const { session, connect, entity } = setup({ timeoutTicks: 5 });
    const host = connect();
    const guest = connect();
    for (let t = 0; t < 5; t++) {
      host.input(t, null);
      session.step();
    }
    expect(entity(guest.welcome!.entityId)).toBeUndefined();
    expect(guest.closed).toBe(true);
    expect(session.state).toBe("open");
  });
});
