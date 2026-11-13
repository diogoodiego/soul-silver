import { readFileSync } from "node:fs";
import { writeFileAtomic } from "@soulsilver/extractor";
import type { TradeLedger } from "@soulsilver/server";
import { migrate, type Save } from "@soulsilver/shared/save";

// Spec 028.3: the host's book of trades whose save a client never acknowledged, in a file next to the saves.
// The session asks synchronously; the file is written behind it, atomically, one write after another.

export function openTradeLedger(path: string, log: (message: string) => void): TradeLedger & { flushed(): Promise<void> } {
  const book = new Map<string, Save>();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") log(`Trade ledger ${path} unreadable, starting empty: ${(error as Error).message}`);
  }
  // A file on disk is a trust boundary: every entry is a save checked like one coming from a client.
  if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw)) {
      const checked = migrate(value);
      if (checked.ok) book.set(name, checked.save);
      else log(`Trade ledger: dropped the entry of ${name}: ${checked.message}`);
    }
  }

  let writing = Promise.resolve();
  const write = () => {
    const data = JSON.stringify(Object.fromEntries(book), null, 2);
    writing = writing.then(() => writeFileAtomic(path, data)).catch((error: Error) => log(`Trade ledger not written: ${error.message}`));
  };

  return {
    get: (name) => book.get(name),
    put(name, save) {
      book.set(name, save);
      write();
    },
    remove(name) {
      if (book.delete(name)) write();
    },
    /** For tests and shutdown: resolves once every write so far is on disk. */
    flushed: () => writing,
  };
}
