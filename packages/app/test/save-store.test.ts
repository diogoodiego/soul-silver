import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSaveStore } from "../src/main/save-store";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-saves-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const start = () => ({ area: "60", x: 10, y: 20 });
const clock = () => "2026-10-24T12:00:00.000Z";
const store = (rename?: (from: string, to: string) => Promise<void>) => createSaveStore({ dir: join(dir, "saves"), start, clock, ...(rename ? { rename } : {}) });
const slotFile = (n: number) => join(dir, "saves", `slot-${n}.json`);
const read = async (path: string) => JSON.parse(await readFile(path, "utf8")) as { name: string; rev: number };

describe("create and list", () => {
  it("lists three empty slots", async () => {
    expect(await store().list()).toEqual([1, 2, 3].map((index) => ({ index, status: "empty" })));
  });

  it("creates a save at the start position", async () => {
    const s = store();
    expect(await s.create(1, " Gold ", "male", false)).toEqual({ ok: true });
    expect(await read(slotFile(1))).toMatchObject({ schemaVersion: 4, name: "Gold", rev: 0, playTimeMs: 0, area: "60", x: 10, y: 20, party: [], money: 3000, badges: 0, respawn: null, bag: [], pokedex: { seen: [], caught: [] }, storage: [], pending: [] });
    expect((await s.list())[0]).toMatchObject({ index: 1, status: "ok", name: "Gold", character: "male", backupAvailable: false, badges: 0 });
  });

  it("refuses an occupied slot without overwrite", async () => {
    const s = store();
    await s.create(1, "Gold", "male", false);
    expect(await s.create(1, "Silver", "female", false)).toMatchObject({ ok: false });
    expect((await read(slotFile(1))).name).toBe("Gold");
    expect(await s.create(1, "Silver", "female", true)).toEqual({ ok: true });
    expect((await read(slotFile(1))).name).toBe("Silver");
  });

  it.each(["", "   ", "x".repeat(17)])("refuses the name %j", async (name) => {
    expect(await store().create(1, name, "male", false)).toMatchObject({ ok: false });
  });

  it.each([0, 4, 1.5])("refuses slot %s", async (slot) => {
    expect(await store().create(slot, "Gold", "male", false)).toMatchObject({ ok: false });
  });
});

describe("write (FR-007)", () => {
  async function withSave() {
    const s = store();
    await s.create(1, "Gold", "male", false);
    const loaded = await s.load(1);
    if (!loaded.ok) throw new Error("setup");
    return { s, save: loaded.save };
  }

  it("shows the badge count in the slot summary (spec 017)", async () => {
    const { s, save } = await withSave();
    await s.write(1, { ...save, rev: 1, badges: 3 });
    expect((await s.list())[0]).toMatchObject({ status: "ok", badges: 3 });
  });

  it("keeps the previous save as the backup", async () => {
    const { s, save } = await withSave();
    await s.write(1, { ...save, rev: 1 });
    await s.write(1, { ...save, rev: 2 });
    expect((await read(slotFile(1))).rev).toBe(2);
    expect((await read(`${slotFile(1)}.bak`)).rev).toBe(1);
    expect((await readdir(join(dir, "saves"))).sort()).toEqual(["slot-1.json", "slot-1.json.bak"]);
  });

  it("refuses to write an invalid save", async () => {
    const { s, save } = await withSave();
    expect(await s.write(1, { ...save, playTimeMs: -1 })).toMatchObject({ ok: false });
    expect((await read(slotFile(1))).rev).toBe(0);
  });

  it("leaves save and backup intact when the first rename fails", async () => {
    const { save } = await withSave();
    const s = store(() => Promise.reject(new Error("disk full")));
    expect(await s.write(1, { ...save, rev: 5 })).toMatchObject({ ok: false });
    expect((await read(slotFile(1))).rev).toBe(0);
    expect((await readdir(join(dir, "saves"))).sort()).toEqual(["slot-1.json"]);
  });

  it("rolls back when the last rename fails", async () => {
    const { s, save } = await withSave();
    await s.write(1, { ...save, rev: 1 });
    let calls = 0;
    const failing = store((from, to) => (++calls === 2 ? Promise.reject(new Error("locked")) : rename(from, to)));
    expect(await failing.write(1, { ...save, rev: 2 })).toMatchObject({ ok: false });
    expect((await read(slotFile(1))).rev).toBe(1);
    expect((await readdir(join(dir, "saves"))).some((f) => f.includes("tmp"))).toBe(false);
  });

  it("does not replace the backup with a corrupt current save", async () => {
    const { s, save } = await withSave();
    await s.write(1, { ...save, rev: 1 });
    await writeFile(slotFile(1), "{ truncated");
    await s.write(1, { ...save, rev: 2 });
    expect((await read(slotFile(1))).rev).toBe(2);
    expect((await read(`${slotFile(1)}.bak`)).rev).toBe(0);
  });
});

