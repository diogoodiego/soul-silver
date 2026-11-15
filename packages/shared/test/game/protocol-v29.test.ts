import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 030.5: a script prop can show a building in one of its animation poses (the Azalea Gym's ropes and levers).

const props = (list: object[]) => ({ type: "script-event", event: { kind: "props", area: "180", props: list } });

describe("protocol v29", () => {
  it("is version 29", () => {
    expect(PROTOCOL_VERSION).toBe(29);
  });

  it("a prop carries an optional pose, as before without one", () => {
    expect(serverMessage.safeParse(props([{ model: 115, x: 104, y: -1, z: 176, pose: 1 }, { model: 118, x: 56, y: 0, z: 504 }])).success).toBe(true);
  });

  it("refuses a pose that is not a small whole number", () => {
    expect(serverMessage.safeParse(props([{ model: 115, x: 0, y: 0, z: 0, pose: -1 }])).success).toBe(false);
    expect(serverMessage.safeParse(props([{ model: 115, x: 0, y: 0, z: 0, pose: 1.5 }])).success).toBe(false);
  });
});
