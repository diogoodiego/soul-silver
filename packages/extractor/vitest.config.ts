import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extractor",
    // Stage tests write and read many files: the CI runner takes several times longer than a PC.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
