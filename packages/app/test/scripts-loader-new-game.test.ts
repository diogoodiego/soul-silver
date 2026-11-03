import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeEventsFile } from "@soulsilver/shared/events";
import { serializeMapFile } from "@soulsilver/shared/maps";
import { serializeTextFile } from "@soulsilver/shared/text";
import { afterEach, describe, expect, it } from "vitest";
import { loadScripts } from "../src/server-host/scripts-loader";

// Spec 024, T011: the new-game start and the std message banks reach the server with the scripts.

let dir: string;

function stages(files: { newGame?: boolean; std?: string }) {
  dir = mkdtempSync(join(tmpdir(), "ss-new-game-"));
  const events = join(dir, "events", "events");
  mkdirSync(join(events, "scripts"), { recursive: true });
  mkdirSync(join(dir, "maps", "maps"), { recursive: true });
  writeFileSync(join(dir, "maps", "maps", "map-headers.json"), serializeMapFile("map-headers", { kind: "map-headers", formatVersion: 1, records: [] }));
  if (files.newGame) writeFileSync(join(events, "new-game.json"), serializeEventsFile("new-game", { kind: "new-game", formatVersion: 1, map: 64, tx: 6, ty: 6, facing: "south", initScript: 9600 }));
  if (files.std) writeFileSync(join(events, "std-messages.json"), files.std);
  return dir;
}

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("scripts loader: new game", () => {
  it("passes on the init script and the std message banks", () => {
    const logs: string[] = [];
    const data = loadScripts(stages({ newGame: true, std: serializeEventsFile("std-messages", { kind: "std-messages", formatVersion: 1, banks: [752, 211, 30, 435] }) }), (m) => logs.push(m))!;
    expect(data.newGame).toEqual({ map: 64, tx: 6, ty: 6, facing: "south", initScript: 9600 });
    expect(data.stdMessageBanks).toEqual([752, 211, 30, 435]);
    expect(logs).toEqual([]);
  });

  it("reads the rival's default name from the game's text", () => {
    const root = stages({});
    mkdirSync(join(root, "text-catalog", "catalog", "en"), { recursive: true });
    writeFileSync(join(root, "text-catalog", "catalog", "en", "0254.json"), serializeTextFile("text-bank", { kind: "text-bank", formatVersion: 1, language: "en", bank: 254, name: "0254", records: [{ id: 84, text: "Soul" }, { id: 85, text: "Heart" }] }));
    expect(loadScripts(root, () => undefined)!.defaultRival).toBe("Heart");
  });

  it("has no default rival name without the text catalog", () => {
    expect(loadScripts(stages({}), () => undefined)!.defaultRival).toBeUndefined();
  });

  it("logs file, field and problem for a bad file and leaves it out", () => {
    const logs: string[] = [];
    const data = loadScripts(stages({ std: JSON.stringify({ kind: "std-messages", formatVersion: 1, banks: [] }) }), (m) => logs.push(m))!;
    expect(data.stdMessageBanks).toBeUndefined();
    expect(data.newGame).toBeUndefined();
    expect(logs).toEqual([expect.stringMatching(/std-messages\.json: banks: /)]);
  });
});
