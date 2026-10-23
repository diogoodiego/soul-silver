import { describe, expect, it, vi } from "vitest";
import { createTickLoop } from "../src/tick-loop";
import { createFakeClock } from "./fake-clock";

function setup(onTickExtra: () => void = () => {}) {
  const clock = createFakeClock();
  const ticks: number[] = [];
  const onOverrun = vi.fn();
  const loop = createTickLoop({
    hz: 20,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onTick: (tick) => {
      ticks.push(tick);
      onTickExtra();
    },
    onOverrun,
  });
  return { clock, ticks, onOverrun, loop };
}

describe("createTickLoop", () => {
  it("runs 200 ± 1 ticks in 10 s at 20 Hz", () => {
    const { clock, ticks, loop } = setup();
    loop.start();
    clock.advance(10_000);
    expect(ticks.length).toBeGreaterThanOrEqual(199);
    expect(ticks.length).toBeLessThanOrEqual(201);
  });

  it("does not drift when each tick takes 10 ms", () => {
    const { clock, ticks, loop } = setup(() => clock.block(10));
    loop.start();
    clock.advance(10_000);
    expect(ticks.length).toBeGreaterThanOrEqual(199);
    expect(ticks.length).toBeLessThanOrEqual(201);
  });

  it("numbers ticks from 1, strictly increasing", () => {
    const { clock, ticks, loop } = setup();
    loop.start();
    clock.advance(500);
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("catches up missed ticks in sequence when late", () => {
    const { clock, ticks, onOverrun, loop } = setup();
    loop.start();
    clock.advance(50); // tick 1
    clock.block(200); // event loop blocked until t=250
    clock.advance(0);
    expect(ticks).toEqual([1, 2, 3, 4, 5]);
    expect(onOverrun).not.toHaveBeenCalled();
    clock.advance(50);
    expect(ticks.at(-1)).toBe(6);
  });

  it("runs at most 5 catch-up ticks and drops the rest", () => {
    const { clock, ticks, onOverrun, loop } = setup();
    loop.start();
    clock.advance(50); // tick 1
    clock.block(1000); // t=1050: 20 ticks due
    clock.advance(0);
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(onOverrun).toHaveBeenCalledWith(15);
    clock.advance(50);
    expect(ticks.at(-1)).toBe(7);
  });

  it("stops ticking after stop()", () => {
    const { clock, ticks, loop } = setup();
    loop.start();
    clock.advance(100);
    loop.stop();
    expect(clock.pendingCount()).toBe(0);
    clock.advance(1000);
    expect(ticks).toEqual([1, 2]);
  });
});
