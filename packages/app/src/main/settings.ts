import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "@soulsilver/extractor";
import type { AppSettings } from "@soulsilver/shared";

const DEFAULTS: AppSettings = { firewallNoticeSeen: false };

/** Small per-PC settings in `settings.json`; a missing or broken file means defaults. */
export function createSettings(path: string) {
  async function read(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as Partial<AppSettings>;
      return { firewallNoticeSeen: raw.firewallNoticeSeen === true };
    } catch {
      return DEFAULTS;
    }
  }
  return {
    get: read,
    async markFirewallNoticeSeen(): Promise<void> {
      await writeFileAtomic(path, JSON.stringify({ ...(await read()), firewallNoticeSeen: true }));
    },
  };
}
