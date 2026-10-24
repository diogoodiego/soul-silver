import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SIMULATION = ["session.ts", "world.ts", "replication.ts", "relevance.ts", "recorder.ts"];

describe("simulation determinism", () => {
  it.each(SIMULATION)("%s uses no wall clock or unseeded randomness", (file) => {
    const source = readFileSync(join(import.meta.dirname, "../src", file), "utf8");
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
  });
});
