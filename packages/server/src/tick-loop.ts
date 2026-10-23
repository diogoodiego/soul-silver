export interface Scheduler {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface TickLoopOptions extends Scheduler {
  hz: number;
  onTick(tick: number): void;
  /** Called with the number of ticks dropped when the loop falls too far behind. */
  onOverrun?(dropped: number): void;
}

export interface TickLoop {
  start(): void;
  stop(): void;
}

const MAX_CATCH_UP_TICKS = 5;

/**
 * Fixed-step loop: tick n is due at start + n × period. Deadlines are absolute,
 * so slow ticks or late timers do not accumulate drift.
 */
export function createTickLoop(options: TickLoopOptions): TickLoop {
  const period = 1000 / options.hz;
  let start = 0;
  let tick = 0;
  let handle: unknown;
  let running = false;

  function scheduleNext(): void {
    const deadline = start + (tick + 1) * period;
    handle = options.schedule(run, deadline - options.now());
  }

  function run(): void {
    let due = Math.floor((options.now() - start) / period) - tick;
    if (due > MAX_CATCH_UP_TICKS) {
      const dropped = due - MAX_CATCH_UP_TICKS;
      start += dropped * period;
      due = MAX_CATCH_UP_TICKS;
      options.onOverrun?.(dropped);
    }
    for (let i = 0; i < due && running; i++) {
      tick++;
      options.onTick(tick);
    }
    if (running) scheduleNext();
  }

  return {
    start() {
      if (running) return;
      running = true;
      start = options.now();
      tick = 0;
      scheduleNext();
    },
    stop() {
      running = false;
      options.cancel(handle);
    },
  };
}
