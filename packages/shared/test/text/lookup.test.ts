import { describe, expect, it } from "vitest";
import { createTextCatalog, resolveNameRef, UnknownTextError } from "../../src/text/catalog.ts";
import type { TextBankFile } from "../../src/text/schemas.ts";

const bank = (number: number, texts: string[]): TextBankFile => ({
  kind: "text-bank", formatVersion: 1, language: "en", bank: number, name: null,
  records: texts.map((text, id) => ({ id, text })),
});

const catalog = createTextCatalog({
  en: [bank(237, ["x", "x", "BULBASAUR"]), bank(34, ["Hardy"])],
});

describe("resolveNameRef", () => {
  it("resolves a feature 004 reference to the text of its bank", () => {
    expect(resolveNameRef(catalog, { catalog: "species-names", index: 2 })).toBe("BULBASAUR");
    expect(resolveNameRef(catalog, { catalog: "nature-names", index: 0 })).toBe("Hardy");
  });

  it("names the reference when the index has no text", () => {
    expect(() => resolveNameRef(catalog, { catalog: "species-names", index: 99 })).toThrow(UnknownTextError);
    expect(() => resolveNameRef(catalog, { catalog: "species-names", index: 99 })).toThrow("0237:99");
  });
});
