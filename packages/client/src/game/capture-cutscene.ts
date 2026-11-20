// The capture cutscene's timeline, one continuous shot: a line across the middle of the screen opens into a
// band; inside it the ball flies into the Pokémon, bounces off onto the ground, opens, draws the Pokémon in as
// red particles, closes; the daylight dies to a single spotlight on the ball, which rocks once per shake; then
// the band closes. Times in ms.

export const LINE_MS = 250;
export const OPEN_MS = 350;
/** When the ball reaches the Pokémon, from the throw. */
export const HIT_MS = LINE_MS + OPEN_MS + 700;
/** How long the ball waits at the Pokémon for the server's result before the cutscene gives up (a miss). */
export const WAIT_MS = 2000;
/** From the result (the ball at the Pokémon), in order. */
export const AFTER_HIT = [
  ["bounce", 650],
  ["lid-open", 300],
  ["absorb", 1100],
  ["lid-close", 250],
  ["dim", 900],
] as const;
/** After the last shake: the result shown before the band closes. */
export const RESULT_MS = 1200;
export const CLOSE_MS = 350;

export type CutsceneStep = "line" | "open" | "throw" | "wait" | (typeof AFTER_HIT)[number][0] | "shake" | "result" | "close" | "done";
/** `k`: 0–1 through the step; `ms`: since the step began. */
export type CutscenePhase = { name: CutsceneStep; k: number; ms: number };

const step = (name: CutsceneStep, ms: number, length: number): CutscenePhase => ({ name, k: Math.min(1, ms / length), ms });

/** `resultAt`: when the server's result arrived with the ball at the Pokémon; undefined until then. */
export function cutscenePhase(t: number, resultAt: number | undefined, shakes: number, shakeMs: number): CutscenePhase {
  if (t < LINE_MS) return step("line", t, LINE_MS);
  if (t < LINE_MS + OPEN_MS) return step("open", t - LINE_MS, OPEN_MS);
  if (t < HIT_MS) return step("throw", t - LINE_MS - OPEN_MS, HIT_MS - LINE_MS - OPEN_MS);
  if (resultAt === undefined) return t - HIT_MS > WAIT_MS ? step("done", 0, 1) : step("wait", t - HIT_MS, WAIT_MS);
  let ms = t - resultAt;
  for (const [name, length] of AFTER_HIT) {
    if (ms < length) return step(name, ms, length);
    ms -= length;
  }
  if (ms < shakes * shakeMs) return step("shake", ms, shakes * shakeMs);
  ms -= shakes * shakeMs;
  if (ms < RESULT_MS) return step("result", ms, RESULT_MS);
  ms -= RESULT_MS;
  if (ms < CLOSE_MS) return step("close", ms, CLOSE_MS);
  return step("done", 0, 1);
}
