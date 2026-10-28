import { describe, expect, it } from "vitest";
import { createDialogQueue } from "../../src/game/dialog-queue";

// Spec 017, US4: text box with typing, advance, yes/no, and the original's speeds.

const FRAME_MS = 1000 / 60;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("dialog queue", () => {
  it("types at the original speed: slow 8, mid 4, fast 1 frame per character", () => {
    for (const [speed, frames] of [["slow", 8], ["mid", 4], ["fast", 1]] as const) {
      const d = createDialogQueue();
      void d.say(["abcdefghij"]);
      d.step(FRAME_MS * frames * 3, speed);
      expect(d.view()?.text).toBe("abc");
    }
  });

  it("completes the text on confirm, then advances and resolves", async () => {
    const d = createDialogQueue();
    let done = false;
    void d.say(["hello"]).then(() => (done = true));
    d.confirm();
    expect(d.view()).toMatchObject({ text: "hello", complete: true });
    d.confirm();
    await flush();
    expect(done).toBe(true);
    expect(d.view()).toBeUndefined();
  });

  it("shows pages one after the other", () => {
    const d = createDialogQueue();
    void d.say(["one", "two"]);
    d.confirm();
    d.confirm();
    expect(d.view()?.text).toBe("");
    d.confirm();
    expect(d.view()).toMatchObject({ text: "two", complete: true });
  });

  it("asks yes or no: Yes is the default, the cursor moves, cancel answers No", async () => {
    const d = createDialogQueue();
    const first = d.ask(["Again?"]);
    d.confirm();
    expect(d.view()).toMatchObject({ choosing: true, yes: true });
    d.confirm();
    expect(await first).toBe(true);

    const second = d.ask(["Again?"]);
    d.confirm();
    d.move();
    expect(d.view()?.yes).toBe(false);
    d.confirm();
    expect(await second).toBe(false);

    const third = d.ask(["Again?"]);
    d.confirm();
    d.cancel();
    expect(await third).toBe(false);
  });

  it("offers a list after the text: the cursor wraps, confirm answers its index, cancel answers -1", async () => {
    const d = createDialogQueue();
    const first = d.choose(["What do you need?"], ["BUY", "SELL", "SEE YA!"]);
    d.confirm();
    expect(d.view()).toMatchObject({ choosing: true, options: ["BUY", "SELL", "SEE YA!"], cursor: 0 });
    d.move(-1);
    expect(d.view()?.cursor).toBe(2);
    d.move(1);
    d.move(1);
    d.confirm();
    expect(await first).toBe(1);

    const second = d.choose(["What do you need?"], ["BUY", "SELL"]);
    d.confirm();
    d.cancel();
    expect(await second).toBe(-1);
  });

  it("cancel only completes the text while it is typing", () => {
    const d = createDialogQueue();
    void d.ask(["Again?"]);
    d.cancel();
    expect(d.view()).toMatchObject({ complete: true, choosing: true });
  });

  it("queues dialogs in order", async () => {
    const d = createDialogQueue();
    const order: string[] = [];
    void d.say(["a"]).then(() => order.push("a"));
    void d.say(["b"]).then(() => order.push("b"));
    d.confirm();
    d.confirm();
    expect(d.view()?.text).toBe("");
    d.confirm();
    d.confirm();
    await flush();
    expect(order).toEqual(["a", "b"]);
  });
});
