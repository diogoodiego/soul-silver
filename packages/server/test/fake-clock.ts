interface Timer {
  at: number;
  fn: () => void;
}

/** Deterministic clock and scheduler for loop tests. */
export function createFakeClock() {
  let time = 0;
  let nextId = 0;
  const pending = new Map<number, Timer>();

  return {
    now: () => time,
    schedule: (fn: () => void, delayMs: number): number => {
      const id = nextId++;
      pending.set(id, { at: time + Math.max(0, delayMs), fn });
      return id;
    },
    cancel: (handle: unknown) => {
      pending.delete(handle as number);
    },
    /** Moves time without firing timers, simulating a blocked event loop. */
    block: (ms: number) => {
      time += ms;
    },
    /** Fires, in order, every timer due up to now + ms. */
    advance: (ms: number) => {
      const target = time + ms;
      for (;;) {
        let next: [number, Timer] | undefined;
        for (const entry of pending) {
          if (entry[1].at <= target && (!next || entry[1].at < next[1].at)) next = entry;
        }
        if (!next) break;
        pending.delete(next[0]);
        time = Math.max(time, next[1].at);
        next[1].fn();
      }
      time = Math.max(time, target);
    },
    pendingCount: () => pending.size,
  };
}
