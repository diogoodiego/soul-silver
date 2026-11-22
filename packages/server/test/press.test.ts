import { BUTTON, clientMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createRecorder, replay } from "../src/recorder";
import { setup } from "./harness";

// Block C: a press of a combat button goes ahead of the input stream, in its own message.

type Recorded = { tick: number; buttons: number; seen: number | undefined };

function joined() {
  const recorder = createRecorder(1);
  const t = setup({ onRecord: recorder.onRecord });
  const c = t.connect();
  const input = (seq: number, buttons = 0) => c.conn.send({ type: "input", seq, move: { x: 0, y: 0 }, run: false, buttons });
  const press = (id: number, seq: number, buttons: number, seen: number) => c.conn.send({ type: "press", id, seq, buttons, seen });
  const applied = (): Recorded[] =>
    recorder.recording(t.session.tick).events.flatMap((e) => (e.kind === "input" ? [{ tick: e.tick, buttons: e.input.buttons, seen: e.input.seen }] : []));
  return { t, c, input, press, applied, recorder };
}

describe("press", () => {
  it("is applied with the next tick's input, ahead of the one that carries it, and stays down until that one", () => {
    const { t, c, input, press, applied } = joined();
    input(0);
    input(1);
    press(0, 2, BUTTON.guard, 0);
    t.session.step();
    input(2, BUTTON.guard);
    t.session.step();
    t.session.step();
    input(3);
    t.session.step();
    expect(applied().map((e) => e.buttons)).toEqual([BUTTON.guard, BUTTON.guard, BUTTON.guard, 0]);
    // What the screen showed goes with the press alone.
    expect(applied().map((e) => e.seen)).toEqual([0, undefined, undefined, undefined]);
    expect(c.lastState()!.lastPress).toBe(0);
  });

  it("is not lost when it was let go before the next input", () => {
    const { t, input, press, applied } = joined();
    press(0, 0, 1, 0);
    input(0);
    t.session.step();
    input(1);
    t.session.step();
    expect(applied().map((e) => e.buttons)).toEqual([1, 0]);
  });

  it("waits for an input, and is acknowledged only then", () => {
    const { t, c, input, press, applied } = joined();
    press(4, 0, BUTTON.dash, 0);
    t.session.step();
    expect(c.lastState()!.lastPress).toBe(-1);
    input(0, BUTTON.dash);
    t.session.step();
    expect(applied()).toMatchObject([{ buttons: BUTTON.dash, seen: 0 }]);
    expect(c.lastState()!.lastPress).toBe(4);
  });

  it("takes only combat buttons, once each, and a bounded number", () => {
    const { t, input, press, applied } = joined();
    press(0, 1, BUTTON.throw | BUTTON.combat | BUTTON.interact | 2, 0);
    press(0, 1, 4, 0);
    for (let i = 1; i < 100; i++) press(i, 1000, 0, 0);
    input(0);
    t.session.step();
    expect(applied()[0]!.buttons).toBe(2);
  });

  it("is refused when malformed", () => {
    for (const bad of [{ id: -1 }, { seen: 1.5 }, { buttons: "x" }, { extra: 1 }]) expect(clientMessage.safeParse({ type: "press", id: 0, seq: 0, buttons: 1, seen: 0, ...bad }).success).toBe(false);
  });

  it("is in the recording, so a replay sees it", () => {
    const { t, input, press, recorder } = joined();
    input(0);
    press(0, 1, BUTTON.guard, 0);
    t.session.step();
    const session = replay(recorder.recording(t.session.tick), { world: () => undefined });
    expect(session.tick).toBe(t.session.tick);
  });
});
