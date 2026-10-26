import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";

// The app has no runtime `dependencies`: electron-vite only externalizes those, so
// workspace packages and electron-updater are bundled and the packaged app ships
// without node_modules.
export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          "server-host": resolve(import.meta.dirname, "src/server-host/entry.ts"),
          "extractor-host": resolve(import.meta.dirname, "src/extractor-host/entry.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads cannot be ES modules.
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "../client"),
    plugins: [svelte(), tailwindcss()],
    build: {
      // No packaged path may contain an `assets/` segment (asset guard, principle II).
      assetsDir: "static",
      rolldownOptions: {
        input: resolve(import.meta.dirname, "../client/index.html"),
      },
    },
  },
});
