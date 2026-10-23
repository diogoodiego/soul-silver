import type { SoulSilverApi } from "@soulsilver/shared";

declare global {
  interface Window {
    soulSilver: SoulSilverApi;
  }
}
