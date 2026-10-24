// Seeded generator for the simulation (spec 010, research R8). The simulation never uses Math.random.

export interface Rng {
  /** Uniform uint32. */
  next(): number;
  /** Uniform in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [0, n). */
  nextInt(n: number): number;
}

/** sfc32 seeded from a 32-bit value. */
export function createRng(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;

  function next(): number {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }

  for (let i = 0; i < 15; i++) next();

  return {
    next,
    nextFloat: () => next() / 0x100000000,
    nextInt: (n) => Math.floor((next() / 0x100000000) * n),
  };
}
