import { describe, expect, it } from "vitest";
import { parseTextJson, serializeTextFile, textBankFile } from "../../src/text/schemas.ts";

function bank(extra: Record<string, unknown> = {}, records: unknown[] = [{ id: 0, text: "Hello{n}" }, { id: 1, text: "" }]) {
  return { kind: "text-bank", formatVersion: 1, language: "en", bank: 34, name: "nature-names", records, ...extra };
}

const parse = (value: unknown) => parseTextJson("text-bank", JSON.stringify(value), "0034.json");

describe("text-bank schema", () => {
  it("accepts a valid bank, including empty text", () => {
    expect(parse(bank()).ok).toBe(true);
  });

  it("accepts the compressed flag only as true, and only when present", () => {
    expect(parse(bank({}, [{ id: 0, text: "a", compressed: true }])).ok).toBe(true);
    expect(parse(bank({}, [{ id: 0, text: "a", compressed: false }])).ok).toBe(false);
  });

  it("accepts a null name for an unnamed bank", () => {
    expect(parse(bank({ name: null, bank: 2 })).ok).toBe(true);
  });

  it("refuses records out of order at records.N.id", () => {
    const result = parse(bank({}, [{ id: 1, text: "a" }, { id: 0, text: "b" }]));
    expect(result).toMatchObject({ ok: false, error: { file: "0034.json", path: "records.1.id" } });
  });

  it("refuses duplicate ids", () => {
    const result = parse(bank({}, [{ id: 0, text: "a" }, { id: 0, text: "b" }]));
    expect(result).toMatchObject({ ok: false, error: { path: "records.1.id" } });
  });

  it("refuses invalid markup at records.N.text, with the position in the problem", () => {
    const result = parse(bank({}, [{ id: 0, text: "ok" }, { id: 1, text: "bad {foo:0}" }]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.path).toBe("records.1.text");
      expect(result.error.problem).toContain("nome desconhecido");
    }
  });

  it.each([
    ["language", "EN_us"],
    ["language", "english!"],
  ])("refuses a bad language %s = %s", (field, value) => {
    const result = parse(bank({ [field]: value }));
    expect(result).toMatchObject({ ok: false, error: { path: field } });
  });

  it("refuses a bank number above 9999", () => {
    expect(parse(bank({ bank: 10000 })).ok).toBe(false);
  });

  it("refuses an unknown extra field at its own path", () => {
    expect(parse(bank({ extra: 1 }))).toMatchObject({ ok: false, error: { path: "extra" } });
  });

  it("refuses another kind and another format version", () => {
    expect(parse({ ...bank(), kind: "text-index" })).toMatchObject({ ok: false, error: { path: "kind" } });
    expect(parse({ ...bank(), formatVersion: 2 })).toMatchObject({ ok: false, error: { path: "formatVersion" } });
  });

  it("serializes deterministically and refuses invalid data with the file name", () => {
    const data = textBankFile.parse(bank());
    expect(serializeTextFile("text-bank", data)).toBe(`${JSON.stringify(data, null, 2)}\n`);
    expect(() => serializeTextFile("text-bank", { ...data, bank: -1 })).toThrow(/text-bank/);
  });
});
