import { describe, expect, it } from "vitest";
import { formatTextId, parseTextId, TEXT_BANK_NAMES, TEXT_REF_BANKS } from "../../src/text/ids.ts";

describe("parseTextId", () => {
  it("accepts the numeric form", () => {
    expect(parseTextId("0237:25")).toEqual({ bank: 237, index: 25 });
  });

  it("accepts a named bank", () => {
    expect(parseTextId("species-names:25")).toEqual({ bank: 237, index: 25 });
  });

  it.each(["0237", "0237:", ":25", "0237:-1", "0237:1.5", "10000:1", "no-such-bank:1"])("rejects %s, naming it", (id) => {
    expect(() => parseTextId(id)).toThrow(id);
  });
});

describe("formatTextId", () => {
  it("always writes a 4-digit bank", () => {
    expect(formatTextId(237, 25)).toBe("0237:25");
    expect(formatTextId(0, 0)).toBe("0000:0");
  });

  it("round trips through parseTextId", () => {
    expect(parseTextId(formatTextId(729, 738))).toEqual({ bank: 729, index: 738 });
  });
});

describe("bank tables", () => {
  it("names the banks confirmed by content", () => {
    expect(TEXT_BANK_NAMES[237]).toBe("species-names");
    expect(TEXT_BANK_NAMES[750]).toBe("move-names");
    expect(TEXT_BANK_NAMES[222]).toBe("item-names");
    expect(TEXT_BANK_NAMES[720]).toBe("ability-names");
    expect(TEXT_BANK_NAMES[735]).toBe("type-names");
    expect(TEXT_BANK_NAMES[34]).toBe("nature-names");
  });

  it("maps each feature 004 catalog to its bank", () => {
    expect(TEXT_REF_BANKS).toEqual({
      "species-names": 237,
      "move-names": 750,
      "item-names": 222,
      "ability-names": 720,
      "type-names": 735,
      "nature-names": 34,
    });
  });
});
