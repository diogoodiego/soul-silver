import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "scripts",
      // Timing tests run after the rest, one file at a time, so they do not compete for the CPU.
      { test: { name: "server-perf", root: "packages/server", include: ["test/**/*perf.test.ts"], maxWorkers: 1, sequence: { groupOrder: 1 } } },
    ],
  },
});
