import type { SoulSilverApi } from "@soulsilver/shared";

declare global {
  interface Window {
    soulSilver: SoulSilverApi;
  }
  /** Replaced by Vite at build time. */
  interface ImportMeta {
    readonly env: { readonly MODE: string };
  }
}
