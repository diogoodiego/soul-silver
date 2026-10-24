import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomSuffix, renameWithRetry, writeFileAtomic } from "@soulsilver/extractor";
import { migrate, SAVE_SLOTS, type Save, type SaveResult, type SlotSummary } from "@soulsilver/shared/save";

// The player's saves, in the player's PC (spec 012, principle VIII, contracts/save-file.md).

export interface SaveStoreOptions {
  dir: string;
  /** Where a new game starts. */
  start: () => { area: string; x: number; y: number };
  clock?: () => string;
  /** Injected in tests to fail the renames. */
  rename?: (from: string, to: string) => Promise<void>;
}

type Read = { state: "missing" } | { state: "ok"; save: Save } | { state: "bad"; reason: string };
export type LoadResult = { ok: true; save: Save } | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const validSlot = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= SAVE_SLOTS;

async function readSave(path: string): Promise<Read> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    return { state: "bad", reason: `não foi possível ler o arquivo: ${(error as Error).message}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: "bad", reason: "arquivo ilegível ou incompleto" };
  }
  const migrated = migrate(raw);
  return migrated.ok ? { state: "ok", save: migrated.save } : { state: "bad", reason: migrated.message };
}

export function createSaveStore(options: SaveStoreOptions) {
  const rename = options.rename ?? renameWithRetry;
  const clock = options.clock ?? (() => new Date().toISOString());
  const current = (slot: number) => join(options.dir, `slot-${slot}.json`);
  const backup = (slot: number) => `${current(slot)}.bak`;

  async function summary(index: number): Promise<SlotSummary> {
    const [cur, bak] = await Promise.all([readSave(current(index)), readSave(backup(index))]);
    if (cur.state === "ok") {
      const s = cur.save;
      return { index, status: "ok", name: s.name, character: s.character, area: s.area, playTimeMs: s.playTimeMs, savedAt: s.savedAt, backupAvailable: bak.state === "ok" };
    }
    if (cur.state === "missing" && bak.state === "missing") return { index, status: "empty" };
    const reason = cur.state === "bad" ? cur.reason : "arquivo do save ausente";
    return bak.state === "ok" ? { index, status: "corrupt", reason, backupAvailable: true } : { index, status: "unrecoverable", reason };
  }

  async function write(slot: number, save: Save): Promise<SaveResult> {
    if (!validSlot(slot)) return fail("slot inválido");
    const checked = migrate(save);
    if (!checked.ok) return fail(checked.message);
    const target = current(slot);
    const tmp = `${target}.tmp-${randomSuffix()}`;
    let movedToBackup = false;
    try {
      await mkdir(options.dir, { recursive: true });
      const handle = await open(tmp, "w");
      try {
        await handle.writeFile(JSON.stringify(checked.save, null, 2));
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Only an intact save becomes the backup; a corrupt one must not replace it.
      if ((await readSave(target)).state === "ok") {
        await rename(target, backup(slot));
        movedToBackup = true;
      }
      await rename(tmp, target);
      return { ok: true };
    } catch (error) {
      await rm(tmp, { force: true });
      if (movedToBackup) await rename(backup(slot), target).catch(() => undefined);
      return fail(`não foi possível gravar o save: ${(error as Error).message}`);
    }
  }

  async function load(slot: number): Promise<LoadResult> {
    if (!validSlot(slot)) return fail("slot inválido");
    const read = await readSave(current(slot));
    if (read.state === "ok") return { ok: true, save: read.save };
    return fail(read.state === "bad" ? read.reason : "slot vazio");
  }

  return {
    async list(): Promise<SlotSummary[]> {
      return Promise.all(Array.from({ length: SAVE_SLOTS }, (_, i) => summary(i + 1)));
    },
    load,
    write,
    async create(slot: number, name: string, character: "male" | "female", overwrite: boolean): Promise<SaveResult> {
      if (!validSlot(slot)) return fail("slot inválido");
      const save = { schemaVersion: 1, name: name.trim(), character, ...options.start(), facing: "south", playTimeMs: 0, savedAt: clock(), rev: 0 };
      const checked = migrate(save);
      if (!checked.ok) return fail(checked.message);
      if (!overwrite && (await summary(slot)).status !== "empty") return fail("o slot já tem um save");
      return write(slot, checked.save);
    },
    async restoreBackup(slot: number): Promise<SaveResult> {
      if (!validSlot(slot)) return fail("slot inválido");
      const bak = await readSave(backup(slot));
      if (bak.state !== "ok") return fail("não há backup íntegro");
      // Goes through write(): the corrupt file stays where it is until replaced.
      return write(slot, bak.save);
    },
    async exportTo(slot: number, path: string): Promise<SaveResult> {
      const loaded = await load(slot);
      if (!loaded.ok) return fail(loaded.reason);
      try {
        await writeFileAtomic(path, JSON.stringify(loaded.save, null, 2));
        return { ok: true };
      } catch (error) {
        return fail(`não foi possível gravar o arquivo: ${(error as Error).message}`);
      }
    },
    async importFrom(slot: number, path: string, overwrite: boolean): Promise<SaveResult> {
      if (!validSlot(slot)) return fail("slot inválido");
      const read = await readSave(path);
      if (read.state === "missing") return fail("arquivo não encontrado");
      if (read.state === "bad") return fail(`arquivo de save inválido: ${read.reason}`);
      if (!overwrite && (await summary(slot)).status !== "empty") return fail("o slot já tem um save");
      return write(slot, read.save);
    },
  };
}

export type SaveStore = ReturnType<typeof createSaveStore>;
