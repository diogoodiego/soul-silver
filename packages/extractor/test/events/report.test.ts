import { parseEventsFile, type ScriptFile } from "@soulsilver/shared/events";
import { describe, expect, it } from "vitest";
import { buildEventsReportFile, reportLines } from "../../src/events/report.ts";

const script = (file: number, names: string[], extra: Partial<ScriptFile> = {}): ScriptFile => ({
  kind: "script-file",
  formatVersion: 1,
  file,
  messageBank: null,
  entries: ["L1"],
  code: names.map((name) => (name.startsWith("raw:") ? { raw: true as const, id: Number(name.slice(4)) } : { name, args: {} })),
  labels: { L1: 0 },
  movements: {},
  unreachableBytes: 0,
  partial: names.some((n) => n.startsWith("raw:")),
  ...extra,
});

const counts = { maps: 3, npcs: 4, warps: 2, triggers: 1, signs: 5, encounterBanks: 2, trainers: 6 };
const build = (files: Parameters<typeof buildEventsReportFile>[0]["files"], unresolved: Parameters<typeof buildEventsReportFile>[0]["unresolved"] = []) =>
  buildEventsReportFile({ counts, files, unresolved });

describe("buildEventsReportFile", () => {
  it("counts each command and lists the maps and shared files it appears in, most frequent first", () => {
    const report = build([
      { file: 10, maps: [4, 2], script: script(10, ["LockAll", "End", "End"]) },
      { file: 11, maps: [], script: script(11, ["End", "LockAll"]) },
      { file: 12, maps: [4], script: script(12, ["End"]) },
    ]);
    expect(report.commands).toEqual([
      { name: "End", count: 4, maps: [2, 4], globalFiles: [11] },
      { name: "LockAll", count: 2, maps: [2, 4], globalFiles: [11] },
    ]);
    expect(report.counts).toMatchObject({ scriptFiles: 3, scripts: 3, commands: 6, maps: 3, trainers: 6 });
  });

  it("breaks ties between equally frequent commands by name", () => {
    const report = build([{ file: 1, maps: [1], script: script(1, ["Zed", "Alpha"]) }]);
    expect(report.commands.map((c) => c.name)).toEqual(["Alpha", "Zed"]);
  });

  it("lists commands kept as raw apart, with their occurrences and maps", () => {
    const report = build([
      { file: 1, maps: [7], script: script(1, ["End", "raw:900", "raw:900"]) },
      { file: 2, maps: [9], script: script(2, ["raw:901"]) },
    ]);
    expect(report.unknownCommands).toEqual([
      { name: "raw:900", count: 2, maps: [7], globalFiles: [] },
      { name: "raw:901", count: 1, maps: [9], globalFiles: [] },
    ]);
    expect(report.commands.map((c) => c.name)).toEqual(["End"]);
    expect(report.undecodedScripts).toEqual([
      { file: 1, reason: "parou num comando desconhecido (raw:900)" },
      { file: 2, reason: "parou num comando desconhecido (raw:901)" },
    ]);
  });

  it("lists a file that failed to decode with its reason and counts it as lost", () => {
    const report = build([
      { file: 1, maps: [1], script: script(1, ["End"]) },
      { file: 2, maps: [1], error: "script file 2: offset 0x10 is outside the code" },
    ]);
    expect(report.undecodedScripts).toEqual([{ file: 2, reason: "script file 2: offset 0x10 is outside the code" }]);
    expect(report.decodedPercent).toBe(50);
    expect(report.ok).toBe(false);
  });

  it("accepts a loss of up to 2% of the files and reports 100% when nothing is lost", () => {
    const files = Array.from({ length: 100 }, (_, i) => ({ file: i, maps: [1], script: script(i, ["End"]) }));
    expect(build(files).decodedPercent).toBe(100);
    expect(build(files).ok).toBe(true);
    const lossy = [...files.slice(2), { file: 0, maps: [1], error: "x" }, { file: 1, maps: [1], error: "y" }];
    expect(build(lossy).ok).toBe(true);
    expect(build([...lossy.slice(1), { file: 5, maps: [1], error: "z" }]).ok).toBe(false);
  });

  it("sums the bytes no entry reaches and carries the unresolved references", () => {
    const unresolved = [{ file: 3, kind: "text", detail: "0012:99 is not in the catalog" }];
    const report = build([{ file: 3, maps: [1], script: script(3, ["End"], { unreachableBytes: 7 }) }, { file: 4, maps: [1], script: script(4, ["End"], { unreachableBytes: 5 }) }], unresolved);
    expect(report.unreachableBytes).toBe(12);
    expect(report.unresolved).toEqual(unresolved);
  });

  it("reports 100% and ok for a ROM without script files", () => {
    const report = build([]);
    expect(report).toMatchObject({ decodedPercent: 100, ok: true, commands: [] });
  });

  it("produces a report the shared schema accepts", () => {
    const report = build([{ file: 1, maps: [1], script: script(1, ["End", "raw:9"]) }]);
    expect(parseEventsFile("events-report", report, "report.json").ok).toBe(true);
  });
});

describe("reportLines", () => {
  it("shows the counts, the most used commands, the unknown ones and the verdict", () => {
    const report = build([{ file: 1, maps: [1], script: script(1, ["End", "End", "LockAll", "raw:9"]) }]);
    const text = reportLines(report).join("\n");
    expect(text).toContain("3 mapas");
    expect(text).toContain("End");
    expect(text).toContain("raw:9");
    expect(text).toContain("FALHA");
  });

  it("says everything was decoded when nothing was lost", () => {
    const text = reportLines(build([{ file: 1, maps: [1], script: script(1, ["End"]) }])).join("\n");
    expect(text).toContain("100%");
    expect(text).not.toContain("FALHA");
  });
});
