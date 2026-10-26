import { describe, expect, it } from "vitest";
import { admitVoice, mixSound } from "../../src/audio/mixer.ts";

// Spec 018, research R6.

const AT = { x: 100, y: 100, halfWidthPx: 200 };
const RANGE = 192;

describe("mixSound", () => {
  it.each(["ui", "own"] as const)("plays %s sounds full, centred, priority 3", (source) => {
    expect(mixSound({ source, kind: "effect", x: 300, y: 100 }, AT, RANGE)).toEqual({ gain: 1, pan: 0, priority: 3 });
  });

  it("fades other sounds with distance", () => {
    expect(mixSound({ source: "other", kind: "effect", x: 196, y: 100 }, AT, RANGE)?.gain).toBeCloseTo(0.5);
  });

  it("drops other sounds at or past the range", () => {
    expect(mixSound({ source: "other", kind: "effect", x: 100, y: 292 }, AT, RANGE)).toBeUndefined();
  });

  it("pans by the position on the screen, clamped", () => {
    const pan = (x: number) => mixSound({ source: "other", kind: "effect", x, y: 100 }, { ...AT, halfWidthPx: 50 }, RANGE)?.pan;
    expect(pan(50)).toBe(-1);
    expect(pan(150)).toBe(1);
    expect(pan(125)).toBeCloseTo(0.5);
    expect(pan(10)).toBe(-1);
  });

  it("ranks other cries above other effects", () => {
    expect(mixSound({ source: "other", kind: "cry", x: 100, y: 100 }, AT, RANGE)?.priority).toBe(2);
    expect(mixSound({ source: "other", kind: "effect", x: 100, y: 100 }, AT, RANGE)?.priority).toBe(1);
  });
});

describe("admitVoice", () => {
  const v = (priority: number, gain = 1) => ({ priority, gain });

  it("is free below the limit", () => {
    expect(admitVoice([v(1)], v(1), 2)).toBe("free");
  });

  it("takes the lowest-priority voice, the quietest on a tie", () => {
    expect(admitVoice([v(3), v(1, 0.8), v(1, 0.2), v(2)], v(2), 4)).toBe(2);
  });

  it("drops a sound below every voice in use", () => {
    expect(admitVoice([v(3), v(2)], v(1), 2)).toBe("drop");
  });

  it("never lets another's sound replace one's own", () => {
    expect(admitVoice([v(3), v(3)], v(2), 2)).toBe("drop");
  });
});
