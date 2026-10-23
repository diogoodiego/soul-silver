import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fileSchema, id, int } from "../../src/game-data/common.ts";
import { createGameDataCodec } from "../../src/game-data/parse.ts";

const widget = z.strictObject({
  id: id(),
  size: int(0, 10),
  nested: z.strictObject({ a: int(0, 5) }),
});

const codec = createGameDataCodec({ widgets: fileSchema("widgets", widget) });

function file(records: unknown[] = [{ id: 0, size: 1, nested: { a: 2 } }, { id: 1, size: 3, nested: { a: 4 } }]) {
  return { kind: "widgets", formatVersion: 1, records };
}

function failure(value: unknown) {
  const result = codec.parseGameDataFile("widgets", value, "widgets.json");
  if (result.ok) throw new Error("expected a failure");
  return result.error;
}

describe("parseGameDataFile", () => {
  it("accepts a valid envelope", () => {
    const result = codec.parseGameDataFile("widgets", file(), "widgets.json");
    expect(result).toEqual({ ok: true, data: file() });
  });

  it("reports the file name in every error", () => {
    expect(failure(null).file).toBe("widgets.json");
  });

  it("rejects a different kind at path kind", () => {
    expect(failure({ ...file(), kind: "gadgets" })).toMatchObject({ path: "kind" });
  });

  it("rejects another formatVersion at path formatVersion", () => {
    expect(failure({ ...file(), formatVersion: 2 })).toMatchObject({ path: "formatVersion" });
  });

  it("rejects unknown fields at the field's path", () => {
    const records = [{ id: 0, size: 1, nested: { a: 2 }, extra: true }];
    expect(failure(file(records))).toMatchObject({ path: "records.0.extra" });
    expect(failure({ ...file(), surprise: 1 })).toMatchObject({ path: "surprise" });
  });

  it("rejects records out of order at the first offending record", () => {
    const records = [0, 1, 3, 2].map((n) => ({ id: n, size: 1, nested: { a: 1 } }));
    expect(failure(file(records))).toMatchObject({ path: "records.3.id" });
  });

  it("rejects duplicate ids at the second occurrence", () => {
    const records = [1, 1].map((n) => ({ id: n, size: 1, nested: { a: 1 } }));
    expect(failure(file(records))).toMatchObject({ path: "records.1.id" });
  });

  it("uses dots and indices for nested paths", () => {
    const records = [
      { id: 0, size: 1, nested: { a: 1 } },
      { id: 1, size: 1, nested: { a: 99 } },
    ];
    expect(failure(file(records))).toMatchObject({ path: "records.1.nested.a" });
  });

  it.each([
    ["out of range", { id: 0, size: 99, nested: { a: 1 } }, "records.0.size"],
    ["wrong type", { id: 0, size: "big", nested: { a: 1 } }, "records.0.size"],
    ["fraction", { id: 0, size: 1.5, nested: { a: 1 } }, "records.0.size"],
    ["negative id", { id: -1, size: 1, nested: { a: 1 } }, "records.0.id"],
    ["missing field", { id: 0, nested: { a: 1 } }, "records.0.size"],
  ])("describes a %s problem in Portuguese", (_name, record, path) => {
    const error = failure(file([record]));
    expect(error.path).toBe(path);
    expect(error.problem).toMatch(/esperado|obrigatório/);
  });

  it("reports a problem at the root with an empty path", () => {
    expect(failure("nope")).toMatchObject({ path: "" });
    expect(failure("nope").problem.length).toBeGreaterThan(0);
  });
});

describe("parseGameDataJson", () => {
  it("parses valid JSON text", () => {
    const text = codec.serializeGameDataFile("widgets", file() as never);
    expect(codec.parseGameDataJson("widgets", text, "widgets.json")).toEqual({ ok: true, data: file() });
  });

  it("reports invalid JSON with an empty path", () => {
    const result = codec.parseGameDataJson("widgets", "{nope", "widgets.json");
    expect(result).toMatchObject({ ok: false, error: { file: "widgets.json", path: "" } });
    if (!result.ok) expect(result.error.problem).toMatch(/^JSON inválido/);
  });
});

describe("serializeGameDataFile", () => {
  it("writes two-space JSON with a trailing newline", () => {
    expect(codec.serializeGameDataFile("widgets", file() as never)).toBe(`${JSON.stringify(file(), null, 2)}\n`);
  });

  it("is stable across calls", () => {
    const first = codec.serializeGameDataFile("widgets", file() as never);
    expect(codec.serializeGameDataFile("widgets", file() as never)).toBe(first);
  });

  it("writes fields in schema order whatever the input order", () => {
    const shuffled = { records: [{ nested: { a: 2 }, size: 1, id: 0 }], formatVersion: 1, kind: "widgets" };
    const text = codec.serializeGameDataFile("widgets", shuffled as never);
    expect(text).toBe(`${JSON.stringify({ kind: "widgets", formatVersion: 1, records: [{ id: 0, size: 1, nested: { a: 2 } }] }, null, 2)}\n`);
  });

  it("refuses to serialize invalid data", () => {
    expect(() => codec.serializeGameDataFile("widgets", file([{ id: 0 }]) as never)).toThrow(/widgets/);
  });
});
