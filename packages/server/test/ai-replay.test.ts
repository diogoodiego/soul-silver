import type { Decision } from "@soulsilver/shared/ai";
import { createRng, type WorldMap } from "@soulsilver/shared/game";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRecorder, replay } from "../src/recorder";
import { combatData } from "./combat-fixture";
import { setup } from "./harness";
import { aiData, grassMap, px, wildData } from "./wild-fixture";

// Spec 019 SC-008: a recorded session replays to the same AI decisions, every time.

const WORLD: Record<string, WorldMap> = { route: grassMap("route", (x) => x >= 6 && x <= 14) };
const options = () => ({
  world: (id: string) => WORLD[id],
  combat: combatData(),
  wild: wildData({ spawn: { defaultCap: 3, viewHalfTiles: { x: 0, y: 0 }, viewMarginTiles: 0 }, temperaments: { default: "aggressive", species: {} } }),
  ai: aiData({ profiles: { sightTiles: 16, sightAngleDeg: 360 } }),
  hour: () => 12,
  timeoutTicks: 1e9,
});

function record() {
  const recorder = createRecorder(19);
  const decisions: Decision[] = [];
  const { session, connect } = setup({ ...options(), seed: 19, onRecord: recorder.onRecord, onDecision: (d) => decisions.push(d), spawn: () => ({ area: "route", x: px(4), y: px(5) }) });
  const c = connect("A");
  const rng = createRng(3);
  const dirs = ["north", "south", "east", "west", null] as const;
  for (let t = 0; t < 20 * 30; t++) {
    c.input(t, dirs[rng.nextInt(5)]!);
    session.step();
  }
  return { decisions, recording: recorder.recording(session.tick) };
}

function replayed(recording: ReturnType<typeof record>["recording"]) {
  const decisions: Decision[] = [];
  replay(recording, { ...options(), onDecision: (d) => decisions.push(d) });
  return decisions;
}

describe("AI determinism (US6)", () => {
  it("two replays of a recorded session make the same decisions as the session", () => {
    const original = record();
    expect(original.decisions.some((d) => d.scores.length > 0)).toBe(true);
    const a = replayed(original.recording);
    const b = replayed(original.recording);
    expect(a).toEqual(original.decisions);
    expect(b).toEqual(a);
  });

  it.each(readdirSync(join(import.meta.dirname, "../../shared/src/ai")).concat(["ai.ts", "wild.ts"]))("%s uses no wall clock or unseeded randomness", (file) => {
    const dir = file === "ai.ts" || file === "wild.ts" ? join(import.meta.dirname, "../src") : join(import.meta.dirname, "../../shared/src/ai");
    expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
  });
});
