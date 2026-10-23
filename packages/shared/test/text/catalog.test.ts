import { describe, expect, it } from "vitest";
import { createTextCatalog, UnknownTextError, validateTranslation } from "../../src/text/catalog.ts";
import type { TextBankFile } from "../../src/text/schemas.ts";

function bank(language: string, records: Array<[number, string]>, number = 34): TextBankFile {
  return {
    kind: "text-bank",
    formatVersion: 1,
    language,
    bank: number,
    name: null,
    records: records.map(([id, text]) => ({ id, text })),
  };
}

const english = () => [bank("en", [[0, "Hi {trainer-name:0}!"], [1, "Plain{n}text"], [2, "Gone"]])];

describe("createTextCatalog", () => {
  it("returns the English text with fallback false", () => {
    const catalog = createTextCatalog({ en: english() });
    expect(catalog.get("0034:0", "en")).toEqual({ text: "Hi {trainer-name:0}!", language: "en", fallback: false });
  });

  it("returns a translated text, and English for the keys it lacks", () => {
    const catalog = createTextCatalog({
      en: english(),
      "pt-BR": [bank("pt-BR", [[0, "Oi {trainer-name:0}!"]])],
    });
    expect(catalog.get("0034:0", "pt-BR")).toEqual({ text: "Oi {trainer-name:0}!", language: "pt-BR", fallback: false });
    expect(catalog.get("0034:1", "pt-BR")).toEqual({ text: "Plain{n}text", language: "en", fallback: true });
  });

  it("falls back to English for an unknown language", () => {
    const catalog = createTextCatalog({ en: english() });
    expect(catalog.get("0034:1", "fr")).toEqual({ text: "Plain{n}text", language: "en", fallback: true });
  });

  it("accepts a text that is deliberately empty", () => {
    const catalog = createTextCatalog({ en: [bank("en", [[0, ""]])] });
    expect(catalog.get("0034:0", "en").text).toBe("");
  });

  it("throws UnknownTextError naming an id that exists in no language", () => {
    const catalog = createTextCatalog({ en: english() });
    expect(() => catalog.get("0034:99", "en")).toThrow(UnknownTextError);
    expect(() => catalog.get("0034:99", "en")).toThrow("0034:99");
  });

  it("lists languages, has and ids", () => {
    const catalog = createTextCatalog({ en: english(), "pt-BR": [bank("pt-BR", [[0, "Oi {trainer-name:0}"]])] });
    expect(catalog.languages()).toEqual(["en", "pt-BR"]);
    expect(catalog.has("0034:2")).toBe(true);
    expect(catalog.has("0034:2", "pt-BR")).toBe(false);
    expect(catalog.ids("en")).toEqual(["0034:0", "0034:1", "0034:2"]);
  });

  it("refuses a translation that drops a variable, naming the id, variable and problem", () => {
    expect(() =>
      createTextCatalog({ en: english(), "pt-BR": [bank("pt-BR", [[0, "Oi!"]])] }),
    ).toThrow(/0034:0.*trainer-name:0/);
  });

  it("accepts a translation that keeps the same variables", () => {
    expect(() =>
      createTextCatalog({ en: english(), "pt-BR": [bank("pt-BR", [[0, "Oi {trainer-name:0}!"]])] }),
    ).not.toThrow();
  });
});

describe("validateTranslation", () => {
  it("reports a missing variable", () => {
    const problems = validateTranslation(english(), [bank("pt-BR", [[0, "Oi!"]])]);
    expect(problems).toEqual([expect.objectContaining({ id: "0034:0", variable: "trainer-name:0" })]);
  });

  it("reports an added variable", () => {
    const problems = validateTranslation(english(), [bank("pt-BR", [[1, "Plain {pokemon-name:1}"]])]);
    expect(problems).toEqual([expect.objectContaining({ id: "0034:1", variable: "pokemon-name:1" })]);
  });

  it("reports a different flag on the same variable", () => {
    const problems = validateTranslation(
      [bank("en", [[0, "{number3:0}"]])],
      [bank("pt-BR", [[0, "{number3:0,2}"]])],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.problem).toContain("flag");
  });

  it("returns nothing when the variables match", () => {
    expect(validateTranslation(english(), [bank("pt-BR", [[0, "Oi {trainer-name:0}!"]])])).toEqual([]);
  });
});
