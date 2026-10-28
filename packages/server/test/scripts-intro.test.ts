import { describe, expect, it } from "vitest";
import { mapEvents, scriptData, story } from "./scripts-fixture";

// Spec 021 FR-011: Prof. Oak's introduction runs once, for a save just created, with its name.

const data = () => scriptData([], { 60: mapEvents() });
const says = (t: ReturnType<typeof story>, c: ReturnType<ReturnType<typeof story>["connect"]>) =>
  t.of(c, "script").flatMap((m) => (m.request.kind === "say" ? [m.request] : []));

describe("introduction", () => {
  it("a new save hears Oak's speech, with its name buffered, without new questions", () => {
    const t = story(data(), { intro: true });
    const a = t.connect("Lyra");
    t.step(2);
    for (let id = 1; id <= 3; id++) {
      a.conn.send({ type: "script-answer", id });
      t.step();
    }
    const all = says(t, a);
    expect(all.map((r) => r.text)).toEqual(["0219:6", "0219:34", "0219:35", "0219:43"]);
    expect(all.at(-1)!.buffers).toEqual({ "0": { kind: "player" } });
    expect(t.of(a, "script").some((m) => m.request.kind === "yes-no")).toBe(false);
  });

  it("a save already played does not hear it again", () => {
    const t = story(data(), { intro: true });
    const a = t.connect("Lyra", undefined, { save: { rev: 3, playTimeMs: 60_000 } });
    t.step(3);
    expect(says(t, a)).toEqual([]);
  });

  it("runs once even after a reconnect", () => {
    const t = story(data(), { intro: true });
    t.connect("Host", undefined, { save: { rev: 1, playTimeMs: 1 } });
    const a = t.connect("Lyra");
    t.step(2);
    for (let id = 1; id <= 4; id++) {
      a.conn.send({ type: "script-answer", id });
      t.step();
    }
    a.conn.send({ type: "leave" });
    const save = a.saves().at(-1)!.save;
    const back = t.connect("Lyra2", undefined, { save });
    t.step(3);
    expect(says(t, back)).toEqual([]);
  });
});
