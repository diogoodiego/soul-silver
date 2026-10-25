import type { HitEvent } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { feedbackLines, type FeedbackTexts } from "../../src/render/combat-fx";

// Stand-ins in the catalog's markup; the real texts come from the extraction.
const BATTLE: Record<number, string> = { 780: "SUPER", 779: "WEAK", 774: "CRIT", 27: "NONE{n}{pokemon-name:0}..." };
const texts: FeedbackTexts = { battle: (id) => BATTLE[id], species: (id) => (id === 92 ? "GASTLY" : undefined) };
const base: HitEvent = { kind: "hit", attacker: 1, target: 2, move: 52, amount: 12, effectiveness: 1, crit: false, push: { x: 0, y: 0 } };

describe("feedbackLines", () => {
  it("shows the damage, and the effectiveness only when it is not neutral", () => {
    expect(feedbackLines(base, texts, 152)).toEqual([{ text: "12", tone: "damage" }]);
    expect(feedbackLines({ ...base, effectiveness: 2 }, texts, 152).map((l) => l.text)).toEqual(["12", "SUPER"]);
    expect(feedbackLines({ ...base, effectiveness: 4 }, texts, 152).map((l) => l.text)).toEqual(["12", "SUPER"]);
    expect(feedbackLines({ ...base, effectiveness: 0.25 }, texts, 152).map((l) => l.text)).toEqual(["12", "WEAK"]);
    expect(feedbackLines({ ...base, crit: true }, texts, 152).map((l) => l.text)).toEqual(["12", "CRIT"]);
  });

  it("names the target on no effect", () => {
    expect(feedbackLines({ ...base, kind: "immune", amount: 0, effectiveness: 0 }, texts, 92)).toEqual([{ text: "NONE GASTLY...", tone: "none" }]);
  });

  it("still shows numbers without the catalog", () => {
    const none: FeedbackTexts = { battle: () => undefined, species: () => undefined };
    expect(feedbackLines({ ...base, effectiveness: 2 }, none, 152)).toEqual([{ text: "12", tone: "damage" }]);
    expect(feedbackLines({ ...base, kind: "heal", amount: 5 }, none, 152)).toEqual([{ text: "+5", tone: "heal" }]);
  });
});
