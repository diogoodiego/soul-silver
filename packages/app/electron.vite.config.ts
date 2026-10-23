import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "electron-vite";

// Workspace packages are TypeScript sources and must be bundled, not required at runtime.
const bundledWorkspaceDeps = { exclude: ["@soulsilver/shared", "@soulsilver/server"] };

export default defineConfig({
  main: {
    build: {
      externalizeDeps: bundledWorkspaceDeps,
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          "server-host": resolve(import.meta.dirname, "src/server-host/entry.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: bundledWorkspaceDeps,
      // Sandboxed preloads cannot be ES modules.
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "../client"),
    plugins: [svelte()],
    build: {
      rolldownOptions: {
        input: resolve(import.meta.dirname, "../client/index.html"),
      },
    },
  },
});
