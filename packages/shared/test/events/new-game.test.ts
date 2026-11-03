import { describe, expect, it } from "vitest";
import { parseEventsFile } from "../../src/events/schemas.ts";

// Spec 024: where a new game starts and the std message banks, both from the events stage.

const newGame = (extra: Record<string, unknown> = {}) => ({ kind: "new-game", formatVersion: 1, map: 64, tx: 6, ty: 6, facing: "south", initScript: 9600, ...extra });
const stdMessages = (extra: Record<string, unknown> = {}) => ({ kind: "std-messages", formatVersion: 1, banks: [752, 211, 30, 435], ...extra });

describe("new-game.json", () => {
  it("accepts the original start", () => {
    expect(parseEventsFile("new-game", newGame(), "new-game.json")).toMatchObject({ ok: true });
  });

  it.each([
    ["facing", "up"],
    ["map", -1],
    ["tx", -1],
    ["ty", 1.5],
    ["initScript", undefined],
  ])("rejects %s = %s with file and path", (field, value) => {
    expect(parseEventsFile("new-game", newGame({ [field]: value }), "new-game.json")).toMatchObject({ ok: false, error: { file: "new-game.json", path: field } });
  });
});

describe("std-messages.json", () => {
  it("accepts the original table", () => {
    expect(parseEventsFile("std-messages", stdMessages(), "std-messages.json")).toMatchObject({ ok: true });
  });

  it("rejects an empty table", () => {
    expect(parseEventsFile("std-messages", stdMessages({ banks: [] }), "std-messages.json")).toMatchObject({ ok: false, error: { file: "std-messages.json", path: "banks" } });
  });
});
