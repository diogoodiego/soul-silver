import { describe, expect, it } from "vitest";
import { setup } from "./harness";

describe("closing the session (FR-021)", () => {
  it("sends every player a final save and waits for the acks", () => {
    const { session, connect } = setup();
    const host = connect("Host");
    const guest = connect("Gold");
    session.close("closed-by-host");
    expect(host.saves()).toHaveLength(1);
    expect(guest.saves()).toHaveLength(1);
    expect(session.state).toBe("closing");
    host.conn.send({ type: "save-ack", rev: host.saves()[0]!.save.rev });
    expect(session.state).toBe("closing");
    guest.conn.send({ type: "save-ack", rev: guest.saves()[0]!.save.rev });
    expect(session.state).toBe("closed");
    expect(guest.got.at(-1)).toEqual({ type: "session-closed", reason: "closed-by-host" });
  });

  it("closes after 3 s even without acks", () => {
    const { session, connect } = setup();
    const guest = connect("Gold");
    session.close("closed-by-host");
    for (let t = 0; t < 59; t++) session.step();
    expect(session.state).toBe("closing");
    session.step();
    expect(session.state).toBe("closed");
    expect(guest.got.at(-1)).toMatchObject({ type: "session-closed" });
  });

  it("does not wait for a player who dropped meanwhile", () => {
    const { session, connect } = setup();
    const host = connect("Host");
    const guest = connect("Gold");
    session.close("closed-by-host");
    host.conn.send({ type: "save-ack", rev: host.saves()[0]!.save.rev });
    guest.conn.close();
    expect(session.state).toBe("closed");
  });

  it("does not count an old ack", () => {
    const { session, connect } = setup();
    const guest = connect("Gold");
    session.close("closed-by-host");
    guest.conn.send({ type: "save-ack", rev: guest.saves()[0]!.save.rev - 1 });
    expect(session.state).toBe("closing");
  });

  it("refuses joins while closing", () => {
    const { session, connect } = setup();
    connect("Gold");
    session.close("closed-by-host");
    expect(connect("Late").got).toEqual([expect.objectContaining({ code: "session-closed" })]);
  });
});
