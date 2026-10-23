import { describe, expect, it } from "vitest";
import { findTexts } from "../../src/text/find.ts";
import type { TextBankFile } from "@soulsilver/shared/text";

const bank = (number: number, texts: string[], name: string | null = null): TextBankFile => ({
  kind: "text-bank",
  formatVersion: 1,
  language: "en",
  bank: number,
  name,
  records: texts.map((text, id) => ({ id, text })),
});

const banks = [
  bank(40, ["Hello{n}world", "Pokémon ruled", "{trainer-name:0}, welcome"]),
  bank(2, ["Photo Taken!", "pokemon again"], "trainer-names"),
];

describe("findTexts", () => {
  it("matches ignoring case and accents", () => {
    expect(findTexts(banks, "POKEMON").map((r) => r.id)).toEqual(["0002:1", "0040:1"]);
  });

  it("treats line breaks as a space, so a phrase across one is found", () => {
    expect(findTexts(banks, "hello world")).toHaveLength(1);
  });

  it("finds variables as literal text", () => {
    expect(findTexts(banks, "{trainer-name:0}")).toHaveLength(1);
  });

  it("orders results by bank and index and respects the limit", () => {
    const found = findTexts(banks, "e", { limit: 2 });
    expect(found.map((r) => r.id)).toEqual(["0002:0", "0002:1"]);
  });

  it("returns the bank name when the bank has one", () => {
    expect(findTexts(banks, "photo")[0]).toMatchObject({ bank: 2, name: "trainer-names", text: "Photo Taken!" });
  });

  it("returns nothing when no text contains the query", () => {
    expect(findTexts(banks, "zzz")).toEqual([]);
  });
});
