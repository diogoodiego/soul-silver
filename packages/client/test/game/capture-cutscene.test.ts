import { describe, expect, it } from "vitest";
import { AFTER_HIT, CLOSE_MS, cutscenePhase, HIT_MS, LINE_MS, OPEN_MS, RESULT_MS, WAIT_MS } from "../../src/game/capture-cutscene";

const SHAKE = 800;
const sequence = AFTER_HIT.reduce((sum, [, ms]) => sum + ms, 0);

describe("capture cutscene timeline", () => {
  it("draws the line, opens the band, then throws until the hit", () => {
    expect(cutscenePhase(0, undefined, 3, SHAKE).name).toBe("line");
    expect(cutscenePhase(LINE_MS + 1, undefined, 3, SHAKE).name).toBe("open");
    const mid = cutscenePhase(LINE_MS + OPEN_MS + (HIT_MS - LINE_MS - OPEN_MS) / 2, undefined, 3, SHAKE);
    expect(mid.name).toBe("throw");
    expect(mid.k).toBeCloseTo(0.5);
  });

  it("holds the ball at the Pokémon until the server's result, and gives up after WAIT_MS", () => {
    expect(cutscenePhase(HIT_MS + 10, undefined, 3, SHAKE).name).toBe("wait");
    expect(cutscenePhase(HIT_MS + WAIT_MS + 1, undefined, 3, SHAKE).name).toBe("done");
  });

  it("from the result: bounce, open, absorb, close, dim, one shake each, the result, then the band closes", () => {
    const start = HIT_MS + 300;
    expect(cutscenePhase(start + 1, start, 2, SHAKE)).toMatchObject({ name: "bounce" });
    const names = AFTER_HIT.map((_, i) => cutscenePhase(start + AFTER_HIT.slice(0, i).reduce((s, [, ms]) => s + ms, 0) + 1, start, 2, SHAKE).name);
    expect(names).toEqual(AFTER_HIT.map(([name]) => name));
    const shaking = cutscenePhase(start + sequence + SHAKE + 1, start, 2, SHAKE);
    expect(shaking).toMatchObject({ name: "shake", ms: SHAKE + 1 });
    const result = start + sequence + 2 * SHAKE;
    expect(cutscenePhase(result + 1, start, 2, SHAKE).name).toBe("result");
    expect(cutscenePhase(result + RESULT_MS + 1, start, 2, SHAKE).name).toBe("close");
    expect(cutscenePhase(result + RESULT_MS + CLOSE_MS + 1, start, 2, SHAKE).name).toBe("done");
  });
});
