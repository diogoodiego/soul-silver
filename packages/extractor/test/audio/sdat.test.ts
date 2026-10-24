import { describe, expect, it } from "vitest";
import { nitroData, readSdat, SdatFormatError } from "../../src/audio/sdat.ts";
import { buildSbnk, buildSdat, buildSseq, buildSwar, ev } from "../fixtures/audio/builders.ts";

const seq = buildSseq([...ev.note(60, 127, 10), ...ev.end()]);
const bank = buildSbnk([{ type: 1 }]);
const swar = buildSwar([{ type: 0, rate: 8000, data: [1, 2, 3, 4] }]);

describe("readSdat", () => {
  const sdat = readSdat(
    buildSdat({
      seqs: [null, { name: "SEQ_ONE", data: seq, bank: 1, volume: 90 }],
      banks: [null, { name: "BANK_ONE", data: bank, waveArcs: [0] }],
      waveArcs: [{ name: "WAVE_ONE", data: swar }],
    }),
  );

  it("reads sequence, bank and wave archive records with their ids", () => {
    expect(sdat.seqs[0]).toBeNull();
    expect(sdat.seqs[1]).toMatchObject({ id: 1, bank: 1, volume: 90 });
    expect(sdat.banks[1]).toMatchObject({ id: 1, waveArcs: [0] });
    expect(sdat.waveArcs).toHaveLength(1);
  });

  it("reads the names, null where the archive has none", () => {
    expect(sdat.names.seq).toEqual([null, "SEQ_ONE"]);
    expect(sdat.names.bank).toEqual([null, "BANK_ONE"]);
    expect(sdat.names.waveArc).toEqual(["WAVE_ONE"]);
  });

  it("returns each file by its FAT id", () => {
    expect([...sdat.file(sdat.seqs[1]!.fileId)]).toEqual([...seq]);
    expect([...sdat.file(sdat.banks[1]!.fileId)]).toEqual([...bank]);
    expect([...sdat.file(sdat.waveArcs[0]!)]).toEqual([...swar]);
  });

  it("fails with a clear message for a file outside the FAT", () => {
    expect(() => sdat.file(99)).toThrow(/arquivo 99 fora da FAT/);
  });

  it("rejects a file that is not an SDAT", () => {
    expect(() => readSdat(new Uint8Array(64))).toThrow(SdatFormatError);
    expect(() => readSdat(new Uint8Array(64))).toThrow(/SDAT/);
  });

  it("rejects an SDAT whose INFO block lies outside the file", () => {
    const bytes = buildSdat({});
    new DataView(bytes.buffer).setUint32(0x18, 0xffff00, true);
    expect(() => readSdat(bytes)).toThrow(/INFO/);
  });
});

describe("nitroData", () => {
  it("finds the DATA block and checks the magic", () => {
    expect(nitroData(seq, "SSEQ", "seq")).toBe(16);
    expect(() => nitroData(seq, "SBNK", "banco 3")).toThrow(/banco 3.*SBNK/);
  });
});
