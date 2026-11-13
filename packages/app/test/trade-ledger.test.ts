import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, type Save } from "@soulsilver/shared/save";
import { afterEach, describe, expect, it } from "vitest";
import { openTradeLedger } from "../src/server-host/trade-ledger";

// Spec 028.3: the host's book of trades not yet saved on a client, in a file that outlives the session and the app.

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function folder() {
  const d = await mkdtemp(join(tmpdir(), "ss-ledger-"));
  dirs.push(d);
  return d;
}
function save(name: string, rev: number): Save {
  const created = migrate({ schemaVersion: 1, name, character: "male", area: "a", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-11-13T12:00:00.000Z", rev });
  if (!created.ok) throw new Error(created.message);
  return created.save;
}

describe("trade ledger file (spec 028.3)", () => {
  it("keeps what is put across a reopen, and forgets what is removed", async () => {
    const path = join(await folder(), "trades-pending.json");
    const a = openTradeLedger(path, () => undefined);
    a.put("Silver", save("Silver", 7));
    a.put("Gold", save("Gold", 3));
    a.remove("Gold");
    await a.flushed();
    const b = openTradeLedger(path, () => undefined);
    expect(b.get("Silver")?.rev).toBe(7);
    expect(b.get("Gold")).toBeUndefined();
  });

  it("starts empty without a file", async () => {
    const ledger = openTradeLedger(join(await folder(), "none.json"), () => undefined);
    expect(ledger.get("Silver")).toBeUndefined();
  });

  it("drops an entry that is not a valid save, and says so, keeping the others", async () => {
    const path = join(await folder(), "trades-pending.json");
    await writeFile(path, JSON.stringify({ Silver: save("Silver", 4), Gold: { name: "Gold" } }));
    const logs: string[] = [];
    const ledger = openTradeLedger(path, (m) => logs.push(m));
    expect(ledger.get("Silver")?.rev).toBe(4);
    expect(ledger.get("Gold")).toBeUndefined();
    expect(logs.join()).toContain("Gold");
  });

  it("survives a file that is not JSON: empty book, logged, and the next write replaces it", async () => {
    const path = join(await folder(), "trades-pending.json");
    await writeFile(path, "{ not json");
    const logs: string[] = [];
    const ledger = openTradeLedger(path, (m) => logs.push(m));
    expect(ledger.get("Silver")).toBeUndefined();
    expect(logs.length).toBe(1);
    ledger.put("Silver", save("Silver", 2));
    await ledger.flushed();
    expect(Object.keys(JSON.parse(await readFile(path, "utf8")) as object)).toEqual(["Silver"]);
  });
});
