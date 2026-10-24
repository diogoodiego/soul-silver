import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSettings } from "../src/main/settings";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-settings-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("settings", () => {
  it("starts with the firewall notice unseen", async () => {
    expect(await createSettings(join(dir, "settings.json")).get()).toEqual({ firewallNoticeSeen: false });
  });

  it("remembers the notice was seen across instances", async () => {
    const path = join(dir, "settings.json");
    await createSettings(path).markFirewallNoticeSeen();
    expect(await createSettings(path).get()).toEqual({ firewallNoticeSeen: true });
  });

  it("falls back to defaults on a broken file", async () => {
    const path = join(dir, "settings.json");
    await writeFile(path, "{ broken");
    expect(await createSettings(path).get()).toEqual({ firewallNoticeSeen: false });
  });
});
