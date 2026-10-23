import { describe, expect, it } from "vitest";
import { createTextCatalog } from "../../src/text/catalog.ts";
import type { TextBankFile } from "../../src/text/schemas.ts";

const bank = (language: string, texts: Array<[number, string]>): TextBankFile => ({
  kind: "text-bank", formatVersion: 1, language, bank: 1, name: null,
  records: texts.map(([id, text]) => ({ id, text })),
});

const english = Array.from({ length: 1000 }, (_, i) => [i, `Line ${i} {trainer-name:0}`] as [number, string]);

describe("parallel catalog", () => {
  it("returns the translation for the keys it has and English for the rest", () => {
    const catalog = createTextCatalog({
      en: [bank("en", english)],
      "pt-BR": [bank("pt-BR", [[0, "Linha 0 {trainer-name:0}"], [1, "Linha 1 {trainer-name:0}"], [2, "Linha 2 {trainer-name:0}"]])],
    });
    expect(catalog.get("0001:0", "pt-BR")).toEqual({ text: "Linha 0 {trainer-name:0}", language: "pt-BR", fallback: false });
    expect(catalog.get("0001:500", "pt-BR")).toEqual({ text: "Line 500 {trainer-name:0}", language: "en", fallback: true });
    expect(catalog.languages()).toEqual(["en", "pt-BR"]);
  });

  it("refuses a translation that adds a variable English does not use", () => {
    expect(() =>
      createTextCatalog({
        en: [bank("en", [[0, "Plain"]])],
        "pt-BR": [bank("pt-BR", [[0, "Oi {pokemon-name:1}"]])],
      }),
    ).toThrow(/0001:0.*pokemon-name:1/);
  });
});
