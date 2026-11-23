import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The tests run inside the Workers runtime (workerd, through Miniflare), locally; nothing reaches Cloudflare:
// the TURN key below is fake and test/setup.ts answers the TURN API.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { TURN_KEY_ID: "test-key-id", TURN_KEY_API_TOKEN: "test-key-token" } },
    }),
  ],
  test: { name: "lobby", setupFiles: ["./test/setup.ts"] },
});
