import { describe, expect, it } from "vitest";
import { setup } from "./harness";

const RESERVE = 2400;

describe("reconnect (FR-020)", () => {
  function dropped() {
    const ctx = setup();
    const host = ctx.connect("Host");
    const guest = ctx.connect("Gold");
    for (let t = 0; t < 40; t++) {
      guest.input(t, "east");
      host.input(t, null);
      ctx.session.step();
    }
    const at = ctx.entity(guest.welcome!.entityId)!;
    guest.conn.close();
    return { ...ctx, host, guest, at };
  }

  it("removes the entity but keeps the seat", () => {
    const { session, entity, guest } = dropped();
    expect(entity(guest.welcome!.entityId)).toBeUndefined();
    expect(session.occupied).toBe(2);
  });

  it("resumes at the last position the server knew, with the same token", () => {
    const { connect, entity, guest, at } = dropped();
    // The client copy of the save is older than what the server knows.
    const back = connect("Gold", undefined, { resumeToken: guest.welcome!.resumeToken, save: { x: 1, y: 1 } });
    expect(back.welcome).toMatchObject({ resumed: true, resumeToken: guest.welcome!.resumeToken });
    expect(entity(back.welcome!.entityId)).toMatchObject({ x: at.x, y: at.y });
  });

  it("refuses the name without the token", () => {
    const { connect } = dropped();
    expect(connect("Gold").got).toEqual([expect.objectContaining({ code: "name-taken" })]);
    expect(connect("Gold", undefined, { resumeToken: "wrong" }).got).toEqual([expect.objectContaining({ code: "name-taken" })]);
  });

  it("releases the seat after 2 minutes", () => {
    const { session, connect, host } = dropped();
    for (let t = 0; t < RESERVE + 1; t++) {
      host.input(t + 100, null);
      session.step();
    }
    expect(session.occupied).toBe(1);
    expect(connect("Gold").welcome).toMatchObject({ resumed: false });
  });

  it("counts reserved seats toward the limit", () => {
    const { connect } = dropped();
    connect("C");
    connect("D");
    expect(connect("E").got).toEqual([expect.objectContaining({ code: "session-full" })]);
  });

  it("puts a silent guest in the reserve instead of removing them", () => {
    const { session, connect } = setup({ timeoutTicks: 5 });
    const host = connect("Host");
    connect("Gold");
    for (let t = 0; t < 5; t++) {
      host.input(t, null);
      session.step();
    }
    expect(session.occupied).toBe(2);
  });
});
