import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    // Timing tests are the root config's server-perf project.
    exclude: [...configDefaults.exclude, "**/*perf.test.ts"],
  },
});