describe("corruption and restore (FR-008, FR-009)", () => {
  async function withBackup() {
    const s = store();
    await s.create(1, "Gold", "male", false);
    const loaded = await s.load(1);
    if (!loaded.ok) throw new Error("setup");
    await s.write(1, { ...loaded.save, rev: 1 });
    return s;
  }

  it("marks a corrupt current save and offers the backup", async () => {
    const s = await withBackup();
    await writeFile(slotFile(1), '{ "schemaVersion": 1, "na');
    expect((await s.list())[0]).toMatchObject({ status: "corrupt", backupAvailable: true });
    expect(await s.load(1)).toMatchObject({ ok: false });
  });

  it("treats a missing current save with a backup the same way", async () => {
    const s = await withBackup();
    await rm(slotFile(1));
    expect((await s.list())[0]).toMatchObject({ status: "corrupt", backupAvailable: true });
  });

  it("restores the backup", async () => {
    const s = await withBackup();
    await writeFile(slotFile(1), "garbage");
    expect(await s.restoreBackup(1)).toEqual({ ok: true });
    expect((await s.list())[0]).toMatchObject({ status: "ok", name: "Gold" });
    expect((await read(slotFile(1))).rev).toBe(0);
  });

  it("marks both corrupt as unrecoverable and deletes nothing", async () => {
    const s = await withBackup();
    await writeFile(slotFile(1), "garbage");
    await writeFile(`${slotFile(1)}.bak`, "garbage too");
    expect((await s.list())[0]).toMatchObject({ status: "unrecoverable" });
    expect(await s.restoreBackup(1)).toMatchObject({ ok: false });
    expect(await readFile(slotFile(1), "utf8")).toBe("garbage");
    expect(await readFile(`${slotFile(1)}.bak`, "utf8")).toBe("garbage too");
  });

  it("detects an edited save with a field out of range", async () => {
    const s = await withBackup();
    const edited = { ...(await read(slotFile(1))), playTimeMs: -4 };
    await writeFile(slotFile(1), JSON.stringify(edited));
    expect((await s.list())[0]).toMatchObject({ status: "corrupt" });
  });

  it("refuses a save from a newer version, keeping the file", async () => {
    const s = await withBackup();
    const newer = { ...(await read(slotFile(1))), schemaVersion: 9 };
    await writeFile(slotFile(1), JSON.stringify(newer));
    const result = await s.load(1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("9");
    expect(((JSON.parse(await readFile(slotFile(1), "utf8")) as { schemaVersion: number }).schemaVersion)).toBe(9);
  });
});

describe("export and import (FR-011)", () => {
  it("round-trips through a file into another slot", async () => {
    const s = store();
    await s.create(1, "Gold", "female", false);
    const file = join(dir, "gold.sssave");
    expect(await s.exportTo(1, file)).toEqual({ ok: true });
    expect(await s.importFrom(2, file, false)).toEqual({ ok: true });
    expect((await s.list())[1]).toMatchObject({ status: "ok", name: "Gold", character: "female" });
  });

  it("refuses to import over an occupied slot without overwrite", async () => {
    const s = store();
    await s.create(1, "Gold", "male", false);
    const file = join(dir, "gold.sssave");
    await s.exportTo(1, file);
    expect(await s.importFrom(1, file, false)).toMatchObject({ ok: false });
    expect(await s.importFrom(1, file, true)).toEqual({ ok: true });
  });

  it("refuses an invalid file without touching the slot", async () => {
    const s = store();
    await s.create(1, "Gold", "male", false);
    const file = join(dir, "bad.sssave");
    await writeFile(file, '{ "schemaVersion": 1, "name": "" }');
    expect(await s.importFrom(1, file, true)).toMatchObject({ ok: false });
    await writeFile(file, "not json");
    expect(await s.importFrom(1, file, true)).toMatchObject({ ok: false });
    expect((await read(slotFile(1))).name).toBe("Gold");
  });

  it("refuses to export an empty slot and a missing file", async () => {
    const s = store();
    await mkdir(join(dir, "saves"), { recursive: true });
    expect(await s.exportTo(1, join(dir, "x.sssave"))).toMatchObject({ ok: false });
    expect(await s.importFrom(1, join(dir, "missing.sssave"), false)).toMatchObject({ ok: false });
  });
});

describe("spec 017: starter and delete", () => {
  const starter = { species: 155, level: 5, moves: [33, 43], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 2, defense: 3, speed: 4, specialAttack: 5, specialDefense: 6 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 3 };

  it("starts a new game with the chosen starter, seen and caught", async () => {
    const s = store();
    expect(await s.create(1, "Gold", "male", false, starter)).toEqual({ ok: true });
    expect(await read(slotFile(1))).toMatchObject({ party: [starter], pokedex: { seen: [155], caught: [155] } });
  });

  it("deletes a save and its backup, leaving the slot empty", async () => {
    const s = store();
    await s.create(1, "Gold", "male", false);
    await s.create(1, "Gold", "male", true);
    expect(await s.remove(1)).toEqual({ ok: true });
    expect((await s.list())[0]).toEqual({ index: 1, status: "empty" });
    expect(await readdir(join(dir, "saves"))).toEqual([]);
  });

  it("deleting an empty slot is fine, a bad slot is not", async () => {
    const s = store();
    expect(await s.remove(2)).toEqual({ ok: true });
    expect(await s.remove(4)).toMatchObject({ ok: false });
  });
});
