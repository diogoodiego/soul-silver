import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "@soulsilver/extractor";
import { type AppSettings, readSettings, settingsPatch } from "@soulsilver/shared";

/** Small per-PC settings in `settings.json`; a missing or broken field means its default. */
export function createSettings(path: string) {
  async function read(): Promise<AppSettings> {
    try {
      return readSettings(JSON.parse(await readFile(path, "utf8")));
    } catch {
      return readSettings(undefined);
    }
  }
  /** An invalid patch changes nothing and returns the current settings. */
  async function set(patch: unknown): Promise<AppSettings> {
    const current = await read();
    const parsed = settingsPatch.safeParse(patch);
    if (!parsed.success) return current;
    const next = readSettings({ ...current, ...parsed.data });
    await writeFileAtomic(path, JSON.stringify(next));
    return next;
  }
  return {
    get: read,
    set,
    async markFirewallNoticeSeen(): Promise<void> {
      await set({ firewallNoticeSeen: true });
    },
  };
}
