import { describe, expect, it } from "vitest";
import { createDialogQueue } from "../../src/game/dialog-queue";

describe("cutscene text boost (spec 021)", () => {
  it("types boost times as many characters as the configured speed", () => {
    const typedAfter = (boost: number) => {
      const q = createDialogQueue();
      void q.say(["abcdefghijklmnopqrstuvwxyz"]);
      q.step(400, "mid", boost);
      return q.view()!.text.length;
    };
    expect(typedAfter(2)).toBe(2 * typedAfter(1));
  });
});
