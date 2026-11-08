import { parseMapFile } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { areaType, HeaderFormatError, MAP_HEADER_COUNT, readMapHeaders, type ArchiveCounts } from "../../src/maps/header.ts";
import { ByteWriter } from "../fixtures/byte-writer.ts";

interface HeaderSpec {
  encounters?: number;
  area?: number;
  matrix?: number;
  scripts?: number;
  messages?: number;
  musicDay?: number;
  musicNight?: number;
  events?: number;
  mapsec?: number;
  weather?: number;
  /** Bit 0 of the byte the weather shares: Kanto. */
  kanto?: boolean;
  /** Byte 23: bikeAllowed bit 1, escapeRopeAllowed bit 3, flyAllowed bit 4 (bits 25, 27 and 28 of the u32 at 20, map_header.h). */
  flags?: number;
}

/** A header table of 24-byte entries at `offset`, in the layout confirmed in research.md R0. */
function table(offset: number, specs: HeaderSpec[]): Uint8Array {
  const w = new ByteWriter();
  for (let i = 0; i < offset; i++) w.u8(0xaa);
  for (let i = 0; i < MAP_HEADER_COUNT; i++) {
    const s = specs[i] ?? {};
    w.u8(s.encounters ?? 0xff).u8(s.area ?? 0).u16(0).u16(s.matrix ?? 0).u16(s.scripts ?? 0).u16(0).u16(s.messages ?? 0);
    w.u16(s.musicDay ?? 1000).u16(s.musicNight ?? 1000).u16(s.events ?? 0).u8(s.mapsec ?? 0).u8(0).u8(((s.weather ?? 0) << 1) | (s.kanto ? 1 : 0)).u8(0).u8(0).u8(s.flags ?? 0);
  }
  return w.toBytes();
}

const counts: ArchiveCounts = { areas: 4, matrices: 3, scripts: 10, messages: 10, events: 10, encounters: 10 };
const OUTDOOR = new Uint8Array([0, 0, 2, 0, 0, 0, 1, 1]);
const INDOOR = new Uint8Array([1, 0, 25, 0, 0xff, 0xff, 0, 0]);
const CAVE = new Uint8Array([0x55, 0, 0x57, 0, 1, 0, 1, 0]);
const areas = [OUTDOOR, INDOOR, CAVE, OUTDOOR];

describe("areaType", () => {
  it("tells indoor (byte 6 = 0), cave (byte 7 = 0) and outdoor apart", () => {
    expect([areaType(OUTDOOR), areaType(INDOOR), areaType(CAVE)]).toEqual(["outdoor", "indoor", "cave"]);
  });
});

describe("readMapHeaders", () => {
  it("reads every field of every header, in a file that passes the schema", () => {
    const arm9 = table(16, [
      { encounters: 3, area: 1, matrix: 2, scripts: 4, messages: 5, musicDay: 1063, musicNight: 1064, events: 6, mapsec: 126, weather: 2, flags: 0b11010 },
    ]);
    const file = readMapHeaders(arm9, areas, counts, 16);
    expect(file.records).toHaveLength(MAP_HEADER_COUNT);
    expect(file.records[0]).toEqual({
      id: 0,
      mapsec: 126,
      areaType: "indoor",
      area: 1,
      matrix: 2,
      musicDay: 1063,
      musicNight: 1064,
      weather: 2,
      bikeAllowed: true,
      escapeRopeAllowed: true,
      flyAllowed: true,
      incomingCalls: false,
      refs: { events: 6, scripts: 4, messages: 5, encounters: 3 },
    });
    expect(file.records[1]!.refs.encounters).toBeNull();
    expect(parseMapFile("map-headers", file, "map-headers.json").ok).toBe(true);
  });

  it("reads the weather apart from the Kanto bit beside it, and each permission bit alone", () => {
    const file = readMapHeaders(table(0, [{ weather: 11, kanto: true }, { flags: 0b10 }, { flags: 0b1000 }, { flags: 0b10000 }]), areas, counts, 0);
    expect(file.records[0]).toMatchObject({ weather: 11, bikeAllowed: false, escapeRopeAllowed: false, flyAllowed: false });
    expect(file.records.slice(1, 4).map((r) => [r.bikeAllowed, r.escapeRopeAllowed, r.flyAllowed])).toEqual([
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ]);
  });

  it("reads whether the map takes incoming phone calls, bit 6 of byte 23 (incomingCalls, spec 026)", () => {
    const file = readMapHeaders(table(0, [{ flags: 0b1000000 }, { flags: 0b100000 }]), areas, counts, 0);
    expect(file.records.slice(0, 2).map((r) => r.incomingCalls)).toEqual([true, false]);
  });

  it.each([
    ["area", { area: 4 }],
    ["matrix", { matrix: 3 }],
    ["scripts", { scripts: 10 }],
    ["messages", { messages: 10 }],
    ["events", { events: 10 }],
    ["encounters", { encounters: 10 }],
  ] as const)("refuses a header whose %s points outside its archive", (field, spec) => {
    expect(() => readMapHeaders(table(0, [{}, spec]), areas, counts, 0)).toThrow(new RegExp(`header 1.*${field}`));
  });

  it("refuses a table that does not fit in the code", () => {
    expect(() => readMapHeaders(new Uint8Array(100), areas, counts, 0)).toThrow(HeaderFormatError);
  });
});
