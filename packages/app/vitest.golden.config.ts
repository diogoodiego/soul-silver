import { defineConfig } from "vitest/config";

// The golden path (spec 024 US6): local only, with the real extraction. The default config never matches *.golden.ts.
export default defineConfig({
  test: {
    name: "golden",
    environment: "node",
    include: ["golden/**/*.golden.ts"],
    testTimeout: 600_000,
    // The report is the point of the run, passing or not.
    silent: false,
  },
});
