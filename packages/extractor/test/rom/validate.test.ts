import { mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RomRegion } from "@soulsilver/shared/rom-validation";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateRom } from "../../src/rom/validate.ts";
import { buildNdsRom, corruptByte, HEADER_SIZE, sha1Hex } from "../fixtures/build-nds-rom.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-validate-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, bytes: Uint8Array): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

const rom = buildNdsRom();
const references = [sha1Hex(rom)];

async function validate(bytes: Uint8Array) {
  const path = await file("candidate.nds", bytes);
  const result = await validateRom(path, { references });
  // Validation never writes anything next to the file.
  expect(await readdir(dir)).toEqual(["candidate.nds"]);
  return result;
}

describe("validateRom (accept path)", () => {
  it("accepts the reference ROM", async () => {
    expect(await validate(rom)).toEqual({ ok: true, sha1: sha1Hex(rom), size: rom.length });
  });

  it("refuses a SoulSilver (USA) ROM whose content differs from the reference", async () => {
    expect(await validate(corruptByte(rom, HEADER_SIZE + 4))).toEqual({ ok: false, rejection: { reason: "modified" } });
  });
});

describe("validateRom (rejections)", () => {
  it("refuses a missing path and a directory as unreadable", async () => {
    expect(await validateRom(join(dir, "missing.nds"), { references })).toEqual({ ok: false, rejection: { reason: "unreadable" } });
    await mkdir(join(dir, "folder.nds"));
    expect(await validateRom(join(dir, "folder.nds"), { references })).toEqual({ ok: false, rejection: { reason: "unreadable" } });
  });

  it.each([
    ["zip", [0x50, 0x4b, 0x03, 0x04]],
    ["7z", [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
    ["rar", [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]],
  ] as const)("recognises a %s archive", async (format, magic) => {
    const bytes = new Uint8Array(64 * 1024);
    bytes.set(magic);
    expect(await validate(bytes)).toEqual({ ok: false, rejection: { reason: "archive", format } });
  });

  it("refuses a file under 32 KiB", async () => {
    expect(await validate(rom.subarray(0, 32 * 1024 - 1))).toEqual({ ok: false, rejection: { reason: "not-ds-rom" } });
  });

  it("refuses a file over 512 MiB without hashing it", async () => {
    const path = join(dir, "huge.nds");
    const handle = await open(path, "w");
    await handle.write(rom.subarray(0, HEADER_SIZE));
    await handle.truncate(512 * 1024 * 1024 + 1);
    await handle.close();
    const started = performance.now();
    expect(await validateRom(path, { references })).toEqual({ ok: false, rejection: { reason: "not-ds-rom" } });
    // Hashing 512 MiB would take far longer than this.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it.each([
    ["header CRC", 0x15e],
    ["logo CRC", 0x15c],
  ])("refuses a bad %s", async (_name, offset) => {
    expect(await validate(corruptByte(rom, offset))).toEqual({ ok: false, rejection: { reason: "not-ds-rom" } });
  });

  it.each<[string, RomRegion]>([
    ["IPKE", "usa"],
    ["IPKP", "europe"],
  ])("recognises HeartGold %s", async (gameCode, region) => {
    expect(await validate(buildNdsRom({ gameCode, title: "POKEMON HG" }))).toEqual({
      ok: false,
      rejection: { reason: "heartgold", region },
    });
  });

  it.each<[string, RomRegion]>([
    ["IPGJ", "japan"],
    ["IPGK", "korea"],
    ["IPGP", "europe"],
    ["IPGF", "france"],
    ["IPGD", "germany"],
    ["IPGI", "italy"],
    ["IPGS", "spain"],
    ["IPGX", "unknown"],
  ])("recognises SoulSilver from another region (%s)", async (gameCode, region) => {
    expect(await validate(buildNdsRom({ gameCode }))).toEqual({
      ok: false,
      rejection: { reason: "other-region", region, gameCode },
    });
  });

  it("recognises another DS game", async () => {
    expect(await validate(buildNdsRom({ gameCode: "ABCE", title: "OTHER GAME" }))).toEqual({
      ok: false,
      rejection: { reason: "other-game", title: "OTHER GAME", gameCode: "ABCE" },
    });
  });

  it("keeps only printable ASCII in the reported title", async () => {
    const result = await validate(buildNdsRom({ gameCode: "ABCE", title: "BAD\u0001TITLEÿ" }));
    expect(result).toMatchObject({ ok: false, rejection: { reason: "other-game" } });
    if (!result.ok && result.rejection.reason === "other-game") {
      expect(result.rejection.title).toMatch(/^[\x20-\x7e]{0,12}$/);
      expect(result.rejection.title).toBe("BADTITLE");
    }
  });
});
